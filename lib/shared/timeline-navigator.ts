// The timeline navigator — what its cells mark.
// ----------------------------------------------------------------------------
// ⚠️ IT WAS A PROTOTYPE BEHIND `?nav=1` FOR ONE DAY. Built 2026-09-11 to be
// judged on one protocol (Aave V3 Ethereum, market `core`) and rebuilt three
// times the same day on Miles's feedback; the flag came off that evening and
// the model is now the date control on every family the shared driver serves.
// The flag is DELETED rather than defaulted on — a flag nobody can turn off is
// a branch that rots, and the thing it used to switch to (an inline heatmap
// that pushed the rows down) is deleted with it.
//
// ── THE PROBLEM IT SOLVES, AND WHY NO GRAIN IS DERIVED
//
// `TransactionHeatmap` has shipped both grains since it was written — a
// GitHub-style day grid (`layout="weeks"`, one column per week) and a compact
// year-row × month-column matrix (`layout="months"`). The position timeline
// hard-coded `months`.
//
// That is not "coarse for big accounts", it is INVERTED. A position with
// 16,036 events over a 51-day life drew its entire history as three month
// cells, and selecting one of them filled the page's whole row budget. The
// positions that most need something to navigate with got the fewest cells to
// navigate with.
//
// The first build answered that by DERIVING a grain from the position's
// density — an active-days and median-per-day rule picking one grain for the
// whole page, with a toggle to override it. That rule is deleted, and so is
// the drill-down that replaced it. What answers it now is the editable DATE
// SPREAD in the panel's header: the map gets a reader roughly to the right
// month and the spread says exactly which days, so no cell has to be the right
// size for every position and nothing has to guess (Miles: "it's the rows, not
// the map").

const SECONDS_PER_DAY = 86_400;

// ── SIGNIFICANCE ─────────────────────────────────────────────────────────────
//
// Density is the least useful thing about a deep timeline. On a position a
// keeper bot is churning, the darkest cells ARE the churn — the map maps the
// noise. Three marks put back what a reader is actually looking for.
//
// ⚠️⚠️ THE MARKS ARE EXACT ONLY OVER WHAT THE PAGE HOLDS, and a cell that
// cannot be marked must not read as a cell with nothing in it.
//
// On a whole-history page the loaded rows ARE the history, so the marks are the
// whole truth. On a WINDOWED page only the newest thousand rows are loaded, and
// the opening balance below the cut carries `byDay` and `byAction` as two
// SEPARATE one-dimensional histograms — the summary knows that 12 liquidations
// happened and that a given day held 40 events, and cannot say whether they
// were the same day. That cross-tab is a server change (rails-ops
// TO-DO-infra-and-backend), so below the cut this page holds nothing.
//
// ⚠️ AND THE SAME IS TRUE OF A FOLDER'S MEMBERS, for the same reason. The
// DENSITY is no longer short there — leg B of `0019` put a day histogram on
// every folder and `folderDays` merges it, so the grid counts a folder's
// members like any other events (2026-09-12; `H1` in
// scripts/verify/verify-folder-reductions.mjs holds it on both families). The
// MARKS are a different claim and still cannot be made: a folder carries
// `counts` and `byDay` as two SEPARATE one-dimensional histograms, so it knows
// that it holds three liquidations and that a given day held forty members, and
// cannot say whether they were the same day. That is the cross-tab above, one
// level down, and it closes the same way.
//
// Per `architecture/chain-truth-charter.md` a figure the page cannot state is
// ABSENT, never a zero and never a dash. So `from` below is the first day the
// marks can speak for; every cell before it draws the density wash, no mark at
// all, and the grid's caption states the reason. Unmarked cells there would
// silently claim a bot-churned position never liquidated, which is the way this
// does real damage.

/** What one cell of either tier carries, read off the LISTED rows. */
export interface MarkSet {
  /** The cell holds at least one liquidation. */
  liquidation: boolean;
  /** The cell holds at least one event the position's owner signed — the
   *  SIGNATURE fact (`txFrom` is the wallet), never the event kind. A seize is
   *  a `transfer_out` on the borrower that the borrower never signed
   *  (`rails-ops/reference/timeline-attention-budget.md`). */
  owner: boolean;
  /** A market note is placed in the cell. A note is NOT an event: it is an
   *  observation about the market between two of the position's own events, it
   *  moves no count on the page, and it is drawn in its own register. */
  note: boolean;
}

export interface SignificanceMarks {
  /** UTC day start → what that day carries. */
  day: Map<number, MarkSet>;
  /** Month index (`year * 12 + month`) → the same, reduced up. */
  month: Map<number, MarkSet>;
  /** The first UTC day these marks can speak for. Nothing before it is marked
   *  and the caption says why — see the note above. */
  from: number;
}

const mark = (m: Map<number, MarkSet>, key: number): MarkSet => {
  let cur = m.get(key);
  if (!cur) {
    cur = { liquidation: false, owner: false, note: false };
    m.set(key, cur);
  }
  return cur;
};

const monthKeyOf = (ts: number): number => {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** The liquidation keys this prototype recognises, one per family that has one.
 *
 *  A key this does not know draws NO liquidation mark, which is the right
 *  answer rather than a bug: the page did not recognise one, and a guessed key
 *  would put a red dot on a cell nobody can point at an event in.
 *
 *  Every key below is the one the family's own label table in
 *  `lib/shared/event-filter-helpers.ts` gives a liquidation word to, read off
 *  the same `getEventActionKey` this module is handed. The three generic verbs
 *  cover most families (Aave V3/V4, Spark, Morpho, Moonwell, Compound V2,
 *  Dolomite, LlamaLend, Liquity V1 — `liquidation`; the Liquity V2 forks and
 *  Polaris — `liquidate`; Fluid's tick attribution — `liquidated`); the rest
 *  spell it their own way and were being missed until the family survey of
 *  2026-09-11:
 *
 *    grab                              MakerDAO ("Liquidated" — the Vat's own verb)
 *    absorb_debt / absorb_collateral   Compound V3 Comet ("Liquidated (debt/collateral)")
 *    liquidatePosition                 f(x) V2 ("Liquidated")
 *    absorbed                          Fluid ("Absorbed" — the protocol took the position on)
 *    vaporize                          Dolomite ("Vaporized" — bad debt closed out)
 *    seize_out                         Compound V2 + Dolomite ("Collateral seized")
 *    challenge_succeeded / forced_sale Frankencoin (the challenge auction taking the position)
 *
 *  DELIBERATELY OUT, and worth stating because each is a key a name-match would
 *  have swept in: `seize_in`, `seize_burn` and `liquidation_payout` are the
 *  OTHER side — this wallet gaining from somebody else's liquidation, which is
 *  not this position being liquidated; `challenge_started` and
 *  `challenge_averted` are a challenge the position survived; and Maple, PWN
 *  and the vault rosters emit no liquidation key at all, so they draw no mark
 *  because there is none to draw. */
const LIQUIDATION_KEYS = new Set([
  "liquidation",
  "liquidate",
  "liquidated",
  "grab",
  "absorb_debt",
  "absorb_collateral",
  "liquidatePosition",
  "absorbed",
  "vaporize",
  "seize_out",
  "challenge_succeeded",
  "forced_sale",
]);

/** Reduce the listed rows, and the notes the page is showing, to the marks.
 *
 * `actionKeyOf` is passed in rather than imported so this module stays free of
 * the filter helpers' protocol union; the caller hands it
 * `getEventActionKey`. */
export function buildSignificanceMarks(
  events: { timestamp: number; wallet: string; context?: { data?: unknown } }[],
  notes: { to: { timestamp: number }; from: { timestamp: number } }[],
  actionKeyOf: (e: never) => string,
): SignificanceMarks {
  const day = new Map<number, MarkSet>();
  const month = new Map<number, MarkSet>();
  let from = Infinity;
  for (const e of events) {
    if (e.timestamp < from) from = e.timestamp;
    const d = mark(day, Math.floor(e.timestamp / SECONDS_PER_DAY) * SECONDS_PER_DAY);
    const m = mark(month, monthKeyOf(e.timestamp));
    if (LIQUIDATION_KEYS.has(actionKeyOf(e as never))) {
      d.liquidation = true;
      m.liquidation = true;
    }
    // The signature fact. Absent on the rows that carry no sender at all
    // (recipient-only rows, a pre-fact payload) — the page then cannot say the
    // owner signed, and does not.
    const data = e.context?.data as { txFrom?: unknown } | undefined;
    const txFrom = typeof data?.txFrom === "string" ? data.txFrom.toLowerCase() : null;
    if (txFrom !== null && txFrom === e.wallet.toLowerCase()) {
      d.owner = true;
      m.owner = true;
    }
  }
  for (const note of notes) {
    // A note is placed at its LATER end — the observation the page anchors it
    // to. A live note whose end carries no timestamp of its own is not placed
    // at all rather than placed at a guess.
    const ts = note.to.timestamp || note.from.timestamp;
    if (!ts) continue;
    mark(day, Math.floor(ts / SECONDS_PER_DAY) * SECONDS_PER_DAY).note = true;
    mark(month, monthKeyOf(ts)).note = true;
  }
  return { day, month, from: Number.isFinite(from) ? Math.floor(from / SECONDS_PER_DAY) * SECONDS_PER_DAY : 0 };
}
