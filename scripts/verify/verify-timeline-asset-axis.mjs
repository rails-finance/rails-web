// Live in-browser verification of the timeline's ASSET axis — the third filter
// beside the event-type menu and the date range (see getEventAssetKeys in
// lib/shared/event-filter-helpers.ts, wired through useTimelineEvents and
// rendered by TimelineToolbar).
//
// Three fixtures, all on the page as a reader meets it — GROUPED, since
// 2026-09-12 the SparkLend default — and the last matters as much as the first:
//
//   POSITIVE — the SparkLend wallet 0x1601843c5e9bc251a3272907010afa41fa18347e, the deepest one indexed: on
//   2026-08-28 it carried 28,065 events over six reserves (USDT 14,525 / USDS
//   3,968 / USDC 3,106 / DAI 2,461 / PYUSD 2,449 / WETH 1,556). It is a LIVE
//   wallet and it moves — the run before this one caught it a single USDT
//   supply lighter — so the counts here are asserted as INVARIANTS, not as
//   pinned figures: the six symbols are present, the buckets account for every
//   event, and hiding a bucket removes exactly the events it claims. A pinned
//   total would have gone red on a working build the first time the wallet
//   traded, which is a verifier that cries wolf, not one that guards anything.
//
//   Grouped, it is a window of 1,000 rows over 1,004 events: one folder of five
//   transfers in, one per reserve (read 2026-09-21), so hiding USDT SPLITS that
//   folder — four of its five members pass.
//
//   EXACT — the SparkLend wallet 0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5: its whole history, 2,795 transfers,
//   sits in 28 folders and no event is loose (2026-09-21). Every event is a
//   transfer of ONE reserve, so the asset buckets partition the history
//   (asserted, X0) and hiding a bucket must leave exactly `total − bucket`.
//   The same holds for the two event types. This is the arm the grouped count
//   is proved on: before 2026-09-21 the filtered numerator counted the loose
//   events alone, and every filter on this page read "0 of 2,795 events" beside
//   the folders it had left standing (rails-ops TO-DO-infra-and-backend.md,
//   "on a grouped page an ACTION or ASSET filter's count reads low").
//   The menu's buckets come from the folders' `legs` and `counts`; the
//   numerator from the folders' `cells` — the check compares two independent
//   halves of the header, and pins that its count reaches the line at all.
//
//   COUNTED — Aave V3 core 0xee7ca610d896c53ffe716b801c05748efd902954, where an asset filter splits 85
//   folders: the count must equal what the members give through the api, and
//   settle without reading them (the arm carries its own history).
//
//   Break-tested 2026-09-21 against preview while it still served the build
//   before the fix — four FAIL by name: X1 [Assets] "0 of 2,795 events —
//   shown 0, expected 750 (2795 − 2045)" and "0 member card(s) drawn"; X2
//   [Types of event] "shown 0, expected 264 (2795 − 2531)" and "0 member
//   card(s) drawn". The same run caught this script's own `check` returning
//   nothing, so `if (!check(…)) return` skipped the whole arm and the run went
//   ALL PASS; `check` returns its verdict now.
//
//   NEGATIVE — a Liquity V1 Trove, one collateral and one debt token for its
//   whole life. getEventAssetKeys returns [] there, so the control must NOT
//   appear. Without this half the suite would pass just as well on a build that
//   rendered an asset menu on every page in the site.
//
// Run:
//   BASE=http://localhost:3111 node scripts/verify/verify-timeline-asset-axis.mjs

import { chromium } from "playwright";
import { COUNT_LINE_SEL, countLineText, parseCountLine, NAMES_THE_CAP } from "../lib/timeline-draw.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "networkidle", timeout: 300000 };

// The DEFAULT page — grouped. Until 2026-09-21 this pinned `?folders=0`: a
// filter's numerator counted only the loose events, so on a grouped page the
// members of a standing folder never joined it. The line now counts them and
// says when it has (`data-timeline-shown`), which is what every read below
// waits on.
const SPARK_WALLET = "0x1601843c5e9bc251a3272907010afa41fa18347e";
const SPARK = `/ethereum/spark/${SPARK_WALLET}`;
const ALL_FOLDERS = "/ethereum/spark/0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5";
const TROVE = "/ethereum/liquity-v1/0x56356afabaa06b555029a1f1fee3fcecf21d3692?epoch=2";

// The reserves this wallet has used, commonest first — the order the menu
// sorts them into. New reserves would be a real change worth seeing, and the
// check has now seen one: RLUSD, a single event, arrived by 2026-09-25 and is
// added here rather than left as a standing red. It is the wallet moving, not
// the page.
const EXPECTED = ["USDT", "USDS", "USDC", "DAI", "PYUSD", "WETH", "RLUSD"];
/** Its event count on 2026-08-28. The index only grows, so this is a floor. */
const FLOOR = 28065;

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

/** Open the toolbar dropdown whose panel heading is `heading`; null if none of
 *  them is it. Both multi menus render an identical "All" trigger, so the only
 *  way to tell them apart is to open one and read its heading. */
async function openMenu(heading) {
  const triggers = page.locator("button", { hasText: /^All$|^\d+$/ });
  const n = await triggers.count();
  for (let i = 0; i < n; i++) {
    const t = triggers.nth(i);
    if (!(await t.isVisible())) continue;
    await t.click();
    const panel = page.locator(".overlay-panel").filter({ has: page.locator(`span:text-is("${heading}")`) });
    if ((await panel.count()) > 0) return panel.first();
    await t.click(); // not this one — close it and try the next
  }
  return null;
}

/** Close whatever panel is open — FilterDropdown listens for a pointerdown
 *  outside its own subtree, so a click in the page margin is the dismissal. */
async function dismiss() {
  await page.mouse.click(4, 4);
}

/** The toolbar's own count line, and beside it the two row grains the line no
 *  longer carries. Every form `eventCountLine` writes is parsed by
 *  `parseCountLine` in `scripts/lib/timeline-draw.mjs` — one grammar, in one
 *  place; read it, and `components/shared/timeline-toolbar.tsx`, before
 *  changing anything here.
 *
 *  ⚠️⚠️ THE LINE STOPPED STATING WHAT THE PAGE LOADED, 2026-09-24. Decision
 *  0019's amendment made the count line state TIME: "29,839 events · loaded 20
 *  Aug 2026 to 25 Sept 2026" at rest, "Showing 563 of 20 Aug 2026 to 25 Sept
 *  2026 · 29,839 events" filtered. The preload is "never stated to the reader
 *  as a number" (rule 2), so "Showing 1,000 of 28,179 events" and "Showing
 *  1,000 rows of 29,590 events" are both gone and with them the `listed` and
 *  `rows` grains this reader used to take off the line. It matched none of the
 *  new forms and returned null from that day, which read as `undefined` in
 *  four details and let one check compare two undefineds and pass
 *  (TO-DO-ui-jobs §58).
 *
 *  So the grains come from where the page still states them, as plumbing
 *  rather than prose: `data-timeline-rows-loaded` is the rows the page holds,
 *  `data-timeline-unit` says whether those rows are a count of events or of
 *  rows the index grouped. A ratio is only ever between two counts of the SAME
 *  set, which is why they are returned apart.
 *
 *  ⚠️ Read from the count line's own ELEMENT, never the whole body: the
 *  coverage footer prose under the timeline names the same figures in
 *  sentences. A filtered numerator may read "at least N" while a split
 *  folder's members are still being read; `settled()` waits that out.
 *
 *  @returns {{shown:number|null,listed:number|null,rows:number|null,total:number|null,
 *    span:string|null,windowed:boolean,text:string}|null}
 *    `shown` — the filtered numerator, null when nothing is filtered. `listed`
 *    — the rows the page loaded, in events where the index grouped nothing.
 *    `rows` — the same figure where it counts ROWS, null otherwise. `total` —
 *    the POSITION's lifetime count, or null where the opening balance has not
 *    arrived and no such figure may be stated. `windowed` — the page holds
 *    less than the whole life, read from the line's span rather than guessed
 *    at from its shape. */
async function counts() {
  const read = await page.evaluate((sel) => {
    const marker = document.querySelector("[data-timeline-rows-loaded]");
    const state = document.querySelector("[data-timeline-total]");
    return {
      text: document.querySelector(sel)?.textContent?.trim() ?? null,
      loaded: marker ? Number(marker.getAttribute("data-timeline-rows-loaded")) : null,
      unit: state?.getAttribute("data-timeline-unit") ?? null,
    };
  }, COUNT_LINE_SEL);
  const parsed = parseCountLine(read.text);
  if (!parsed) return null;
  // The line names the span only where the page holds less than the life; a
  // whole history states its total and stops. The mid-settle form states a
  // listed count and no total, and `settled()` is what keeps it out of here.
  const windowed = parsed.span != null || parsed.listed != null;
  const listed = read.loaded ?? parsed.listed;
  return {
    shown: parsed.shown,
    listed,
    rows: read.unit === "rows" ? listed : null,
    total: parsed.total,
    span: parsed.span,
    windowed,
    text: parsed.text,
  };
}

/** The count line once the page has declared it settled: the lifetime figures
 *  in hand (`data-timeline-total` not `pending`) and the filtered numerator
 *  whole (`data-timeline-shown` not `floor` — a split folder's members are
 *  read after the filter lands). A build without the marker is read as it
 *  stands, so a build before the fix answers with its own numbers and fails
 *  on them by name rather than as a timeout. */
async function settled() {
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector("[data-timeline-total]");
        if (!el) return false;
        return (
          el.getAttribute("data-timeline-total") !== "pending" && el.getAttribute("data-timeline-shown") !== "floor"
        );
      },
      null,
      { timeout: 240000 },
    )
    .catch(() => {});
  return counts();
}

/** Toggle one row of a menu and read the settled line. */
async function toggle(heading, key) {
  const menu = await openMenu(heading);
  if (!menu) return null;
  await menu.locator("button", { hasText: new RegExp(`^${key}\\d`) }).click();
  await dismiss();
  return settled();
}

/** A menu's rows as { key, count }, commonest first. */
async function menuRows(menu) {
  const rows = (await menu.locator("button").allTextContents()).map((r) => r.trim()).filter(Boolean);
  return rows.map((r) => {
    const m = r.match(/^(.+?)([\d,]+)$/);
    return m ? { key: m[1], count: +m[2].replace(/,/g, "") } : { key: r, count: NaN };
  });
}

// ── POSITIVE: the six-reserve SparkLend wallet ──────────────────────────────
await page.goto(BASE + SPARK, NAV);
const atRest = await settled();
check(
  "spark: the position's whole-history count is stated",
  (atRest?.total ?? 0) >= FLOOR,
  `${atRest?.total} events, floor ${FLOOR} — line reads "${atRest?.text}"`,
);
const TOTAL = atRest?.total ?? 0;

// The grouped answer this page drew, read on the same run and independently of
// it: `eventsServed` is the EVENTS the page holds, folder members included,
// against `events.length` rows. Those two grains used to be on the count line;
// decision 0019's amendment of 2026-09-24 took the cap off the reader's face,
// so the page states the life's total and the time its rows cover and nothing
// about their number. The ratio checks below need the grain all the same, and
// an expectation read from the route rather than from the page is the stronger
// source in any case.
const sparkRoute = await fetch(`${BASE}/api/spark/timeline?wallet=${SPARK_WALLET}&group=1`)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);
const SERVED_EVENTS = sparkRoute?.eventsServed ?? null;
const SERVED_ROWS = sparkRoute?.events?.length ?? null;
check(
  "spark: the grouped route answers, cut by rows, with more events served than rows",
  sparkRoute?.grouped === true && sparkRoute?.boundBy === "rows" && SERVED_EVENTS > SERVED_ROWS && SERVED_ROWS > 0,
  `grouped ${sparkRoute?.grouped}, boundBy ${sparkRoute?.boundBy}, ${SERVED_ROWS} rows carrying ${SERVED_EVENTS} events`,
);

// This wallet is past the preload, so the page holds part of its life and says
// so IN TIME. If it ever stops holding part of it the fixture has fallen under
// the cut and the windowed assertions below go vacuous — which is a reason to
// change the fixture, not to drop the check. The grain the page still states,
// and no longer in prose, is the rows it loaded.
check(
  "spark: the page holds part of the life, states the span in time, and names no cap",
  atRest?.windowed === true &&
    atRest?.span != null &&
    (atRest?.rows ?? 0) > 0 &&
    atRest.rows < TOTAL &&
    !NAMES_THE_CAP.test(await page.innerText("body")),
  `${atRest?.rows} rows loaded of a position holding ${TOTAL}, span ${JSON.stringify(atRest?.span)} — "${atRest?.text}"`,
);

const assets = await openMenu("Assets");
check("spark: the asset menu exists", assets !== null);

if (assets) {
  const parsed = (await menuRows(assets)).map((r) => ({ sym: r.key, count: r.count }));
  const rows = parsed.map((p) => `${p.sym}${p.count}`);
  check(
    "spark: one row per reserve, in count order, and no others",
    parsed.map((p) => p.sym).join(",") === EXPECTED.join(","),
    rows.join(" | "),
  );
  // Symbols are names: the menu's title-casing must not have touched them.
  check("spark: symbols render verbatim (PYUSD, not Pyusd)", !rows.some((r) => /^Pyusd|^Usdt|^Usdc|^Weth/.test(r)));

  // Every event is in some bucket. Equality rather than ">=" holds here because
  // this wallet has only supplies, withdrawals and transfers — one reserve
  // each. A liquidation would sit in TWO buckets (debt covered, collateral
  // seized) and legitimately push the sum above the total, so the floor is the
  // assertion and a rise above it is not a fault.
  const summed = parsed.reduce((n, p) => n + p.count, 0);
  check("spark: the buckets account for every event", summed >= TOTAL, `${summed} bucketed vs ${TOTAL} events`);
  await dismiss();

  // Hide the biggest reserve. ⚠️⚠️ THE DENOMINATOR IS THE ASSERTION. The menu's
  // bucket is a fact about the POSITION (it is seeded from the opening balance),
  // while the filter can only ever act on the rows the page loaded — so the
  // numerator must be counted over what the page LOADED, and the position's own
  // total must sit beside it, unchanged. The bug this pins read "563 of 28,153":
  // the drop it implied, 27,590 events, was twice the bucket the menu had just
  // named.
  //
  // ⚠️ THE DENOMINATOR IS NOW THE LOADED SPAN, not a number. Decision 0019's
  // amendment of 2026-09-24: the filtered line reads "Showing 563 of 20 Aug
  // 2026 to 25 Sept 2026 · 29,839 events", so what the numerator is over is
  // stated in TIME and the cap is not stated at all. The set is the same set,
  // and the served answer above is where its size is read. The span is the
  // second half of the assertion now: a filter narrows the view and must move
  // neither the span the page holds nor the position's total.
  const biggest = parsed[0];
  const hidden = await toggle("Assets", biggest.sym);
  const LISTED = SERVED_EVENTS ?? 0;
  check(
    `spark: hiding ${biggest.sym} counts over what the page loaded, and moves neither the span nor the position`,
    hidden?.windowed === true &&
      (hidden?.shown ?? 0) > 0 &&
      hidden.shown <= LISTED &&
      hidden?.span === atRest?.span &&
      hidden?.total === TOTAL,
    `"${hidden?.text}" — shown ${hidden?.shown} of the ${LISTED} events served, span ${JSON.stringify(
      hidden?.span,
    )} (was ${JSON.stringify(atRest?.span)}), position ${hidden?.total} (expected ${TOTAL})`,
  );
  // Direction, and the one exact relation that survives the two grains: a drop
  // measured over the loaded rows can never exceed the bucket measured over the
  // whole position.
  const dropped = LISTED - (hidden?.shown ?? 0);
  check(
    `spark: hiding ${biggest.sym} removes some listed events, and no more than its ${biggest.count}`,
    dropped > 0 && dropped <= biggest.count,
    `${dropped} of ${LISTED} listed events removed, bucket ${biggest.count}`,
  );

  // And it is reversible — the axis narrows the view, never the data.
  // ⚠️ AND BOTH SIDES HAVE TO EXIST. While the reader above matched none of
  // the amended forms this compared `undefined` with `undefined` and passed on
  // a page it had not read (TO-DO-ui-jobs §58).
  const restored = await toggle("Assets", biggest.sym);
  check(
    `spark: showing ${biggest.sym} again restores the unfiltered line`,
    restored?.text != null && restored.text === atRest?.text,
    `"${restored?.text ?? "UNREAD"}" — before the filter "${atRest?.text ?? "UNREAD"}"`,
  );
}

// ── EXACT: every event inside a folder ───────────────────────────────────────
// A whole history (no window), so the line is "N of T events" and a bucket is
// a count over the same set the line counts.
await page.goto(BASE + ALL_FOLDERS, NAV);
const whole = await settled();
const WHOLE = whole?.total ?? 0;
check("all-folders: a whole history, stated as events", whole?.windowed === false && WHOLE > 0, `"${whole?.text}"`);
const loose = await page.locator("[data-event-id]").count();
check(
  "all-folders: no event is loose — the arm is the folders' count or nothing",
  loose === 0,
  `${loose} loose card(s)`,
);

/** Hide the biggest bucket of one menu and hold the line to `total − bucket`.
 *  X0 first: the buckets must partition the history (every event in exactly
 *  one), or `total − bucket` is not the answer and the check says so instead
 *  of passing or failing on a wrong expectation. */
async function exactArm(heading, id) {
  const menu = await openMenu(heading);
  if (!check(`all-folders: the "${heading}" menu exists`, menu !== null)) return;
  const buckets = await menuRows(menu);
  await dismiss();
  const summed = buckets.reduce((n, b) => n + b.count, 0);
  const partition = check(
    `all-folders X0 [${heading}]: the buckets partition the history`,
    buckets.length > 1 && summed === WHOLE,
    `${buckets.map((b) => `${b.key} ${b.count}`).join(" | ")} — Σ ${summed} vs ${WHOLE} events`,
  );
  if (!partition) return;
  const biggest = buckets[0];
  const expected = WHOLE - biggest.count;
  const after = await toggle(heading, biggest.key);
  check(
    `all-folders ${id} [${heading}]: hiding ${biggest.key} leaves exactly the events outside its bucket`,
    after?.shown === expected && after?.total === WHOLE,
    `"${after?.text}" — shown ${after?.shown}, expected ${expected} (${WHOLE} − ${biggest.count})`,
  );
  // The folders the filter SPLIT open, and their members answer it. No event
  // on this page is loose, so every card drawn is a member of an opened folder
  // (checked above), and none is drawn while every folder stays shut.
  const drawn = await page
    .waitForSelector("[data-event-id]", { timeout: 120000 })
    .then(() => page.locator("[data-event-id]").count())
    .catch(() => 0);
  check(
    `all-folders ${id} [${heading}]: the folders it splits open onto their members`,
    drawn > 0,
    `${drawn} member card(s) drawn`,
  );
  const back = await toggle(heading, biggest.key);
  check(
    `all-folders ${id} [${heading}]: showing ${biggest.key} again restores the line`,
    back?.text != null && back.text === whole?.text,
    `"${back?.text ?? "UNREAD"}" — before the filter "${whole?.text ?? "UNREAD"}"`,
  );
}
await exactArm("Assets", "X1");
await exactArm("Types of event", "X2");

// ── COUNTED: an asset filter is counted off the folders' cells ──────────────
// Aave V3 core 0xee7c…2954 serves 86 transfer folders in its window, 85 of them
// over two reserves (USDC and cbBTC, read 2026-09-21), so hiding USDC splits 85
// folders. Until the folders carried `cells` the page read every split folder's
// members, one request at a time, to count them: 85 reads and 23 s before the
// line settled. The count must now settle with only the reads the drawn,
// opened folders make for their own cards — and must equal the count the
// members give, read here independently through the api (C1), so a cell keyed
// differently from the member it stands for cannot pass.
//
// Break-tested 2026-09-21 against preview before the cells deployed: C1 held
// (1,580 both ways, the page counting from members) and C2 failed with 85
// member reads before the line settled.
{
  const WALLET = "0xee7ca610d896c53ffe716b801c05748efd902954";
  const HIDE = "USDC";
  const api = `${BASE}/api/aave-v3/timeline?wallet=${WALLET}&market=core`;
  // getEventAssetKeys' Aave V3 arm, restated: the reserve, a liquidation's
  // collateral, a swap's received reserve unless it left as a trade.
  const assetKeys = (e) => {
    const d = e.context?.data ?? {};
    const s = d.swap;
    const found = [d.reserveSymbol, d.collateralSymbol, s?.receivedAction === "trade" ? undefined : s?.receivedSymbol];
    return [...new Set(found.filter(Boolean))];
  };
  const passes = (e) => {
    const k = assetKeys(e);
    return k.length === 0 || k.some((x) => x !== HIDE);
  };
  const grouped = await (await fetch(`${api}&group=1`)).json();
  const folderList = (grouped.rowPlan ?? []).filter((r) => r.kind === "folder").map((r) => r.folder);
  let expected = (grouped.events ?? []).filter(passes).length;
  for (const f of folderList) {
    const r = await fetch(
      `${BASE}/api/aave-v3/timeline/folder?wallet=${WALLET}&market=core&folder=${encodeURIComponent(f.responseId)}`,
    );
    expected += ((await r.json()).events ?? []).filter(passes).length;
  }
  const split = folderList.filter((f) => {
    const symbols = new Set(f.legs.map((l) => l.symbol));
    return symbols.has(HIDE) && symbols.size > 1;
  }).length;
  check(
    "counted: the fixture still splits most of its folders on the filter",
    split >= 40,
    `${split} of ${folderList.length} folders hold ${HIDE} beside another reserve`,
  );

  const p2 = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let reads = 0;
  p2.on("request", (r) => {
    if (/\/timeline\/folder\?/.test(r.url())) reads++;
  });
  const t0 = Date.now();
  await p2.goto(`${BASE}/ethereum/aave-v3/${WALLET}?market=core&hideAssets=${HIDE}`, {
    waitUntil: "domcontentloaded",
    timeout: 300000,
  });
  // ⚠️ WAIT ON THE PAGE'S MARKERS AND ON THE LINE HAVING A NUMERATOR — never
  // on the shape of the line. This waited for "Showing N of M listed", which
  // decision 0019's amendment of 2026-09-24 retired with the rest of the cap's
  // appearances on the reader's face; from that day it waited out its full
  // 240 s and both checks below went red on a page that was right
  // (TO-DO-ui-jobs §58). Three facts have to be true before the reads below
  // mean anything, and each is taken from where the page states it: the
  // lifetime figures are in hand and the numerator is whole (the two markers),
  // and the filter has landed, which is the line stating a numerator at all.
  // Parsed, not matched: the assertion is on the VALUE, and the form is the
  // toolbar's business.
  const deadline = Date.now() + 240000;
  let line = null;
  let shown = null;
  for (;;) {
    const state = await p2.evaluate(() => {
      const el = document.querySelector("[data-timeline-total]");
      return el
        ? { total: el.getAttribute("data-timeline-total"), shown: el.getAttribute("data-timeline-shown") }
        : null;
    });
    line = await countLineText(p2);
    shown = parseCountLine(line)?.shown ?? null;
    if (state && state.total !== "pending" && state.shown !== "floor" && shown != null) break;
    if (Date.now() > deadline) break;
    await p2.waitForTimeout(100);
  }
  const settledMs = Date.now() - t0;
  const readsAtSettle = reads;
  check(
    `counted C1: hiding ${HIDE} counts what the members give`,
    shown === expected,
    `"${line}" — shown ${shown}, the members through the api give ${expected}`,
  );
  check(
    "counted C2: the count settles without reading the split folders' members",
    line !== null && readsAtSettle < split / 4,
    `${readsAtSettle} member read(s) before the line settled at ${settledMs} ms, over ${split} split folders`,
  );
  await p2.close();
}

// ── NEGATIVE: a single-asset position must grow no asset menu ───────────────
await page.goto(BASE + TROVE, NAV);
const troveCounts = await counts();
check("trove: the page rendered a timeline at all", (troveCounts?.total ?? 0) > 0, `${troveCounts?.total} events`);
const troveTypes = await openMenu("Types of event");
check("trove: it still has the event-type menu", troveTypes !== null);
if (troveTypes) await dismiss();
const troveAssets = await openMenu("Assets");
check("trove: and NO asset menu — one collateral, one debt, for its whole life", troveAssets === null);

check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" / "));

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
