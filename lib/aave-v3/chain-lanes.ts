// The aToken / variable debt token balance, replayed exactly (decision 0033).
// ----------------------------------------------------------------------------
// An Aave V3 token stores a scaled balance: a mint or burn of `amount` moves it
// by amount ÷ the reserve's index at that transaction, and balanceOf is the
// scaled balance × the index now. The Base replays (replayAaveV3Rows) walk the
// rows with the index each one was applied at (rails-server
// services/aave-base-row-indexes.ts), so each row states what the token held
// around it, interest included, and the interest the lane accrued since the
// transaction that last moved it.
//
// ROUNDING follows the Pool revision (rails-server mig 257): up to the V3.5
// upgrade every division and multiplication rounds half up; from it a mint of
// aTokens and a burn of debt tokens divide down, a burn of aTokens and a mint
// of debt tokens divide up, and balanceOf rounds down for an aToken, up for a
// debt token. A BalanceTransfer moves its emitted scaled value as it is.

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const RAY = BigInt("1000000000000000000000000000");

export type Axis = "supply" | "debt";

/** (block, transaction) of the last event that rounds half up; null: every
 *  event does (a Pool that never took V3.5). */
export type HalfUpThrough = readonly [number, number] | null;

const halfUpAt = (h: HalfUpThrough, block: number, txIndex: number): boolean =>
  h == null || block < h[0] || (block === h[0] && txIndex <= h[1]);

/** The scaled amount a signed nominal delta moves the lane by. */
export function scaledDelta(
  axis: Axis,
  nominal: bigint,
  index: bigint,
  h: HalfUpThrough,
  block: number,
  txIndex: number,
): bigint {
  if (nominal === ZERO) return ZERO;
  const neg = nominal < ZERO;
  const a = neg ? -nominal : nominal;
  let q: bigint;
  if (halfUpAt(h, block, txIndex)) q = (a * RAY + index / TWO) / index;
  else if ((axis === "supply") === neg) q = (a * RAY + index - ONE) / index;
  else q = (a * RAY) / index;
  return neg ? -q : q;
}

/** balanceOf for a scaled balance at an index. */
export function balanceOfScaled(
  axis: Axis,
  scaled: bigint,
  index: bigint,
  h: HalfUpThrough,
  block: number,
  txIndex: number,
): bigint {
  if (scaled <= ZERO) return ZERO;
  if (halfUpAt(h, block, txIndex)) return (scaled * index + RAY / TWO) / RAY;
  return axis === "supply" ? (scaled * index) / RAY : (scaled * index + RAY - ONE) / RAY;
}

/** One lane's replayed state. `known` false: a row the walk could not value
 *  (no index) has passed, so nothing after it is stated. */
export interface LaneState {
  scaled: bigint;
  /** The index and (block, transaction) of the lane's last move. */
  index: bigint | null;
  block: number;
  txIndex: number;
  /** Σ the signed amounts moved (a transfer's value × its index ÷ 1e27). */
  net: bigint;
  known: boolean;
}

/** A row's figures on one lane. */
export interface LaneMove {
  before: bigint;
  after: bigint;
  scaled: bigint;
  index: bigint;
  /** Interest since the lane's previous move; null where there was none. */
  interest: bigint | null;
}

export class ChainLanes {
  private lanes = new Map<string, LaneState>();
  constructor(
    private readonly h: HalfUpThrough,
    /** A lane never seen opens at zero and known (a whole history), or
     *  unknown (a history that starts after the Pool's first block). */
    private readonly openKnown: boolean,
  ) {}

  private key(axis: Axis, reserve: string) {
    return `${axis}:${reserve}`;
  }

  get(axis: Axis, reserve: string): LaneState {
    const k = this.key(axis, reserve);
    let s = this.lanes.get(k);
    if (!s) {
      s = { scaled: ZERO, index: null, block: 0, txIndex: 0, net: ZERO, known: this.openKnown };
      this.lanes.set(k, s);
    }
    return s;
  }

  /** Open a lane from a seed's state at its cut; null: the seed cannot state
   *  it (a row before the cut had no index, or the seed predates the field). */
  seed(axis: Axis, reserve: string, v: { scaled: bigint; net: bigint; index: bigint } | null, cutBlock: number) {
    const s = this.get(axis, reserve);
    if (!v) {
      s.known = false;
      return;
    }
    s.scaled = v.scaled;
    s.net = v.net;
    s.index = v.index;
    // The index's own transaction is not in the seed; any block before the cut
    // on the same side of the V3.5 upgrade rounds the same way.
    s.block = cutBlock - 1;
    s.txIndex = 0;
    s.known = true;
  }

  /** Apply one row's move on a lane: `nominal` is the signed amount, `direct`
   *  a BalanceTransfer's signed scaled value (applied as it is). Returns the
   *  row's figures, or null where the lane is not known or the row carries no
   *  index (the lane is unknown from then on). */
  move(
    axis: Axis,
    reserve: string,
    p: { nominal: bigint; direct?: bigint; index: bigint | null | undefined; block: number; txIndex: number },
  ): LaneMove | null {
    const s = this.get(axis, reserve);
    s.net += p.nominal;
    if (!s.known) return null;
    if (p.index == null) {
      // A move with no index cannot be valued; one that moves nothing leaves
      // the lane as it was.
      if (p.nominal !== ZERO || (p.direct != null && p.direct !== ZERO)) s.known = false;
      return null;
    }
    const idx = p.index;
    const prev = s.scaled;
    const before = balanceOfScaled(axis, prev, idx, this.h, p.block, p.txIndex);
    const interest =
      s.index != null && prev > ZERO ? before - balanceOfScaled(axis, prev, s.index, this.h, s.block, s.txIndex) : null;
    s.scaled = prev + (p.direct ?? scaledDelta(axis, p.nominal, idx, this.h, p.block, p.txIndex));
    s.index = idx;
    s.block = p.block;
    s.txIndex = p.txIndex;
    return {
      before,
      after: balanceOfScaled(axis, s.scaled, idx, this.h, p.block, p.txIndex),
      scaled: s.scaled,
      index: idx,
      interest,
    };
  }

  /** A known lane's balance after its last move; null otherwise. */
  balance(axis: Axis, reserve: string): bigint | null {
    const s = this.lanes.get(this.key(axis, reserve));
    if (!s || !s.known || s.index == null) return s && s.known && s.scaled === ZERO ? ZERO : null;
    return balanceOfScaled(axis, s.scaled, s.index, this.h, s.block, s.txIndex);
  }

  /** Every known lane: its balance after its last move, and the net moved. */
  totals(): { axis: Axis; reserve: string; balance: bigint; net: bigint; block: number }[] {
    const out: { axis: Axis; reserve: string; balance: bigint; net: bigint; block: number }[] = [];
    for (const [k, s] of this.lanes) {
      if (!s.known || s.index == null) continue;
      const [axis, reserve] = k.split(":") as [Axis, string];
      out.push({
        axis,
        reserve,
        balance: balanceOfScaled(axis, s.scaled, s.index, this.h, s.block, s.txIndex),
        net: s.net,
        block: s.block,
      });
    }
    return out;
  }
}
