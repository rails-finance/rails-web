// Live frontend verification for the market / system / pools views — the
// eighteen protocol-aggregate surfaces that read the protocol's own contracts
// at head rather than an index.
//
// Run: node scripts/verify/verify-market-view-caching.mjs [port]
// (run it from the repo root — node resolves `playwright` from there)
//
// These views are cached: thirteen render through the segment cache at ten
// minutes, and the four Aave-family pages fetch a market route that declares a
// ten-minute shared-cache TTL. The caching is only defensible because every one
// of them names the block it read at, so this verifier holds three things:
//
//   A. the block stamp renders — "Chain snapshot · block N" with a real
//      number, the sentence a cached render leans on to state its own age;
//   B. the figures render — the page's own table is on the page and the
//      "Couldn't read the market from chain" state is not;
//   C. the four Aave-family market routes answer with a shared-cache TTL, and
//      the browser's own request for them carries no header that would order a
//      shared cache to skip it.

import { chromium } from "playwright";

const PORT = process.argv[2] ?? "3111";
const base = process.env.BASE ?? `http://localhost:${PORT}`;

/** The eighteen views. `wait` is a selector that only appears once the page's
 *  own figures are on screen — the four Aave-family pages fetch client-side, so
 *  their table arrives after first paint. */
const VIEWS = [
  { path: "/ethereum/aave-v3/market", client: true },
  { path: "/ethereum/spark/market", client: true },
  { path: "/ethereum/compound-v2/markets" },
  { path: "/ethereum/compound-v3/markets" },
  { path: "/ethereum/dolomite/markets" },
  { path: "/ethereum/frankencoin/system" },
  { path: "/ethereum/fx/pools" },
  { path: "/ethereum/liquity-v1/system" },
  { path: "/ethereum/llamalend/markets" },
  { path: "/ethereum/makerdao/system" },
  { path: "/ethereum/maple/pools" },
  { path: "/ethereum/moonwell/markets" },
  { path: "/ethereum/morpho/markets" },
  { path: "/base/aave-v3/market", client: true },
  { path: "/base/compound-v3/market" },
  { path: "/base/moonwell/markets" },
  { path: "/base/morpho/markets" },
  { path: "/base/seamless/market", client: true },
];

/** The market routes the four Aave-family pages read. */
const MARKET_ROUTES = [
  "/api/chain/aave-v3/market",
  "/api/chain/spark/market",
  "/api/chain/aave-v3-base/market",
  "/api/chain/seamless/market",
];

const browser = await chromium.launch();
const page = await browser.newPage();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// Record what the browser actually sends for the market routes, so "the edge
// can serve this from cache" is measured rather than assumed.
const marketRequestHeaders = new Map();
page.on("request", (req) => {
  const u = new URL(req.url());
  if (MARKET_ROUTES.includes(u.pathname)) marketRequestHeaders.set(u.pathname, req.headers());
});

// ── A + B — every view names its block and renders its figures ───────────────
/** Formatted figures — a thousands-separated integer, a decimal, or a compact
 *  suffix. A view that read nothing renders its error copy and almost none. */
const FIGURE = /\d{1,3}(?:,\d{3})+|\d+\.\d+%?|\d+(?:\.\d+)?[MBk]\b/g;

for (const view of VIEWS) {
  await page.goto(`${base}${view.path}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-skel-section="page-table"]', { timeout: 30000 }).catch(() => {});
  const text = await page.evaluate(() => document.body.innerText);

  // Non-greedy to the FIRST "block" after the stamp opens: several stamps name
  // a second block further along the same line (Morpho's roster census), and a
  // greedy match would read that one, or the word "block" in the prose.
  const stamp = text.match(/Chain snapshot[^\n]*?block\s*([\d,]+)/);
  const blockNumber = stamp ? Number(stamp[1].replace(/,/g, "")) : 0;
  check(`${view.path}: names the block it read at`, blockNumber > 1_000_000, stamp ? `block ${stamp[1]}` : "no stamp");

  const figures = text.match(FIGURE)?.length ?? 0;
  const broke = /Couldn.t read the market from chain|could not be read from chain/i.test(text);
  check(`${view.path}: renders its figures`, figures >= 10 && !broke, `${figures} formatted figures`);
}

// ── C — the market routes declare a shared-cache TTL ─────────────────────────
for (const route of MARKET_ROUTES) {
  const res = await fetch(`${base}${route}`);
  const cc = res.headers.get("cache-control") ?? "";
  const m = cc.match(/s-maxage=(\d+)/);
  check(`${route}: declares a shared-cache TTL`, m !== null && Number(m[1]) >= 300, cc || "no Cache-Control");

  const body = await res.json();
  check(`${route}: the cached body carries a block`, typeof body.blockNumber === "number" && body.blockNumber > 0);
}

for (const route of MARKET_ROUTES) {
  const headers = marketRequestHeaders.get(route);
  if (!headers) {
    console.log(`SKIP  ${route}: the browser never requested it in this run`);
    continue;
  }
  const cc = headers["cache-control"] ?? "";
  const pragma = headers["pragma"] ?? "";
  check(
    `${route}: the browser's request orders no shared cache to skip`,
    !/no-cache|no-store|max-age=0/.test(cc) && !/no-cache/.test(pragma),
    `cache-control: "${cc}" pragma: "${pragma}"`,
  );
}

await browser.close();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
