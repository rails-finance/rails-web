// A Liquity V2 fork's deposit answers in the 1e18 units the deposit pages
// compute in. The fork routes (rails-server routes/liquityForkStabilityPool.ts)
// answer each branch's collateral amounts in the collateral's own decimals
// (`coll_decimals`: Ebisu's WBTC and LBTC are 8, every other branch 18); the
// stablecoin side is 1e18 everywhere. RULE: every coll_* amount is scaled to
// 1e18 where the answer is read, so lib/liquity-v2/sp-math.ts and every page
// part reads one unit, and the chain read (lib/sources/chain/liquity-v2-sp.ts,
// `loadSpDepositFromChain`) scales its collateral getters the same way, so the index-lag comparison
// (sp-math.ts `depositNow`) compares like with like. Liquity V2's answers carry
// no `coll_decimals` and pass through untouched. A scaled answer loses its
// `coll_decimals`, top-level and per branch, so a second pass leaves it as it is.
//
// Pure: no imports, so scripts/test/liquity-fork-sp.test.mjs loads it.

/** The collateral amounts on a position row, an operation row and a day row. */
const ROW_COLL = ["stash_raw", "coll_gain_raw", "coll_claimed_raw"] as const;
const EVENT_COLL = [
  "coll_gain_since",
  "coll_gain_claimed",
  "stash_before",
  "stash_after",
  "coll_gain_to_here",
  "coll_claimed_to_here",
] as const;
const DAY_COLL = ["coll_in", "coll_claimed", "stash"] as const;

/** A raw integer string in `decimals` units, in 1e18 units. Anything that is
 *  not a plain integer passes through. */
export function toE18(raw: string | null | undefined, decimals: number): string | null | undefined {
  if (raw == null || decimals >= 18 || !/^-?\d+$/.test(raw) || /^-?0+$/.test(raw)) return raw;
  return raw + "0".repeat(18 - decimals);
}

/** A PriceFeed price in 1e(36 − decimals) units (USD per whole token), in
 *  1e18 units: the integer division drops digits below 1e-18 USD. */
export function priceToE18(raw: string | null | undefined, decimals: number): string | null | undefined {
  if (raw == null || decimals >= 18 || !/^\d+$/.test(raw)) return raw;
  const cut = 18 - decimals;
  return raw.length > cut ? raw.slice(0, raw.length - cut) : "0";
}

type Rec = Record<string, unknown>;

function scaleFields(o: unknown, keys: readonly string[], decimals: number): void {
  if (!o || typeof o !== "object") return;
  const r = o as Rec;
  for (const k of keys) {
    if (typeof r[k] === "string") r[k] = toE18(r[k] as string, decimals);
  }
}

/** The decimals of one branch, from a listing answer's `branches` map. */
function branchDecimals(branches: unknown, collateralType: unknown): number | null {
  if (!branches || typeof branches !== "object" || typeof collateralType !== "string") return null;
  const entry = (branches as Rec)[collateralType] as Rec | undefined;
  return typeof entry?.coll_decimals === "number" ? entry.coll_decimals : null;
}

/** Scales a deposit route's answer in place and returns it: a listing by each
 *  row's branch, a timeline or flows answer by its top-level `coll_decimals`. */
export function scaleSpAnswer<T>(answer: T): T {
  if (!answer || typeof answer !== "object") return answer;
  const a = answer as Rec;
  const top = typeof a.coll_decimals === "number" ? a.coll_decimals : null;
  if (Array.isArray(a.rows)) {
    for (const row of a.rows as Rec[]) {
      const d = top ?? branchDecimals(a.branches, row?.collateral_type);
      if (d == null || d >= 18) continue;
      scaleFields(row, ROW_COLL, d);
      scaleFields(row, EVENT_COLL, d);
    }
  }
  if (top != null && top < 18) {
    scaleFields(a.position, ROW_COLL, top);
    if (Array.isArray(a.days)) for (const day of a.days) scaleFields(day, DAY_COLL, top);
  }
  // Scaled once: the units are 1e18 now, and nothing is left to scale by.
  delete a.coll_decimals;
  if (a.branches && typeof a.branches === "object")
    for (const entry of Object.values(a.branches as Rec))
      if (entry && typeof entry === "object") delete (entry as Rec).coll_decimals;
  return answer;
}
