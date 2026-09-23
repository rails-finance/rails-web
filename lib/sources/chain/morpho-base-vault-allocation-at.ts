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
// ── THE LANE, AND WHY THE BATCHES ARE POSTED BY HAND ─────────────────────────
// `BASE_BACKFILL_RPC_URL`, the same lane the sibling timeline reader names, and
// the one these three waves were measured on. It meters on COMPUTE UNITS PER
// SECOND as well as on response size, so one large JSON-RPC batch can be
// refused where the same calls made singly pass — and viem does not retry an
// HTTP 429 that carries a JSON-RPC error body. So the batches are posted here
// rather than left to a transport: a refused batch is HALVED and retried, never
// abandoned, because abandoning it would turn a rate limit into a page that
// says a market held nothing. A call that is still refused at a batch of one is
// stated UNREAD — never zero, never dropped. A zero is a reading and an unread
// value is not, and this file keeps them apart at every level.

import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

import { MORPHO_BASE_BLUE, MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { MORPHO_MARKETS } from "@/lib/morpho-base/market-catalog";
import type { VaultAllocationLeg } from "@/lib/shared/vault-holder-timeline";
import { resolveErc20Meta } from "./erc20-meta";

const ZERO = BigInt(0);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

/** The endpoint these reads run on, named rather than resolved: a receipt
 *  states the NAME because the URL carries a key. */
export const MORPHO_BASE_ALLOCATION_LANE = "BASE_BACKFILL_RPC_URL";

/** Calls per JSON-RPC request. Under the 100 the lane was measured comfortable
 *  with, and halved on a refusal rather than raised. */
const BATCH = 60;
/** Requests in flight at once — the lane's limit is compute units per SECOND,
 *  so the cap that matters is concurrency, not total. */
const CONCURRENCY = 3;

const VAULT_ABI = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function withdrawQueueLength() view returns (uint256)",
  "function withdrawQueue(uint256) view returns (bytes32)",
]);

const BLUE_ABI = parseAbi([
  "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);

type MarketParamsTuple = readonly [string, string, string, string, bigint];
type MarketTuple = readonly [bigint, bigint, bigint, bigint, bigint, bigint];
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

// ── the batch poster ─────────────────────────────────────────────────────────

interface EthCall {
  to: string;
  data: string;
  block: bigint;
}

/**
 * Post `eth_call`s as JSON-RPC batches and hand back one answer per call, in
 * order, with `null` for any that did not answer.
 *
 * A batch the lane refuses whole — a 429 on compute units, a body that is not
 * an array, a transport error — is HALVED and both halves retried, down to a
 * single call. Only at that floor does a refusal become an unread answer, and
 * it becomes unread for that one call rather than for its neighbours. Halving
 * rather than dropping is the whole point: a rate limit that silently emptied a
 * leg would render as "this market held nothing", which is a different and
 * false statement.
 */
async function postCalls(url: string, calls: EthCall[]): Promise<(string | null)[]> {
  const out = new Array<string | null>(calls.length).fill(null);
  const groups: { from: number; count: number }[] = [];
  for (let i = 0; i < calls.length; i += BATCH) groups.push({ from: i, count: Math.min(BATCH, calls.length - i) });

  const runGroup = async (from: number, count: number, attempt: number): Promise<void> => {
    const body = Array.from({ length: count }, (_, k) => ({
      jsonrpc: "2.0",
      id: k,
      method: "eth_call",
      params: [{ to: calls[from + k].to, data: calls[from + k].data }, `0x${calls[from + k].block.toString(16)}`],
    }));
    let answers: unknown = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      answers = await res.json();
    } catch {
      answers = null;
    }
    if (Array.isArray(answers)) {
      for (const item of answers as { id?: number; result?: string }[]) {
        if (typeof item?.id === "number" && typeof item.result === "string") out[from + item.id] = item.result;
      }
      return;
    }
    // The batch itself was refused. One call cannot be halved further, so a
    // refusal there is this call's own unread answer; anything larger splits.
    if (count === 1) return;
    if (attempt > 6) return;
    await new Promise((r) => setTimeout(r, 120 * attempt));
    const half = Math.ceil(count / 2);
    await runGroup(from, half, attempt + 1);
    await runGroup(from + half, count - half, attempt + 1);
  };

  for (let i = 0; i < groups.length; i += CONCURRENCY)
    await Promise.all(groups.slice(i, i + CONCURRENCY).map((g) => runGroup(g.from, g.count, 1)));
  return out;
}

type VaultFn = "totalSupply" | "balanceOf" | "withdrawQueueLength" | "withdrawQueue";
type BlueFn = "idToMarketParams" | "market" | "position";

/** One `eth_call` answer, decoded, with a refusal and a revert both landing on
 *  null — the caller states an unread figure either way rather than a zero. */
function decode<T>(abi: typeof VAULT_ABI, fn: VaultFn, data: string | null): T | null;
function decode<T>(abi: typeof BLUE_ABI, fn: BlueFn, data: string | null): T | null;
function decode<T>(abi: typeof VAULT_ABI | typeof BLUE_ABI, fn: string, data: string | null): T | null {
  if (!data || data === "0x") return null;
  try {
    return decodeFunctionResult({
      abi: abi as typeof VAULT_ABI,
      functionName: fn as VaultFn,
      data: data as `0x${string}`,
    }) as T;
  } catch {
    return null;
  }
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

  const url = process.env[MORPHO_BASE_ALLOCATION_LANE];
  const vaultAddress = vault.toLowerCase();
  const blue = MORPHO_BASE_BLUE.toLowerCase();
  const empty = (b: number): VaultAllocationAtBlock => ({
    blockNumber: b,
    totalSupply: null,
    holderShares: null,
    queueLength: null,
    legs: [],
    allocatedTotal: null,
    unread: true,
  });
  if (!url) {
    for (const b of blocks) out.set(b, empty(b));
    return out;
  }

  const at = blocks.map((b) => BigInt(b));

  // ── wave 1 — the denominator, the numerator, and how long the queue is ─────
  const w1 = await postCalls(
    url,
    at.flatMap((block) => [
      { to: vaultAddress, block, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "totalSupply" }) },
      {
        to: vaultAddress,
        block,
        data: encodeFunctionData({ abi: VAULT_ABI, functionName: "balanceOf", args: [holder as `0x${string}`] }),
      },
      { to: vaultAddress, block, data: encodeFunctionData({ abi: VAULT_ABI, functionName: "withdrawQueueLength" }) },
    ]),
  );

  const state = blocks.map((b, i) => ({
    blockNumber: b,
    block: at[i],
    totalSupply: decode<bigint>(VAULT_ABI, "totalSupply", w1[i * 3]),
    holderShares: decode<bigint>(VAULT_ABI, "balanceOf", w1[i * 3 + 1]),
    queueLength: decode<bigint>(VAULT_ABI, "withdrawQueueLength", w1[i * 3 + 2]),
  }));

  // ── wave 2 — the queue's own shape at each block ──────────────────────────
  const queueCalls: EthCall[] = [];
  const queueSpan: { from: number; count: number }[] = [];
  for (const s of state) {
    const n = s.queueLength == null ? 0 : Number(s.queueLength);
    queueSpan.push({ from: queueCalls.length, count: n });
    for (let i = 0; i < n; i++)
      queueCalls.push({
        to: vaultAddress,
        block: s.block,
        data: encodeFunctionData({ abi: VAULT_ABI, functionName: "withdrawQueue", args: [BigInt(i)] }),
      });
  }
  const w2 = await postCalls(url, queueCalls);
  const queues = queueSpan.map(({ from, count }) =>
    Array.from({ length: count }, (_, i) => decode<string>(VAULT_ABI, "withdrawQueue", w2[from + i])),
  );

  // ── wave 3 — Blue's own rows, and the params the catalogue cannot supply ──
  const legCalls: EthCall[] = [];
  const legSpan: { id: string | null; queueIndex: number; pos: number; mkt: number; params: number | null }[][] = [];
  for (let b = 0; b < state.length; b++) {
    const rowSpans: (typeof legSpan)[number] = [];
    queues[b].forEach((id, queueIndex) => {
      if (!id) {
        rowSpans.push({ id: null, queueIndex, pos: -1, mkt: -1, params: null });
        return;
      }
      const block = state[b].block;
      const pos = legCalls.length;
      legCalls.push({
        to: blue,
        block,
        data: encodeFunctionData({
          abi: BLUE_ABI,
          functionName: "position",
          args: [id as `0x${string}`, vaultAddress as `0x${string}`],
        }),
      });
      const mkt = legCalls.length;
      legCalls.push({
        to: blue,
        block,
        data: encodeFunctionData({ abi: BLUE_ABI, functionName: "market", args: [id as `0x${string}`] }),
      });
      // Only where the census does not already hold this market's immutable
      // params. Blue mints an id as the hash of those params, so a catalogued
      // row cannot be a stale one — it can only be missing.
      let params: number | null = null;
      if (!CATALOGUE.has(id.toLowerCase())) {
        params = legCalls.length;
        legCalls.push({
          to: blue,
          block,
          data: encodeFunctionData({ abi: BLUE_ABI, functionName: "idToMarketParams", args: [id as `0x${string}`] }),
        });
      }
      rowSpans.push({ id, queueIndex, pos, mkt, params });
    });
    legSpan.push(rowSpans);
  }
  const w3 = await postCalls(url, legCalls);

  // ── the collateral symbols, named through the house resolver ──────────────
  // A symbol is a name for a token, not a fact about a block: the resolver's
  // one cached multicall answers it at the head, and where it answers nothing
  // the leg is identified by its market id alone rather than by a truncated
  // address dressed as a ticker.
  const collateralAddresses = new Set<string>();
  for (let b = 0; b < legSpan.length; b++)
    for (const span of legSpan[b]) {
      if (!span.id) continue;
      const catalogued = CATALOGUE.get(span.id.toLowerCase());
      const fromChain =
        span.params == null ? null : (decode<MarketParamsTuple>(BLUE_ABI, "idToMarketParams", w3[span.params]) ?? null);
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

    for (const span of legSpan[b]) {
      if (!span.id) {
        // The queue slot itself did not answer. There IS a leg here — the
        // length said so — and nothing about it was read.
        legs.push({
          marketId: "",
          queueIndex: span.queueIndex,
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
      const fromChain =
        span.params == null ? null : decode<MarketParamsTuple>(BLUE_ABI, "idToMarketParams", w3[span.params]);
      const collateralToken = (catalogued?.collateralToken ?? fromChain?.[1])?.toLowerCase() ?? null;
      const oracle = (catalogued?.oracle ?? fromChain?.[2])?.toLowerCase() ?? null;
      const lltv = catalogued?.lltv ?? fromChain?.[4]?.toString() ?? null;
      const coll = collateralToken && collateralToken !== ZERO_ADDR ? meta.get(collateralToken) : undefined;

      const position = decode<PositionTuple>(BLUE_ABI, "position", w3[span.pos]);
      const market = decode<MarketTuple>(BLUE_ABI, "market", w3[span.mkt]);
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
        queueIndex: span.queueIndex,
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
