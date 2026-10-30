// What one MetaMorpho vault's asset sat in, and one address's slice of it, at a
// LIST of blocks. SERVER-ONLY.
// ----------------------------------------------------------------------------
// `morpho-base-vault.ts` answers this at ONE block — the page's — and this file
// answers the same question at each block a holder's own timeline row happened
// at. The arithmetic is deliberately identical, operand for operand, so the two
// surfaces cannot disagree about the same market at the same block:
//
//     vaultSupplied = position(id, vault).supplyShares × market(id).totalSupplyAssets
//                     ÷ market(id).totalSupplyShares                          (floor)
//     attributed    = balanceOf(holder) × vaultSupplied ÷ totalSupply()       (floor)
//
// Both integer divisions floor, both in the loan token's own raw units, and
// every operand on the right is read AT THE SAME BLOCK as the row it describes.
//
// ── THE ALLOCATION IS REPLAYED FROM BLUE'S OWN ROWS ──────────────────────────
// Never from `ReallocateSupply`, `ReallocateWithdraw` or `SetWithdrawQueue`.
// Those events say a curator moved something; they do not say what is there,
// and summing them would be a ledger of Rails' own making. The withdraw queue
// and Morpho Blue's stored position and market totals ARE what is there, and
// they are readable at any block an archive node keeps. No event in this file.
//
// ── A READ AT A BLOCK, NOT AN INTERVAL ───────────────────────────────────────
// Each answer here describes exactly one block. Between two of a holder's own
// events the curator fired thousands of reallocations that nobody here read, so
// nothing may be drawn, summed or interpolated across the gap. The surface that
// renders this states the rule in words; this file states it by having no field
// that spans two blocks.
//
// ── THE THREE WAVES, AND WHY THEY ARE THREE ──────────────────────────────────
// Each wave's calls depend on the previous wave's answers, so they cannot be
// merged, and inside a wave every call is independent, so it batches:
//
//   1. per block — `totalSupply()`, `balanceOf(holder)`, `withdrawQueueLength()`
//   2. per (block, i) — `withdrawQueue(i)`: the queue's own shape at that block,
//      which is not the shape it has today. On the case-study vault the LENGTH
//      changes 5 → 6 inside one holder's eight events, and the ORDER changes too.
//   3. per (block, leg) — `position(id, vault)` and `market(id)` on the Blue
//      singleton, plus `idToMarketParams(id)` ONLY for a market the catalogue
//      does not already know. Blue's market params are immutable and the id is
//      their hash, so a catalogued market's collateral, oracle and LLTV cannot
//      have drifted; a market created after the census is asked directly.
//
// ── THE STORE ────────────────────────────────────────────────────────────────
// The three waves are read by rails-server's `/api/at-block/metamorpho/allocation`
// (its services/metamorpho-allocation-at.ts), which keeps each call once the
// block is final (server mig 412; rails-ops decisions/0056); `idToMarketParams`
// it reads once per market, at the newest block that queued it. A call that
// reverts or answers nothing is stated UNREAD — never zero, never dropped. A
// request the server could not answer leaves every block unread. A zero is a
// reading and an unread value is not, and this file keeps them apart at every
// level.

import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { MORPHO_MARKETS } from "@/lib/morpho-base/market-catalog";
import type { VaultAllocationLeg } from "@/lib/shared/vault-holder-timeline";
import { atBlockGet } from "./at-block-api";
import { resolveErc20Meta } from "./erc20-meta";

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** idToMarketParams: loanToken, collateralToken, oracle, irm, lltv. */
type MarketParamsTuple = readonly [string, string, string, string, bigint];
/** market(id): totalSupplyAssets, totalSupplyShares, totalBorrowAssets, totalBorrowShares, lastUpdate, fee. */
type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint];
/** position(id, vault): supplyShares, borrowShares, collateral. */
type PositionTuple = readonly [bigint, bigint, bigint];

/** One block's answer: the queue as it stood, the two attribution operands, and
 *  every leg. `legs` is empty only where the queue itself could not be read —
 *  which is stated by `unread`, not by an empty list read as "no markets". */
export interface VaultAllocationAtBlock {
  blockNumber: number;
  /** `totalSupply()` at this block — the attribution denominator. Null unread. */
  totalSupply: string | null;
  /** `balanceOf(holder)` at this block — the attribution numerator, and an
   *  END-of-block figure, where a row's replayed `balanceAfter` is a position
   *  inside the block. The two differ only for an address with two logs in one
   *  block, and the receipt says which this is. */
  holderShares: string | null;
  /** `withdrawQueueLength()` at this block. Null unread. */
  queueLength: number | null;
  legs: VaultAllocationLeg[];
  /** Σ of the legs' `vaultSupplied`, over the legs that answered. Null where
   *  none did. */
  allocatedTotal: string | null;
  /** Set where this block's own reads did not answer at all. */
  unread: boolean;
}

/** A market's immutable params, from the census that bakes them. The roster is
 *  complete as of its census block and each id is the keccak of its own params,
 *  so a row here cannot silently disagree with the chain — but a market created
 *  after the census is simply absent, and wave 3 asks the singleton for it. */
const CATALOGUE = new Map(MORPHO_MARKETS.map((m) => [m.id.toLowerCase(), m]));

/** The server's answer: per block the raw reads, and each market's params. */
interface ServerAllocation {
  reads: {
    block: number;
    totalSupply: string | null;
    holderShares: string | null;
    queueLength: string | null;
    legs: { id: string | null; position: string[] | null; market: string[] | null }[];
  }[];
  params: Record<string, string[] | null>;
}

// ── the three waves ──────────────────────────────────────────────────────────

/**
 * Read the vault's whole allocation, and this holder's attributed slice of it,
 * at each of `blocks`.
 *
 * The answer is a Map keyed by block number so a caller can attach it to the
 * rows it already has without re-ordering anything. A block whose reads did not
 * answer comes back present and `unread` — the caller states that, because
 * "this address held nothing here" and "this was not read" are different facts
 * and only one of them is on the chain.
 */
export async function loadMorphoBaseVaultAllocationAt(
  vault: string,
  holder: string,
  blocks: number[],
): Promise<Map<number, VaultAllocationAtBlock>> {
  const out = new Map<number, VaultAllocationAtBlock>();
  if (!blocks.length) return out;

  const vaultAddress = vault.toLowerCase();
  const empty = (b: number): VaultAllocationAtBlock => ({
    blockNumber: b,
    totalSupply: null,
    holderShares: null,
    queueLength: null,
    legs: [],
    allocatedTotal: null,
    unread: true,
  });

  let served: ServerAllocation;
  try {
    served = await atBlockGet<ServerAllocation>(
      "metamorpho/allocation",
      new URLSearchParams({ vault: vaultAddress, holder: holder.toLowerCase(), blocks: blocks.join(",") }),
    );
  } catch {
    // The server did not answer: every block below is unread.
    for (const b of blocks) out.set(b, empty(b));
    return out;
  }
  const byBlock = new Map(served.reads.map((r) => [r.block, r]));
  const big = (v: string | null | undefined) => (v == null ? null : BigInt(v));
  const state = blocks.map((b) => {
    const r = byBlock.get(b);
    return {
      blockNumber: b,
      totalSupply: big(r?.totalSupply),
      holderShares: big(r?.holderShares),
      queueLength: big(r?.queueLength),
      legs: r?.legs ?? [],
    };
  });
  /** A market's params from the chain, only where the census does not hold them. */
  const fromChainOf = (id: string): MarketParamsTuple | null => {
    if (CATALOGUE.has(id.toLowerCase())) return null;
    const p = served.params[id.toLowerCase()];
    return p ? ([p[0], p[1], p[2], p[3], BigInt(p[4])] as const) : null;
  };

  // ── the collateral symbols, named through the house resolver ──────────────
  // A symbol is a name for a token, not a fact about a block: the resolver's
  // one cached multicall answers it at the head, and where it answers nothing
  // the leg is identified by its market id alone rather than by a truncated
  // address dressed as a ticker.
  const collateralAddresses = new Set<string>();
  for (const s of state)
    for (const leg of s.legs) {
      if (!leg.id) continue;
      const catalogued = CATALOGUE.get(leg.id.toLowerCase());
      const fromChain = fromChainOf(leg.id);
      const collateral = (catalogued?.collateralToken ?? fromChain?.[1] ?? "").toLowerCase();
      if (collateral && collateral !== ZERO_ADDR) collateralAddresses.add(collateral);
    }
  const meta = collateralAddresses.size
    ? await resolveErc20Meta([...collateralAddresses], MORPHO_BASE_CHAIN_ID)
    : new Map<string, { symbol: string; named: boolean }>();

  // ── the attribution ───────────────────────────────────────────────────────
  for (let b = 0; b < state.length; b++) {
    const s = state[b];
    const legs: VaultAllocationLeg[] = [];
    let allocated: bigint | null = null;

    for (const [queueIndex, span] of s.legs.entries()) {
      if (!span.id) {
        // The queue slot itself did not answer. There IS a leg here — the
        // length said so — and nothing about it was read.
        legs.push({
          marketId: "",
          queueIndex,
          collateralToken: null,
          collateralSymbol: null,
          collateralNamed: false,
          lltv: null,
          isIdle: false,
          supplyShares: null,
          marketTotalSupplyAssets: null,
          marketTotalSupplyShares: null,
          vaultSupplied: null,
          attributed: null,
        });
        continue;
      }
      const catalogued = CATALOGUE.get(span.id.toLowerCase());
      const fromChain = fromChainOf(span.id);
      const collateralToken = (catalogued?.collateralToken ?? fromChain?.[1])?.toLowerCase() ?? null;
      const oracle = (catalogued?.oracle ?? fromChain?.[2])?.toLowerCase() ?? null;
      const lltv = catalogued?.lltv ?? fromChain?.[4]?.toString() ?? null;
      const coll = collateralToken && collateralToken !== ZERO_ADDR ? meta.get(collateralToken) : undefined;

      const position = span.position ? (span.position.map((v) => BigInt(v)) as unknown as PositionTuple) : null;
      const market = span.market ? (span.market.map((v) => BigInt(v)) as unknown as MarketTuple) : null;
      // Blue's own share→asset conversion on its STORED totals — the market's
      // last settled state, which is what `market(id)` holds. No accrual is
      // applied: accruing in a reader would be Rails' arithmetic sitting where
      // the contract's own figure belongs.
      const supplied = position && market ? (market[1] === ZERO ? ZERO : (position[0] * market[0]) / market[1]) : null;
      const attributed =
        supplied != null && s.holderShares != null && s.totalSupply != null
          ? s.totalSupply === ZERO
            ? ZERO
            : (s.holderShares * supplied) / s.totalSupply
          : null;
      if (supplied != null) allocated = (allocated ?? ZERO) + supplied;

      legs.push({
        marketId: span.id.toLowerCase(),
        queueIndex,
        collateralToken,
        collateralSymbol: coll?.named ? coll.symbol : null,
        collateralNamed: Boolean(coll?.named),
        lltv,
        // The idle market is the one with no collateral token and no oracle —
        // where a vault holds cash inside Blue rather than outside it. It is
        // labelled as that, never as a collateral it does not have.
        isIdle: collateralToken === ZERO_ADDR && oracle === ZERO_ADDR,
        supplyShares: position ? position[0].toString() : null,
        marketTotalSupplyAssets: market ? market[0].toString() : null,
        marketTotalSupplyShares: market ? market[1].toString() : null,
        vaultSupplied: supplied?.toString() ?? null,
        attributed: attributed?.toString() ?? null,
      });
    }

    out.set(s.blockNumber, {
      blockNumber: s.blockNumber,
      totalSupply: s.totalSupply?.toString() ?? null,
      holderShares: s.holderShares?.toString() ?? null,
      queueLength: s.queueLength == null ? null : Number(s.queueLength),
      legs,
      allocatedTotal: allocated?.toString() ?? null,
      unread: s.queueLength == null && s.totalSupply == null,
    });
  }

  return out;
}
