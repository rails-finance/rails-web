// Polaris — "Since its last touch": the live window's two causes, and the
// identity that lets them be stated as facts rather than as a choice.
// ---------------------------------------------------------------------------
// The claim under test is an identity, not a figure, so this verifier rebuilds
// it from the two endpoints the page itself reads — /api/chain/polaris/position
// (the overlay's per-leg getters at head) and /api/polaris/timeline (the CDP's
// own touches, each carrying the oracle-at-block lane's price) — and never from
// the module it is checking:
//
//   feed      = coll at the touch × (previewPrice now − previewPrice then)
//   protocol  = (mrColl + bcGain) × price now − interest − mrDebt + stables
//   feed + protocol  ==  (entireColl × price now − entireDebt)
//                        − (coll × price then − debt)
//
// It proves:
//   1. The identity closes to better than 1e-6 of the equity on the live
//      fixtures — goldp/5 (a redemption share pending), usdp/8 (the whale,
//      a mint share) and usdp/70 (never touched since its open) — and the
//      residual is not merely inside the render's rounding: the two terms are
//      recomputed at full precision.
//   2. Both pages draw the row — the timeline's pinned head row, marked
//      `data-live-window="polaris-since-touch"` (rails-ops TO-DO-ui-jobs §44
//      moved it there from the retired standalone `detail-since-touch`
//      section). It is COLLAPSED at rest and its body mounts only while open,
//      so the check opens it on NoteRowShell's own disclosure control; then
//      the feed line, one line per protocol leg (`data-leg`, largest first,
//      dust left out) and the total each parse back to the recomputed value
//      within the page's own compact rounding, and the closed headline's
//      figure is the open row's total. The feed line states the feed's legs
//      at both ends (bonding curve and ETH/USD).
//   2b. The label says "Since its open" where the last touch is the open (one
//      non-transfer row, usdp/70) and "Since its last touch" elsewhere; the
//      note says the same.
//   3. The window's opening end IS the CDP's last touch: the row names the
//      newest non-transfer row's block, and its opening price is that row's
//      own priceAtBlock.
//   4. No verdict on the page — the row carries no "%", no "profit", no
//      "P&L", no "return", and no red/green on any of its figures.
//   5. A closed CDP draws no row at all (goldp/1561) and does not name the
//      window anywhere: the window has no live end, and the grammar is
//      silence, never a dash.
//   6. goldp/5's markdown export carries the same sentence with the same
//      figures, and usdp/70's says "Since its open".
//
// The figures MOVE between runs — the feed is live — so nothing here is pinned
// to a value; what is pinned is the identity and the provenance of each end.
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3000 node scripts/verify/verify-polaris-since-last-touch.mjs

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

// ── restated formatting, independent of lib/utils/format.ts ─────────────────
const fmtCompact = (n) =>
  Math.abs(n) >= 1000
    ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
    : n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const parseSignedCompact = (s) => {
  const m = /([+−-])\s*([\d,.]+)\s*([MK])?/.exec(s);
  if (!m) return NaN;
  const sign = m[1] === "−" || m[1] === "-" ? -1 : 1;
  const mult = m[3] === "M" ? 1_000_000 : m[3] === "K" ? 1_000 : 1;
  return sign * Number(m[2].replace(/,/g, "")) * mult;
};
// The card's own price grain (three dp under 1, two under 100, whole above).
const fmtPrice = (p) =>
  p == null
    ? "(no read)"
    : p < 0.01
      ? "<0.01"
      : p < 1
        ? p.toFixed(3)
        : p < 100
          ? p.toFixed(2)
          : p.toLocaleString("en-US", { maximumFractionDigits: 0 });

async function api(p_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${p_}`).catch((e) => ((last = e), null));
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${p_}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${p_}`);
}

/** Rebuild the window from the two endpoints — the verifier's own arithmetic. */
async function windowFor(market, id) {
  const chain = await api(`/api/chain/polaris/position?market=${market}&id=${id}`);
  const tl = await api(`/api/polaris/timeline?market=${market}&id=${id}`);
  const rows = tl.events
    .filter((e) => e.context?.data?.eventType && e.context.data.eventType !== "transfer")
    .sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  const last = rows[rows.length - 1];
  const d = last.context.data;
  const priceThen = d.priceAtBlock?.pethInDebt;
  const priceNow = chain.price?.pethInDebt;
  const coll = Number(d.newColl);
  const debt = Number(d.newDebt);
  const feed = coll * (priceNow - priceThen);
  const protocol =
    (chain.mintRedeemCollChange + chain.bcTokenGain) * priceNow -
    chain.accruedInterest -
    chain.mintRedeemDebtChange +
    chain.accruedStables;
  const equityNow = chain.entireColl * priceNow - chain.entireDebt;
  const equityThen = coll * priceThen - debt;
  const legs = {
    psm: chain.mintRedeemCollChange * priceNow - chain.mintRedeemDebtChange,
    reward: chain.bcTokenGain * priceNow,
    interest: -chain.accruedInterest,
    stabilityGain: chain.accruedStables,
    settle: Math.min(0, chain.entireDebt),
  };
  return {
    sinceOpen: rows.length === 1,
    legs,
    curveThen: d.priceAtBlock?.curve,
    ethUsdThen: d.priceAtBlock?.ethUsd,
    curveNow: chain.price?.curve,
    ethUsdNow: chain.price?.ethUsd,
    chain,
    touchBlock: last.blockNumber,
    touchTs: last.timestamp,
    priceThen,
    priceNow,
    coll,
    debt,
    feed,
    protocol,
    total: feed + protocol,
    equityNow,
    equityThen,
    delta: equityNow - equityThen,
  };
}

const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;
// The window is a timeline row now, not a section of the detail page: the
// marker is set on <NoteRowShell>'s wrapper by PolarisSinceLastTouchRow.
const ROW = '[data-live-window="polaris-since-touch"]';

/** The row is collapsed by default and its body mounts only while open, so
 *  everything below point 2 needs it opened first. NoteRowShell owns the
 *  disclosure — a role="button" carrying aria-expanded, which also takes
 *  Enter/Space — and stamps `data-live-window-open` on the wrapper while the
 *  body is up, so the open state is read off the DOM rather than waited out. */
async function openRow(page, row) {
  const control = row.locator('[role="button"][aria-expanded]').first();
  if ((await control.count()) === 0) return false;
  await control.click({ timeout: 30000 }).catch(() => {});
  return page
    .locator(`${ROW}[data-live-window-open]`)
    .first()
    .waitFor({ state: "attached", timeout: 15000 })
    .then(() => true)
    .catch(() => false);
}

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  // The overlay lands after first paint; the "Equity at the feed" stat is the
  // signal that the chain lane has answered (the block reads the same overlay).
  await page
    .getByText(/Equity at the feed/i)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page
    .locator('[data-skel-section="detail-economics"]')
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  return page;
}

console.log(`BASE ${BASE}\n`);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1600 },
  permissions: ["clipboard-read", "clipboard-write"],
});

const FIXTURES = [
  { market: "goldp", id: "5", stable: "GOLDp", n: 1 },
  { market: "usdp", id: "8", stable: "USDp", n: 2 },
  { market: "usdp", id: "70", stable: "USDp", n: 3 },
];

const pages = {};
/** The figure strings each page actually rendered — the markdown export must
 *  state the same ones, and it is the same client-side computation in the same
 *  render, so this is an exact comparison rather than a moving one. */
const shownFigures = {};

for (const f of FIXTURES) {
  const w = await windowFor(f.market, f.id);
  const tag = `${f.market}/${f.id}`;

  // ── 1. the identity ───────────────────────────────────────────────────────
  const residual = Math.abs(w.total - w.delta);
  const bound = Math.abs(w.equityNow) * 1e-6;
  check(
    `${f.n}. ${tag}: feed + protocol equals the change in equity at the feed`,
    residual <= bound,
    `feed ${w.feed.toFixed(4)} + protocol ${w.protocol.toFixed(4)} = ${w.total.toFixed(4)} vs Δequity ${w.delta.toFixed(4)} (residual ${residual.toExponential(2)} ≤ ${bound.toExponential(2)})`,
  );
  check(
    `${f.n}. ${tag}: both terms are material (neither is the whole story)`,
    Math.abs(w.feed) > 0 && Math.abs(w.protocol) > 0,
    `feed ${fmtCompact(w.feed)}, protocol ${fmtCompact(w.protocol)} ${f.stable}`,
  );

  // ── 2. the page ───────────────────────────────────────────────────────────
  const page = await open(context, polarisUrl(f.market, f.id));
  pages[tag] = page;
  await page
    .locator(ROW)
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const block = page.locator(ROW).first();
  const present = (await page.locator(ROW).count()) === 1;
  check(`${f.n}. ${tag}: the live window row renders, exactly once`, present);
  if (!present) continue;

  // The row's figures are signed; the block number the row now states also
  // carries `tabular-nums`, and is left out.
  const signed = (texts) => texts.filter((t) => /^[+−-]/.test(t.trim()));
  const closedFigures = signed(await block.locator("span.tabular-nums").allInnerTexts());
  const opened = await openRow(page, block);
  check(
    `${f.n}. ${tag}: the row rests closed on its headline and opens on its header control`,
    closedFigures.length === 1 && opened,
    `closed on ${closedFigures.join(" · ") || "no figure"}${opened ? "" : "; the control did not open it"}`,
  );
  if (!opened) continue;
  const text = await block.innerText();

  // While open: the header's ECHO of the total, then the feed, one line per
  // protocol leg, and the total. The echo is one fact stated twice, so it is
  // compared against the total rather than parsed as another term.
  const allFigures = signed(await block.locator("span.tabular-nums").allInnerTexts());
  shownFigures[tag] = allFigures.slice(1);
  check(
    `${f.n}. ${tag}: the closed headline's figure is the open row's own total`,
    allFigures.length >= 3 && allFigures[0] === allFigures[allFigures.length - 1] && closedFigures[0] === allFigures[0],
    `headline ${allFigures[0] ?? "—"} against total ${allFigures[allFigures.length - 1] ?? "—"} (${allFigures.length} figures in the row)`,
  );
  const near = (shown, want) => Math.abs(shown - want) <= Math.max(Math.abs(want) * 0.005, 0.002);
  // A leg's line is drawn compact ("+3.0K"), so it is held to half a unit of
  // its last shown digit, plus the 0.5% the page's own rounding allows.
  const legNear = (shown, want) => {
    const m = /\.(\d+)\s*([MK])?/.exec(shown.text ?? "");
    const mult = m?.[2] === "M" ? 1e6 : m?.[2] === "K" ? 1e3 : 1;
    const grain = m ? 0.5 * 10 ** -m[1].length * mult : 0.5 * mult;
    return Math.abs(shown.value - want) <= grain + Math.max(Math.abs(want) * 0.005, 0.002);
  };
  const lineShown = async (key) => {
    const line = block.locator(`[data-leg="${key}"]`).first();
    if ((await line.count()) === 0) return { value: NaN, text: "" };
    const t = signed(await line.locator("span.tabular-nums").allInnerTexts());
    return t.length ? { value: parseSignedCompact(t[t.length - 1]), text: t[t.length - 1] } : { value: NaN, text: "" };
  };
  const lineFigure = async (key) => (await lineShown(key)).value;
  const feedShown = await lineFigure("feed");
  const totalShown = await lineFigure("total");
  check(
    `${f.n}. ${tag}: the feed line and the total row are the recomputed feed and total`,
    near(feedShown, w.feed) && near(totalShown, w.total),
    `shown ${feedShown} / ${totalShown} against ${fmtCompact(w.feed)} / ${fmtCompact(w.total)}`,
  );

  // One line per leg, largest first, dust left out; each its own figure.
  const shownKeys = await block
    .locator("[data-leg]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-leg")).filter((k) => k !== "feed" && k !== "total"));
  const wantKeys = Object.entries(w.legs)
    .filter(([, v]) => Math.abs(v) > 1e-9)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k]) => k);
  const legMisses = [];
  for (const k of wantKeys) {
    const v = await lineShown(k);
    if (!legNear(v, w.legs[k])) legMisses.push(`${k} shown ${v.text || "nothing"} want ${fmtCompact(w.legs[k])}`);
  }
  check(
    `${f.n}. ${tag}: the protocol term is one line per leg, largest first, each the recomputed figure`,
    shownKeys.join(",") === wantKeys.join(",") && legMisses.length === 0,
    `lines ${shownKeys.join(", ")}${shownKeys.join(",") === wantKeys.join(",") ? "" : ` (want ${wantKeys.join(", ")})`}${legMisses.length ? `; ${legMisses.join("; ")}` : ""}`,
  );

  // The feed line states the feed's legs at both ends.
  const feedText = await block.locator('[data-leg="feed"]').first().innerText();
  const curvePair = `bonding curve ${fmtPrice(w.curveThen)} → ${fmtPrice(w.curveNow)}`;
  const ethPair = `ETH/USD ${fmtPrice(w.ethUsdThen)} → ${fmtPrice(w.ethUsdNow)}`;
  check(
    `${f.n}. ${tag}: the feed line states the bonding-curve price and ETH/USD at both ends`,
    feedText.includes(curvePair) && feedText.includes(ethPair),
    `${curvePair}; ${ethPair}`,
  );

  // 2b. "Since its open" where the last touch is the open.
  const label = w.sinceOpen ? "Since its open" : "Since its last touch";
  const otherLabel = w.sinceOpen ? "Since its last touch" : "Since its open";
  const noteSaysOpen = /since its open/i.test(text) && /over its life/i.test(text);
  check(
    `${f.n}. ${tag}: the row says "${label}"${w.sinceOpen ? ", in its label and its note" : ""}`,
    text.trim().startsWith(label) && !text.includes(otherLabel) && (!w.sinceOpen || noteSaysOpen),
    `${w.sinceOpen ? "one non-transfer row" : "more than one touch"}; row opens "${text.trim().slice(0, 30)}"`,
  );

  // ── 3. the window's opening end is the CDP's own last touch ───────────────
  const namesBlock = text.includes(w.touchBlock.toLocaleString("en-US"));
  const namesPrice = text.includes(`${fmtPrice(w.priceThen)} → ${fmtPrice(w.priceNow)}`);
  check(
    `${f.n}. ${tag}: the row opens at the last touch's own block and that block's own price`,
    namesBlock && namesPrice,
    namesBlock
      ? namesPrice
        ? `block ${w.touchBlock.toLocaleString("en-US")}, ${fmtPrice(w.priceThen)} → ${fmtPrice(w.priceNow)}`
        : `block named but the price pair is not ${fmtPrice(w.priceThen)} → ${fmtPrice(w.priceNow)}`
      : `block ${w.touchBlock.toLocaleString("en-US")} not named`,
  );

  // ── 4. no verdict ─────────────────────────────────────────────────────────
  const banned = ["%", "profit", "P&L", "PNL", "return", "gain/loss"];
  const hit = banned.filter(
    (b) =>
      text.toLowerCase().includes(b.toLowerCase()) &&
      !/nothing is a profit/i.test(
        text.slice(
          Math.max(0, text.toLowerCase().indexOf(b.toLowerCase()) - 20),
          text.toLowerCase().indexOf(b.toLowerCase()) + 20,
        ),
      ),
  );
  check(
    `${f.n}. ${tag}: the row states no percentage and no verdict`,
    hit.length === 0,
    hit.length ? `found ${hit.join(", ")}` : "none of %, profit, P&L, return",
  );

  const colours = await block.evaluate((root) =>
    [...root.querySelectorAll("span")]
      .map((el) => getComputedStyle(el).color)
      .filter((c) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
        if (!m) return false;
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        // A judgement colour: one channel clearly dominant (red or green).
        return (r > g + 60 && r > b + 60) || (g > r + 60 && g > b + 60);
      }),
  );
  check(
    `${f.n}. ${tag}: no figure in the row is red or green`,
    colours.length === 0,
    colours.length ? colours.join(", ") : "all neutral",
  );
}

// ── 5. a closed CDP draws nothing ───────────────────────────────────────────
// Silence, not a dash: the head slot draws no row, and the headline is not on
// the page at all — a collapsed row saying "Since its last touch — —" would
// pass a count-only check.
const closedPage = await open(context, polarisUrl("goldp", "1561"));
const closedCount = await closedPage.locator(ROW).count();
const closedSilent = !/Since its (last touch|open)/i.test(await closedPage.locator("body").innerText());
const closedChain = await api("/api/chain/polaris/position?market=goldp&id=1561");
check(
  "3. a closed CDP draws no live window row, and does not name the window at all",
  closedCount === 0 && closedSilent && closedChain.isOpen === false,
  `isOpen ${closedChain.isOpen}, rows on the page ${closedCount}, headline ${closedSilent ? "absent" : "PRESENT"}`,
);
await closedPage.close();

// ── 6. the markdown export ──────────────────────────────────────────────────
// lib/polaris/position-to-markdown.ts was not touched by the move into the
// timeline, so this point is unchanged: the export runs off the same overlay
// the row rendered from, and its figures
// must be the page's own, character for character. Comparing it against a
// fresh recomputation instead would fail whenever the feed moved between the
// two reads — a moving target, not a broken export.
async function exportMarkdown(page) {
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(500);
  return page.evaluate(() => navigator.clipboard.readText());
}
const md = await exportMarkdown(pages["goldp/5"]);
const hasSection = /## Since its last touch/.test(md);
const shown5 = shownFigures["goldp/5"] ?? [];
const missing = shown5.filter((f) => !md.includes(f));
check(
  "4. goldp/5's markdown export states the page's own figures, the per-leg lines among them",
  hasSection && shown5.length >= 3 && missing.length === 0,
  hasSection
    ? missing.length === 0
      ? `section present with ${shown5.join(" · ")}`
      : `section present, missing ${missing.join(" · ")}`
    : "section absent",
);
if (pages["usdp/70"]) {
  const md70 = await exportMarkdown(pages["usdp/70"]);
  check(
    '4. usdp/70\'s markdown export says "Since its open" in its heading and its sentence',
    /## Since its open/.test(md70) && /Since its open at block/.test(md70) && !/Since its last touch/.test(md70),
    /## Since its open/.test(md70) ? "heading and sentence present" : "heading absent",
  );
}

for (const p of Object.values(pages)) await p.close();
await context.close();
await browser.close();

// ── siblings ────────────────────────────────────────────────────────────────
function runSibling(script) {
  const scriptPath = path.join(__dirname, script);
  const result = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, BASE },
    encoding: "utf8",
    timeout: 300000,
  });
  const out = (result.stdout ?? "") + (result.stderr ?? "");
  const passMatch = /ALL (\d+) CHECKS PASS/.exec(out);
  const failMatch = /(\d+) CHECK\(S\) FAILED of (\d+)/.exec(out);
  return {
    ok: result.status === 0,
    summary: passMatch
      ? `${passMatch[1]}/${passMatch[1]} passed`
      : failMatch
        ? `${failMatch[2] - failMatch[1]}/${failMatch[2]} passed, ${failMatch[1]} failed`
        : `exit ${result.status}, no summary line found`,
  };
}

// Only the one adjacent suite is nested. verify-polaris-psm-outcome.mjs spawns
// five siblings of its own, so calling it from here fans out to seven browser
// suites against one dev server and one Alchemy key at once — which rate-limits
// the overlay into `timeline: null` and reds a correct lane. Run it separately.
for (const sib of ["verify-polaris-equity.mjs"]) {
  console.log(`\n--- running sibling verifier: ${sib} ---`);
  const r = runSibling(sib);
  check(`5. ${sib} still passes`, r.ok, r.summary);
}

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the since-last-touch window holds as an identity`,
);
process.exit(failures ? 1 : 0);
