// What an address is, from one code read at head (rails-ops ui-jobs 232): a
// key's account (no code), a smart account (an EIP-7702 delegation, or a
// Safe whose singleton is a released deployment), or a contract, with the
// `name()` and `symbol()` it answers (read through `resolveErc20Meta`). Every verdict is the chain's own
// answer; no explorer label is consulted.
//
// Where the account's state names the product that runs it (ui-jobs 440),
// the answer carries `manager`, read at the same block: a Safe with DeFi
// Saver's module enabled, a DSProxy whose authority lets DeFi Saver's
// ProxyAuth call `execute`, an Instadapp DSA, a Summer.fi DPM account. The
// product contracts and their sources are lib/shared/account-managers.ts.
//
// The code shapes are the ones the vault holder reader proves
// (aave-ethereum-vault.ts `readAaveVaultHolderShape`); this reader asks only
// what the wallet row states.
//
// SERVER-ONLY.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { erc20NameOf, resolveErc20Meta } from "./erc20-meta";
import { EIP1167_RE, EIP7702_RE, SAFE_SINGLETONS, SLOT_ZERO } from "./aave-ethereum-vault";
import type { ChainId } from "@/lib/shared/chains";
import type { AccountManager, AddressKind, ManagerCall } from "@/lib/api/fetch-address-kind";
import {
  DFS_PROXY_AUTH,
  DFS_SAFE_MODULE_AUTH,
  DSPROXY_EXECUTE,
  INSTA_LIST,
  SUMMER_ACCOUNT_GUARD,
  type ManagerProduct,
} from "@/lib/shared/account-managers";
import { DEFI_SAVER_BAR, INSTADAPP_BAR, SUMMER_FI_BAR } from "@/lib/shared/bar-owners";

const NAME_ABI = parseAbi([
  "function name() view returns (string)",
  "function owner() view returns (address)",
  "function guard() view returns (address)",
  "function authority() view returns (address)",
  "function cache() view returns (address)",
]);
const SAFE_ABI = parseAbi([
  "function getOwners() view returns (address[])",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
]);
const DS_AUTHORITY_ABI = parseAbi(["function canCall(address src, address dst, bytes4 sig) view returns (bool)"]);
const INSTA_LIST_ABI = parseAbi([
  "function accountID(address) view returns (uint64)",
  "function accountLink(uint64) view returns (address first, address last, uint64 count)",
  "function accountList(uint64, address) view returns (address prev, address next)",
]);

const ZERO = "0x0000000000000000000000000000000000000000";
/** The Safe's module list starts and ends at this sentinel. */
const SENTINEL = "0x0000000000000000000000000000000000000001";
/** Enough for any Safe Rails has met; a longer list is read as far as this. */
const MODULE_PAGE = 50;
/** A DSA's authorities are walked this far at most. */
const MAX_AUTHORITIES = 20;

const SUBJECTS = { defisaver: DEFI_SAVER_BAR, summerfi: SUMMER_FI_BAR, instadapp: INSTADAPP_BAR } as const;

function manager(
  product: ManagerProduct,
  contract: string,
  contractName: string,
  calls: ManagerCall[],
  block: number,
): AccountManager {
  const s = SUBJECTS[product];
  return {
    product,
    name: s.name,
    icon: s.icon,
    ...(s.closed ? { closed: s.closed } : {}),
    contract,
    contractName,
    read: { calls, block },
  };
}

/** DeFi Saver's module among the Safe's enabled modules, at the block. */
async function safeManager(
  client: ReturnType<typeof chainClient>,
  address: `0x${string}`,
  blockNumber: bigint,
  chainId: ChainId,
): Promise<{ manager?: AccountManager }> {
  const module = DFS_SAFE_MODULE_AUTH[chainId];
  if (!module) return {};
  try {
    const [modules] = await client.readContract({
      address,
      abi: SAFE_ABI,
      functionName: "getModulesPaginated",
      args: [SENTINEL, BigInt(MODULE_PAGE)],
      blockNumber,
    });
    const list = modules.map((m) => m.toLowerCase());
    if (!list.includes(module)) return {};
    return {
      manager: manager(
        "defisaver",
        module,
        "SafeModuleAuth",
        [
          {
            contract: address,
            contractName: "Safe",
            call: `getModulesPaginated(${SENTINEL}, ${MODULE_PAGE})`,
            answer: `[${list.join(", ")}]`,
          },
        ],
        Number(blockNumber),
      ),
    };
  } catch {
    return {};
  }
}

/** A DSA's authorities from InstaList's linked list, at the block. */
async function dsaAuthorities(
  client: ReturnType<typeof chainClient>,
  list: `0x${string}`,
  id: bigint,
  blockNumber: bigint,
): Promise<{ owners: string[]; count: bigint } | null> {
  try {
    const [first, , count] = await client.readContract({
      address: list,
      abi: INSTA_LIST_ABI,
      functionName: "accountLink",
      args: [id],
      blockNumber,
    });
    const owners: string[] = [];
    let at = first;
    while (at !== ZERO && owners.length < Math.min(Number(count), MAX_AUTHORITIES)) {
      owners.push(at.toLowerCase());
      const [, next] = await client.readContract({
        address: list,
        abi: INSTA_LIST_ABI,
        functionName: "accountList",
        args: [id, at],
        blockNumber,
      });
      at = next;
    }
    return { owners, count };
  } catch {
    return null;
  }
}

/** A Safe's owners at the block, lowercase; absent where the read fails. */
async function safeOwners(
  client: ReturnType<typeof chainClient>,
  address: `0x${string}`,
  blockNumber: bigint,
): Promise<{ owners?: string[] }> {
  try {
    const owners = await client.readContract({ address, abi: SAFE_ABI, functionName: "getOwners", blockNumber });
    return { owners: owners.map((o) => o.toLowerCase()) };
  } catch {
    return {};
  }
}

const textOf = (v: string | undefined): string | null => {
  const t = (v ?? "").replace(/\0/g, "").trim();
  return t.length > 0 && t.length <= 64 ? t : null;
};
export async function readAddressKind(addressRaw: string, chainId: ChainId): Promise<AddressKind | null> {
  const address = addressRaw.toLowerCase() as `0x${string}`;
  const client = chainClient(chainId);
  try {
    const blockNumber = await client.getBlockNumber();
    const code = await client.getCode({ address, blockNumber });
    const block = Number(blockNumber);
    if (!code || code === "0x") return { kind: "account", block };
    const delegation = EIP7702_RE.exec(code);
    if (delegation) return { kind: "delegated", delegate: `0x${delegation[1].toLowerCase()}`, block };
    const minimal = EIP1167_RE.exec(code);
    const minimalImpl = minimal ? `0x${minimal[1].toLowerCase()}` : null;
    if (minimalImpl && SAFE_SINGLETONS[minimalImpl])
      return {
        kind: "safe",
        version: SAFE_SINGLETONS[minimalImpl],
        ...(await safeOwners(client, address, blockNumber)),
        ...(await safeManager(client, address, blockNumber, chainId)),
        block,
      };
    const instaList = INSTA_LIST[chainId] as `0x${string}` | undefined;
    const [names, slotZero, id, token] = await Promise.all([
      client.multicall({
        allowFailure: true,
        blockNumber,
        contracts: [
          { address, abi: NAME_ABI, functionName: "owner" },
          { address, abi: NAME_ABI, functionName: "guard" },
          { address, abi: NAME_ABI, functionName: "authority" },
          { address, abi: NAME_ABI, functionName: "cache" },
        ],
      }),
      client.getStorageAt({ address, slot: SLOT_ZERO as `0x${string}`, blockNumber }),
      instaList
        ? client
            .readContract({
              address: instaList,
              abi: INSTA_LIST_ABI,
              functionName: "accountID",
              args: [address],
              blockNumber,
            })
            .catch(() => BigInt(0))
        : Promise.resolve(BigInt(0)),
      // Symbol through the api's token_meta (chain for what it lacks); the name
      // is the api's row, else read here (the chain path keeps none for a
      // token whose symbol() answered).
      resolveErc20Meta([address], chainId).then(async (m) => ({
        meta: m.get(address),
        name:
          erc20NameOf(address, chainId) ??
          (await client
            .readContract({ address, abi: NAME_ABI, functionName: "name", blockNumber })
            .catch(() => undefined)),
      })),
    ]);
    if (slotZero && slotZero !== SLOT_ZERO) {
      const singleton = `0x${slotZero.slice(-40)}`.toLowerCase();
      if (SAFE_SINGLETONS[singleton])
        return {
          kind: "safe",
          version: SAFE_SINGLETONS[singleton],
          ...(await safeOwners(client, address, blockNumber)),
          ...(await safeManager(client, address, blockNumber, chainId)),
          block,
        };
    }
    const addr = (i: number): string | null => {
      const r = names[i];
      return r?.status === "success" && typeof r.result === "string" && r.result !== ZERO
        ? r.result.toLowerCase()
        : null;
    };
    // A DSProxy, a DPM and any Ownable account answer `owner()`.
    const owner = addr(0);
    const guard = addr(1);
    const authority = addr(2);
    const cache = addr(3);
    const base = {
      kind: "contract" as const,
      name: textOf(token.name),
      symbol: token.meta?.named ? textOf(token.meta.symbol) : null,
      block,
    };
    const owned = owner ? { owners: [owner] } : {};

    // An Instadapp DSA: InstaList numbers it, and its authorities act for it.
    if (instaList && id > BigInt(0)) {
      const auth = await dsaAuthorities(client, instaList, id, blockNumber);
      return {
        ...base,
        account: "dsa",
        ...(auth ? { owners: auth.owners } : owned),
        manager: manager(
          "instadapp",
          instaList,
          "InstaList",
          [
            { contract: instaList, contractName: "InstaList", call: `accountID(${address})`, answer: id.toString() },
            ...(auth
              ? [
                  {
                    contract: instaList,
                    contractName: "InstaList",
                    call: `accountLink(${id})`,
                    answer: `${auth.count} ${auth.count === BigInt(1) ? "authority" : "authorities"}: ${auth.owners.join(", ")}`,
                  },
                ]
              : []),
          ],
          block,
        ),
      };
    }

    // A Summer.fi DPM account: its guard is Summer's AccountGuard.
    const summerGuard = SUMMER_ACCOUNT_GUARD[chainId];
    if (guard && summerGuard && guard === summerGuard)
      return {
        ...base,
        account: "dpm",
        ...owned,
        manager: manager(
          "summerfi",
          summerGuard,
          "AccountGuard",
          [
            { contract: address, contractName: "AccountImplementation", call: "guard()", answer: guard },
            ...(owner
              ? [{ contract: address, contractName: "AccountImplementation", call: "owner()", answer: owner }]
              : []),
          ],
          block,
        ),
      };

    // A DSProxy: owner, authority and cache answer. DeFi Saver runs it where
    // the authority lets ProxyAuth call `execute`.
    if (owner && cache && names[2]?.status === "success") {
      const proxyAuth = DFS_PROXY_AUTH[chainId] as `0x${string}` | undefined;
      let allowed = false;
      if (authority && proxyAuth)
        try {
          allowed = await client.readContract({
            address: authority as `0x${string}`,
            abi: DS_AUTHORITY_ABI,
            functionName: "canCall",
            args: [proxyAuth, address, DSPROXY_EXECUTE as `0x${string}`],
            blockNumber,
          });
        } catch {
          allowed = false;
        }
      return {
        ...base,
        account: "dsproxy",
        ...owned,
        ...(allowed && authority && proxyAuth
          ? {
              manager: manager(
                "defisaver",
                proxyAuth,
                "ProxyAuth",
                [
                  { contract: address, contractName: "DSProxy", call: "authority()", answer: authority },
                  {
                    contract: authority,
                    contractName: "DSAuthority",
                    call: `canCall(${proxyAuth}, ${address}, ${DSPROXY_EXECUTE})`,
                    answer: "true",
                  },
                ],
                block,
              ),
            }
          : {}),
      };
    }

    return { ...base, ...owned };
  } catch (error) {
    console.error("Address kind read failed:", error);
    return null;
  }
}
