// Covered-positions loader — the roster-wide count behind the home headline.
// ----------------------------------------------------------------------------
// SERVER-ONLY. Fetches the rails-server backend directly with the bearer token
// (API_BEARER_TOKEN must not reach the browser bundle) — imported only from the
// home page server component. Every fetch carries `next.revalidate`, so the
// page stays static (ISR) and the count refreshes in the background hourly.
//
// The claim this feeds is "N positions across <the launched chains> DeFi" —
// the phrase is built from the same set this file sums over, in
// components/home/covered-stats.tsx — so the count is ALL-OR-NOTHING: if any
// one explorer's total fails to resolve,
// the loader returns null and the headline renders without the figure. A sum
// over 14 of 15 rosters, stated as the roster, is a false number — the charter
// forbids it more clearly than it forbids an absent one. Partial is not a
// degraded version of this claim; it is a different, wrong claim.
//
// The Base explorers add a second kind of "not yet": their listings are drawn
// from a history the Base box is still backfilling, and the listing says so
// (`coverage.historyComplete`, from rails-server's base_lending_coverage). A
// Comet listing that holds 735 accounts because the backfill has not started
// is not a failed fetch, and it is not 735 positions either — it is a count
// that does not exist yet. So a Base explorer JOINS the sum the hour its
// history completes and is left out, and logged, until then; the sum over the
// explorers that are counted stays a true number about them, as it always did
// over a roster with explorers excluded. This is the whole-or-nothing rule the
// Base timeline pages follow, applied to the headline: an index that cannot
// vouch for the whole history is not what the reader is shown.
//
// Each explorer is asked twice — `status=open`, and all-time — and its closed
// count is the difference (see CoveredPositions.closedPositions for why the
// subtraction, and not `status=closed`, is the correct question).
//
// Three seams in the backend the tables below have to absorb:
//
//   • Envelope. Most listings answer `{ rows, total }`; the Liquity family
//     (troves) answers `{ success, data, pagination: { total } }`. Both are
//     read through `readTotal`.
//
//   • Default status. `status=open` is passed EXPLICITLY for every protocol and
//     must stay that way. Most listings default to all-time, but Aave V4's
//     defaults to OPEN — so an omitted param would silently mean "open" there
//     and "ever" everywhere else, and the sum would be neither. That trap is
//     live today: Aave V4 answers 2,377 unfiltered and 4,306 for its stated
//     union, so a default-trusting all-time leg reports 1,929 real closed
//     positions as zero. ALL_TIME_STATUS below is the override.
//
//   • Unrecognized statuses do not error — they fall back to NO filter and
//     return the full set. f(x)'s `FxPositionStatus` includes "unknown", which
//     is a render state rather than a queryable one: `status=unknown` returns
//     all 2,872 rows, not a subset. So a status value that is quietly wrong
//     reads as a plausible large number, never as a failure, and no union may
//     be assumed correct because it returned something. Only `open` (verified
//     honoured on all fifteen, each reconciling against its own all-time) and
//     the audited ALL_TIME_STATUS override are trusted here.
//
// The grain is each protocol's own model of a position, which differs by
// protocol and is meant to: Aave V3 is one cross-collateralised account per
// wallet, Morpho Blue is one per wallet-market pair, the Liquity family is one
// per trove. Each row is a distinct position in the protocol's own terms — the
// unit the protocol itself counts in, not one Rails imposes across them.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { fetchWithRetry } from "@/lib/api/resilient-fetch";
import { CHAINS } from "@/lib/shared/chains";
import { LAUNCHED_PROTOCOLS } from "@/lib/shared/protocols";
import type { CoveredPositions } from "./covered-positions";

const RAILS_API_URL = process.env.RAILS_API_URL;

/** Matches the route-segment `revalidate` on app/(site)/page.tsx. */
const REVALIDATE_SECONDS = 3600;

/**
 * Every explorer's discovery listing, keyed by `ProtocolEntry.id`. Keys are
 * asserted against the counted roster at load (see `assertRosterCovered`) so adding an
 * explorer without listing it here fails loudly rather than quietly shrinking
 * the count — the headline names the roster, so the roster defines this map.
 */
const LISTING_ENDPOINT: Record<string, string> = {
  "aave-v3": "/api/aave-v3/positions",
  "aave-v3-base": "/api/aave-v3-base/positions",
  "aave-v4": "/api/aave-v4/spoke-positions",
  asymmetry: "/api/asymmetry/troves",
  basedollar: "/api/basedollar/troves",
  compound: "/api/compound/positions",
  "compound-base": "/api/compound-base/positions",
  "compound-v2": "/api/compound-v2/positions",
  dolomite: "/api/dolomite/positions",
  ebisu: "/api/ebisu/troves",
  fluid: "/api/fluid/positions",
  frankencoin: "/api/frankencoin/positions",
  fx: "/api/fx/positions",
  "liquity-v1": "/api/liquity-v1/positions",
  liquity: "/api/troves",
  llamalend: "/api/llamalend/positions",
  makerdao: "/api/makerdao/vaults",
  maple: "/api/maple/positions",
  moonwell: "/api/moonwell/positions",
  "moonwell-base": "/api/moonwell-base/positions",
  morpho: "/api/morpho/positions",
  "morpho-base": "/api/morpho-base/positions",
  pwn: "/api/pwn/positions",
  seamless: "/api/seamless/positions",
  spark: "/api/spark/positions",
};

/**
 * How to ask an explorer for ALL-TIME, where its unfiltered default isn't that.
 * Keyed by `ProtocolEntry.id`; anything absent is fetched with no status param,
 * which those fourteen backends answer with the full set (each verified to
 * reconcile: open + closed + liquidated equals the unfiltered total).
 *
 * Aave V4 is the reason this map exists — its listing defaults to open. The
 * union is stated in full rather than as `open,closed`: `liquidated` is a
 * recognized status there that happens to be 0 today (it answers 0, where an
 * unrecognized value would answer the full set), so naming it now means the
 * first Aave V4 liquidation lands in the count instead of silently falling
 * outside it.
 *
 * The five Base explorers are here for a different reason: their listings are
 * not a replay but an accounts table joined to a CHAIN read at a pinned block,
 * and an account the chain sweep has not read yet has no status. Seamless and
 * Aave V3 Base LEFT JOIN that read, so their unfiltered total holds those
 * unread accounts (status null) and `all − open` would file every one of them
 * under "closed" — 817 on Seamless the day this was written, wallets the chain
 * has not yet answered for. The union is the set the chain HAS answered for,
 * which is the only set a position count can honour with an open/closed
 * split. The Comet, Moonwell and Morpho Base listings INNER JOIN the read, so
 * the union and the unfiltered total agree there; it is stated all the same,
 * so the five are counted on one rule rather than three-and-two.
 */
const ALL_TIME_STATUS: Record<string, string> = {
  "aave-v4": "open,closed,liquidated",
  "aave-v3-base": "open,closed,liquidated",
  "compound-base": "open,closed,liquidated",
  "moonwell-base": "open,closed,liquidated",
  "morpho-base": "open,closed,liquidated",
  seamless: "open,closed,liquidated",
};

/** Both listing envelopes carry the filtered total; neither nests it deeper.
 *  The Base listings also state their `coverage` (rails-server
 *  `shapeCoverage`); only `historyComplete` is read here. */
type TotalEnvelope = {
  total?: unknown;
  pagination?: { total?: unknown };
  coverage?: { historyComplete?: unknown; backfillNextBlock?: unknown; backfillTo?: unknown } | null;
};

/**
 * Pull the filtered total out of either envelope. Returns null rather than 0
 * when the field is absent or non-numeric: the listing clients fall back to
 * `rows.length` on a missing envelope, which would cap a roster-wide total at
 * the page limit and read as a real, small number. Here a total that isn't
 * stated is a failure, not a zero.
 */
function readTotal(json: TotalEnvelope): number | null {
  const raw = typeof json.total === "number" ? json.total : json.pagination?.total;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

/** One explorer's roster, counted. `closed` is derived, never fetched. */
type RosterCount = { open: number; closed: number };

/**
 * One leg of a listing: its filtered total, and — where the listing states a
 * `coverage` — whether the history behind it is complete. `pending` carries
 * the reason when it is not; it is null for every L1 listing (they state no
 * coverage: their history IS complete, it is the index) and for a Base
 * listing whose backfill has reached the Sieve checkpoint.
 */
type Leg = { total: number; pending: string | null };

async function fetchTotal(id: string, path: string, status: string | null): Promise<Leg | null> {
  // limit=1 — only `total` is read; the row is the smallest page the API will
  // answer with and is discarded.
  const qs = new URLSearchParams({ limit: "1" });
  if (status) qs.set("status", status);
  const url = `${RAILS_API_URL}${path}?${qs.toString()}`;
  try {
    // fetchWithRetry, not bare fetch: the all-or-nothing sum below means one
    // transient failure among the ~50 legs suppresses the whole headline for
    // an ISR cycle. The retry absorbs the transient class only — a 4xx or a
    // malformed envelope still fails here on the first answer.
    const res = await fetchWithRetry(url, createAuthFetchOptions({ next: { revalidate: REVALIDATE_SECONDS } }));
    if (!res.ok) {
      console.error(`covered-positions: ${id} ${path} [${status ?? "all-time"}] -> ${res.status} ${res.statusText}`);
      return null;
    }
    const json = (await res.json()) as TotalEnvelope;
    const total = readTotal(json);
    if (total === null) {
      console.error(`covered-positions: ${id} ${path} [${status ?? "all-time"}] -> no total`);
      return null;
    }
    const cov = json.coverage;
    // A null cursor is a backfill that has not started (the Base box runs them
    // in sequence, one protocol at a time); a number is where it has reached.
    const pending =
      cov && cov.historyComplete !== true
        ? typeof cov.backfillNextBlock === "number"
          ? `backfill at ${cov.backfillNextBlock} of ${typeof cov.backfillTo === "number" ? cov.backfillTo : "?"}`
          : `backfill not started (to ${typeof cov.backfillTo === "number" ? cov.backfillTo : "?"})`
        : null;
    return { total, pending };
  } catch (err) {
    console.error(`covered-positions: ${id} ${path} [${status ?? "all-time"}] failed`, err);
    return null;
  }
}

/**
 * One explorer's roster, in one of three states: counted (`RosterCount`),
 * `{ pending }` — a Base explorer whose history is still backfilling, left out
 * of this hour's sum and named in the log — or null if either leg is
 * unavailable or the pair doesn't reconcile.
 *
 * The reconcile guard is the point: all-time < open is impossible from a
 * backend that answered both questions about the same roster, so it means a
 * leg didn't mean what it claimed — a filter ignored, an endpoint repointed, a
 * status renamed. That's unprovable rather than merely unlucky, so it
 * suppresses the figure instead of publishing a negative or nonsense closed
 * count.
 */
async function fetchRosterCount(id: string, path: string): Promise<RosterCount | { pending: string } | null> {
  const [open, allTime] = await Promise.all([
    fetchTotal(id, path, "open"),
    fetchTotal(id, path, ALL_TIME_STATUS[id] ?? null),
  ]);
  if (open === null || allTime === null) return null;
  // Both legs read the same coverage row; either saying "not yet" is enough.
  const pending = open.pending ?? allTime.pending;
  if (pending) return { pending };
  if (allTime.total < open.total) {
    console.error(`covered-positions: ${id} all-time (${allTime.total}) < open (${open.total}) — count suppressed`);
    return null;
  }
  return { open: open.total, closed: allTime.total - open.total };
}

/**
 * Explorers whose subject is not a position, and so cannot join a position count.
 *
 * Currently EMPTY — Compound V2, the machinery's first occupant, left when its
 * position explorer landed (2026-07-16; the exclusion was always "no position
 * roster exists to count YET", never "this subject has no positions"). The set
 * stays because the concept is real: an explorer listed here is exempt from the
 * LISTING_ENDPOINT requirement below and contributes nothing to the headline,
 * keeping the headline a claim about positions, which is what it says it is.
 *
 * ⚠️ If a future entry lands here alongside a LISTING_ENDPOINT for the same id,
 * the exclusion wins and silences `assertRosterCovered()` — the headline would
 * quietly drop a whole explorer and still render a confident number. Remove the
 * exclusion in the SAME change that adds the endpoint; removing it first is the
 * safe failure (the guard trips and the figure disappears, loudly).
 */
const NOT_POSITION_EXPLORERS = new Set<string>([
  // Aave's vault layer. Not "no listing yet" but the other kind: a holder's
  // share in a vault carries no debt and no threshold to breach, so it is not a
  // position in the sense the headline counts (rails-ops decisions 0014 and
  // 0027 call 2). It has no LISTING_ENDPOINT and must never gain one.
  "aave-vaults",
  // Yearn V3, here for the same reason and permanently: its whole product is
  // vaults, so every one of its rows would be a share rather than a position.
  "yearn",
  // Otherwise empty since 2026-08-26. The five Base explorers (Aave V3 Base,
  // Moonwell Base, Morpho Blue Base, Compound V3 Base, Seamless) sat here from
  // 2026-08-23 for the same reason Compound V2 once did — they had positions
  // to show but no listing to count them from, Base's history not being
  // indexed. The Sieve indexer indexes it now and each has a listing, so each
  // left in the change that added its LISTING_ENDPOINT. Whether a Base
  // listing's history is COMPLETE is a different question, and it is answered
  // per hour by the listing itself (`coverage.historyComplete` → the `pending`
  // state in fetchRosterCount), not by a name in this set.
]);

/** The explorers whose rosters the count is drawn from.
 *
 *  Three cuts, on three different axes:
 *
 *  - Launch. The figure sits on the home page above a strip of tiles a reader
 *    can open, so it counts the explorers that strip offers. An explorer
 *    flagged `unlaunched` on the roster serves at its URL and is linked from
 *    nowhere, so counting its positions would be a number about pages the site
 *    does not show — hence `LAUNCHED_PROTOCOLS` rather than `PROTOCOLS`, and
 *    hence the scope phrase beside the figure is drawn from the same set
 *    (components/home/covered-stats.tsx).
 *
 *  - Chain. The headline is a claim about real money on production chains. An
 *    explorer on a testnet chain (`CHAINS[chainId].testnet`, Polaris on Sepolia)
 *    is left out here regardless of its id: its numbers are test numbers, not
 *    a position in that claim, and the rule reads off the chain axis so the
 *    next testnet explorer needs no change here either.
 *  - Explorer. What is excluded beyond that is the explorers that have no
 *    listing to count (`NOT_POSITION_EXPLORERS`), which is decision 0014's
 *    rule: the headline names what the reader can actually reach. An explorer
 *    whose listing exists but whose history is still backfilling is asked,
 *    and answers "not yet" — see fetchRosterCount.
 */
const COUNTED_PROTOCOLS = LAUNCHED_PROTOCOLS.filter(
  (p) => !CHAINS[p.chainId].testnet && !NOT_POSITION_EXPLORERS.has(p.id),
);

/** Guards the map against roster drift — see LISTING_ENDPOINT. */
function assertRosterCovered(): string[] | null {
  const missing = COUNTED_PROTOCOLS.filter((p) => !LISTING_ENDPOINT[p.id]).map((p) => p.id);
  return missing.length > 0 ? missing : null;
}

/**
 * The roster-wide open and closed position counts, or null if any explorer's
 * rosters are unavailable (see the all-or-nothing note above). Fetches every
 * explorer concurrently; each leg retries transient failures with a per-attempt
 * timeout (fetchWithRetry), and failures are not cached, so the next
 * regeneration retries from scratch. A Base explorer still backfilling its history is not a failure: it
 * is left out of this hour's sum, logged by name, and joins the hour its
 * listing says the history is complete.
 */
export async function getCoveredPositions(): Promise<CoveredPositions | null> {
  if (!RAILS_API_URL) {
    console.error("covered-positions: RAILS_API_URL is not set");
    return null;
  }

  const missing = assertRosterCovered();
  if (missing) {
    console.error(`covered-positions: no listing endpoint for ${missing.join(", ")} — count suppressed`);
    return null;
  }

  const counts = await Promise.all(COUNTED_PROTOCOLS.map((p) => fetchRosterCount(p.id, LISTING_ENDPOINT[p.id])));

  const rosters: RosterCount[] = [];
  for (const [i, c] of counts.entries()) {
    if (c === null) return null;
    if ("pending" in c) {
      console.info(`covered-positions: ${COUNTED_PROTOCOLS[i].id} not yet counted — ${c.pending}`);
      continue;
    }
    rosters.push(c);
  }
  const openPositions = rosters.reduce((sum, r) => sum + r.open, 0);
  const closedPositions = rosters.reduce((sum, r) => sum + r.closed, 0);
  return {
    // The sum is stated with the split beneath it — see the field docs on
    // CoveredPositions for which lane each one trusts and why the addition is
    // the safe figure.
    totalPositions: openPositions + closedPositions,
    openPositions,
    closedPositions,
    protocolCount: rosters.length,
  };
}
