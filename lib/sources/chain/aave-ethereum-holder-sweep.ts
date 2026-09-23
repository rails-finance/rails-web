// ONE ADDRESS, across every vault Aave publishes on Ethereum — read at one
// pinned block. SERVER-ONLY.
// ----------------------------------------------------------------------------
// The per-vault loader beside this one (aave-ethereum-vault.ts) answers "what is
// this address's reading of THIS vault". It needs a vault first, and the
// question a reader actually arrives with is the other way round: enter an
// address, and be told which of Aave's vaults it stands in. That is this file.
//
// THE SHAPE OF THE READ. Everything is pinned to one block, and the hops are
// sequential because each request's arguments are the previous one's answers:
//
//   1. one `eth_blockNumber`;
//   2. request A — the two enumerators (lib/sources/chain/aave-ethereum-catalogue.ts):
//      WHO the vaults are at that block, which is also what decides whether the
//      address being asked about is itself one of them;
//   3. request B — `balanceOf(holder)`, `maxRedeem(holder)` and
//      `name/symbol/decimals/asset/totalSupply` on every catalogued vault
//      (7 calls × ~18);
//   4. request C — `convertToAssets(balance)` on the vaults that answered a
//      NON-ZERO balance, and nothing else. Its argument is B's answer, which is
//      why it cannot be in B;
//   5. one `eth_getCode` on the address itself, for what it is.
//
// `batchSize: 0` on each keeps the request count a fact about the code rather
// than a viem heuristic. An address holding nothing costs steps 1–3 and the code
// read, and stops.
//
// ⚠️ THE SHARE PRICE'S EXPONENT — the same trap the directory documents. Aave's
// share tokens are 6-, 8- and 18-decimal, so shares are scaled by each vault's
// OWN `decimals()`, read in the same request as the balance. Nothing here raises
// ten to a fixed 18.
//
// A ZERO BALANCE IS A READING AND IS NOT A ROW. Every catalogued vault is asked;
// the ones that answered zero are counted, not listed, and the count is stated —
// "holds none of the 18" is a reading about the address, never an empty region.
// A vault whose `balanceOf` did not ANSWER is a different thing again: it is
// counted as unread and stated separately, because the read established nothing
// about it.
//
// NO USD AND NO TOTAL ACROSS ASSETS. Two rows in two different tokens are two
// quantities of two different things; nothing here sums or orders them across
// assets, and no price is read.
//
// NOT CACHED. The directory's five-minute cache is right for a reading every
// visitor shares; this one is about one address and stays a read at the head.

import { parseAbi, type ContractFunctionParameters } from "viem";
import { chainBatchClient } from "./rpc";
import { resolveErc20Meta } from "./erc20-meta";
import { readAaveEthereumCatalogue } from "./aave-ethereum-catalogue";
import { readAaveVaultHolderShape, type AaveVaultHolderShape, type AaveVaultRef } from "./aave-ethereum-vault";
import type { RawAmount } from "./morpho-base-vault";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";

const ZERO = BigInt(0);

const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function maxRedeem(address) view returns (uint256)",
]);

/** The calls request B makes on every catalogued vault, in this order. */
const SWEEP_CALLS = ["balanceOf", "maxRedeem", "name", "symbol", "decimals", "asset", "totalSupply"] as const;

type Call = { status: string; result?: unknown };
const ok = (r: Call | undefined): unknown => (r?.status === "success" ? r.result : undefined);

const amount = (raw: bigint, decimals: number): RawAmount => ({
  raw: raw.toString(),
  value: Number(raw) / Math.pow(10, decimals),
});
const maybeAmount = (raw: bigint | undefined, decimals: number): RawAmount | null =>
  raw == null ? null : amount(raw, decimals);

export interface AaveHolderSweepRow {
  /** Lowercased vault address — the row's identity and its page's route. */
  address: string;
  family: AaveVaultFamily;
  name: string | null;
  symbol: string | null;
  /** The SHARE token's own `decimals()` at the block — the scale every share
   *  figure in this row is printed at. Null when the call did not answer. */
  shareDecimals: number | null;
  asset: { address: string; symbol: string; decimals: number; named: boolean };
  /** `balanceOf(holder)` — the one figure the rest of the row hangs off. */
  shares: RawAmount;
  /** `totalSupply()` at the same block — the fraction's denominator. */
  totalSupply: RawAmount | null;
  /** shares ÷ totalSupply, for printing. The exact ratio is the two raws. */
  fraction: number;
  /** True when the fraction rounds to nothing at four significant figures and
   *  the balance is not zero — then the exact share count is the only truthful
   *  thing to print. */
  dust: boolean;
  /** `convertToAssets(shares)` — the VAULT's own answer, in asset units. */
  claim: RawAmount | null;
  /** `maxRedeem(holder)`, in SHARE units. Zero beside a positive balance is a
   *  state on a stake token, not missing data. */
  maxRedeem: RawAmount | null;
}

export interface AaveEthereumHolderSweepResponse {
  /** The address asked about, lowercased. */
  holder: string;
  /** The block the roster AND every figure below was read at. */
  blockNumber: number;
  /** True when the read failed: nothing below may be rendered as a fact. */
  chainStale: boolean;
  /** How many vaults the enumerators plus sGHO answered at that block — the
   *  denominator of "holds none of these N". */
  catalogSize: number;
  stataCount: number;
  stakeCount: number;
  /** One row per vault whose `balanceOf` answered ABOVE zero, in roster order. */
  rows: AaveHolderSweepRow[];
  /** How many answered zero — a reading about each of them. */
  zeroCount: number;
  /** How many did not answer at all — an absence, stated separately. */
  unreadCount: number;
  /** From `eth_getCode` at the same block. Null when that read did not answer. */
  shape: AaveVaultHolderShape | null;
  /** Set when the address asked about is ITSELF in the catalogue at this block
   *  — Aave's own layer holding its own layer. A chain fact: the address came
   *  back from an enumerator. */
  catalogued: AaveVaultRef | null;
  /** When this reading was taken, ISO-8601 UTC. */
  readAt: string;
}

function empty(holder: string): AaveEthereumHolderSweepResponse {
  return {
    holder,
    blockNumber: 0,
    chainStale: true,
    catalogSize: 0,
    stataCount: 0,
    stakeCount: 0,
    rows: [],
    zeroCount: 0,
    unreadCount: 0,
    shape: null,
    catalogued: null,
    readAt: new Date().toISOString(),
  };
}

/**
 * Which of Aave's Ethereum vaults one address holds, and how much of each, at
 * one pinned block.
 *
 * `holder` must already be an address; ENS resolution belongs to the caller
 * (lib/aave-vaults/vault-holder.ts). An address holding nothing is a full
 * reading with no rows — never an error and never a 404.
 */
export async function loadAaveEthereumHolderSweep(holder: string): Promise<AaveEthereumHolderSweepResponse> {
  const address = holder.toLowerCase();
  try {
    const client = chainBatchClient(MAINNET_CHAIN_ID);
    const blockNumber = await client.getBlockNumber();

    // ── A: who the vaults are ────────────────────────────────────────────────
    const catalogue = await readAaveEthereumCatalogue(client, blockNumber);
    if (!catalogue) return empty(address);

    // ── B: the balance, and what a row needs to print it ─────────────────────
    const bRes = (await client.multicall({
      contracts: catalogue.addresses.flatMap((vault) =>
        SWEEP_CALLS.map((functionName) => {
          const call: ContractFunctionParameters = {
            address: vault as `0x${string}`,
            abi: VAULT_ABI,
            functionName,
          };
          if (functionName === "balanceOf" || functionName === "maxRedeem") call.args = [address];
          return call;
        }),
      ),
      batchSize: 0,
      allowFailure: true,
      blockNumber,
    })) as Call[];
    const at = (i: number, call: (typeof SWEEP_CALLS)[number]) =>
      ok(bRes[i * SWEEP_CALLS.length + SWEEP_CALLS.indexOf(call)]);

    const balances = catalogue.addresses.map((_, i) => at(i, "balanceOf") as bigint | undefined);
    const held = catalogue.addresses.map((_, i) => i).filter((i) => balances[i] != null && balances[i]! > ZERO);

    // ── C: what those shares convert to, asked of each vault that holds some ──
    const cRes = held.length
      ? ((await client.multicall({
          contracts: held.map((i) => ({
            address: catalogue.addresses[i] as `0x${string}`,
            abi: VAULT_ABI,
            functionName: "convertToAssets",
            args: [balances[i]!],
          })),
          batchSize: 0,
          allowFailure: true,
          blockNumber,
        })) as Call[])
      : [];
    const claimByRow = new Map<number, bigint>();
    held.forEach((row, i) => {
      const value = ok(cRes[i]);
      if (typeof value === "bigint") claimByRow.set(row, value);
    });

    // ── the address itself ───────────────────────────────────────────────────
    const shape = await readAaveVaultHolderShape(client, address, blockNumber, catalogue.byAddress);

    // Name and scale every distinct asset once, through the resolver the vault
    // page uses — so a row and the page it links to print one symbol per token.
    const assets = catalogue.addresses.map((_, i) => (at(i, "asset") as string | undefined)?.toLowerCase() ?? null);
    const tokens = await resolveErc20Meta(
      [...new Set(held.map((i) => assets[i]).filter((a): a is string => Boolean(a)))],
      MAINNET_CHAIN_ID,
    );

    const rows: AaveHolderSweepRow[] = held.map((i) => {
      const vault = catalogue.addresses[i];
      const assetAddress = assets[i];
      const assetMeta = assetAddress ? tokens.get(assetAddress) : undefined;
      const assetDecimals = assetMeta?.decimals ?? 18;
      const dec = typeof at(i, "decimals") === "number" ? (at(i, "decimals") as number) : null;
      const sharesRaw = balances[i]!;
      const totalSupplyRaw = at(i, "totalSupply") as bigint | undefined;
      const fraction =
        totalSupplyRaw == null || totalSupplyRaw === ZERO ? 0 : Number(sharesRaw) / Number(totalSupplyRaw);
      return {
        address: vault,
        family: catalogue.byAddress.get(vault)!,
        name: (at(i, "name") as string | undefined) ?? null,
        symbol: (at(i, "symbol") as string | undefined) ?? null,
        shareDecimals: dec,
        asset: {
          address: assetAddress ?? "",
          symbol: assetMeta?.symbol ?? (assetAddress ? assetAddress.slice(0, 6) : "not read"),
          decimals: assetDecimals,
          named: Boolean(assetMeta?.named),
        },
        shares: amount(sharesRaw, dec ?? 18),
        totalSupply: totalSupplyRaw == null || dec == null ? null : amount(totalSupplyRaw, dec),
        fraction,
        dust: fraction > 0 && fraction < 0.000001,
        claim: maybeAmount(claimByRow.get(i), assetDecimals),
        maxRedeem: maybeAmount(at(i, "maxRedeem") as bigint | undefined, dec ?? 18),
      };
    });

    const family = catalogue.byAddress.get(address);
    return {
      holder: address,
      blockNumber: Number(blockNumber),
      chainStale: false,
      catalogSize: catalogue.addresses.length,
      stataCount: catalogue.stataCount,
      stakeCount: catalogue.stakeCount,
      rows,
      zeroCount: balances.filter((b) => b != null && b === ZERO).length,
      unreadCount: balances.filter((b) => b == null).length,
      shape,
      catalogued: family ? { address, family, symbol: shape?.kind === "aave-vault" ? shape.symbol : null } : null,
      readAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Aave Ethereum holder sweep chain read failed:", error);
    return empty(address);
  }
}
