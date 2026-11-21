// The words of a Liquity V1 LQTY stake's timeline row: the label of one touch
// and the sentences its Explanation states, from the row's fields. Every touch
// pays out the LUSD and ETH fees the stake has been paid since the last one.
// Pure: no imports, so scripts/test/liquity-v1-staking.test.mjs loads it.

const ZERO = BigInt(0);
const E18 = BigInt("1000000000000000000");

/** The row's fields this file reads, raw 1e18 integer strings. */
export interface StakeProseRow {
  operation: string;
  stake_before: string;
  stake_after: string;
  stake_change: string;
  lusd_gain: string;
  eth_gain: string;
}

const big = (raw: string | null | undefined): bigint => (raw == null || raw === "" ? ZERO : BigInt(raw));

const exact = (v: bigint): string => {
  const a = v < ZERO ? -v : v;
  const frac = (a % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return `${(a / E18).toString()}${frac ? `.${frac}` : ""}`;
};

const amt = (v: bigint, symbol: string) => `${exact(v)} ${symbol}`;

/** The row's label: what the touch did. */
export function stEventLabel(r: StakeProseRow): string {
  const change = big(r.stake_change);
  if (big(r.stake_before) === ZERO && change > ZERO) return "Opened";
  if (big(r.stake_after) === ZERO && big(r.stake_before) > ZERO) return "Unstaked all";
  if (change > ZERO) return "Staked";
  if (change < ZERO) return "Unstaked";
  if (big(r.lusd_gain) > ZERO || big(r.eth_gain) > ZERO) return "Claimed";
  return "Touched";
}

/** The row's sentences, each one fact, never none. */
export function stEventSentences(r: StakeProseRow): string[] {
  const out: string[] = [];
  const change = big(r.stake_change);
  if (change > ZERO) out.push(`The staker staked ${amt(change, "LQTY")}.`);
  if (change < ZERO) out.push(`The staker unstaked ${amt(-change, "LQTY")}.`);
  if (change === ZERO) out.push("The staker called unstake with 0, which claims the fees and moves no LQTY.");
  const lusd = big(r.lusd_gain);
  if (lusd > ZERO) out.push(`The touch paid the staker ${amt(lusd, "LUSD")} of borrowing fees.`);
  const eth = big(r.eth_gain);
  if (eth > ZERO) out.push(`The touch paid the staker ${amt(eth, "ETH")} of redemption fees.`);
  if (change !== ZERO && lusd === ZERO && eth === ZERO) out.push("No fees were pending, so the touch paid none.");
  return out;
}
