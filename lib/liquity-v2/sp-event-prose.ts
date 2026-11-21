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

/** The bullet naming a sender other than the depositor; the card links the
 *  address to its wallet page (ui-jobs 751). */
export const spSenderSentence = (txFrom: string) => `${short(txFrom)} sent the transaction.`;

/** The row's label: what the operation did. */
export function spEventLabel(r: SpProseRow): string {
  const change = big(r.top_up_or_withdrawal);
  if (r.operation === 2) return "Claimed";
  if (big(r.deposit_before) === ZERO && change > ZERO) return "Opened";
  if (r.operation === 1 && big(r.deposit_after) === ZERO && change < ZERO) return "Withdrew all";
  if (change > ZERO) return "Deposited";
  if (change < ZERO) return "Withdrew";
  if (big(r.yield_gain_claimed) > ZERO || big(r.coll_gain_claimed) > ZERO) return "Claimed";
  if (big(r.yield_gain_since) - big(r.yield_gain_claimed) > ZERO) return "Compounded";
  return "Touched";
}

/** The row's sentences, each one fact, never none. `coll` is the branch's
 *  collateral, `stable` the pool's stablecoin (a fork's USDaf, BD, ebUSD). */
export function spEventSentences(r: SpProseRow, coll: string, stable = "BOLD"): string[] {
  const out: string[] = [];
  const change = big(r.top_up_or_withdrawal);
  if (change > ZERO) out.push(`The depositor deposited ${amt(change, stable)}.`);
  if (change < ZERO) out.push(`The depositor withdrew ${amt(-change, stable)}.`);
  if (r.tx_from && r.tx_from.toLowerCase() !== r.depositor.toLowerCase()) out.push(spSenderSentence(r.tx_from));
  const loss = big(r.deposit_loss);
  if (loss > ZERO)
    out.push(
      `Liquidations since the previous touch had burned ${amt(loss, stable)} of the deposit; this touch wrote it.`,
    );
  const gain = big(r.yield_gain_since);
  const claimed = big(r.yield_gain_claimed);
  if (gain > ZERO)
    out.push(
      claimed === gain
        ? `The branch's interest paid ${amt(gain, stable)} of yield, all claimed.`
        : claimed > ZERO
          ? `The branch's interest paid ${amt(gain, stable)} of yield and ${amt(claimed, stable)} was claimed; the rest stays in the deposit.`
          : `The branch's interest paid ${amt(gain, stable)} of yield, kept in the deposit.`,
    );
  const collIn = big(r.coll_gain_since);
  const collOut = big(r.coll_gain_claimed);
  const stashBefore = big(r.stash_before);
  if (r.operation === 2) {
    out.push(
      collOut > ZERO
        ? `The depositor claimed the collateral stash and was sent ${amt(collOut, coll)}.`
        : `The depositor claimed the collateral stash, which was empty.`,
    );
    return out;
  }
  if (collIn > ZERO)
    out.push(
      collOut > ZERO
        ? `Liquidations paid ${amt(collIn, coll)} in.`
        : `Liquidations paid ${amt(collIn, coll)} in, stashed for a later claim.`,
    );
  if (collOut > ZERO)
    out.push(
      stashBefore > ZERO
        ? `The touch sent ${amt(collOut, coll)} to the depositor, the ${amt(stashBefore, coll)} stashed at earlier touches included.`
        : `The touch sent ${amt(collOut, coll)} to the depositor.`,
    );
  if (change === ZERO && loss === ZERO && gain === ZERO && collIn === ZERO && collOut === ZERO)
    out.push("The touch moved nothing.");
  return out;
}
