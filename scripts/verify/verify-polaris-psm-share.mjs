// The Polaris PSM share — settled on the sheet and in the explanation,
// pending on the header strip.
// ---------------------------------------------------------------------------
// Polaris has no per-CDP redemption event: the PSM's mints and redemptions
// move every CDP's share pro rata, and the effect settles on the CDP's own
// next CDPUpdated as `_mintRedeemCollGain` / `_mintRedeemDebtGain`.
// The row head states no PSM figure (Miles, 18 Oct 2026: values live in T2
// and T3). This script proves:
//
//   1. the three pinned fixture touches on usdp CDP 8, usdp CDP 9's net
//      redemption at block 11,637,899 (event 21) and usdp CDP 22's PSM-only
//      touch at block 11,670,597: the row HEAD carries no "PSM share" label,
//      no net and neither leg, and it opens on the holder's own act as a
//      past participle ("Borrowed", "Added collateral", "Touched CDP"); the opened card's sheet carries two "PSM share"
//      rows with the route's two legs, each signed; the explanation states
//      the legs netted at the route's own price at block,
//      mintRedeemCollGain × pethInDebt − mintRedeemDebtGain, in the debt unit,
//      with its side in words. 1x proves the comparison rejects a figure 1%
//      off, so a green 1 is not a match on any number. 1u stubs the page's
//      timeline payload so CDP 9's block 11,637,899 row arrives without
//      `priceAtBlock` (every indexed row carries one, so no live fixture
//      reaches the fallback) and reads the two signed legs off the
//      explanation;
//   2. the four zero-share rows on usdp/8 show no PSM label;
//   3. no row head on usdp/8 carries the "PSM share" label;
//   4. the Lifetime flows panel names the net shares "Net PSM shares" on
//      both signs, never "PSM redemptions";
//   5. the debt-sum strip states the live overlay's own pending net PSM
//      share on the debt (fetched independently, compared with tolerance);
//   6. a control CDP (usdp/296): no row head carries the label either;
//   7. the two sibling verifiers (rate-step, market-note-placement) still
//      pass.
//
// Every expected value in 1/2/3/6 is re-derived from `/api/polaris/timeline`,
// fetched independently of the page, never read back off it. The fixture
// figures themselves (block/tx/leg pairs, the 45/25/16/4 touch counts) were
// pinned by psql over the RAW tables on the onboarding box, 2026-09-06 — never
// re-derived from this code either.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// ui-jobs 368 (18 Oct 2026) moved checks 1 and 1u from the head to the sheet
// and the explanation.
//
// Run:  BASE=http://localhost:3412 node scripts/verify/verify-polaris-psm-share.mjs

import { chromium } from "playwright";
import { showCardTab, waitOnFigures } from "./lib/card-tabs.mjs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(path_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path_}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path_}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path_}`);
}

// Polaris states every row figure in full, three decimals (the house
// formatNumber: en-US, at most 3 fraction digits; a non-zero amount that would
// round to 0 reads to 3 significant digits) — restated, not imported.
function fmtFullLike(n) {
  const a = Math.abs(Number(n));
  if (!a || !isFinite(a)) return "";
  const s = a.toLocaleString("en-US", { maximumFractionDigits: 3 });
  if (parseFloat(s.replace(/,/g, "")) === 0)
    return a < 1e-6 ? "<0.000001" : a.toLocaleString("en-US", { maximumSignificantDigits: 3 });
  return s;
}

const relClose = (got, want, tol = 0.005) => {
  if (Math.abs(want) < 1e-9) return Math.abs(got) < 1e-6;
  return Math.abs(got - want) / Math.abs(want) <= tol;
};

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

const PSM_LABEL = "PSM share";
const PSM_LABEL_RE = /^PSM share$/;
const signedFig = (v) => `${v < 0 ? "−" : "+"}${fmtFullLike(v)}`;

async function rowText(page, eventKey) {
  const row = page.locator(`[data-event-id="${cssEscape(eventKey)}"]`);
  if ((await row.count()) === 0) return null;
  return ((await row.first().textContent()) ?? "").replace(/\s+/g, " ").trim();
}

// Minimal CSS.escape for the characters an event_key/tx hash can carry
// (":" from `cdp_updated:<tx>:<log>"). No untrusted input reaches this.
function cssEscape(s) {
  return s.replace(/[:]/g, "\\:");
}

console.log("Polaris PSM share — settled on the sheet and in the explanation, pending on the header strip\n");
console.log(`BASE ${BASE}\n`);

// ── 0. the route, fetched independently ─────────────────────────────────────

const j8 = await api("/api/polaris/timeline?market=usdp&id=8");
check("0. usdp/8's own route yields 45 events", j8.events.length === 45, `got ${j8.events.length}`);

const mrColl = (e) => Number(e.context?.data?.mintRedeemCollGain ?? 0);
const mrDebt = (e) => Number(e.context?.data?.mintRedeemDebtGain ?? 0);
const nonZeroLegCount = (events) =>
  events.reduce((acc, e) => acc + (mrColl(e) !== 0 ? 1 : 0) + (mrDebt(e) !== 0 ? 1 : 0), 0);

const eventsByBlock8 = new Map(j8.events.map((e) => [e.blockNumber, e]));
check(
  "0a. usdp/8's route yields the pinned 41 non-zero PSM touches (45 − 4 zero)",
  nonZeroLegCount(j8.events) === 82 && j8.events.filter((e) => mrColl(e) !== 0 || mrDebt(e) !== 0).length === 41,
  `${nonZeroLegCount(j8.events)} legs across ${j8.events.filter((e) => mrColl(e) !== 0 || mrDebt(e) !== 0).length} touches`,
);

// ── the browser ──────────────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });

const page8 = await open(context, polarisUrl("usdp", "8"));

// ── 1. the fixture touches — no PSM figure on the head; sheet and explanation

// The head opens on the holder's own act as a past participle (rails-ops
// decision 0045; `t1_*` in content/polaris/event-prose.yaml), restated.
const FIXTURES = [
  { cdp: "8", block: 11603483, holderVerb: "Borrowed" },
  { cdp: "8", block: 11562362, holderVerb: "Borrowed" },
  { cdp: "8", block: 11610231, holderVerb: "Added collateral" },
  // The net redemption that read "−20.772 pETH 108,803.567 USDp" on the face
  // while its sheet read −108,803.567 (ui-jobs 357 point 1).
  { cdp: "9", block: 11637899, holderVerb: "Added collateral" },
  // A touch whose only content was a PSM share: the head reads the docs' touch.
  { cdp: "22", block: 11670597, holderVerb: "Touched CDP" },
];

// The pETH leg reads to four decimals (lib/polaris/figure-format.ts), the debt to three.
const pethFig = (v) => Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 4 });
const signedPeth = (v) => `${v < 0 ? "−" : "+"}${pethFig(v)}`;
// The sheet signs a negative amount only.
const sheetSigned = (v, fig) => `${v < 0 ? "−" : ""}${fig}`;

/** What the explanation must state for one row, from the route alone. */
function expectedProse(e) {
  const price = e.context?.data?.priceAtBlock?.pethInDebt;
  if (price == null)
    return { net: null, text: `moved ${signedPeth(mrColl(e))} pETH and ${signedFig(mrDebt(e))} USDp through this CDP` };
  const net = mrColl(e) * price - mrDebt(e);
  return {
    net,
    text: `netted ${fmtFullLike(net)} USDp ${net < 0 ? "against the holder" : "in the holder's favour"} at this block's pETH price`,
  };
}

/** Every figure the head must NOT state for one row. */
function forbiddenOnHead(e) {
  const out = [pethFig(mrColl(e)), fmtFullLike(mrDebt(e))];
  const price = e.context?.data?.priceAtBlock?.pethInDebt;
  if (price != null) out.push(fmtFullLike(mrColl(e) * price - mrDebt(e)));
  return out;
}

/** Open one row's card through `?at=`, its Figures tab with the breakdown on,
 *  then its Explanation tab (ui-jobs 370); returns the head's, the sheet's PSM
 *  rows' and the explanation's text. */
async function readCard(page, e) {
  const row = page.locator(`[data-event-id="${cssEscape(e.id)}"]`).first();
  if ((await row.count()) === 0) return null;
  await row.waitFor({ timeout: 60000 }).catch(() => {});
  const head = (
    (await row
      .locator('[data-anatomy="T1"]')
      .first()
      .innerText()
      .catch(() => "")) ?? ""
  ).replace(/\s+/g, " ");
  await waitOnFigures(row, "[data-sheet]", 60000);
  const sw = row.locator("[data-sheet-switch]").first();
  if ((await sw.count()) > 0) await sw.evaluate((el) => el.click());
  await page.waitForTimeout(400);
  const psmRows = [];
  for (const r of await row.locator('[data-sheet] [data-sheet-row="psm"]').all()) {
    const label = ((await r.innerText()) ?? "").replace(/\s+/g, " ");
    const amount = (
      (await r
        .locator('[data-sheet-col="amount"]')
        .first()
        .innerText()
        .catch(() => "")) ?? ""
    ).trim();
    psmRows.push({ label, amount });
  }
  await showCardTab(row, "explanation");
  await row
    .locator('[data-anatomy="T3"]')
    .first()
    .waitFor({ state: "attached", timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(600);
  const prose = (
    (await row
      .locator('[data-anatomy="T3"]')
      .last()
      .innerText()
      .catch(() => "")) ?? ""
  ).replace(/\s+/g, " ");
  return { head, psmRows, prose };
}

async function openAt(context, cdp, e) {
  return open(context, `${polarisUrl("usdp", cdp)}?at=${encodeURIComponent(e.id)}`);
}

check(
  "1x. the comparison rejects a net 1% off (a stubbed figure goes red)",
  fmtFullLike(626000) !== fmtFullLike(626000 * 1.01) &&
    !"netted 625,603.378 USDp".includes(`netted ${fmtFullLike(625603.378 * 1.01)} USDp`),
);

const j9 = await api("/api/polaris/timeline?market=usdp&id=9");
const j22 = await api("/api/polaris/timeline?market=usdp&id=22");
const routeByCdp = {
  8: eventsByBlock8,
  9: new Map(j9.events.map((e) => [e.blockNumber, e])),
  22: new Map(j22.events.map((e) => [e.blockNumber, e])),
};

for (const f of FIXTURES) {
  const e = routeByCdp[f.cdp].get(f.block);
  check(`1. usdp/${f.cdp} block ${f.block} is on the route`, e != null);
  if (e == null) continue;
  const page = await openAt(context, f.cdp, e);
  const card = await readCard(page, e);
  await page.close();
  check(`1. usdp/${f.cdp} block ${f.block} card found on the page (event_key ${e.id})`, card != null);
  if (card == null) continue;
  const bad = forbiddenOnHead(e).filter((t) => card.head.includes(t));
  check(
    `1. usdp/${f.cdp} block ${f.block} head carries no "${PSM_LABEL}" label and no PSM figure`,
    !card.head.includes(PSM_LABEL) && bad.length === 0,
    `${card.head.slice(0, 200)}${bad.length ? ` (found ${bad.join(", ")})` : ""}`,
  );
  check(
    `1. usdp/${f.cdp} block ${f.block} head opens on "${f.holderVerb}"`,
    card.head.trim().startsWith(f.holderVerb),
    card.head.slice(0, 200),
  );
  const wantAmounts = [sheetSigned(mrColl(e), pethFig(mrColl(e))), sheetSigned(mrDebt(e), fmtFullLike(mrDebt(e)))];
  check(
    `1. usdp/${f.cdp} block ${f.block} sheet carries two "${PSM_LABEL}" rows reading ${wantAmounts.join(" and ")}`,
    card.psmRows.length === 2 &&
      card.psmRows.every((r) => r.label.startsWith(PSM_LABEL) && !/Net PSM/.test(r.label)) &&
      card.psmRows.map((r) => r.amount).join("|") === wantAmounts.join("|"),
    JSON.stringify(card.psmRows),
  );
  const want = expectedProse(e);
  check(
    `1. usdp/${f.cdp} block ${f.block} explanation states "${want.text}"`,
    card.prose.includes(want.text),
    card.prose.slice(0, 400),
  );
}

// ── 1u. the unpriced fallback — a stubbed page payload, two signed legs ──

{
  const f = FIXTURES[3];
  const priced = routeByCdp[9].get(f.block);
  const pricedText = expectedProse(priced).text; // what the priced explanation carries
  // The expectation comes from the route event with its price removed.
  const stripped = structuredClone(priced);
  delete stripped.context.data.priceAtBlock;
  const want = expectedProse(stripped);
  check("1u. the stubbed event expects the fallback sentence (no net, two signed legs)", want.net == null, want.text);

  const stubCtx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  // The page's events are seeded by the server (position-page-data.ts), so
  // the browser makes no timeline fetch on a first load: the stub rewrites
  // the document's embedded payload instead. The event's object runs from its
  // `id` to the next event's; inside it the price object is removed.
  let stubbed = 0;
  const stubPage = await stubCtx.newPage();
  await stubPage.route(/\/sepolia\/polaris\/usdp\/9(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    let html = await res.text();
    const start = html.indexOf(`{\\"id\\":\\"${priced.id}\\"`);
    if (start >= 0) {
      const next = html.indexOf('{\\"id\\":\\"cdp_updated', start + 10);
      const end = next < 0 ? html.length : next;
      const seg = html.slice(start, end);
      const cut = seg.replace(/\\"priceAtBlock\\":\{[^{}]*\},?/g, () => {
        stubbed++;
        return "";
      });
      html = html.slice(0, start) + cut + html.slice(end);
    }
    await route.fulfill({ response: res, body: html });
  });
  await stubPage.goto(`${polarisUrl("usdp", "9")}?at=${encodeURIComponent(priced.id)}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  await stubPage
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await stubPage.waitForTimeout(1200);

  check("1u. the page's embedded timeline was stubbed (price removed from the row)", stubbed > 0, `stubbed ${stubbed}`);
  const card = await readCard(stubPage, priced);
  check(`1u. usdp/9 block ${f.block} card found on the stubbed page`, card != null);
  if (card != null) {
    check(
      `1u. the unpriced explanation states "${want.text}"`,
      card.prose.includes(want.text),
      card.prose.slice(0, 400),
    );
    check(
      `1u. the unpriced explanation does not carry the priced net ("${pricedText}")`,
      !card.prose.includes(pricedText),
      card.prose.slice(0, 400),
    );
    check(
      `1u. the unpriced head carries no "${PSM_LABEL}" label`,
      !card.head.includes(PSM_LABEL),
      card.head.slice(0, 200),
    );
  }
  await stubCtx.close();
}

// ── 2. the four zero-share rows show none of the four labels ──────────────

const ZERO_BLOCKS = [11507592, 11514810, 11519755, 11519759];
for (const block of ZERO_BLOCKS) {
  const e = eventsByBlock8.get(block);
  check(`2. usdp/8 block ${block} is on the route`, e != null);
  if (e == null) continue;
  check(
    `2. usdp/8 block ${block} has zero PSM legs on the route (as pinned)`,
    mrColl(e) === 0 && mrDebt(e) === 0,
    `coll ${mrColl(e)}, debt ${mrDebt(e)}`,
  );
  const text = await rowText(page8, e.id);
  check(`2. usdp/8 block ${block} row found on the page`, text != null);
  const hasAnyLabel = text != null && text.includes(PSM_LABEL);
  check(`2. usdp/8 block ${block} header shows NO PSM label`, !hasAnyLabel, text?.slice(0, 200) ?? "");
}

// ── 3. no row head on usdp/8 carries the label ───────────────────────────

const headLabels8 = await page8.locator('[data-anatomy="T1"]').getByText(PSM_LABEL_RE).count();
check(`3. usdp/8: no row head carries "${PSM_LABEL}"`, headLabels8 === 0, `${headLabels8} on the heads`);

// ── 4. the panel's flow labels; "PSM redemptions" nowhere on page ────────

// The panel's lines are named in its Key, inside the Explanation: open it.
{
  const panel = page8.locator('[data-skel-section="detail-economics"]').first();
  await panel
    .locator("[data-flow-strip]")
    .first()
    .waitFor({ timeout: 60000 })
    .catch(() => {});
  const toggle = panel.locator('button[aria-label*="explanation" i]').first();
  if ((await toggle.count()) > 0 && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page8.waitForTimeout(500);
}
const bodyText8 = (await page8.locator("body").innerText()).replace(/\s+/g, " ");
check(
  '4. "Net PSM shares" appears on the page (the flows panel\'s one name for both signs)',
  bodyText8.includes("Net PSM shares"),
);
check('4. the string "PSM redemptions" appears nowhere on the page', !bodyText8.includes("PSM redemptions"));

// ── 5. the pending-share strip — fetched independently, live tolerance ────

const chain8 = await api("/api/chain/polaris/position?market=usdp&id=8");
const pendingLocator = page8.locator("[data-polaris-debt-sum]");
// The strip depends on the page's OWN client-side chain fetch (separate from
// ours above) — give it a beat to land before deciding it's absent.
await pendingLocator
  .first()
  .waitFor({ state: "visible", timeout: 15_000 })
  .catch(() => {});
const pendingCount = await pendingLocator.count();
const pendingText = pendingCount > 0 ? ((await pendingLocator.first().textContent()) ?? "").replace(/\s+/g, " ") : "";
const shareNonZero = chain8.mintRedeemDebtChange !== 0;

if (shareNonZero) {
  check("5. usdp/8's debt-sum strip is present", pendingCount > 0, pendingText);
  const m = pendingText.match(/([+−]) ([\d,.]+) net PSM share/);
  check("5. the strip names the net PSM share on the debt, signed", m != null, pendingText);
  if (m) {
    const got = Number(m[2].replace(/,/g, "")) * (m[1] === "−" ? -1 : 1);
    check(
      "5. the strip's net PSM share matches the live overlay within 0.5%",
      relClose(got, chain8.mintRedeemDebtChange),
      `strip ${got}, overlay ${chain8.mintRedeemDebtChange}`,
    );
  }
} else {
  check(
    '5. the live PSM share is zero, so the strip (if any) states no "net PSM share"',
    !/net PSM share/.test(pendingText),
    pendingText || "(no strip)",
  );
}

await page8.close();

// ── 6. control — no row head on usdp/296 carries the label ───────────────

const page296 = await open(context, polarisUrl("usdp", "296"));
const headLabels296 = await page296.locator('[data-anatomy="T1"]').getByText(PSM_LABEL_RE).count();
check(`6. usdp/296: no row head carries "${PSM_LABEL}"`, headLabels296 === 0, `${headLabels296} on the heads`);
await page296.close();

await context.close();
await browser.close();

// ── 7. the sibling verifiers still pass ────────────────────────────────────

function runSibling(name, file, extraEnv = {}) {
  const scriptPath = path.join(__dirname, file);
  try {
    const out = execFileSync("node", [scriptPath], {
      env: { ...process.env, BASE, ...extraEnv },
      encoding: "utf8",
      timeout: 300_000,
    });
    check(`7. ${name} still passes`, /ALL \d+ CHECKS PASS/.test(out), out.trim().split("\n").slice(-1)[0]);
  } catch (err) {
    const out = String(err.stdout ?? err.message ?? err);
    check(`7. ${name} still passes`, false, out.trim().split("\n").slice(-3).join(" | "));
  }
}

runSibling("verify-polaris-rate-step.mjs (51/51)", "verify-polaris-rate-step.mjs");
runSibling("verify-market-note-placement.mjs", "verify-market-note-placement.mjs");

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Polaris PSM share holds, on the sheet, in the explanation and on the strip`,
);
process.exit(failures ? 1 : 0);
