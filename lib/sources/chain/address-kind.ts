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
// The classification the code gives is kept by rails-server (`address_kind`, mig
// 416; `readStoredKind`, `writeStoredKind`). An address with code is read once
// and never again; no code, or a delegation, is answered from the row for an
// hour, the window the route caches for. What moves (a Safe's owners and
// modules, a DSProxy's owner and authority, a DSA's authorities) is read at
// head on every search from the stored shape (`finishKind`).
//
// The code shapes are the ones the vault holder reader proves
// (aave-ethereum-vault.ts `readAaveVaultHolderShape`); this reader asks only
// what the wallet row states.
//
// SERVER-ONLY.

import { parseAbi } from "viem";
import { chainClient } from "./rpc";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
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
/** What the code at an address gives, and the facts a later read needs to finish
 *  the verdict without asking the chain for the code again. The state that
 *  moves (a Safe's owners and modules, a DSProxy's owner and authority, a DSA's
 *  authorities) is not in it; `finishKind` reads that at head. Stored by the
 *  api in `address_kind` (rails-server mig 416). */
export type KindShape =
  | { kind: "account" }
  | { kind: "delegated"; delegate: string }
  | { kind: "safe"; version: string }
  | {
      kind: "contract";
      name: string | null;
      symbol: string | null;
      /** The InstaList account id, as a decimal string; null for none. */
      dsaId: string | null;
      /** `guard()` as the contract answered it; null for a revert or zero. */
      guard: string | null;
      /** `cache()` answered with a non-zero address. */
      hasCache: boolean;
      /** `authority()` did not revert. */
      hasAuthority: boolean;
    };

/** An `account` or `delegated` row is answered by the api for an hour (no code
 *  can gain code); the others are final. */
interface StoredKind {
  shape: KindShape;
  block: number;
}

const KINDS = new Set(["account", "delegated", "safe", "contract"]);
const STORED_KIND_TIMEOUT_MS = 3_000;

/** The api's row for the address, or null where it has none, did not answer,
 *  or RAILS_API_URL is not set. */
async function readStoredKind(address: string, chainId: ChainId): Promise<StoredKind | null> {
  const api = process.env.RAILS_API_URL;
  if (!api) return null;
  try {
    const res = await fetch(
      `${api}/api/reference/address-kind?chain=${chainId}&address=${address}`,
      createAuthFetchOptions({ signal: AbortSignal.timeout(STORED_KIND_TIMEOUT_MS) }),
    );
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = (await res.json()) as {
      found?: boolean;
      kind?: string;
      shape?: Record<string, unknown>;
      readAtBlock?: number;
    };
    if (!body.found || !body.kind || !KINDS.has(body.kind) || !body.shape || !Number.isSafeInteger(body.readAtBlock))
      return null;
    return { shape: { ...body.shape, kind: body.kind } as KindShape, block: body.readAtBlock as number };
  } catch {
    return null;
  }
}

/** Keep the classification. Never throws: a row not written is read again. */
async function writeStoredKind(address: string, chainId: ChainId, shape: KindShape, block: number): Promise<void> {
  const api = process.env.RAILS_API_URL;
  if (!api) return;
  const { kind, ...rest } = shape;
  try {
    const res = await fetch(
      `${api}/api/reference/address-kind`,
      createAuthFetchOptions({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: chainId, address, kind, shape: rest, block }),
        signal: AbortSignal.timeout(STORED_KIND_TIMEOUT_MS),
      }),
    );
    void res.body?.cancel().catch(() => undefined);
  } catch {
    // The next read classifies again.
  }
}

/** The code reads: what the address is, and the multicall answers they used. */
async function classifyKind(
  client: ReturnType<typeof chainClient>,
  address: `0x${string}`,
  chainId: ChainId,
  blockNumber: bigint,
): Promise<{ shape: KindShape; seed?: LiveReads }> {
  const code = await client.getCode({ address, blockNumber });
  if (!code || code === "0x") return { shape: { kind: "account" } };
  const delegation = EIP7702_RE.exec(code);
  if (delegation) return { shape: { kind: "delegated", delegate: `0x${delegation[1].toLowerCase()}` } };
  const minimal = EIP1167_RE.exec(code);
  const minimalImpl = minimal ? `0x${minimal[1].toLowerCase()}` : null;
  if (minimalImpl && SAFE_SINGLETONS[minimalImpl])
    return { shape: { kind: "safe", version: SAFE_SINGLETONS[minimalImpl] } };
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
    if (SAFE_SINGLETONS[singleton]) return { shape: { kind: "safe", version: SAFE_SINGLETONS[singleton] } };
  }
  const addr = (i: number): string | null => {
    const r = names[i];
    return r?.status === "success" && typeof r.result === "string" && r.result !== ZERO ? r.result.toLowerCase() : null;
  };
  const hasAuthority = names[2]?.status === "success";
  return {
    shape: {
      kind: "contract",
      name: textOf(token.name),
      symbol: token.meta?.named ? textOf(token.meta.symbol) : null,
      dsaId: id > BigInt(0) ? id.toString() : null,
      guard: addr(1),
      hasCache: addr(3) != null,
      hasAuthority,
    },
    seed: { owner: addr(0), authority: addr(2) },
  };
}

/** The contract's state that moves, at the block. */
interface LiveReads {
  owner: string | null;
  authority: string | null;
}

async function readLive(
  client: ReturnType<typeof chainClient>,
  address: `0x${string}`,
  blockNumber: bigint,
  hasAuthority: boolean,
): Promise<LiveReads> {
  const r = await client.multicall({
    allowFailure: true,
    blockNumber,
    contracts: hasAuthority
      ? [
          { address, abi: NAME_ABI, functionName: "owner" },
          { address, abi: NAME_ABI, functionName: "authority" },
        ]
      : [{ address, abi: NAME_ABI, functionName: "owner" }],
  });
  const pick = (i: number): string | null => {
    const x = r[i];
    return x?.status === "success" && typeof x.result === "string" && x.result !== ZERO ? x.result.toLowerCase() : null;
  };
  return { owner: pick(0), authority: hasAuthority ? pick(1) : null };
}

/** The verdict from the classification and the state at the block. */
async function finishKind(
  client: ReturnType<typeof chainClient>,
  address: `0x${string}`,
  chainId: ChainId,
  blockNumber: bigint,
  shape: KindShape,
  seed?: LiveReads,
): Promise<AddressKind> {
  const block = Number(blockNumber);
  if (shape.kind === "account") return { kind: "account", block };
  if (shape.kind === "delegated") return { kind: "delegated", delegate: shape.delegate, block };
  if (shape.kind === "safe")
    return {
      kind: "safe",
      version: shape.version,
      ...(await safeOwners(client, address, blockNumber)),
      ...(await safeManager(client, address, blockNumber, chainId)),
      block,
    };
  const instaList = INSTA_LIST[chainId] as `0x${string}` | undefined;
  const { owner, authority } = seed ?? (await readLive(client, address, blockNumber, shape.hasAuthority));
  const guard = shape.guard;
  const base = {
    kind: "contract" as const,
    name: shape.name,
    symbol: shape.symbol,
    block,
  };
  const owned = owner ? { owners: [owner] } : {};
  const id = shape.dsaId ? BigInt(shape.dsaId) : BigInt(0);
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
  if (owner && shape.hasCache && shape.hasAuthority) {
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
}

export async function readAddressKind(addressRaw: string, chainId: ChainId): Promise<AddressKind | null> {
  const address = addressRaw.toLowerCase() as `0x${string}`;
  const client = chainClient(chainId);
  try {
    const stored = await readStoredKind(address, chainId);
    // No code, or a delegation: the row is the answer, read at its own block.
    if (stored && (stored.shape.kind === "account" || stored.shape.kind === "delegated"))
      return stored.shape.kind === "account"
        ? { kind: "account", block: stored.block }
        : { kind: "delegated", delegate: stored.shape.delegate, block: stored.block };
    const blockNumber = await client.getBlockNumber();
    if (stored) return await finishKind(client, address, chainId, blockNumber, stored.shape);
    const { shape, seed } = await classifyKind(client, address, chainId, blockNumber);
    await writeStoredKind(address, chainId, shape, Number(blockNumber));
    return await finishKind(client, address, chainId, blockNumber, shape, seed);
  } catch (error) {
    console.error("Address kind read failed:", error);
    return null;
  }
}
