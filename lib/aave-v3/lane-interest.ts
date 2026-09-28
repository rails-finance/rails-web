// Lifetime interest per lane on the Aave V3 and SparkLend Ethereum timelines
// (rails-server services/aave-family-chain-rows.ts, decision 0033).
//
// The api states, per (reserve, axis) the position ever moved, the net of the
// amounts its events moved on it — supplies, aToken transfers in and borrows
// positive; withdrawals, transfers out, repays (aToken repays on the supply
// lane too), liquidations and write-offs negative — beside the chain balance
// after the lane's last move. A balance held now less that net is the interest
// the lane has earned or accrued over the position's life, transfers included,
// so no conservation gate is needed.

/** One lane as the api's `laneInterest` states it. Integers are raw strings. */
export interface AaveLaneInterest {
  market: string;
  reserve: string;
  axis: "supply" | "debt";
  /** The chain balance after the lane's last move. */
  balance: string;
  /** Σ of the amounts the position's events moved on the lane. */
  net: string;
  /** balance − net: the interest to the lane's last move. */
  interest: string;
  block: number;
}

export function laneFor(
  lanes: readonly AaveLaneInterest[] | null | undefined,
  address: string,
  axis: "supply" | "debt",
): AaveLaneInterest | undefined {
  const a = address.toLowerCase();
  return lanes?.find((l) => l.reserve === a && l.axis === axis);
}

const scale = (raw: bigint, decimals: number): number => Number(raw) / 10 ** decimals;

/** A held balance split into the net its events moved and the interest on
 *  top, in token units. Null where the lane is unknown, the interest is not
 *  positive, or the events took out more than they put in (the interest then
 *  left with the withdrawals and the holding is no net-plus-interest stack). */
export function splitHeld(
  amountRaw: string,
  decimals: number,
  lane: AaveLaneInterest | undefined,
): { net: number; interest: number } | null {
  if (!lane) return null;
  let held: bigint;
  let net: bigint;
  try {
    held = BigInt(amountRaw.split(".")[0]);
    net = BigInt(lane.net.split(".")[0]);
  } catch {
    return null;
  }
  const interest = held - net;
  if (net < BigInt(0) || interest <= BigInt(0)) return null;
  return { net: scale(net, decimals), interest: scale(interest, decimals) };
}
