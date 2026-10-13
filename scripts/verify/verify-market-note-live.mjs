// The market-notes switch, and the LIVE note at the head of the timeline —
// the market's rate read at the chain head against the position's newest
// event that carries it, on a Polaris CDP (usdp/8).
// ---------------------------------------------------------------------------
// A live note sits in a dedicated head slot above the newest row for any OPEN
// position whose live read exists — unthresholded, because "nothing has moved"
// is itself the fact. The switch was a toolbar pill, "Market notes · N", until
// rails-ops TO-DO-ui-jobs item 118 moved it into Display as "Market-note
// markers" and made each closed note a marker on the spine; the count the pill
// stated is `data-market-notes` on the timeline root. This script turns on
// "Open all market notes" before load (lib/market-notes.mjs), so every note
// draws its row as it did at rest before the markers.
//
// Every EARLIER end below is a historical fact, read from the position's own
// timeline route and safe to pin (it does not move). Every LATER end is a
// live chain read and is NEVER pinned: it is re-fetched from the same routes
// the page reads, right before the assertion, and compared with a tolerance
// — a fixed number would go stale on the next block and read as a false
// failure forever after.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3416 node scripts/verify/verify-market-note-live.mjs

import { chromium } from "playwright";
import { drawWholeList } from "../lib/timeline-draw.mjs";
import { marketNoteCount, setMarketNotes, showNoteRows } from "./lib/market-notes.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
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
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

// ── Formatting, restated independently of lib/shared/market-note.ts ────────
const formatRatePercent = (n) =>
  `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const formatStableAmount = (n) => {
  const opts =
    Math.abs(n) >= 1000
      ? { notation: "compact", maximumFractionDigits: 2 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return n.toLocaleString("en-US", opts);
};
/** The number right after the LAST "→" following `label` in the note's text —
 *  the "after" half of a before→after stat card, e.g. "Oracle price (…) 5,003.96
 *  → 5,378.75" yields 5378.75 for label "Oracle price". Used to compare a
 *  page's own rendered live figure against a fresh route read numerically,
 *  with a tolerance, rather than string-matching a value that can have ticked
 *  a block between the two reads. */
function afterArrow(text, label) {
  const re = new RegExp(`${label}.*?([\\d.,]+)\\s*(?:%|pp)?\\s*→\\s*([\\d.,]+)`);
  const m = re.exec(text);
  return m ? Number(m[2].replace(/,/g, "")) : null;
}

console.log("Market notes — the Display switch and the live note\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1600 },
  permissions: ["clipboard-read", "clipboard-write"],
});
await showNoteRows(context);

async function open(url, waitForNoteMs = 15000) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page
    .locator('[data-market-note$="-head"]')
    .first()
    .waitFor({ state: "attached", timeout: waitForNoteMs })
    .catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

async function openNote(row) {
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { expanded: false }).first().click();
  await row.page().waitForTimeout(250);
  const trig = row.getByRole("button", { name: /how this note was derived/i });
  if (await trig.count()) await trig.click();
  await row.page().waitForTimeout(200);
  return (await row.innerText()).replace(/\s+/g, " ");
}

// ── 1. usdp/8 — the live rate note in the head slot ─────────────────────────

const chain8 = await api("/api/chain/polaris/position?market=usdp&id=8");
check("0a. usdp/8's chain overlay answers, open, priced", chain8.isOpen === true && chain8.price != null);

const page8 = await open(`${BASE}/sepolia/polaris/usdp/8`);
const ids8 = await page8
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
// ⚠️ THE COUNT IS READ, NOT PINNED — and the three surfaces are then held to
// each other. It was pinned at 29 until 2026-09-20 and the page drew 22, with
// the count and the markdown export BOTH saying 22 as well, so the page is
// internally consistent and the pin is what moved. Nobody can say which figure
// is right: no baseline exists from before the plain-words commit, and a
// Sepolia CDP's note count moves with whoever touches it (TO-DO-ui-jobs §38 —
// the fall from 29 to 22 is the suspicious direction, since a touch only ever
// adds an endpoint, and it is recorded there rather than pinned over).
//
// So what this run asserts is the claim a pinned number could never make: the
// row count, the timeline's `data-market-notes` and the export all state ONE
// number (checks 7a and 9a), and the live note is the pinned one by id (1b).
// A count that drifted from its rows is the defect this pair is for, and it
// survives a count that moves.
const NOTE_COUNT_8 = ids8.length;
check("1a. usdp/8 draws its live note", NOTE_COUNT_8 >= 1, `${NOTE_COUNT_8} note rows`);
check(
  "1b. the live row is in the head slot, above every historical row (DOM order, newest-first default)",
  ids8[0] === "rate-step:usdp:11610231-head",
  ids8.slice(0, 3).join(", "),
);

const rateRow8 = page8.locator('[data-market-note="rate-step:usdp:11610231-head"]');
const rateText8 = await openNote(rateRow8.first());

// Fresh read, right before the assertion — the live end is never pinned. It
// is the independent cross-check (2c below proves the page's figure
// tracks a route read taken moments apart).
const liveChain8 = await api("/api/chain/polaris/position?market=usdp&id=8");
const FROM_RATE_8 = 0.09343584279726581;
const FROM_DEBT_8 = 9191687.015714981855337009;

check(
  "2a. the rate note is a LIVE note naming the CDP's own last touch, block 11,610,231",
  /this is a live note:.*this cdp.s own last touch/i.test(rateText8) &&
    /yearly interest on the debt at block 11,610,231/i.test(rateText8),
  rateText8.slice(0, 260),
);
check(
  "2b. the rate note's earlier rate is the pinned historical figure",
  rateText8.includes(formatRatePercent(FROM_RATE_8)),
  `wanted ${formatRatePercent(FROM_RATE_8)}`,
);
const gotRatePct8 = afterArrow(rateText8, "Primary rate");
check(
  "2c. the rate note's later rate is within 0.05pp of the freshly-read overlay primaryRate",
  gotRatePct8 != null && Math.abs(gotRatePct8 - liveChain8.primaryRate * 100) <= 0.05,
  `page ${gotRatePct8}%, overlay ${(liveChain8.primaryRate * 100).toFixed(2)}%`,
);
const interestBefore8 = FROM_DEBT_8 * FROM_RATE_8;
// The "after" interest is recomputed from the OVERLAY'S full-precision
// primaryRate, not the 2-decimal rate the row displays — a compact 2-sig-fig
// dollar figure is sensitive enough to input precision that reusing the
// DISPLAYED "1.37%" (rounded from e.g. 1.3697…%) rather than the underlying
// value produces a different compact figure than the page actually computed.
// Check 2c above already proved the overlay's rate is within 0.05pp of what
// the page rendered, so this is the same reading, at the precision the page
// itself used internally.
const interestAfter8 = FROM_DEBT_8 * liveChain8.primaryRate;
check(
  "2d. the rate note's yearly-interest figures are recomputed from the pinned debt and each rate",
  rateText8.includes(formatStableAmount(interestBefore8)) && rateText8.includes(formatStableAmount(interestAfter8)),
  `wanted ${formatStableAmount(interestBefore8)} → ${formatStableAmount(interestAfter8)}`,
);
check(
  '2e. the rate note names the quantity "primary rate"',
  rateText8.includes("primary rate"),
  rateText8.slice(0, 80),
);

// ── 2. usdp/27 and usdp/166 — no live note ─────────────────────────────────

for (const id of ["27", "166"]) {
  const chain = await api(`/api/chain/polaris/position?market=usdp&id=${id}`);
  const p = await open(`${BASE}/sepolia/polaris/usdp/${id}`, 3000);
  // A note is drawn beside its row, so the list is drawn whole before the
  // notes on it are read.
  await drawWholeList(p);
  const ids = await p
    .locator("[data-market-note]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
  const liveOnes = ids.filter((i) => i.endsWith("-head"));
  check(
    `3. usdp/${id} (closed=${chain.isOpen === false}) shows no live note`,
    liveOnes.length === 0,
    `${liveOnes.length} live note(s): ${liveOnes.join(", ")}`,
  );
  await p.close();
}

// ── 5. The switch — Display's item, the count, the no-notes page ──────────

const count8 = await marketNoteCount(page8);
check(
  `7a. usdp/8's timeline states the same note count as the rows it draws, ${NOTE_COUNT_8}`,
  count8 === NOTE_COUNT_8,
  `data-market-notes ${count8}`,
);
const offered8 = await setMarketNotes(page8, false);
await page8.waitForTimeout(300);
const notesAfterToggle = await page8.locator("[data-market-note], [data-note-marker]").count();
check(
  '7b. Display\'s "Market-note markers" off hides every note (historical and live), row and marker',
  offered8 && notesAfterToggle === 0,
  `${offered8 ? "offered" : "not offered"}, ${notesAfterToggle} note(s) left`,
);
await setMarketNotes(page8, true);
await page8.waitForTimeout(300);
const pill8 = await page8.getByRole("button", { name: /^Market notes ·/i }).count();
check('7c. the toolbar carries no "Market notes · N" pill', pill8 === 0, `${pill8} found`);
await page8.close();

// The no-notes page — a Liquity V1 trove: no note kind exists there at all.
const v1Roster = await api("/api/liquity-v1/positions?status=active&limit=1");
const v1Wallet = v1Roster.data?.[0]?.wallet;
check("8a. a Liquity V1 wallet with an open trove was found for the control", !!v1Wallet, v1Wallet ?? "NO EVIDENCE");
if (v1Wallet) {
  const v1Page = await open(`${BASE}/ethereum/liquity-v1/${v1Wallet}`, 3000);
  const v1Notes = await v1Page.locator("[data-market-note], [data-note-marker]").count();
  const v1Offered = await setMarketNotes(v1Page, false);
  check(
    "8b. the no-notes page (Liquity V1 trove) shows no note and Display offers no notes item",
    v1Notes === 0 && !v1Offered,
    `${v1Notes} note(s), Display ${v1Offered ? "offers" : "does not offer"} the item`,
  );
  await v1Page.close();
} else {
  check(
    "8b. the no-notes page (Liquity V1 trove) shows no note and Display offers no notes item",
    false,
    "NO EVIDENCE — no fixture found",
  );
}

// ── 6. Markdown export on usdp/8 carries the live sentence ─────────────────

const exportPage = await open(`${BASE}/sepolia/polaris/usdp/8`);
const copyMarkdown = async () => {
  await exportPage
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await exportPage.getByRole("menuitem", { name: /Copy Position/i }).click();
  await exportPage.waitForTimeout(500);
  return exportPage.evaluate(() => navigator.clipboard.readText());
};
const md8 = await copyMarkdown();
check(
  `9a. the markdown export names "Market notes" and lists the same count, ${NOTE_COUNT_8}`,
  new RegExp(`\\*\\*Market notes:\\*\\*\\s*${NOTE_COUNT_8}\\b`).test(md8),
  md8.includes("Market notes") ? md8.match(/\*\*Market notes:\*\*[^\n]*/)?.[0] : "absent",
);
check(
  "9c. the export's Market notes section carries the rate live sentence",
  /Since this CDP.s adjustment at block 11,610,231 the USDp market.s primary rate has moved/.test(md8),
);
const tableRows = (md) => (md.match(/^\| \d+ \| /gm) ?? []).length;
const usdp8Timeline = await api("/api/polaris/timeline?market=usdp&id=8");
check(
  "9d. the live note adds no row to the timeline table — its count is the route's event count",
  tableRows(md8) === usdp8Timeline.events.length,
  `table ${tableRows(md8)} rows, route ${usdp8Timeline.events.length} events`,
);
await exportPage.close();

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the live market note holds`,
);
process.exit(failures ? 1 : 0);
