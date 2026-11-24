// The words of a Liquity V1 stability-pool deposit's timeline row: the label
// of one touch and the sentences its Explanation states, from the row's
// fields as rails-ops reference/liquity-v1-stability-pool.md reads them. Every
// touch pays out the ETH and LQTY the deposit has gained: to the depositor, or
// the ETH to its Trove on withdrawETHGainToTrove. Pure: no imports, so
// scripts/test/liquity-v1-sp.test.mjs loads it directly.

const ZERO = BigInt(0);
const E18 = BigInt("1000000000000000000");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** The row's fields this file reads, raw 1e18 integer strings. */
export interface SpProseRow {
  operation: string;
  front_end: string;
  deposit_before: string;
  deposit_after: string;
  deposit_loss: string;
  top_up_or_withdrawal: string;
  eth_gain: string;
  lqty_gain: string;
}

const big = (raw: string | null | undefined): bigint => (raw == null || raw === "" ? ZERO : BigInt(raw));

const exact = (v: bigint): string => {
  const a = v < ZERO ? -v : v;
  const frac = (a % E18).toString().padStart(18, "0").replace(/0+$/, "");
  return `${(a / E18).toString()}${frac ? `.${frac}` : ""}`;
};

const amt = (v: bigint, symbol: string) => `${exact(v)} ${symbol}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The row's label: what the touch did. */
export function spEventLabel(r: SpProseRow): string {
  const change = big(r.top_up_or_withdrawal);
  if (big(r.deposit_before) === ZERO && change > ZERO) return "Opened";
  if (big(r.deposit_after) === ZERO && big(r.deposit_before) > ZERO) return "Withdrew all";
  if (change > ZERO) return "Deposited";
  if (change < ZERO) return "Withdrew";
  if (r.operation === "withdrawETHGainToTrove") return "ETH to Trove";
  if (big(r.eth_gain) > ZERO || big(r.lqty_gain) > ZERO) return "Claimed";
  return "Touched";
}

/** The row's sentences, each one fact, never none. */
export function spEventSentences(r: SpProseRow): string[] {
  const out: string[] = [];
  const change = big(r.top_up_or_withdrawal);
  const opening = big(r.deposit_before) === ZERO && change > ZERO;
  if (change > ZERO) out.push(`The depositor deposited ${amt(change, "LUSD")}.`);
  if (change < ZERO) out.push(`The depositor withdrew ${amt(-change, "LUSD")}.`);
  if (opening)
    out.push(
      r.front_end && r.front_end.toLowerCase() !== ZERO_ADDRESS
        ? `The deposit opened through the front end ${short(r.front_end)}, which takes a share of its LQTY.`
        : "The deposit opened through no front end.",
    );
  const loss = big(r.deposit_loss);
  if (loss > ZERO)
    out.push(
      `Liquidations since the previous touch had burned ${amt(loss, "LUSD")} of the deposit; this touch wrote it.`,
    );
  const eth = big(r.eth_gain);
  if (eth > ZERO)
    out.push(
      r.operation === "withdrawETHGainToTrove"
        ? `Liquidations had paid ${amt(eth, "ETH")} in; the touch sent it to the depositor's Trove as collateral.`
        : `Liquidations had paid ${amt(eth, "ETH")} in; the touch sent it to the depositor.`,
    );
  const lqty = big(r.lqty_gain);
  if (lqty > ZERO) out.push(`The touch paid the depositor ${amt(lqty, "LQTY")}.`);
  if (change === ZERO && loss === ZERO && eth === ZERO && lqty === ZERO) out.push("The touch moved nothing.");
  return out;
}
