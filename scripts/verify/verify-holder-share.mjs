#!/usr/bin/env node
// The wallet view's own share card, and the clean shareable URL (Polaris +
// Liquity V2).
// ---------------------------------------------------------------------------
// A wallet search is a page someone shares. Two things had to be true for that
// to be worth doing, and this asserts both:
//
//   a  the wallet's page ADVERTISES a card of its own — `og:image` and
//      `twitter:image` point at the share route with this wallet's `?q=`, the
//      canonical is `<basePath>?q=<wallet>` and NOTHING else, and the title
//      names the holder;
//   b  that card RENDERS — 200 `image/png`, bytes that are not the explorer's
//      static roster card, behind the 5-minute edge cache every live card uses;
//   c  and only a wallet gets one: the bare directory, a position-id search and
//      an ENS that resolves to nothing all keep the static card, and the share
//      route answers those 200 with the static bytes rather than failing;
//   d  the card's figures are the WALLET's — the model is called directly with
//      the wallet response and the market board this script fetched itself, and
//      every stat is restated here from those two: Σ coll, Σ debt legs × the
//      markets' own units, the position nearest its own floor. A wallet stated
//      as holding more than one page states its count and no totals;
//   e  the same for Liquity V2, in its own units;
//   f  the URL a reader ends up with carries the wallet and nothing else —
//      `?q=<wallet>` on both explorers, where it used to carry a
//      `status=open,closed,liquidated` that said what the absent param already
//      said. The explorers that DON'T declare a contextual default are
//      untouched: on /ethereum/spark clearing Status still writes an explicit
//      `?status=`, and reloading that URL still shows every status.
//
// THE EXPECTED VALUES ARE RESTATED HERE, never imported and never read off the
// card: the sums, the ratios and the counts all come from the wallet route and
// the price read this script makes for itself. Nothing is pinned — the feeds
// tick every block and the campaign wave moves these wallets by the hour.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3414 node scripts/verify/verify-holder-share.mjs
//
// ── PROVED IT CAN FAIL, 2026-09-10 ──────────────────────────────────────────
//   1. `lib/shared/list-filter.ts` reverted to `const def = dim.get(defaults)`
//      (the page-level default for every dimension) → F1/F2 went red: searching
//      wallet B on Polaris landed on
//      `?q=0xedb7…2959&status=open,closed,liquidated`, and V2 the same with its
//      four buckets. F3–F5 (Spark, Aave V4) stayed green — those are the
//      dimensions the rule does not touch.
//   2. `lib/polaris/holder-strip.ts` had the priced debt leg doubled
//      (`usd += 2 * amount * unitUsd`) → D4 went red, the card's "≈ $338,061.65"
//      against this script's restated $169,030.83 — proving the card carries
//      the adapter's own figure and computes nothing of its own.
//   Both reverted; the green run below is the reverted tree.

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

// The two wallets the plan pins as SHAPES, not as figures: Polaris's holds CDPs
// in both markets and has closed and liquidated ones; V2's holds one trove on
// each of the three branches. Every number about them is read at run time.
const POLARIS_WALLET = "0xedb7cca3ba468055b0062d2cd033dfe6c6632959";
const V2_WALLET = "0x8b0afadfde6fa271325305ff24a016b4fb6e3846";
// A CDP number that exists in BOTH Polaris markets — a position-id search, not
// a holder — and a name nobody has registered.
const BOTH_MARKETS_ID = "27";
const NONSENSE_ENS = "nobody-has-this-name-xyz.eth";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);

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

// ── the app's own number grammar, restated ─────────────────────────────────
/** formatNumber: en-US decimal, three fraction digits at most. */
const fmtNum = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 3 });
/** formatUsdValue: "$" + en-US, exactly two fraction digits. */
const fmtUsd = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** The ratio grammar: one decimal, en-US. */
const fmtPct = (v) => `${v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** shortSubject: 6 + 4 with a Unicode ellipsis. */
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const parseNum = (s) => Number(String(s ?? "").replace(/[$,]/g, ""));

/** The head metadata a scraper reads off a page: the two image URLs, the
 *  canonical and the share title. Parsed out of the served HTML — no browser,
 *  because a scraper has none either. */
async function readMeta(url) {
  const res = await fetch(`${BASE}${url}`, { headers: { "user-agent": "rails-verify" } });
  const html = await res.text();
  const meta = (attr, key) => new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1] ?? null;
  const decode = (s) =>
    (s ?? "")
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');
  return {
    status: res.status,
    ogImage: meta("property", "og:image"),
    ogImageAlt: decode(meta("property", "og:image:alt")),
    twitterImage: meta("name", "twitter:image"),
    ogTitle: decode(meta("property", "og:title")),
    canonical: /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null,
    title: decode(/<title>([^<]*)</.exec(html)?.[1] ?? null),
  };
}

/** An absolute metadata URL reduced to the path + query the app wrote — the
 *  origin is `metadataBase`'s and says nothing about this feature. */
const rel = (absolute) => {
  if (!absolute) return null;
  const u = new URL(absolute);
  return `${u.pathname}${u.search}`;
};

/** Fetch an image and return what a scraper would see of it. */
async function readImage(url) {
  const res = await fetch(`${BASE}${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    cacheControl: res.headers.get("cache-control"),
    // Vercel's edge consumes `s-maxage` / `stale-while-revalidate` and hands
    // the browser `public, max-age=0`; the route's own header is only visible
    // off Vercel (local dev). `x-vercel-cache` marks which of the two we read.
    vercel: res.headers.get("x-vercel-cache") != null,
    bytes,
  };
}

/** The short-lived edge cache the route sets, as each environment shows it:
 *  off Vercel the header itself; on Vercel the edge's rewrite of it, which
 *  must still carry no `immutable` / year-long max-age (that was the default
 *  this route overrides). */
const shortEdgeCache = (img) =>
  img.vercel
    ? /^public, max-age=0$/.test(img.cacheControl ?? "")
    : /s-maxage=300/.test(img.cacheControl ?? "") && !/immutable/.test(img.cacheControl ?? "");

console.log("The wallet view's own share card, and the clean shareable URL\n");
console.log(`BASE ${BASE}\n`);

// ═══ POLARIS ═══════════════════════════════════════════════════════════════
console.log("── Polaris: what the wallet's page advertises ───────────────────");

// The STATIC card is whatever the bare directory advertises — read, not pinned,
// so a roster rename cannot make this script assert a path that no longer
// exists while calling it green.
const polarisDirectory = await readMeta("/sepolia/polaris");
const POLARIS_STATIC = rel(polarisDirectory.ogImage);
const polarisStaticBytes = (await readImage(POLARIS_STATIC)).bytes;
info("P0. the explorer's static roster card", `${POLARIS_STATIC}, ${polarisStaticBytes.length} bytes`);

const pShareUrl = `/api/share/polaris-wallet?q=${POLARIS_WALLET}`;
const pWalletUrl = `/sepolia/polaris?q=${POLARIS_WALLET}`;
const pMeta = await readMeta(pWalletUrl);

check(
  "A1. og:image on the wallet's page is the share route carrying this wallet's own q",
  rel(pMeta.ogImage) === pShareUrl,
  `${rel(pMeta.ogImage)} vs ${pShareUrl}`,
);
check("A2. …and twitter:image is the same URL", rel(pMeta.twitterImage) === pShareUrl, rel(pMeta.twitterImage));
{
  const c = new URL(pMeta.canonical ?? "https://x.invalid/");
  const params = [...c.searchParams.keys()];
  check(
    "A3. the canonical is the wallet's own view — the basePath, ?q=<wallet>, and no other param",
    c.pathname === "/sepolia/polaris" && c.searchParams.get("q") === POLARIS_WALLET && params.length === 1,
    `${rel(pMeta.canonical)} (params: ${params.join(", ") || "none"})`,
  );
}
check(
  "A4. the title names the holder in the explorer's own plural noun",
  pMeta.ogTitle === `Rails | Polaris CDPs held by ${short(POLARIS_WALLET)}` &&
    pMeta.ogImageAlt === "This wallet's Polaris CDPs at a glance",
  `"${pMeta.ogTitle}" / alt "${pMeta.ogImageAlt}"`,
);

const pImage = await readImage(pShareUrl);
check(
  "B1. the advertised card renders — 200 image/png, and not the static roster card's bytes",
  pImage.status === 200 && pImage.contentType === "image/png" && !pImage.bytes.equals(polarisStaticBytes),
  `${pImage.status} ${pImage.contentType}, ${pImage.bytes.length} bytes vs static ${polarisStaticBytes.length}`,
);
check(
  "B2. …behind the short edge cache a live figure needs, not a static asset's year",
  shortEdgeCache(pImage),
  `${pImage.cacheControl}${pImage.vercel ? " (as Vercel's edge rewrites it)" : ""}`,
);

// ── c. only a WALLET gets a live card ──────────────────────────────────────
for (const [name, q] of [
  ["the bare directory", null],
  [`a CDP-number search (q=${BOTH_MARKETS_ID})`, BOTH_MARKETS_ID],
  ["an ENS that resolves to nothing", NONSENSE_ENS],
]) {
  const meta = q == null ? polarisDirectory : await readMeta(`/sepolia/polaris?q=${encodeURIComponent(q)}`);
  check(`C1. ${name} keeps the static roster card`, rel(meta.ogImage) === POLARIS_STATIC, rel(meta.ogImage));
}
for (const q of [BOTH_MARKETS_ID, NONSENSE_ENS]) {
  const img = await readImage(`/api/share/polaris-wallet?q=${encodeURIComponent(q)}`);
  check(
    `C2. the share route answers q=${q} with the static card, at 200 — never a failure a scraper would blank`,
    img.status === 200 && img.contentType === "image/png" && img.bytes.equals(polarisStaticBytes),
    `${img.status} ${img.contentType}, ${img.bytes.length} bytes`,
  );
}

// ═══ LIQUITY V2 ════════════════════════════════════════════════════════════
console.log("\n── Liquity V2: what the wallet's page advertises ────────────────");

const v2Directory = await readMeta("/ethereum/liquity-v2");
const V2_STATIC = rel(v2Directory.ogImage);
const v2StaticBytes = (await readImage(V2_STATIC)).bytes;
info("V0. the explorer's static roster card", `${V2_STATIC}, ${v2StaticBytes.length} bytes`);

const vShareUrl = `/api/share/liquity-v2-wallet?q=${V2_WALLET}`;
const vMeta = await readMeta(`/ethereum/liquity-v2?q=${V2_WALLET}`);
check(
  "A5. og:image and twitter:image on V2's wallet page are its own share route",
  rel(vMeta.ogImage) === vShareUrl && rel(vMeta.twitterImage) === vShareUrl,
  `${rel(vMeta.ogImage)} / ${rel(vMeta.twitterImage)}`,
);
{
  const c = new URL(vMeta.canonical ?? "https://x.invalid/");
  check(
    "A6. …and the canonical is `/ethereum/liquity-v2?q=<wallet>` with no other param",
    c.pathname === "/ethereum/liquity-v2" &&
      c.searchParams.get("q") === V2_WALLET &&
      [...c.searchParams.keys()].length === 1,
    rel(vMeta.canonical),
  );
}
check(
  "A7. …titled in V2's own noun",
  vMeta.ogTitle === `Rails | Liquity V2 Troves held by ${short(V2_WALLET)}`,
  `"${vMeta.ogTitle}"`,
);
const vImage = await readImage(vShareUrl);
check(
  "B3. V2's wallet card renders — 200 image/png, not the static card, short edge cache",
  vImage.status === 200 &&
    vImage.contentType === "image/png" &&
    !vImage.bytes.equals(v2StaticBytes) &&
    shortEdgeCache(vImage),
  `${vImage.status} ${vImage.contentType}, ${vImage.bytes.length} bytes, ${vImage.cacheControl}`,
);
{
  const meta = await readMeta(`/ethereum/liquity-v2?q=${NONSENSE_ENS}`);
  check(
    "C3. V2: an ENS that resolves to nothing keeps the static card",
    rel(meta.ogImage) === V2_STATIC,
    rel(meta.ogImage),
  );
}

// ═══ d + e. the card's own figures ═════════════════════════════════════════
// The two models are called directly in a node child with the SAME two
// responses this script restates from — the wallet's rows and the one price
// read. Nothing about the expected values comes out of the code under test.
console.log("\n── the figures, at the card models ──────────────────────────────");

const board = await api("/api/chain/polaris/markets");
const pWallet = await api(`/api/polaris/positions?wallet=${POLARIS_WALLET}&limit=50`);
const pRows = pWallet.data ?? [];
const pTotal = pWallet.pagination?.total ?? 0;

const oracle = (await api("/api/oracle/liquity-v2")).data;
const vTroves = await api(`/api/troves?ownerAddress=${V2_WALLET}&limit=50`);
const vRows = vTroves.data ?? [];
const vTotal = vTroves.pagination?.total ?? 0;

check(
  "D0. both wallet routes answer, the board is not stale, and both wallets fit one page",
  pRows.length > 0 &&
    pTotal === pRows.length &&
    pTotal <= 20 &&
    board.chainStale === false &&
    vRows.length > 0 &&
    vTotal === vRows.length &&
    vTotal <= 20 &&
    oracle?.weth > 0,
  `Polaris ${pRows.length} rows / board @ ${board.blockNumber}; V2 ${vRows.length} troves / weth ${oracle?.weth}`,
);

// ── Polaris, restated ──────────────────────────────────────────────────────
const pOpen = pRows.filter((r) => r.status === "open");
const pCounts = {
  open: pOpen.length,
  closed: pRows.filter((r) => r.status === "closed").length,
  liquidated: pRows.filter((r) => r.status === "liquidated").length,
};
const boardOf = (m) => (board.markets ?? []).find((b) => b.market === m);
/** USDp is a dollar by construction; GOLDp is a troy ounce of gold at the
 *  market's own feed. */
const unitUsd = (m) => (m === "usdp" ? 1 : (boardOf(m)?.price.xauUsd ?? null));
const pColl = pOpen.reduce((s, r) => s + r.coll, 0);
const pDebtByMarket = new Map();
for (const r of pOpen) if (r.debt > 0) pDebtByMarket.set(r.market, (pDebtByMarket.get(r.market) ?? 0) + r.debt);
const pDebtUsd = [...pDebtByMarket].reduce((s, [m, amt]) => s + amt * unitUsd(m), 0);
/** Nearest its floor: the smallest ratio ÷ its own market's minimum. */
let pNearest = null;
for (const r of pOpen) {
  const b = boardOf(r.market);
  if (!b || !(r.debt > 0) || !(r.coll > 0)) continue;
  const min = b.defensiveMode ? b.defensiveMcr : b.mcr;
  const ratio = (r.coll * b.price.pethInDebt) / r.debt;
  if (!pNearest || ratio / min < pNearest.headroom) {
    pNearest = { label: `${r.market}/${r.cdpId}`, ratioPct: ratio * 100, headroom: ratio / min };
  }
}
const pStatus = [
  pCounts.open > 0 ? `${pCounts.open} open` : null,
  pCounts.closed > 0 ? `${pCounts.closed} closed` : null,
  pCounts.liquidated > 0 ? `${pCounts.liquidated} liquidated` : null,
]
  .filter(Boolean)
  .join(" · ");
info(
  "D0 restated (Polaris)",
  `${pStatus}; coll ${fmtNum(pColl)} pETH; debt ${fmtUsd(pDebtUsd)}; nearest ${pNearest?.label} at ${fmtPct(pNearest?.ratioPct ?? 0)}`,
);

// ── Liquity V2, restated ───────────────────────────────────────────────────
const vOpen = vRows.filter((t) => t.status === "open");
const vCounts = {
  open: vOpen.length,
  closed: vRows.filter((t) => t.status === "closed").length,
  liquidated: vRows.filter((t) => t.status === "liquidated").length,
};
const priceOf = (ct) => oracle?.[ct.toLowerCase()] ?? null;
const vDebt = vOpen.reduce((s, t) => s + t.debt.current, 0);
const vByBranch = new Map();
for (const t of vOpen) vByBranch.set(t.collateralType, (vByBranch.get(t.collateralType) ?? 0) + t.collateral.amount);
const vCollUsd = [...vByBranch].reduce((s, [ct, amt]) => s + amt * priceOf(ct), 0);
/** The branch minimums are the protocol's own constants, restated here rather
 *  than read from the code under test: WETH 110%, the LSTs 120%. */
const branchMin = (ct) => (ct === "WETH" || ct === "ETH" ? 110 : 120);
let vNearest = null;
for (const t of vOpen) {
  const price = priceOf(t.collateralType);
  if (!price || !(t.debt.current > 0) || !(t.collateral.amount > 0)) continue;
  const ratioPct = ((t.collateral.amount * price) / t.debt.current) * 100;
  const headroom = ratioPct / branchMin(t.collateralType);
  if (!vNearest || headroom < vNearest.headroom) vNearest = { branch: t.collateralType, ratioPct, headroom };
}
const vStatus = [
  vCounts.open > 0 ? `${vCounts.open} open` : null,
  vCounts.closed > 0 ? `${vCounts.closed} closed` : null,
  vCounts.liquidated > 0 ? `${vCounts.liquidated} liquidated` : null,
]
  .filter(Boolean)
  .join(" · ");
info(
  "E0 restated (Liquity V2)",
  `${vStatus}; coll ${fmtUsd(vCollUsd)}; debt ${fmtNum(vDebt)} BOLD; nearest ${vNearest?.branch} at ${fmtPct(vNearest?.ratioPct ?? 0)}`,
);

// ── the probe ──────────────────────────────────────────────────────────────
const PROBE = `
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
const { polarisHolderCardModel } = await import(ROOT + "lib/polaris/share-card.ts");
const { liquityV2HolderCardModel } = await import(ROOT + "lib/liquity/share-card.ts");

const pRows = ${JSON.stringify(pRows)};
const board = ${JSON.stringify(board)};
const vRows = ${JSON.stringify(vRows)};
const oracle = ${JSON.stringify(oracle)};

const strip = (m) => (m ? { headline: m.headline, subject: m.subject, status: m.status ?? null, stats: m.stats, session: m.session } : null);
console.log("RESULT " + JSON.stringify({
  polaris: strip(polarisHolderCardModel(pRows, ${pTotal}, board, 20, ${JSON.stringify(short(POLARIS_WALLET))})),
  // The same rows with the wallet's total forced past one page — a slice is not
  // an aggregate, so the card must state the count and nothing else.
  polarisTruncated: strip(polarisHolderCardModel(pRows, 21, board, 20, ${JSON.stringify(short(POLARIS_WALLET))})),
  polarisNoBoard: strip(polarisHolderCardModel(pRows, ${pTotal}, null, 20, ${JSON.stringify(short(POLARIS_WALLET))})),
  polarisEmpty: strip(polarisHolderCardModel([], 0, board, 20, "0x0000…0000")),
  v2: strip(liquityV2HolderCardModel(vRows, ${vTotal}, oracle, 20, ${JSON.stringify(short(V2_WALLET))})),
  v2Truncated: strip(liquityV2HolderCardModel(vRows, 21, oracle, 20, ${JSON.stringify(short(V2_WALLET))})),
  v2NoPrices: strip(liquityV2HolderCardModel(vRows, ${vTotal}, null, 20, ${JSON.stringify(short(V2_WALLET))})),
}));
`;
const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", PROBE], {
  cwd: REPO,
  encoding: "utf8",
  timeout: 120000,
  maxBuffer: 32 * 1024 * 1024,
});
const probeLine = /RESULT (\{.*\})/.exec(probe.stdout ?? "");
if (!check("D1. the card-model probe runs", Boolean(probeLine), probeLine ? "" : (probe.stderr ?? "").slice(-600))) {
  // Nothing below can mean anything without it.
} else {
  const got = JSON.parse(probeLine[1]);
  const stat = (m, label) => m?.stats?.find((s) => s.label === label);

  // ── Polaris ──────────────────────────────────────────────────────────────
  check(
    "D2. Polaris: the card's headline and status word are the wallet and its restated counts",
    got.polaris?.headline === `CDPs held by ${short(POLARIS_WALLET)}` && got.polaris?.status === pStatus,
    `"${got.polaris?.headline}" / "${got.polaris?.status}" vs restated "${pStatus}"`,
  );
  check(
    "D3. Polaris: Total collateral is the restated Σ coll over the open rows, exact and unmarked",
    stat(got.polaris, "Total collateral")?.value === `${fmtNum(pColl)} pETH`,
    `"${stat(got.polaris, "Total collateral")?.value}" vs restated "${fmtNum(pColl)} pETH"`,
  );
  check(
    "D4. Polaris: Total debt is the restated Σ legs at the markets' own units, within $1, and wears the ≈",
    /^≈ /.test(stat(got.polaris, "Total debt")?.value ?? "") &&
      Math.abs(parseNum((stat(got.polaris, "Total debt")?.value ?? "").replace("≈ ", "")) - pDebtUsd) <= 1,
    `"${stat(got.polaris, "Total debt")?.value}" vs restated ${fmtUsd(pDebtUsd)}`,
  );
  check(
    "D5. Polaris: Nearest its floor names the restated CDP at its restated ratio",
    stat(got.polaris, "Nearest its floor")?.value === `${pNearest.label} ≈ ${fmtPct(pNearest.ratioPct)}`,
    `"${stat(got.polaris, "Nearest its floor")?.value}" vs restated "${pNearest.label} ≈ ${fmtPct(pNearest.ratioPct)}"`,
  );
  check(
    "D6. Polaris: a wallet stated as holding 21 CDPs states the count and NO totals — a slice is not an aggregate",
    got.polarisTruncated?.status === "21 CDPs" && got.polarisTruncated?.stats.length === 0,
    JSON.stringify(got.polarisTruncated),
  );
  check(
    "D7. Polaris: no board and no rows both mean no card — the route serves the static one rather than a part-priced sum",
    got.polarisNoBoard === null && got.polarisEmpty === null,
    `noBoard ${JSON.stringify(got.polarisNoBoard)} / empty ${JSON.stringify(got.polarisEmpty)}`,
  );

  // ── Liquity V2 ───────────────────────────────────────────────────────────
  check(
    "E1. Liquity V2: the card's headline and status word are the wallet and its restated counts",
    got.v2?.headline === `Troves held by ${short(V2_WALLET)}` && got.v2?.status === vStatus,
    `"${got.v2?.headline}" / "${got.v2?.status}" vs restated "${vStatus}"`,
  );
  check(
    "E2. Liquity V2: Total debt is the restated Σ BOLD over the open troves, exact and unmarked",
    stat(got.v2, "Total debt")?.value === `${fmtNum(vDebt)} BOLD`,
    `"${stat(got.v2, "Total debt")?.value}" vs restated "${fmtNum(vDebt)} BOLD"`,
  );
  check(
    "E3. Liquity V2: Total collateral is the restated Σ branch × its own feed, within $1, and wears the ≈",
    /^≈ /.test(stat(got.v2, "Total collateral")?.value ?? "") &&
      Math.abs(parseNum((stat(got.v2, "Total collateral")?.value ?? "").replace("≈ ", "")) - vCollUsd) <= 1,
    `"${stat(got.v2, "Total collateral")?.value}" vs restated ${fmtUsd(vCollUsd)}`,
  );
  check(
    "E4. Liquity V2: Nearest its floor names the restated BRANCH at its restated ratio — no trove id nobody can click",
    stat(got.v2, "Nearest its floor")?.value === `${vNearest.branch} ≈ ${fmtPct(vNearest.ratioPct)}`,
    `"${stat(got.v2, "Nearest its floor")?.value}" vs restated "${vNearest.branch} ≈ ${fmtPct(vNearest.ratioPct)}"`,
  );
  check(
    "E5. Liquity V2: 21 troves states the count and no totals; an unanswered price read means no card at all",
    got.v2Truncated?.status === "21 Troves" && got.v2Truncated?.stats.length === 0 && got.v2NoPrices === null,
    `${JSON.stringify(got.v2Truncated)} / noPrices ${JSON.stringify(got.v2NoPrices)}`,
  );
  check(
    "E6. neither card carries more than the three stats the canvas holds",
    (got.polaris?.stats.length ?? 9) <= 3 && (got.v2?.stats.length ?? 9) <= 3,
    `Polaris ${got.polaris?.stats.length}, V2 ${got.v2?.stats.length}`,
  );
}

// ═══ f. the URL a reader ends up with ══════════════════════════════════════
console.log("\n── the clean URL, in the browser ────────────────────────────────");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });

/** Open a listing and wait for its first rows. */
async function openListing(ctx, url) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .locator('[data-skel-section="listing-row"]')
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(2500);
  return page;
}

/** Type into the listing's own search box and let the driver's 300 ms debounce
 *  push the URL — the path a reader takes to a wallet view. */
async function searchWallet(page, wallet) {
  const box = page.locator('[data-skel-section="listing-toolbar"] input').first();
  await box.click();
  await box.fill(wallet);
  await page.waitForTimeout(4000);
}

/** What the page says its result set is — the pagination strip's own total. */
async function statedTotal(page) {
  return page.evaluate(() => {
    const m = /Showing\s+[\d,]+-[\d,]+\s+of\s+([\d,]+)\s+/.exec(document.body.innerText ?? "");
    return m ? Number(m[1].replace(/,/g, "")) : null;
  });
}

{
  const page = await openListing(context, `${BASE}/sepolia/polaris`);
  await searchWallet(page, POLARIS_WALLET);
  const search = await page.evaluate(() => location.search);
  check(
    "F1. Polaris: a wallet search lands on ?q=<wallet> and nothing else",
    search === `?q=${POLARIS_WALLET}`,
    `"${search}"`,
  );
  await page.close();
}
{
  const page = await openListing(context, `${BASE}/ethereum/liquity-v2`);
  await searchWallet(page, V2_WALLET);
  const search = await page.evaluate(() => location.search);
  check("F2. Liquity V2: the same — ?q=<wallet> alone", search === `?q=${V2_WALLET}`, `"${search}"`);
  await page.close();
}

// Spark rests on `status:["open"]` with NO contextual default, so the rule this
// change added does not reach it: clearing Status must still write an explicit
// empty param, because an absent one would snap back to "open".
{
  const openTotal = (await api("/api/spark/positions?limit=1&status=open")).pagination?.total;
  const everyTotal = (await api("/api/spark/positions?limit=1")).pagination?.total;
  info("F3 fixtures (Spark)", `${openTotal} open of ${everyTotal} positions in all`);

  const page = await openListing(context, `${BASE}/ethereum/spark`);
  await page.getByRole("button", { name: "Remove Status filter" }).first().click();
  await page.waitForTimeout(3500);
  const cleared = await page.evaluate(() => location.search);
  check(
    "F3. Spark: clearing Status still writes an explicit `?status=` — the open-only explorers are untouched",
    cleared === "?status=",
    `"${cleared}"`,
  );
  await page.close();

  const reloaded = await openListing(context, `${BASE}/ethereum/spark?status=`);
  await reloaded.waitForTimeout(2500);
  const total = await statedTotal(reloaded);
  check(
    "F4. …and reloading that URL still shows every status, not the open resting set",
    total === everyTotal && everyTotal > openTotal,
    `page says ${total}, API says ${everyTotal} in all / ${openTotal} open`,
  );
  await reloaded.close();
}

// Aave V4's status default is the full set outright — the same on the page as
// in the page-level defaults — so its bare directory URL was clean before this
// change and must still be.
{
  const page = await openListing(context, `${BASE}/ethereum/aave-v4`);
  const search = await page.evaluate(() => location.search);
  check("F5. Aave V4: the bare directory URL is still empty", search === "", `"${search}"`);
  await page.close();
}

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — a shared wallet link carries the wallet, and unfurls as the wallet's own card`,
);
process.exit(failures ? 1 : 0);
