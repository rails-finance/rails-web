// Polaris — the markets page read live under its own skeleton, and the small
// chrome: market facet glyphs, the liquidation header's Claimable leg, the
// docs deep-links in every learn-more modal, the ENS sentence, the sort label.
// ---------------------------------------------------------------------------
// Scaffold of verify-polaris-listing-ratio.mjs. Checks:
//
//   1. /sepolia/polaris/markets: the response carries data-skel-section=
//      "page-table"; the stamp names a block within 20 of the board's own
//      blockNumber fetched in the same second (a live read); and the module
//      declares `dynamic = "force-dynamic"` with no `revalidate` (dev renders
//      an ISR page fresh on every request, so the block gap alone cannot tell
//      the two apart — the declaration is the proof).
//   2. markets/loading.tsx exists and mounts two SkeletonBlocks, page-header
//      and page-table (a node fs check — a loading state cannot be caught
//      reliably in the browser).
//   3. Listing: the Market facet's two options each carry the stable's glyph
//      (<img alt="USDp"> / <img alt="GOLDp">); picking one still writes
//      ?market=usdp (the codec is untouched).
//   4. usdp/175 and usdp/166: the liquidation card's header carries a
//      "Claimable" leg restating the timeline API's collSurplus in the
//      header's compact form, after Seized and Cleared; usdp/8's rows carry
//      none. The zero-surplus branch is proven on the model: a node child
//      feeds polarisLiquidationDeltas a row with collSurplus "0" and gets two
//      legs, and one with "0.5" gets the third, neutral, off the spine.
//   5. Every Polaris learn-more modal — the markets page's two inline "?",
//      the CDP card's, the tower's, a liquidation row's — lists ≥ 2 links on
//      docs.polaris.finance, each answering 200 to a fetch from this script,
//      and the last link is the testnet app.
//   6. /sepolia/polaris/info carries the ENS sentence.
//   7. The bare listing's sort menu reads "Recent activity", and so does
//      Liquity V2's, the one cross-explorer check that proves the sweep.
//
// THE EXPECTED VALUES ARE RESTATED HERE, never imported and never read off the
// page: the compact figure is parseFloat(x.toFixed(4)) for a sub-1 magnitude
// (the header's own rule for the spine's form), and collSurplus comes from
// /api/polaris/timeline fetched by this script. The two liquidations are
// immutable rows; the board block is read at run time.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3102 node scripts/verify/verify-polaris-chrome.mjs

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
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

/** The header's compact form for a sub-1 magnitude, restated. */
const compactSub1 = (x) => parseFloat(Number(x).toFixed(4)).toString();
const DOCS_HOST = "docs.polaris.finance";
const APP_URL = "https://testnet.polaris.finance";

console.log("Polaris — the live markets page, its skeleton, and the small chrome\n");
console.log(`BASE ${BASE}\n`);

// ── 1. the markets page reads live ─────────────────────────────────────────
{
  const [board, html] = await Promise.all([
    api("/api/chain/polaris/markets"),
    fetch(`${BASE}/sepolia/polaris/markets`).then((r) => r.text()),
  ]);
  check('1a. the markets page carries data-skel-section="page-table"', html.includes('data-skel-section="page-table"'));
  const stampIdx = html.indexOf("chain snapshot");
  const stamp = stampIdx >= 0 ? html.slice(stampIdx, stampIdx + 400) : "";
  const stampBlock = Number((/etherscan\.io\/block\/(\d+)/.exec(stamp) ?? [])[1]);
  const gap = Math.abs(stampBlock - Number(board.blockNumber));
  check(
    "1b. the stamp names a block within 20 of the board read in the same second",
    Number.isFinite(stampBlock) && stampBlock > 0 && gap <= 20,
    `stamp ${stampBlock} vs board ${board.blockNumber} (gap ${Number.isFinite(gap) ? gap : "n/a"})`,
  );
  const pageSrc = readFileSync(path.join(REPO, "app/(app)/sepolia/polaris/(views)/markets/page.tsx"), "utf8");
  check(
    "1c. markets/page.tsx declares force-dynamic and no revalidate",
    /export const dynamic = "force-dynamic"/.test(pageSrc) && !/export const revalidate\b/.test(pageSrc),
  );
}

// ── 2. the route's own skeleton ────────────────────────────────────────────
{
  const p = path.join(REPO, "app/(app)/sepolia/polaris/(views)/markets/loading.tsx");
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";
  const mounts = [...src.matchAll(/<SkeletonBlock height=\{sizes\["([a-z-]+)"\]\}/g)].map((m) => m[1]);
  check(
    "2. markets/loading.tsx mounts two SkeletonBlocks, page-header then page-table",
    mounts.length === 2 && mounts[0] === "page-header" && mounts[1] === "page-table",
    src ? `mounts: ${mounts.join(", ") || "none"}` : "file missing",
  );
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1600 } });

async function openListing(url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator('[data-skel-section="listing-row"]').first().waitFor({ state: "visible", timeout: 120000 });
  await page.waitForTimeout(1500);
  return page;
}

async function openPosition(url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator('[data-skel-section="detail-event"]').first().waitFor({ state: "visible", timeout: 120000 });
  await page.waitForTimeout(2000);
  return page;
}

// ── 3. the Market facet's glyphs ───────────────────────────────────────────
{
  const page = await openListing(`${BASE}/sepolia/polaris`);
  await page
    .locator('[data-skel-section="listing-toolbar"] button', { hasText: /^Market$/ })
    .first()
    .click();
  const menu = page.locator('[role="menuitemradio"]');
  await menu.first().waitFor({ state: "visible", timeout: 10000 });
  const options = await menu.evaluateAll((els) =>
    els.map((el) => ({
      label: (el.textContent ?? "").trim(),
      imgAlts: [...el.querySelectorAll("img")].map((i) => i.getAttribute("alt")),
    })),
  );
  const usdp = options.find((o) => o.label === "USDp");
  const goldp = options.find((o) => o.label === "GOLDp");
  check(
    "3a. the Market facet's two options each carry the stable's glyph",
    usdp?.imgAlts.includes("USDp") && goldp?.imgAlts.includes("GOLDp"),
    JSON.stringify(options),
  );
  await menu
    .filter({ hasText: /^USDp$/ })
    .first()
    .click();
  await page.waitForURL(/[?&]market=usdp(&|$)/, { timeout: 15000 }).catch(() => {});
  check("3b. picking USDp writes ?market=usdp", /[?&]market=usdp(&|$)/.test(page.url()), page.url());
  await page.close();
}

// ── 4. the Claimable leg ───────────────────────────────────────────────────
async function liquidationCard(page) {
  return page.locator('[data-skel-section="detail-event"]', { hasText: "Seized" }).first();
}

for (const id of ["175", "166"]) {
  const tl = await api(`/api/polaris/timeline?market=usdp&id=${id}`);
  const liq = (tl.events ?? []).find((e) => e.context?.data?.eventType === "liquidate");
  const surplus = Number(liq?.context?.data?.collSurplus);
  check(
    `4a. usdp/${id}: the timeline API carries a liquidate row with a surplus`,
    liq != null && surplus > 0,
    `collSurplus ${surplus}`,
  );
  const page = await openPosition(`${BASE}/sepolia/polaris/usdp/${id}`);
  const card = await liquidationCard(page);
  const header = await card.evaluate((el) => {
    const spans = [...el.querySelectorAll("span")];
    const claim = spans.find((s) => s.textContent === "Claimable");
    const figure = claim?.parentElement?.querySelector("span.tabular-nums")?.textContent ?? "";
    const text = (el.textContent ?? "").replace(/\s+/g, " ");
    return { figure, text, order: [text.indexOf("Seized"), text.indexOf("Cleared"), text.indexOf("Claimable")] };
  });
  const want = compactSub1(surplus);
  check(
    `4b. usdp/${id}: the liquidation header states "Claimable ${want} pETH"`,
    header.figure === want,
    `figure "${header.figure}" vs restated ${want}`,
  );
  check(
    `4c. usdp/${id}: the leg rides after Seized and Cleared`,
    header.order[0] >= 0 && header.order[0] < header.order[1] && header.order[1] < header.order[2],
    `positions ${header.order.join(", ")}`,
  );
  await page.close();
}
{
  const page = await openPosition(`${BASE}/sepolia/polaris/usdp/8`);
  const claimables = await page
    .locator('[data-skel-section="detail-event"]')
    .evaluateAll((els) => els.filter((el) => /Claimable/.test(el.textContent ?? "")).length);
  const rows = await page.locator('[data-skel-section="detail-event"]').count();
  check(
    "4d. usdp/8's rows carry no Claimable leg",
    rows > 0 && claimables === 0,
    `${rows} rows, ${claimables} with Claimable`,
  );
  await page.close();
}
{
  const MODEL_PROBE = `
import { register } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = pathToFileURL(${JSON.stringify(REPO)} + "/").href;
const hook = \`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = \${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
\`;
register("data:text/javascript," + encodeURIComponent(hook));
const { polarisLiquidationDeltas } = await import(ROOT + "lib/polaris/liquidation-legs.ts");
const base = { eventType: "liquidate", market: "usdp", cdpId: "175", stableSymbol: "USDp", collLiquidated: "4.03", debtLiquidated: "16803.4" };
const coords = { txHash: "0xab", blockNumber: 1, market: "usdp", cdpId: "175" };
const strip = (d) => d.map(({ prov, ...r }) => r);
console.log("RESULT " + JSON.stringify({
  zero: strip(polarisLiquidationDeltas({ ...base, collSurplus: "0" }, coords)),
  some: strip(polarisLiquidationDeltas({ ...base, collSurplus: "0.5" }, coords)),
}));
`;
  const probe = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "--eval", MODEL_PROBE],
    {
      cwd: REPO,
      encoding: "utf8",
      timeout: 120000,
    },
  );
  const line = /RESULT (\{.*\})/.exec(probe.stdout ?? "");
  if (!line) {
    check("4e. the liquidation-legs model probe runs", false, (probe.stderr ?? "").slice(-500));
  } else {
    const got = JSON.parse(line[1]);
    check(
      "4e. a zero surplus draws Seized and Cleared only",
      got.zero.length === 2 && got.zero.map((d) => d.label).join(",") === "Seized,Cleared",
      JSON.stringify(got.zero.map((d) => d.label)),
    );
    const third = got.some[2];
    check(
      "4f. a surplus draws a third, neutral, off-spine Claimable leg in pETH",
      got.some.length === 3 &&
        third?.label === "Claimable" &&
        third.value === 0.5 &&
        third.symbol === "pETH" &&
        third.tone === undefined &&
        third.noSpineCounterpart === true,
      JSON.stringify(third),
    );
  }
}

// ── 5. the learn-more modals' links ────────────────────────────────────────
const MODAL = "div.fixed.inset-0";
const fetched = new Map();
async function status(url) {
  if (!fetched.has(url)) {
    fetched.set(
      url,
      fetch(url, { method: "GET", redirect: "follow" })
        .then((r) => r.status)
        .catch(() => 0),
    );
  }
  return fetched.get(url);
}
async function readModalLinks(page) {
  await page.locator(MODAL).first().waitFor({ state: "visible", timeout: 10000 });
  const links = await page
    .locator(`${MODAL} a[target="_blank"]`)
    .evaluateAll((as) =>
      as.map((a) => ({ label: (a.textContent ?? "").replace(/^↗\s*/, "").trim(), url: a.getAttribute("href") })),
    );
  const title = await page
    .locator(`${MODAL} h2, ${MODAL} h3`)
    .first()
    .textContent()
    .catch(() => "");
  await page.keyboard.press("Escape");
  await page
    .locator(MODAL)
    .first()
    .waitFor({ state: "detached", timeout: 10000 })
    .catch(() => {});
  return { title: (title ?? "").trim(), links };
}
/** Click the "?" inside `scope`. The CDP card's and the tower's ride at the
 *  foot of an Explanation pane and are hidden until it opens; a timeline row's
 *  rides its footer, drawn once the card is open. */
async function openModalIn(scope, page) {
  const btn = scope.locator('button[aria-label="Learn more"]').first();
  if (!(await btn.isVisible().catch(() => false))) {
    const expl = scope.locator('button[aria-label*="explanation" i]').first();
    if ((await expl.count()) > 0 && (await expl.getAttribute("aria-expanded")) !== "true") await expl.click();
    await page.waitForTimeout(400);
  }
  await btn.waitFor({ state: "visible", timeout: 30000 });
  await btn.click();
}
async function checkModal(name, { title, links }) {
  const docs = links.filter((l) => {
    try {
      return new URL(l.url).host === DOCS_HOST;
    } catch {
      return false;
    }
  });
  const statuses = await Promise.all(docs.map((l) => status(l.url)));
  const all200 = statuses.every((s) => s === 200);
  const last = links[links.length - 1];
  check(
    `5. ${name} ("${title}"): ≥ 2 docs links, each 200, the app last`,
    docs.length >= 2 && all200 && last?.url === APP_URL,
    `${links.map((l) => l.label).join(" | ")}; docs statuses ${statuses.join(",")}`,
  );
}
{
  const page = await context.newPage();
  await page.goto(`${BASE}/sepolia/polaris/markets`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const btns = page.locator('button[aria-label="Learn more"]');
  await btns.first().waitFor({ state: "visible", timeout: 60000 });
  const n = await btns.count();
  check("5a. the markets page carries its inline learn-more triggers", n >= 2, `${n} triggers`);
  for (let i = 0; i < n; i++) {
    await btns.nth(i).click();
    await checkModal(`markets page inline #${i + 1}`, await readModalLinks(page));
  }
  await page.close();
}
{
  const page = await openPosition(`${BASE}/sepolia/polaris/usdp/175`);
  await page
    .locator('[data-skel-section="detail-card"] button[aria-label*="explanation" i]')
    .first()
    .waitFor({ state: "attached", timeout: 30000 })
    .catch(() => {});
  await openModalIn(page.locator('[data-skel-section="detail-card"]').first(), page);
  await checkModal("the CDP card", await readModalLinks(page));
  await openModalIn(page.locator('[data-skel-section="detail-economics"]').first(), page);
  await checkModal("the tower", await readModalLinks(page));
  const card = await liquidationCard(page);
  // The card's header is the toggle (role="button"); its footer, with the "?",
  // draws once the detail is open.
  await card
    .locator('[role="button"]')
    .first()
    .click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(600);
  await openModalIn(card, page);
  await checkModal("the liquidation row", await readModalLinks(page));
  await page.close();
}

// ── 6. the ENS sentence ────────────────────────────────────────────────────
{
  const html = await fetch(`${BASE}/sepolia/polaris/info`).then((r) => r.text());
  check(
    "6. the info page says an ENS name resolves on Ethereum mainnet",
    html.includes("resolves on Ethereum mainnet"),
  );
}

// ── 7. the sort label ──────────────────────────────────────────────────────
{
  const page = await openListing(`${BASE}/sepolia/polaris`);
  const labels = await page
    .locator('[data-skel-section="listing-toolbar"] button[aria-expanded]')
    .evaluateAll((els) => els.map((b) => (b.textContent ?? "").trim()));
  check(
    '7a. the bare listing\'s sort menu reads "Recent activity"',
    labels.includes("Recent activity"),
    labels.join(" | "),
  );
  await page.close();
  // The one cross-explorer check that proves the roster-wide sweep: Liquity
  // V2 spelled it "Latest Activity" before every dimension file took the one
  // constant (RECENT_ACTIVITY_LABEL, components/shared/filter-bar/sort-control.tsx).
  const v2 = await openListing(`${BASE}/ethereum/liquity-v2`);
  const v2Labels = await v2
    .locator('[data-skel-section="listing-toolbar"] button[aria-expanded]')
    .evaluateAll((els) => els.map((b) => (b.textContent ?? "").trim()));
  check(
    "7b. Liquity V2's sort menu reads \"Recent activity\" too, the sweep's one spelling",
    v2Labels.includes("Recent activity") && !v2Labels.some((l) => /Latest Activity/i.test(l)),
    v2Labels.join(" | "),
  );
  await v2.close();
}

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the markets page reads live under its own skeleton and the chrome is in place`,
);
process.exit(failures ? 1 : 0);
