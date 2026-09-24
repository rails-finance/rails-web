// The Polaris primary-rate step market note, on the page.
// ---------------------------------------------------------------------------
// A rate step says the market's own primary rate moved between two of a
// CDP's OWN touches — unlike the other two kinds of note, BOTH ends here are
// the position's own events, read off `context.data.primaryRate`. It is a
// NOTE, not an event: it must render at the right count on each fixture CDP,
// state figures re-derivable from the CDP's own timeline route, and nothing
// on the page may count it.
//
// Every expected note below is re-derived from `/api/polaris/timeline` —
// fetched independently of the page, never read back off it — by an
// algorithm restated HERE from lib/shared/market-note.ts's own header, not
// imported from it: a check whose expected value comes from the thing under
// test cannot go red however wrong the thing is. The counts and blocks were
// pinned by psql over the RAW tables on the onboarding box, 2026-09-05 — never
// derived from this code either.
//
// 2026-09-10 — TWO RULES CHANGED, and the fixture table with them:
//   · The header states the LATER RATE ("2.96%"), not the move ("5.36 pp");
//     the move is in the panel and in the prose, where "pp" is now written
//     "points". No step mark on a rate step any more — it would print that
//     same later rate a second time — so at rest a row states one rate, once.
//   · Consecutive stretches that moved the rate the SAME WAY are one note,
//     from the first stretch's earlier touch to the last's later one. A
//     stretch the other way ends the run; a move too small to be stated never
//     breaks one. usdp/8 falls from 21 notes to 14 this way.
// The counts and the merged runs below were recomputed from the route on
// 2026-09-10 by the collapse rule restated in `collapseRuns` — never read off
// the page. ⚠️ usdp/296 and usdp/235 were the two "controls with none" when
// this note shipped on 2026-09-05; the campaign wave has touched them since
// and each now carries three steps that merge into ONE note. They are moving
// CDPs: if a count here goes red, re-derive from the route before assuming a
// regression.
//
// 2026-09-19 — usdp/235 moved again (touches at 11,715,277 and 11,715,285,
// rate 0% → 1.91%, a second note) and is retired as a fixture. The "exactly
// one note" seat is now usdp/196, a CLOSED CDP: three events, closed at block
// 11,662,377, ids are sequential so it cannot be opened again. Its pins (§0f,
// §6) were read from the live route and page on preview.rails.finance. No
// closed CDP in either market carries a merged run (675 closed CDPs scanned),
// so the merged-run control on the page is usdp/296 alone, still open.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3411 node scripts/verify/verify-polaris-rate-step.mjs
//       BASE=https://rails-web.vercel.app node scripts/verify/verify-polaris-rate-step.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const RATE_STEP_MIN_PP = 1;

// Fixture CDPs (plan §4 F3) — `want` is the count AFTER the same-direction
// collapse, pinned 2026-09-10.
const FIXTURES = [
  { market: "usdp", id: "27", want: 2 },
  { market: "usdp", id: "7", want: 1 },
  { market: "goldp", id: "8", want: 1 },
  { market: "usdp", id: "8", want: 14 },
  { market: "usdp", id: "296", want: 1 },
  { market: "usdp", id: "196", want: 1 },
];

// The closed fixture, pinned from the live route 2026-09-19: one unmerged
// stretch between its second touch and its closing touch.
const CLOSED_FIXTURE = {
  key: "usdp/196",
  events: 3,
  noteId: "rate-step:usdp:11634933-11662377",
  fromPct: 8.57,
  toPct: 3.49,
  deltaPoints: -5.08,
  observedFromBlock: 11_634_923,
  observedToBlock: 11_662_375,
};

// Every run of two or more stretches, pinned: members, the two blocks the
// merged note runs between, and the rate at each end (per cent, 2 dp). A note
// that merged nothing is absent here — those are the plain stretches.
const MERGED_RUNS = {
  "usdp/8": [
    { steps: 2, fromBlock: 11_507_592, toBlock: 11_519_485, fromPct: 8.32, toPct: 2.96 },
    { steps: 2, fromBlock: 11_526_634, toBlock: 11_526_644, fromPct: 2.27, toPct: 5.12 },
    { steps: 3, fromBlock: 11_533_686, toBlock: 11_533_702, fromPct: 2.11, toPct: 6.29 },
    { steps: 4, fromBlock: 11_554_512, toBlock: 11_556_029, fromPct: 0.82, toPct: 8.15 },
  ],
  "usdp/296": [{ steps: 3, fromBlock: 11_637_797, toBlock: 11_668_760, fromPct: 8.17, toPct: 0.0 }],
};

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

// ── Formatting, restated from Intl rather than imported ────────────────────
const ratePct = (n) => `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const pointsSigned = (n) =>
  `${n < 0 ? "\u2212" : "+"}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} points`;
const stableAmount = (n) =>
  Math.abs(n) >= 1_000
    ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const blk = (n) => n.toLocaleString("en-US");

/** A polaris event id's tail `:N` segment — the log index. */
function polarisLogIndex(id) {
  const cut = id.lastIndexOf(":");
  return cut < 0 ? -1 : Number(id.slice(cut + 1));
}

/**
 * Phase-3 selector, restated from the route's own rows — the same rule
 * lib/shared/market-note.ts's `rateStepNotesFor` applies, computed here
 * independently so this check cannot pass by trusting the code under test.
 */
function computeNotes(events, marketKey) {
  const ends = events
    .filter(
      (e) =>
        e.context?.protocol === "polaris" &&
        e.context.data.eventType !== "transfer" &&
        e.context.data.primaryRate != null,
    )
    .sort((a, b) => a.blockNumber - b.blockNumber || polarisLogIndex(a.id) - polarisLogIndex(b.id));
  const out = [];
  for (let i = 0; i < ends.length - 1; i += 1) {
    const a = ends[i];
    const b = ends[i + 1];
    if (b.blockNumber <= a.blockNumber) continue;
    const da = a.context.data;
    const db = b.context.data;
    const rateA = da.primaryRate;
    const rateB = db.primaryRate;
    if (rateA === rateB) continue;
    const deltaPp = (rateB - rateA) * 100;
    if (Math.abs(deltaPp) < RATE_STEP_MIN_PP) continue;
    const debtA = Number(da.newDebt ?? 0);
    const interest =
      Number.isFinite(debtA) && debtA > 0 ? { debt: debtA, before: debtA * rateA, after: debtA * rateB } : null;
    out.push({
      id: `rate-step:${marketKey}:${a.blockNumber}-${b.blockNumber}`,
      fromBlock: a.blockNumber,
      toBlock: b.blockNumber,
      rateA,
      rateB,
      deltaPp,
      rising: rateB > rateA,
      observedFrom: da.rateSet ?? null,
      observedTo: db.rateSet ?? null,
      interest,
    });
  }
  return collapseRuns(out);
}

/**
 * The collapse, restated: a run of stretches whose moves share a sign is ONE
 * note, from the first stretch's earlier end to the last stretch's later one.
 * A stretch the other way ends the run. Written from the shipped rule, not
 * imported from `collapseSameDirectionRateSteps` — the same reason
 * `computeNotes` restates the selector.
 */
function collapseRuns(steps) {
  const out = [];
  let run = [];
  const settle = () => {
    if (run.length === 0) return;
    const first = run[0];
    const last = run[run.length - 1];
    out.push({
      ...first,
      id: `${first.id.slice(0, first.id.lastIndexOf(":") + 1)}${first.fromBlock}-${last.toBlock}`,
      toBlock: last.toBlock,
      rateB: last.rateB,
      deltaPp: (last.rateB - first.rateA) * 100,
      rising: last.rateB > first.rateA,
      observedTo: last.observedTo,
      interest: first.interest
        ? {
            debt: first.interest.debt,
            before: first.interest.debt * first.rateA,
            after: first.interest.debt * last.rateB,
          }
        : null,
      steps: run.length,
    });
    run = [];
  };
  for (const step of steps) {
    const last = run[run.length - 1];
    if (last && Math.sign(last.deltaPp) === Math.sign(step.deltaPp)) run.push(step);
    else {
      settle();
      run = [step];
    }
  }
  settle();
  return out;
}

const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  // A client-side toggle/click before hydration is lost, not replayed — wait
  // for the position card to be live before touching anything.
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  return page;
}

// Scoped to rate-step notes: since 2026-09-06 a CDP can also carry a
// price-gap note (lib/shared/market-note.ts's polarisPriceGapNotesFor) on
// the SAME page, so a bare `[data-market-note]` count would no longer say
// anything about rate steps specifically. `RATE_STEP_SELECTOR` is this
// file's one query for "a rate-step note" — every count and open/close
// check below reads through it, so this file keeps testing exactly what it
// always tested regardless of what other note kinds coexist.
const RATE_STEP_SELECTOR = '[data-market-note^="rate-step:"]';

/** Open every rate-step note's header, then its "(i) how this note was
 *  derived" panel — the stat grid mounts on the header click, the
 *  derivation prose (which names the PrimaryRateSet log) only on the
 *  disclosure click. Re-asserts the open state after each poll, since a
 *  pre-hydration click vanishes rather than replaying. */
async function openNotesAndDerivations(page) {
  const rows = page.locator(RATE_STEP_SELECTOR);
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded();
    await row.getByRole("button", { expanded: false }).first().click();
    await page.waitForTimeout(150);
    const derivationTrigger = row.getByRole("button", { name: /how this note was derived/i });
    if (await derivationTrigger.count()) {
      await derivationTrigger.click();
    }
  }
  await page.waitForTimeout(300);
  const openCount = await page.locator(`${RATE_STEP_SELECTOR}[data-market-note-open]`).count();
  return n > 0 && openCount === n;
}

console.log("Polaris primary-rate step market note — on the page\n");
console.log(`BASE ${BASE}\n`);

// ── 0. fixtures, read from the routes ──────────────────────────────────────

const fixtureNotes = {};
for (const f of FIXTURES) {
  const j = await api(`/api/polaris/timeline?market=${f.market}&id=${f.id}`);
  const notes = computeNotes(j.events, f.market);
  fixtureNotes[`${f.market}/${f.id}`] = { notes, totalEvents: j.totalEvents, count: j.events.length };
  check(
    `0. ${f.market}/${f.id}'s own route yields ${f.want} rate-step note(s)`,
    notes.length === f.want,
    `got ${notes.length}: ${notes.map((n) => n.id).join(", ") || "(none)"}`,
  );
}

const want27 = fixtureNotes["usdp/27"].notes;
check(
  "0a. usdp/27's two notes match the pinned ids and directions (Δ −5.96 points, then +9.39 points; opposite signs, so neither merges)",
  want27.length === 2 &&
    want27[0].id === "rate-step:usdp:11512561-11548724" &&
    want27[1].id === "rate-step:usdp:11548726-11604377" &&
    !want27[0].rising &&
    want27[1].rising,
  want27.map((n) => `${n.id} Δ${n.deltaPp.toFixed(2)}`).join(" | "),
);
check(
  "0b. usdp/27's first note observed both PrimaryRateSet logs (block 11,512,518 / 11,548,232)",
  want27[0]?.observedFrom?.block === 11_512_518 && want27[0]?.observedTo?.block === 11_548_232,
  `from ${want27[0]?.observedFrom?.block}, to ${want27[0]?.observedTo?.block}`,
);
check(
  "0c. usdp/27's first note carries the pinned interest slice (77.46 × 5.96% = 4.61 → 0.00)",
  want27[0]?.interest != null &&
    Math.abs(want27[0].interest.debt - 77.459136) < 0.001 &&
    Math.abs(want27[0].interest.before - 4.6135) < 0.01 &&
    Math.abs(want27[0].interest.after - 0) < 0.001,
  `debt ${want27[0]?.interest?.debt?.toFixed(4)}, before ${want27[0]?.interest?.before?.toFixed(4)}, after ${want27[0]?.interest?.after}`,
);

// ── 0d. the merged runs — members, both blocks, both rates ─────────────────
// The collapse's own claim: these runs, and no others. A run that lost a
// member, gained one, or started a block early fails here before the page is
// ever opened.

for (const [key, runs] of Object.entries(MERGED_RUNS)) {
  const merged = fixtureNotes[key].notes.filter((n) => (n.steps ?? 1) > 1);
  const got = merged
    .map((n) => `${n.steps}× ${blk(n.fromBlock)}→${blk(n.toBlock)} ${ratePct(n.rateA)}→${ratePct(n.rateB)}`)
    .join(" · ");
  check(
    `0d. ${key}'s merged runs match the pinned table (${runs.map((r) => `${r.steps} steps`).join(", ")})`,
    merged.length === runs.length &&
      runs.every(
        (r, i) =>
          merged[i].steps === r.steps &&
          merged[i].fromBlock === r.fromBlock &&
          merged[i].toBlock === r.toBlock &&
          ratePct(merged[i].rateA) === `${r.fromPct.toFixed(2)}%` &&
          ratePct(merged[i].rateB) === `${r.toPct.toFixed(2)}%`,
      ),
    got || "(no merged run)",
  );
}
check(
  "0e. usdp/8's 21 stretches merge to 14 notes — the four runs above account for the 7 rows that went",
  fixtureNotes["usdp/8"].notes.length === 14 &&
    fixtureNotes["usdp/8"].notes.reduce((n, x) => n + (x.steps ?? 1), 0) === 21,
  `${fixtureNotes["usdp/8"].notes.length} note(s) over ${fixtureNotes["usdp/8"].notes.reduce((n, x) => n + (x.steps ?? 1), 0)} stretch(es)`,
);

// ── 0f. the closed fixture — its one note, pinned ──────────────────────────
// A closed CDP's route cannot gain a row, so every figure here is fixed: a
// different event count means the index changed under a settled position.

const closedRead = fixtureNotes[CLOSED_FIXTURE.key];
const closedNote = closedRead.notes[0];
const closedLast = (await api(`/api/polaris/timeline?market=usdp&id=196`)).events.at(-1);
check(
  `0f. ${CLOSED_FIXTURE.key} is closed, with ${CLOSED_FIXTURE.events} events, and its route ends on the close`,
  closedRead.count === CLOSED_FIXTURE.events &&
    closedRead.totalEvents === CLOSED_FIXTURE.events &&
    closedLast?.context?.data?.eventType === "close",
  `${closedRead.count} of ${closedRead.totalEvents} event(s), last is "${closedLast?.context?.data?.eventType}"`,
);
check(
  `0g. ${CLOSED_FIXTURE.key}'s one note matches the pinned id, rates and PrimaryRateSet blocks (8.57% → 3.49%, unmerged)`,
  closedRead.notes.length === 1 &&
    closedNote.id === CLOSED_FIXTURE.noteId &&
    (closedNote.steps ?? 1) === 1 &&
    ratePct(closedNote.rateA) === `${CLOSED_FIXTURE.fromPct.toFixed(2)}%` &&
    ratePct(closedNote.rateB) === `${CLOSED_FIXTURE.toPct.toFixed(2)}%` &&
    closedNote.observedFrom?.block === CLOSED_FIXTURE.observedFromBlock &&
    closedNote.observedTo?.block === CLOSED_FIXTURE.observedToBlock,
  closedNote
    ? `${closedNote.id} ×${closedNote.steps ?? 1} ${ratePct(closedNote.rateA)}→${ratePct(closedNote.rateB)}, set at ${closedNote.observedFrom?.block} / ${closedNote.observedTo?.block}`
    : "(no note)",
);

// ── the browser ──────────────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});

// ── 1. counts on each fixture page ──────────────────────────────────────────

for (const f of FIXTURES) {
  const key = `${f.market}/${f.id}`;
  const page = await open(context, polarisUrl(f.market, f.id));
  const allIds = await page
    .locator(RATE_STEP_SELECTOR)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
  // 2026-09-06 (live notes): `computeNotes` below is a HISTORICAL-only
  // replica — it has no live builder, and a live note's id always ends
  // `-head` (market-note.ts's own id shape for `to.block` = the chain head)
  // — so it is excluded here rather than making every FIXTURES.want account
  // for whether its CDP happens to be open right now.
  const gotIds = allIds.filter((id) => !id.endsWith("-head"));
  check(
    `1. ${key} shows exactly ${f.want} HISTORICAL rate-step [data-market-note] row(s) on the page`,
    gotIds.length === f.want,
    `${gotIds.length} row(s): ${gotIds.join(", ") || "(none)"}${allIds.length !== gotIds.length ? ` (+ ${allIds.length - gotIds.length} live)` : ""}`,
  );
  if (f.want > 0) {
    const wantIds = fixtureNotes[key].notes.map((n) => n.id).sort();
    check(
      `1a. ${key}'s row ids match the route-derived ids`,
      JSON.stringify([...gotIds].sort()) === JSON.stringify(wantIds),
      `page: ${gotIds.join(", ")} · route: ${wantIds.join(", ")}`,
    );
  }
  // The row count and label — a note is never counted, so this must equal the
  // route's own event count whether or not any note rendered.
  const eventRows = await page.locator("[data-event-id]").count();
  check(
    `1b. ${key}'s event-row count is the route's own event count (a note is never counted)`,
    eventRows === fixtureNotes[key].count,
    `${eventRows} row(s) on page, route says ${fixtureNotes[key].count}`,
  );
  await page.close();
}

// ── 2. usdp/27 — the header states the LATER RATE, at rest ────────────────
// Since 2026-09-10 the header's one figure is the rate at the later end, and
// the step mark (which used to print that same rate again beside it) is gone
// from this kind. So a row at rest reads: direction, one rate, the quantity
// word — and the earlier rate is nowhere on it.

const page27 = await open(context, polarisUrl("usdp", "27"));
const rowText = async (page, noteId) =>
  ((await page.locator(`[data-market-note="${noteId}"]`).textContent()) ?? "").replace(/\s+/g, " ").trim();
// `textContent` runs the elements together with no space between them, so the
// comparison is on content with ALL whitespace removed: exact about what the
// row says, silent about how the DOM spaces it.
const squash = (t) => t.replace(/\s+/g, "");
const restA = await rowText(page27, want27[0].id);
const restB = await rowText(page27, want27[1].id);
check(
  "2. at rest, each usdp/27 header states the LATER rate and nothing else (0.00%, then 9.39%)",
  squash(restA) === squash(`down ${ratePct(want27[0].rateB)} primary rate`) &&
    squash(restB) === squash(`up ${ratePct(want27[1].rateB)} primary rate`),
  `first "${restA}", second "${restB}"`,
);
check(
  "2b. neither header states the earlier rate — the later rate appears once in the row",
  !restA.includes(ratePct(want27[0].rateA)) && !restB.includes(ratePct(want27[1].rateA)),
  `first wanted no "${ratePct(want27[0].rateA)}", second no "${ratePct(want27[1].rateA)}"`,
);
const glyphOf = async (noteId) => {
  const row = page27.locator(`[data-market-note="${noteId}"]`);
  const down = await row.locator("svg.lucide-arrow-down-right").count();
  const up = await row.locator("svg.lucide-arrow-up-right").count();
  return down > 0 ? "down" : up > 0 ? "up" : "none";
};
const glyphA = await glyphOf(want27[0].id);
const glyphB = await glyphOf(want27[1].id);
check(
  "2c. the first note's glyph is down (a fall), the second's is up (a rise)",
  glyphA === "down" && glyphB === "up",
  `first ${glyphA}, second ${glyphB}`,
);

// ── 3. open one note, and its derivation — the pinned PrimaryRateSet block
//    and the interest figures ────────────────────────────────────────────

const openedAll = await openNotesAndDerivations(page27);
check("3. every note on usdp/27 opens, and stays open across the poll", openedAll);
const openNoteA = await rowText(page27, want27[0].id);
check(
  "3a. the opened first note's stat grid states the rate before/after and the blocks",
  openNoteA != null &&
    openNoteA.includes(ratePct(want27[0].rateA)) &&
    openNoteA.includes(ratePct(want27[0].rateB)) &&
    openNoteA.includes(blk(want27[0].fromBlock)) &&
    openNoteA.includes(blk(want27[0].toBlock)),
  openNoteA ? openNoteA.slice(0, 200) : "note not found once opened",
);
check(
  "3b. the derivation prose names the pinned PrimaryRateSet block (11,512,518)",
  openNoteA != null && openNoteA.includes(blk(want27[0].observedFrom.block)),
  openNoteA ? `wanted "${blk(want27[0].observedFrom.block)}"` : "",
);
check(
  "3c. the opened note states the pinned interest slice — 77.46 USDp, 4.61 → 0.00",
  openNoteA != null &&
    openNoteA.includes(stableAmount(want27[0].interest.debt)) &&
    openNoteA.includes(stableAmount(want27[0].interest.before)) &&
    openNoteA.includes(stableAmount(want27[0].interest.after)),
  openNoteA
    ? `wanted "${stableAmount(want27[0].interest.debt)}", "${stableAmount(want27[0].interest.before)}", "${stableAmount(want27[0].interest.after)}"`
    : "",
);
// Re-assert the open state after the poll above — a pre-hydration click is
// lost, not replayed, so this is the guard against a false positive. Scoped
// to rate-step notes: usdp/27 also carries one price-gap note since
// 2026-09-06 (its own +46.96% stretch), which `openNotesAndDerivations`
// above never touches.
const stillOpen = await page27.locator(`${RATE_STEP_SELECTOR}[data-market-note-open]`).count();
check(
  "3d. both rate-step notes are still open after reading them (no silent close)",
  stillOpen === 2,
  `${stillOpen} open`,
);
check(
  "3e. the opened note states the move itself, signed, in POINTS — the figure the header no longer carries",
  openNoteA.includes(pointsSigned(want27[0].deltaPp)),
  `wanted "${pointsSigned(want27[0].deltaPp)}" in the panel`,
);
// The unit word, everywhere on the page at once: "pp" is finance's shorthand
// and no reader outside it writes it (Miles, 2026-09-10). Every note is open
// at this point, so this reads the panels and the derivation prose too.
const bodyText = ((await page27.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
check(
  '3f. the word "pp" appears nowhere on the position page',
  !/\bpp\b/i.test(bodyText),
  bodyText.match(/.{0,60}\bpp\b.{0,60}/i)?.[0] ?? "",
);

// ── 4. the markdown export — "Market notes: 3" and the row annotations ────
// usdp/27 carries 3 notes in total since 2026-09-06 (2 rate-step + 1
// price-gap, lib/shared/market-note.ts's polarisPriceGapNotesFor) — the
// export's "Market notes:" line counts every kind, so it moved from 2 to 3;
// the per-kind annotation count below stays scoped to the rate-step wording
// and is unaffected.

const copyMarkdown = async (page) => {
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(500);
  return page.evaluate(() => navigator.clipboard.readText());
};
const md = await copyMarkdown(page27);
const tableRows = (m) => (m.match(/^\| \d+ \| /gm) ?? []).length;
check(
  '4. the markdown export states "Market notes: 3" (2 rate-step + 1 price-gap) and adds no row to the event table',
  /\*\*Market notes:\*\*\s*3\b/.test(md) && tableRows(md) === fixtureNotes["usdp/27"].count,
  `table rows ${tableRows(md)}, route says ${fixtureNotes["usdp/27"].count}; "Market notes" line ${md.includes("Market notes") ? "present" : "absent"}`,
);
const annotationCount = (md.match(/market note: the USDp market's primary rate was /g) ?? []).length;
check(
  "4a. the export carries two rate-step row annotations, each leading with the later rate",
  annotationCount === 2,
  `${annotationCount} annotation(s)`,
);
check(
  "4b. the export names the two signed moves, in points",
  md.includes("−5.96 points") && md.includes("+9.39 points"),
  `"−5.96 points" ${md.includes("−5.96 points")}, "+9.39 points" ${md.includes("+9.39 points")}`,
);
check(
  '4c. the export writes no "pp" either — one unit word on the page and in the export alike',
  !/\bpp\b/i.test(md),
  md.match(/.{0,60}\bpp\b.{0,60}/i)?.[0] ?? "",
);
await page27.close();

// ── 5. the former control — one merged note, on the page ───────────────────
// usdp/296 was a "control with none" until 2026-09-10: the campaign wave has
// since driven it 8-odd points down to zero across three steps, all the same
// way — which is the shape the collapse exists for, so it now shows ONE note, from its first step's earlier touch to its last step's
// later one, at the pinned blocks and rates. A live note (id `…-head`) is not
// one of them and is never merged into one.

for (const key of ["usdp/296"]) {
  const [market, id] = key.split("/");
  const run = MERGED_RUNS[key][0];
  const wantId = `rate-step:${market}:${run.fromBlock}-${run.toBlock}`;
  const page = await open(context, polarisUrl(market, id));
  // The CDP also carries a price-gap note and a live note; this section is
  // about the rate-step rows, so it counts through the same scoped selector
  // every other count here reads.
  await page
    .locator(RATE_STEP_SELECTOR)
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const allIds = await page
    .locator(RATE_STEP_SELECTOR)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
  const historical = allIds.filter((noteId) => !noteId.endsWith("-head"));
  check(
    `5. ${key} shows exactly one HISTORICAL note, the merged run ${blk(run.fromBlock)} → ${blk(run.toBlock)}`,
    historical.length === 1 && historical[0] === wantId,
    `${historical.length} historical (${historical.join(", ") || "none"}), ${allIds.length - historical.length} live; wanted ${wantId}`,
  );
  const text = historical.length === 1 ? await rowText(page, historical[0]) : "";
  check(
    `5a. ${key}'s header states the run's later rate (${run.toPct.toFixed(2)}%), not a step's`,
    squash(text) === squash(`down ${run.toPct.toFixed(2)}% primary rate`),
    `"${text}"`,
  );
  check(
    `5b. ${key}'s note says it stands for ${run.steps} of the CDP's touches, once opened`,
    await (async () => {
      if (historical.length !== 1) return false;
      const row = page.locator(`[data-market-note="${historical[0]}"]`);
      await row.getByRole("button", { expanded: false }).first().click();
      await page.waitForTimeout(300);
      const opened = await rowText(page, historical[0]);
      return opened.includes(`${run.steps} of the CDP's touches`);
    })(),
    `wanted "${run.steps} of the CDP's touches" in the panel`,
  );
  await page.close();
}

// ── 6. the closed fixture, on the page ─────────────────────────────────────
// A closed CDP has no debt at the head, so it carries no live note: its one
// rate-step row is the pinned historical one, stating the pinned figures.

{
  const page = await open(context, polarisUrl("usdp", "196"));
  await page
    .locator(RATE_STEP_SELECTOR)
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const allIds = await page
    .locator(RATE_STEP_SELECTOR)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
  check(
    `6. ${CLOSED_FIXTURE.key} shows the pinned rate-step note and no live one`,
    allIds.length === 1 && allIds[0] === CLOSED_FIXTURE.noteId,
    `${allIds.join(", ") || "(none)"}; wanted ${CLOSED_FIXTURE.noteId}`,
  );
  const atRest = allIds.length === 1 ? await rowText(page, allIds[0]) : "";
  check(
    `6a. ${CLOSED_FIXTURE.key}'s header states the later rate (${CLOSED_FIXTURE.toPct.toFixed(2)}%)`,
    squash(atRest) === squash(`down ${CLOSED_FIXTURE.toPct.toFixed(2)}% primary rate`),
    `"${atRest}"`,
  );
  let opened = "";
  if (allIds.length === 1) {
    const row = page.locator(`[data-market-note="${allIds[0]}"]`);
    await row.getByRole("button", { expanded: false }).first().click();
    await page.waitForTimeout(300);
    opened = await rowText(page, allIds[0]);
  }
  check(
    `6b. opened, it states both rates, the move (${pointsSigned(CLOSED_FIXTURE.deltaPoints)}) and both blocks, and claims no merged touches`,
    opened.includes(`${CLOSED_FIXTURE.fromPct.toFixed(2)}%`) &&
      opened.includes(`${CLOSED_FIXTURE.toPct.toFixed(2)}%`) &&
      opened.includes(pointsSigned(CLOSED_FIXTURE.deltaPoints)) &&
      opened.includes(blk(11_634_933)) &&
      opened.includes(blk(11_662_377)) &&
      !opened.includes("of the CDP's touches"),
    opened.slice(0, 220),
  );
  await page.close();
}

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Polaris rate-step note holds`,
);
process.exit(failures ? 1 : 0);
