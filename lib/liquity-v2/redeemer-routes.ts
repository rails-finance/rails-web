// A Liquity V2 redeemer's page, spelled once: /ethereum/liquity-v2/redeemer/<address>,
// a wallet's redemptions against Troves (rails-server GET
// /api/liquity-v2/redeemer/:address). Pure: no imports, so
// scripts/test/liquity-v2-redeemer.test.mjs loads it directly.

export const LIQUITY_V2_REDEEMER_PATH = "/ethereum/liquity-v2/redeemer";

/** An address, lowercased; null where it is not one. */
export function normalizeRedeemer(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : null;
}

export function liquityV2RedeemerHref(address: string): string {
  return `${LIQUITY_V2_REDEEMER_PATH}/${address.toLowerCase()}`;
}

/** One of the redeemer's redemptions on the redeemer page: its row, landed
 *  on and ringed (`?at=`, the Trove timeline's event id). */
export function redeemerEventHref(address: string, eventId: string): string {
  return `${liquityV2RedeemerHref(address)}?at=${encodeURIComponent(eventId)}`;
}

/** A Trove operation's id on its Trove's timeline: the transaction and the
 *  TroveOperation log's index. */
export function troveEventId(txHash: string, logIndex: number | string): string {
  return `${txHash}_${logIndex}`;
}

/** That operation's event page on its Trove. */
export function troveEventHref(branch: string, troveId: string, eventId: string): string {
  return `/ethereum/liquity-v2/trove/${branch}/${troveId}/event/${encodeURIComponent(eventId)}`;
}

/** That operation in its Trove's timeline, landed on and ringed (`?at=`). */
export function troveTimelineHref(branch: string, troveId: string, eventId: string): string {
  return `/ethereum/liquity-v2/trove/${branch}/${troveId}?at=${encodeURIComponent(eventId)}`;
}

/** Whether a transaction's Trove operations hold a redemption sent by
 *  `sender`: a redeemCollateral row whose transaction it sent. */
export function sentRedemption(
  rows: readonly { operation: string; transaction_from: string }[],
  sender: string,
): boolean {
  const s = sender.toLowerCase();
  return rows.some((r) => r.operation === "redeemCollateral" && r.transaction_from.toLowerCase() === s);
}
