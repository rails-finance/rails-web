// The census leg of the home count — how an Arbitrum explorer's figures are
// read. The Arbitrum explorers are position-first: there is no listing whose
// envelope carries a total, so the server walks each family's logs once a day
// and states a census on its coverage route (rails-ops
// reference/arbitrum-position-first-lane.md, "The census"). All-time is
// `census.wallets`, a wallet that has ever acted on the family (for Compound
// and Morpho, distinct across Comets or markets); open is `census.open`.
//
// Imports nothing through `@/`, so scripts/test/census-leg.test.mjs can load
// it; the loader passes the authenticated, retrying fetch in as `get`.

/** One explorer's roster, counted. `closed` is derived, never fetched. */
export type RosterCount = { open: number; closed: number };

/** Counted, `{ pending }` (joins the sum once ready), or null (a failure,
 *  which suppresses the whole figure). */
export type RosterState = RosterCount | { pending: string } | null;

type CensusAnswer = {
  census?: {
    wallets?: unknown;
    open?: unknown;
    complete?: unknown;
    walkedThroughBlock?: unknown;
    lastError?: unknown;
  } | null;
};

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Read one explorer's census. Pending while the route states no census, the
 * walk is incomplete, or the open figure is not yet read; null when the
 * answer fails, is malformed, or does not reconcile (wallets < open).
 */
export async function fetchCensusCount(
  id: string,
  url: string,
  get: (url: string) => Promise<Response>,
): Promise<RosterState> {
  const path = new URL(url).pathname;
  try {
    const res = await get(url);
    if (!res.ok) {
      console.error(`covered-positions: ${id} ${path} [census] -> ${res.status} ${res.statusText}`);
      return null;
    }
    const { census } = (await res.json()) as CensusAnswer;
    if (census == null) return { pending: "census not yet taken" };
    if (census.complete !== true) {
      const through = isCount(census.walkedThroughBlock) ? census.walkedThroughBlock : "?";
      const err = typeof census.lastError === "string" && census.lastError ? ` (${census.lastError})` : "";
      return { pending: `census walked through ${through}, incomplete${err}` };
    }
    if (census.open === null) return { pending: "census open figure not yet read" };
    if (!isCount(census.wallets) || !isCount(census.open)) {
      console.error(`covered-positions: ${id} ${path} [census] -> no wallets/open figure`);
      return null;
    }
    if (census.wallets < census.open) {
      console.error(
        `covered-positions: ${id} census wallets (${census.wallets}) < open (${census.open}) — count suppressed`,
      );
      return null;
    }
    return { open: census.open, closed: census.wallets - census.open };
  } catch (err) {
    console.error(`covered-positions: ${id} ${path} [census] failed`, err);
    return null;
  }
}
