// Browser-verify the operator bullet's DENOMINATOR on every position pane.
// ---------------------------------------------------------------------------
// `ExternalActorSummary.total` counts EVENTS. Most position cards lead with a
// TRANSACTION count, and one transaction routinely emits several — 2,762
// against 3,485 reduced rows on the aave-v3 fixture. A bullet opening
// "Of those, " chains its proportion onto whatever bullet precedes it, so
// chaining across that seam states events over transactions. It shipped that
// way on maple, dolomite and aave-v3.
//
// `check:parties` asserts every pane routes through `operatorLead()`. That is a
// STATIC test — it proves the helper is called, not that the sentence it
// produces is true. This drives the real pages and reads the rendered prose.
//
// The assertion is the defect itself:
//   • a chained lead ("Of those, ") may only follow an EVENT bullet — if the
//     bullet above it counts transactions, the proportion is across grains;
//   • a self-anchored lead must state a denominator no smaller than the
//     external count it then quotes.
//
// ⚠️ The pane's control is `button[aria-label="Show explanation"]` — NOT
// "Explanation" — and the button has NO textContent (the icon is the visible
// identity). A wrong selector reports "no explanation control" on every route
// including known-good ones. If this says the whole roster is broken, suspect
// the probe.
//
// WHAT ROTTED (both halves were in the DOM step, not the render):
//
//  1. ONE CLICK, NO RETRY. The detail pages SSR, so the toggle is in the served
//     markup and `waitFor({state:"visible"})` returns at paint — before React
//     has attached the handler. The click landed in that window and was
//     swallowed: measured on /ethereum/spark, the button still read "Show
//     explanation" three seconds later, and the second click opened it. The
//     pane is now opened by a loop that re-reads the OPEN state each poll and
//     clicks again until it flips, which is the remedy this repo has used since
//     `verify-feedback-frontend`'s `openModal`.
//
//  2. `.first()` WAS THE WRONG PANE. A detail page now carries TWO Explanation
//     disclosures — the economics tower's and the position card's — and which
//     comes first in the DOM differs per explorer. On morpho, compound-v3 and
//     moonwell the first one is the tower's, whose prose has no operator bullet
//     in it at all, so the check read a correctly-rendered page and reported
//     the bullet missing. Every Explanation pane on the page is opened now.
//
//  3. THE PROSE WAS READ ONCE, THE MOMENT THE PANE OPENED. The operator bullet
//     is gated on a summary reduced from events the page fetches on the client,
//     so the pane paints its economics bullets before that bullet exists. A
//     single read called moonwell and compound-v3 empty and then found the
//     bullet on the same URL seconds later. Absence is now polled for.
//
// ⇒ IT CARRIES ITS OWN POSITIVE CONTROLS. "No operator bullet" is only ever
// evidence about the render once the pane is known to be open, so opening is
// asserted first, by magnitude: the page must gain prose lines it did not have
// while collapsed. And a run in which no fixture and no discovered subject
// rendered the bullet at all proves nothing about a denominator, so it reports
// NO EVIDENCE and exits non-zero rather than reading as a pass.
//
// FIXTURES ARE SEEDS, NOT PINS. A position only renders the bullet while a
// third party has acted on it, and that moves: the spark subject pinned in
// July has since closed (a closed account renders the terminal explainer, which
// carries no operator bullet by design). So a seed that comes up empty is not
// the verdict — the protocol's listing is walked for a subject that does carry
// one, and the run reports which subject actually answered.
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-operator-denominator.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";

// Seeded 2026-07-27, re-measured 2026-09-01. `listing` is the explorer's
// chain-scoped roster, walked only when the seed renders no operator bullet.
const FIXTURES = [
  {
    proto: "aave-v3",
    listing: "/ethereum/aave-v3",
    path: "/ethereum/aave-v3/0x572372831a9d6b2e3ee8fa284505599e6125fea9?market=core",
  },
  // Re-seeded 2026-09-12. The previous seed, `0xf20b…0704`, still has 466
  // third-party-acted events but has CLOSED, and a terminal position carries no
  // operator bullet by design — so the run walked the listing, and the first 20
  // open positions it reached had no third-party action. This one is open and
  // renders "Of the 42 events … 16 were executed not by the owner", measured
  // with folders on AND off (the bullet is identical — grouping is not a factor).
  { proto: "spark", listing: "/ethereum/spark", path: "/ethereum/spark/0xf84c9f6d59be057f60b484ceda185449848044e1" },
  {
    proto: "aave-v4",
    listing: "/ethereum/aave-v4",
    path: "/ethereum/aave-v4/spoke/main/0x7eac02864fbae93de38394a3e7b72a22e9b5fa09",
  },
  {
    proto: "compound",
    listing: "/ethereum/compound-v3",
    path: "/ethereum/compound-v3/usdc/0x52a3cdf2ef6b17e6ffdaceb38ef30a8c42e6a366",
  },
  {
    proto: "compound-v2",
    listing: "/ethereum/compound-v2",
    path: "/ethereum/compound-v2/0xe08d97e151473a848c3d9ca3f323cb720472d015",
  },
  {
    proto: "moonwell",
    listing: "/ethereum/moonwell",
    path: "/ethereum/moonwell/0xcc2f8a9725aa6682478ccb62d9f0dcbed34daad3",
  },
  { proto: "fluid", listing: "/ethereum/fluid", path: "/ethereum/fluid/4456" },
  { proto: "fx", listing: "/ethereum/fx", path: "/ethereum/fx/wsteth-780" },
  {
    proto: "makerdao",
    listing: "/ethereum/makerdao",
    path: "/ethereum/makerdao/0x226ede73e2efae6a1acf4f162b8e28caee3aaeb4",
  },
  // ⚠️ A maple pane renders only while the position is OPEN, and only for a
  // lender. Re-seeded 2026-09-19: the previous seed, `0x0000…8a90`, is Uniswap
  // V4's PoolManager, which `0767b1d8` (2026-09-14) entered in
  // known-infrastructure — never a roster position, so its page carries no
  // card and `inspect` timed out waiting for one. This seed is an EOA, which
  // cannot be entered there: open with 698,783 syrupUSDT, 236 events, 12 of
  // them third-party rows, read from the live page. A seed whose card never
  // paints still throws, and that is a red.
  { proto: "maple", listing: "/ethereum/maple", path: "/ethereum/maple/0x015cc48cc8bc37d80aaff4e43061dbaf94192308" },
  {
    proto: "morpho",
    listing: "/ethereum/morpho",
    path: "/ethereum/morpho/3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49-0x405dbf6606336ab3d6574f78eddfa68038e9f9a1",
  },
];

// The operator bullet across all 12 vocabularies.
const OPERATOR = /executed (by an address other than|not by the owner|by a third-party address)/;
// The trailing "where" wording varies per protocol ("recorded here,", "on this
// account’s timeline,") — anchor only on the figure, never on the phrasing.
const SELF_ANCHORED = /Of the ([\d,]+) events\b/;
const CHAINED = /^Of those, /;
// fx says "The timeline RECORDS n events"; the rest say "has RECORDED n".
const COUNT_BULLET = /\brecords?\b|\brecorded\b/;

const SHOW = '[aria-label="Show explanation"]';
const HIDE = '[aria-label="Hide explanation"]';
const ROW = 'a[class~="group/listing-row"]';
// How many listed positions to try before giving up on a protocol. Third-party
// action is genuinely rare on some explorers — measured on /ethereum/spark,
// exactly one of the first twenty listed positions carries any — so the walk
// has to be deep enough to reach the phenomenon it is looking for.
const DISCOVERY_DEPTH = 20;

let pass = 0;
let fail = 0;
// The run-level control: how many protocols produced an operator bullet at all.
let withBullet = 0;
const ok = (m) => {
  pass++;
  console.log(`  ✓ ${m}`);
};
const bad = (m) => {
  fail++;
  console.log(`  ✗ ${m}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

/** The page's rendered prose, one entry per visible line.
 *
 *  ⚠️ Read innerText and split on the page's own line breaks rather than
 *  selecting bullet ELEMENTS. A first version filtered nodes by
 *  `childElementCount < 6` and silently dropped compound-v2's bullet, which
 *  nests more spans than that — reporting "no operator bullet" against a pane
 *  that renders one correctly. innerText (not textContent) also keeps a
 *  `sm:hidden` node from contributing text it does not display. */
const prose = () =>
  page.evaluate(() =>
    document.body.innerText
      .split("\n")
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 20),
  );

/**
 * Open every Explanation disclosure on the page and read the operator bullet
 * out of it — as ONE polling loop, because all three of this file's rot
 * mechanisms live in the gap between "the page painted" and "the page is
 * finished".
 *
 * Each pass re-reads the collapsed set and clicks whatever is still collapsed,
 * so a click discarded before hydration is simply made again; a second
 * disclosure that mounts only after the client fetch is picked up on a later
 * pass rather than missed by a loop that already stopped; and the bullet is
 * looked for after every pass, because it is gated on a summary reduced from
 * those same client-fetched events and does not exist when the pane first
 * opens.
 *
 * Returns `{ opened, added, bullets, idx }` — panes now open, the prose lines
 * that were not on the page while everything was collapsed (the positive
 * control that opening actually rendered something), and where the operator
 * bullet landed, or -1 once the deadline passes with the page quiet.
 */
async function openAndRead(deadlineMs = 25_000) {
  const beforeSet = new Set(await prose());
  const deadline = Date.now() + deadlineMs;
  let bullets = [];
  let idx = -1;
  let opened = 0;
  while (Date.now() < deadline) {
    const collapsed = page.locator(SHOW);
    if ((await collapsed.count()) > 0) {
      await collapsed
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    }
    await page.waitForTimeout(400);
    opened = await page.locator(HIDE).count();
    bullets = await prose();
    idx = bullets.findIndex((b) => OPERATOR.test(b));
    if (idx !== -1) break;
  }
  const added = bullets.filter((l) => !beforeSet.has(l));
  return { opened, added, bullets, idx };
}

/**
 * How many rows of the timeline the page itself marks as third-party-executed.
 *
 * `ExternalActorChip` renders the word "by" as its own element beside the
 * actor, so it lands on its own line in innerText — the same `externalActor()`
 * verdict the pane's summary reduces, read off the rendered page rather than
 * recomputed here. It is the independent half of the pair: chips on the
 * timeline and no bullet in the pane is a contradiction on one page, and that
 * is a finding, not a subject to skip. It also makes the listing walk cheap,
 * since a position with no chips cannot have a bullet and needs no pane opened.
 */
const actorChips = () =>
  page.evaluate(
    () =>
      document.body.innerText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s === "by").length,
  );

/** Judge one subject's open pane. Returns a verdict object; the caller decides
 *  whether an absent bullet is a failure or a cue to keep looking. */
async function inspect(path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator(SHOW).first().waitFor({ state: "visible", timeout: 60_000 });
  const { opened, added, bullets, idx } = await openAndRead();
  const chips = await actorChips();
  // A position whose record has ended renders the terminal card and its own
  // terminal explainer, which carries no operator bullet by design. "Highest
  // recorded …" is that card's peak grammar house-wide, and an open card never
  // uses it — so it is the cross-protocol way to tell the two apart, and it
  // keeps a closed subject from being read as a contradiction.
  const terminal =
    bullets.some((b) => /Highest recorded/.test(b)) || (await page.getByText("Highest recorded").count()) > 0;
  const base = { opened, added: added.length, chips, terminal };
  if (opened === 0) return { kind: "closed-pane", ...base };
  // The control: an open pane that added no prose is not evidence about a
  // bullet — it is a pane that did not render.
  if (added.length === 0) return { kind: "empty-pane", ...base, added: 0 };
  if (idx === -1) return { kind: "no-bullet", ...base };
  return { kind: "bullet", ...base, bullets, idx };
}

/** Does this position's timeline mark any row as third-party-executed? Cheap —
 *  a load and a settle, no disclosure driven — so the walk can afford to look
 *  at twenty positions before concluding an explorer has none in reach. */
async function hasActorChips(path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  // The chips ride the timeline rows, which arrive with the client fetch.
  for (let poll = 0; poll < 12; poll++) {
    if ((await actorChips()) > 0) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

/** The seed came up empty: walk the explorer's own listing for a position that
 *  does carry the bullet. Returns the verdict plus the path that answered. */
async function discover(listing) {
  await page.goto(BASE + listing, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const found = await page
    .waitForSelector(ROW, { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  if (!found) return null;
  const hrefs = await page
    .locator(ROW)
    .evaluateAll((as, n) => as.slice(0, n).map((a) => a.getAttribute("href")), DISCOVERY_DEPTH);
  for (const href of hrefs) {
    if (!href) continue;
    if (!(await hasActorChips(href).catch(() => false))) continue;
    const v = await inspect(href).catch(() => null);
    if (!v || v.terminal) continue;
    // A subject whose timeline marks third-party rows and whose pane then says
    // nothing is the contradiction this file is for — surface it rather than
    // walking on to a subject that happens to read correctly.
    if (v.kind === "no-bullet" || v.kind === "bullet") return { ...v, path: href };
  }
  return null;
}

/** The denominator assertions — the defect this file exists for. */
function judge(proto, subject, { bullets, idx }) {
  const bullet = bullets[idx];
  if (CHAINED.test(bullet)) {
    // Find the nearest preceding bullet that states a count.
    const before = bullets
      .slice(0, idx)
      .reverse()
      .find((b) => COUNT_BULLET.test(b) && /\b(event|transaction)s?\b/.test(b));
    if (!before) {
      bad(`${proto}: chains "Of those" onto NOTHING — no preceding count bullet (${subject})`);
    } else if (/\btransactions?\b/.test(before)) {
      bad(`${proto}: chains "Of those" onto a TRANSACTION count — "${before.slice(0, 70)}…"`);
    } else {
      ok(`${proto}: chains onto an event count — "${before.slice(0, 60)}…"`);
    }
    return;
  }
  const m = bullet.match(SELF_ANCHORED);
  if (!m) {
    bad(`${proto}: lead is neither chained nor self-anchored — "${bullet.slice(0, 90)}…"`);
    return;
  }
  const denom = Number(m[1].replace(/,/g, ""));
  const ext = Number((bullet.match(/, ([\d,]+) (?:was|were) executed/) || [0, "0"])[1].replace(/,/g, ""));
  if (ext > denom) {
    bad(`${proto}: external ${ext} EXCEEDS its denominator ${denom}`);
  } else if (denom === 0) {
    bad(`${proto}: self-anchored on a zero denominator`);
  } else if (ext === 0) {
    // A bullet that renders at all means `ext.external > 0` upstream, so a
    // zero here is the sentence disagreeing with its own gate.
    bad(`${proto}: bullet renders but quotes ZERO external events against ${denom}`);
  } else {
    ok(`${proto}: self-anchored — ${ext} of ${denom} events`);
  }
}

// Naming protocols on the command line runs only those — for re-running one
// red alone, which this repo's verify sweeps require before a failure is
// believed. With none named the whole roster runs.
const only = new Set(process.argv.slice(2));
const subjects = only.size ? FIXTURES.filter((f) => only.has(f.proto)) : FIXTURES;

for (const { proto, path, listing } of subjects) {
  console.log(`\n── ${proto} ${path}`);
  try {
    let verdict = await inspect(path);
    let subject = path;

    if (verdict.kind === "closed-pane") {
      bad(`${proto}: the Explanation pane never opened — ${verdict.opened} open after 60 polls`);
      continue;
    }
    if (verdict.kind === "empty-pane") {
      bad(`${proto}: the pane reports open but added no prose — nothing to judge`);
      continue;
    }
    if (verdict.kind === "no-bullet") {
      if (verdict.chips > 0 && !verdict.terminal) {
        // The page contradicts itself on one screen: the timeline marks rows as
        // third-party-executed and the pane, open and rendering, says nothing
        // about them. That is the defect, not a subject to walk past.
        bad(
          `${proto}: timeline marks ${verdict.chips} third-party row(s) but the open pane states no operator (${subject})`,
        );
        continue;
      }
      // No third-party action on this subject at all (the seed may simply have
      // closed since it was pinned). Go and find one that has some, rather than
      // calling a correctly-rendered page a failure.
      console.log(
        `  … seed carries no operator bullet (${verdict.chips} chips, terminal=${verdict.terminal})` +
          ` — walking ${listing} for an open subject with third-party action`,
      );
      const found = await discover(listing);
      if (!found) {
        bad(`${proto}: no third-party action on the seed or the first ${DISCOVERY_DEPTH} listed positions`);
        continue;
      }
      verdict = found;
      subject = found.path;
      console.log(`  … discovered ${subject} (${verdict.chips} third-party rows on its timeline)`);
      if (verdict.kind === "no-bullet") {
        bad(
          `${proto}: timeline marks ${verdict.chips} third-party row(s) but the open pane states no operator (${subject})`,
        );
        continue;
      }
    }

    withBullet++;
    ok(
      `${proto}: pane open (${verdict.opened}) and rendering — ${verdict.added} prose lines added,` +
        ` ${verdict.chips} third-party rows on the timeline`,
    );
    judge(proto, subject, verdict);
  } catch (e) {
    // A throw must COUNT as a failure and never discard the run's verdict.
    bad(`${proto}: threw — ${String(e).split("\n")[0].slice(0, 110)}`);
  }
}

await browser.close();

// The run-level control. Every denominator assertion above is conditional on
// finding a bullet, so a run that found none asserted nothing about a
// denominator — that must not read as a pass.
if (withBullet === 0) {
  console.log(
    `\nNO EVIDENCE — not one of the ${FIXTURES.length} explorers rendered an operator bullet, ` +
      `so no denominator was ever judged.`,
  );
  process.exit(1);
}

console.log(
  `\n=== SUMMARY ===\nPASS=${pass} FAIL=${fail} across ${FIXTURES.length} fixtures` +
    ` · ${withBullet} rendered an operator bullet (the control)`,
);
process.exit(fail === 0 ? 0 : 1);
