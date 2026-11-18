// The words of a Liquity V2 stability-pool deposit's timeline row: the label
// of one DepositOperation and the sentences its Explanation states, from the
// row's fields as rails-ops reference/liquity-v2-stability-pool-deposits.md
// reads them. One doClaim flag claims both gains or neither: unclaimed yield
// joins the deposit, unclaimed collateral is stashed, and a claim sends the
// stash with the new collateral. Pure: no imports, so
// scripts/test/liquity-v2-sp.test.mjs loads it directly.

const ZERO = BigInt(0);
const E18 = BigInt("1000000000000000000");

/** The row's fields this file reads, raw 1e18 integer strings. */
export interface SpProseRow {
  operation: number;
  depositor: string;
  tx_from: string | null;
  deposit_before: string;
  deposit_after: string;
  deposit_loss: string;
  top_up_or_withdrawal: string;
  yield_gain_since: string;
  yield_gain_claimed: string;
  coll_gain_since: string;
  coll_gain_claimed: string;
  stash_before: string;
}

const big = (raw: string | null | undefined): bigint => (raw == null || raw === "" ? ZERO : BigInt(raw));

const exact = (v: bigint): string => {
  const a = v < ZERO ? -v : v;
  const frac = (a % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return `${(a / E18).toString()}${frac ? `.${frac}` : ""}`;
};

const amt = (v: bigint, symbol: string) => `${exact(v)} ${symbol}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The row's label: what the operation did. */
export function spEventLabel(r: SpProseRow): string {
  const change = big(r.top_up_or_withdrawal);
  if (r.operation === 2) return "Claimed";
  if (big(r.deposit_before) === ZERO && change > ZERO) return "Opened";
  if (r.operation === 1 && big(r.deposit_after) === ZERO && change < ZERO) return "Withdrew all";
  if (change > ZERO) return "Deposited";
  if (change < ZERO) return "Withdrew";
  if (big(r.yield_gain_claimed) > ZERO || big(r.coll_gain_claimed) > ZERO) return "Claimed";
  return "Compounded";
}

/** The row's sentences, each one fact. `coll` is the branch's collateral. */
export function spEventSentences(r: SpProseRow, coll: string): string[] {
  const out: string[] = [];
  const change = big(r.top_up_or_withdrawal);
  if (change > ZERO) out.push(`The depositor provided ${amt(change, "BOLD")} to the ${coll} Stability Pool.`);
  if (change < ZERO) out.push(`The depositor withdrew ${amt(-change, "BOLD")} from the deposit.`);
  if (r.tx_from && r.tx_from.toLowerCase() !== r.depositor.toLowerCase())
    out.push(`${short(r.tx_from)} sent the transaction.`);
  const loss = big(r.deposit_loss);
  if (loss > ZERO)
    out.push(
      `Liquidations since the previous touch had burned ${amt(loss, "BOLD")} of the deposit; this touch wrote it.`,
    );
  const gain = big(r.yield_gain_since);
  const claimed = big(r.yield_gain_claimed);
  if (gain > ZERO)
    out.push(
      claimed === gain
        ? `The branch's interest had paid ${amt(gain, "BOLD")} of yield since the previous touch, all sent to the depositor.`
        : claimed > ZERO
          ? `The branch's interest had paid ${amt(gain, "BOLD")} of yield since the previous touch; ${amt(claimed, "BOLD")} was sent to the depositor and the rest joined the deposit.`
          : `The branch's interest had paid ${amt(gain, "BOLD")} of yield since the previous touch, added to the deposit.`,
    );
  const collIn = big(r.coll_gain_since);
  const collOut = big(r.coll_gain_claimed);
  const stashBefore = big(r.stash_before);
  if (r.operation === 2) {
    out.push(
      collOut > ZERO
        ? `The depositor claimed the collateral stash: ${amt(collOut, coll)} sent.`
        : `The depositor claimed the collateral stash, which was empty.`,
    );
    return out;
  }
  if (collIn > ZERO)
    out.push(
      collOut > ZERO
        ? `Liquidations had paid ${amt(collIn, coll)} in since the previous touch.`
        : `Liquidations had paid ${amt(collIn, coll)} in since the previous touch, stashed for a later claim.`,
    );
  if (collOut > ZERO)
    out.push(
      stashBefore > ZERO
        ? `The touch sent ${amt(collOut, coll)} to the depositor, the ${amt(stashBefore, coll)} stashed at earlier touches included.`
        : `The touch sent ${amt(collOut, coll)} to the depositor.`,
    );
  return out;
}
