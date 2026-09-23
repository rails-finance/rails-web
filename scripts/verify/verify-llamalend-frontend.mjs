// Live in-browser + wire verification of the LlamaLend frontend against a dev
// server pointed at the REAL rails-server backend (live on the onboarding box —
// 614,179 rows at onboarding, across every market from Curve's three
// factories; verify-llamalend-replay green live) plus live chain reads for the
// markets view and the per-position soft-liq lane.
//   BASE=http://localhost:3000 node scripts/verify/verify-llamalend-frontend.mjs
// BASE defaults to :3789; set it to whichever port the dev server is on. The
// market count deliberately is NOT stated here — it was "59" and went stale
// within days, which is the same rot this file's assertions were rewritten to
// stop asserting.
// Assertions that could fail; real figures + EXACT wire values throughout
// (the Frankencoin lesson: assert what the wire says, never what the doc
// implied).

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3789";
// The chain-scoped explorer route (rails-ops decision 0016). `/llamalend` is a
// 308 to this, and a cold `networkidle` navigation across that hop times out.
const EXPLORER = "/ethereum/llamalend";
// ⚠️ THE SOFT-LIQ SUBJECT IS DISCOVERED, NOT PINNED — see `findSoftLiq()`. The
// position pinned here in July (0x4e59…5c67 / 0xa6fb…28f0, ~918,706 crvUSD
// converted) has since repaid: the chain read answers `hasLoan:false` for it,
// so the listing row and the whole soft-liq surface it was gating are gone. A
// soft-liquidating position is a live chain STATE, not an identity — it is
// exactly the kind of fixture the next price move invalidates — so the subject
// is found at run time and NO EVIDENCE is reported when there is none.
// One position carrying BOTH a self-liquidation and a partial third-party
// hard liquidation (found on the live wire).
const LIQCASE = {
  controller: "0x652aea6b22310c89dcc506710cad24d2dba56b11",
  user: "0x9c283aa6b1e6676b5ded6c2a6242a80589c59112",
};
// A borrow with borrowed_amount="0" — the add-collateral rendering.
const ADDCOLL = {
  controller: "0x4e59541306910ad6dc1dac0ac9dfb29bd9f15c67",
  user: "0x2618f4c64805526a3092d41f25597ccfe4dd8216",
};

// Facts read off the wire, shared with the browser section below so the page
// is asserted AGAINST THE BACKEND rather than against numbers frozen into this
// file. Every hard-coded census here rotted within days of being written —
// LlamaLend V2 launched and a 60th market appeared — and a guard whose
// baseline rots gets deleted rather than updated (this file was, in fact,
// found as an unstaged deletion).
const WIRE = {};

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

/** A check that compares the page against a WIRE value. If the wire never
 *  answered, the comparison was never MADE — reporting it as a failure invents
 *  a page bug out of a backend outage ("60 cards vs undefined on the wire"
 *  reads as a rendering fault and is not one). Skips loudly instead; the
 *  upstream failure is already its own FAIL, and one root cause should produce
 *  one red line. */
const checkVsWire = (name, wireValue, cond, detail = "") => {
  if (wireValue == null) {
    console.log(`SKIP  ${name} — the wire never answered, so nothing was compared`);
    return;
  }
  check(name, cond, detail);
};

/** The card's own compact rule, written out from the standard library rather
 *  than imported: `lib/utils/format.formatCompact` renders four digits and up
 *  in compact notation at two fraction digits, anything smaller plainly. Kept
 *  independent of the code under test so the expected string is derived, not
 *  borrowed from the renderer. */
const compact = (n) =>
  Math.abs(n) >= 1000
    ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
    : n.toLocaleString("en-US");

/**
 * Find a position that is soft-liquidating RIGHT NOW.
 *
 * Soft-liquidation is a live chain state — a price move puts a position into it
 * and another takes it out — and it lives in a state read, not in the indexed
 * history, so there is no such thing as a durable fixture for it. The subject
 * is found by paging the listing's own API, which layers the per-page
 * `user_state` overlay onto the open rows and is therefore the only place the
 * `inSoftLiq` flag exists at all.
 *
 * The subject is then confirmed against the PER-POSITION chain route, which is
 * a different code path reading the same contracts: the batched page overlay
 * and the single-position multicall must agree that this position has a loan,
 * is soft-liquidating, and has converted something. That agreement is the
 * positive control for everything asserted about it below, and the figures the
 * page is checked against come from the chain read, not from the listing lane
 * the page itself renders.
 */
async function findSoftLiq(pages = 6, perPage = 100) {
  for (let i = 0; i < pages; i++) {
    const res = await fetch(`${BASE}/api/llamalend/positions?status=open&limit=${perPage}&offset=${i * perPage}`);
    if (!res.ok) throw new Error(`listing API ${res.status} while discovering a soft-liq position`);
    const j = await res.json();
    const rows = j.data ?? [];
    if (rows.length === 0) break;
    for (const row of rows) {
      if (!row.inSoftLiq) continue;
      const cRes = await fetch(`${BASE}/api/chain/llamalend/position?controller=${row.controller}&user=${row.user}`);
      if (!cRes.ok) continue;
      const chain = await cRes.json();
      if (chain.chainStale) continue;
      if (chain.hasLoan === true && chain.inSoftLiq === true && chain.converted > 0 && chain.bands > 0) {
        return { controller: row.controller, user: row.user, chain, scanned: i * perPage + rows.length };
      }
    }
  }
  return null;
}

// ── 0. RAW WIRE — exact values straight off the backend ─────────────────────
// Resolved from THIS FILE's location up to the repo root, not from the cwd.
// This path is why the move into scripts/verify/ has to be deliberate: it used
// to read `./.env.local` beside a script that lived at the repo root, and the
// move silently redirected it to scripts/verify/.env.local. Anchoring it to the
// script means the verifier also runs correctly from any working directory.
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
const RAILS = env
  .match(/^RAILS_API_URL=(.*)$/m)[1]
  .trim()
  .replace(/^"|"$/g, "");
const TOKEN = env
  .match(/^API_BEARER_TOKEN=(.*)$/m)?.[1]
  ?.trim()
  .replace(/^"|"$/g, "");
const H = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
// ⚠️ A transport failure must NOT be readable as a data failure. This was a
// bare `.json()`, so an upstream 429 returned `{success:false,error:"Too many
// requests"}` and every downstream shape assertion then failed on it — the run
// reported "booleans are booleans: FAIL", "raw amounts are strings: FAIL" and
// three more, which describe a backend schema bug that does not exist, before
// throwing on the first `.map` of an undefined array. Rate limiting now says
// so in one line, in the one place that can tell the difference.
const api = async (p) => {
  const res = await fetch(`${RAILS}${p}`, { headers: H });
  if (!res.ok) throw new Error(`upstream ${res.status} ${res.statusText} for ${p}`);
  const j = await res.json();
  if (j && j.success === false) throw new Error(`upstream error for ${p}: ${j.error}`);
  return j;
};

// The whole wire section is one unit: if the backend is unreachable or rate
// limiting us, none of these assertions has been TESTED, and reporting them
// individually as failures is a lie about what was checked. One FAIL, named
// for what actually went wrong, and the browser section still runs.
try {
  const j = await api("/api/llamalend/positions?limit=1");
  const row = j.rows?.[0];
  check("wire: positions envelope is {rows,total,limit,offset}", Array.isArray(j.rows) && typeof j.total === "number");
  check(
    "wire: market.version is a NUMBER 1|2 (not 'V1'/'v1')",
    typeof row?.market?.version === "number" && [1, 2].includes(row.market.version),
    `${JSON.stringify(row?.market?.version)} (${typeof row?.market?.version})`,
  );
  check(
    "wire: status is lowercase enum",
    ["open", "closed", "liquidated"].includes(row?.status),
    JSON.stringify(row?.status),
  );
  check("wire: booleans are booleans", typeof row?.isOpen === "boolean" && typeof row?.everLiquidated === "boolean");
  check("wire: raw amounts are strings", typeof row?.debtRaw === "string");

  const liq = await api("/api/llamalend/positions?status=liquidated&limit=1");
  check(
    "wire: liquidated rows carry n1 null (stale ticks withheld)",
    liq.rows?.[0]?.n1 === null,
    JSON.stringify(liq.rows?.[0]?.n1),
  );
  const v2 = await api("/api/llamalend/positions?version=2&limit=5");
  // Was "version=2 is empty (pre-launch)". V2 has since launched, so the
  // assertion asserted history. What is durable is that the FILTER works:
  // whatever it returns is version 2 and nothing else.
  check(
    "wire: version filter returns only V2 rows",
    (v2.rows ?? []).every((r) => r.version === 2 || r.version == null),
    `total ${v2.total}`,
  );
  const surv = await api("/api/llamalend/positions?hasLiquidations=true&status=open&limit=1");
  check(
    "wire: open survivors exist (two-axis status is real)",
    surv.total > 0 && surv.rows?.[0]?.everLiquidated === true,
    `${surv.total} open ever-liquidated`,
  );

  const t = await api(`/api/llamalend/timeline?user=${LIQCASE.user}&controller=${LIQCASE.controller}&limit=200`);
  const legs = new Set(t.rows.map((x) => x.leg));
  const actions = new Set(t.rows.map((x) => x.action));
  check(
    "wire: timeline actions are the contract's exact strings",
    t.rows.length > 0 && [...actions].every((a) => ["borrow", "repay", "remove_collateral", "liquidation"].includes(a)),
    `${t.rows.length} rows: ${[...actions].join(",")}`,
  );
  check(
    "wire: legs are the contract's exact strings",
    t.rows.length > 0 && [...legs].every((l) => ["self", "borrower", "liquidator"].includes(l)),
    `${t.rows.length} rows: ${[...legs].join(",")}`,
  );
  // How many liquidation rows the chain left WITHOUT an after-image. The detail
  // grid must omit those stats entirely rather than print a zero — asserted
  // against this exact count on the page below.
  WIRE.liqRows = t.rows.filter((x) => x.action === "liquidation").length;
  WIRE.liqNoAfterImage = t.rows.filter(
    (x) => x.action === "liquidation" && x.collateral_after == null && x.debt_after == null,
  ).length;
  const selfRow = t.rows.find((x) => x.action === "liquidation" && x.leg === "self");
  const hardRow = t.rows.find((x) => x.action === "liquidation" && x.leg === "borrower");
  check("wire: a 'self' liquidation leg exists with self_liquidation=true", selfRow?.self_liquidation === true);
  check(
    "wire: a partial 'borrower' liquidation carries NULL after-image",
    hardRow != null && hardRow.debt_after === null && hardRow.collateral_after === null,
  );
  check(
    "wire: liquidation rows carry debt_repaid ≠ borrowed_amount (converted taken)",
    hardRow != null && hardRow.debt_repaid !== hardRow.borrowed_amount && BigInt(hardRow.borrowed_amount ?? "0") > 0n,
  );
  check(
    "wire: no same-tx phantom repay beside a liquidation (claim held)",
    !t.rows.some(
      (x) => x.action === "repay" && t.rows.some((l) => l.action === "liquidation" && l.tx_hash === x.tx_hash),
    ),
  );

  const mk = await api("/api/llamalend/markets");
  WIRE.marketCount = mk.markets.length;
  const snapped = mk.markets.filter((m) => m.snapshotBlock != null && m.totalDebtRaw != null);
  const unsnapped = mk.markets.filter((m) => m.snapshotBlock == null || m.totalDebtRaw == null);
  // The true invariant is not a count — it is that the un-snapshotted markets
  // are exactly the MOST RECENTLY ADDED ones, i.e. the sweep is merely behind
  // the newest arrivals. An OLD market losing its snapshot is a real fault and
  // still fails here, where "=== 59" would have gone green the moment the
  // count happened to match again.
  const newestSnapped = Math.max(0, ...snapped.map((m) => m.addedBlock ?? 0));
  check(
    "wire: every market has a snapshot, bar newly-added ones awaiting a sweep",
    unsnapped.every((m) => (m.addedBlock ?? 0) > newestSnapped),
    `${snapped.length}/${mk.markets.length} snapshotted${unsnapped.length ? `; awaiting sweep: ${unsnapped.map((m) => m.controller.slice(0, 10)).join(",")}` : ""}`,
  );
  check(
    "wire: global block present (post-first-sweep)",
    mk.global != null && typeof mk.global.market_count === "number",
    JSON.stringify(mk.global?.market_count),
  );
  // Surfaced explicitly rather than buried in a frozen count: the global
  // aggregate must agree with the market list it aggregates — but AS OF ITS
  // OWN BLOCK, which is the part a bare `=== markets.length` got wrong.
  //
  // `global` is stamped at a completed sweep (`global.block_number` equals the
  // `snapshotBlock` on every swept market), so a market created on chain AFTER
  // that block is legitimately absent from the count. That is the same lag the
  // snapshot check above tolerates, and asserting equality made an expected
  // few-hundred-block gap read as a data fault: on 2026-07-27 the list held 60
  // and the count said 59, purely because syrupUSDC/crvUSD was added at block
  // 25,603,281 against a sweep at 25,544,900.
  //
  // The real invariant survives: every market that EXISTED at the sweep block
  // must be counted, so an aggregate that drops an old market still fails.
  const countableAtSweep = mk.markets.filter((m) => (m.addedBlock ?? 0) <= (mk.global?.block_number ?? 0));
  const addedSinceSweep = mk.markets.length - countableAtSweep.length;
  check(
    "wire: global market_count accounts for every market that existed at its own block",
    mk.global?.market_count === countableAtSweep.length,
    `global ${mk.global?.market_count} vs ${countableAtSweep.length} listed at block ${mk.global?.block_number}` +
      (addedSinceSweep ? ` (+${addedSinceSweep} added since the sweep, not yet countable)` : ""),
  );
} catch (err) {
  check("wire: the indexed backend answered", false, err && err.message);
}

// ⚠️ Everything from here to the summary runs against a live dev server, and
// any single `waitForSelector` that times out throws. Unguarded, that killed
// the script mid-run: 33 checks had already been decided and NONE of them were
// reported, on a log indistinguishable from "this guard never ran". The throw
// is now itself a FAIL and the verdict always prints. Same fix as 084f221, one
// file it had not reached.
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // ── 1. /llamalend/markets — the protocol view (chain-direct, real figures) ──
  await page.goto(`${BASE}${EXPLORER}/markets`, { waitUntil: "networkidle", timeout: 180000 });
  const h1 = await page.textContent("h1");
  check("markets: heading renders", /band geometry/i.test(h1 ?? ""), h1 ?? "");
  let body = await page.textContent("body");
  const cardCount = await page.locator("div.grid > div.rounded-lg").count();
  checkVsWire(
    "markets: one card per market on the wire",
    WIRE.marketCount,
    cardCount === WIRE.marketCount,
    `${cardCount} cards vs ${WIRE.marketCount} on the wire`,
  );
  // The census is asserted for SELF-CONSISTENCY against the wire, not against a
  // frozen split: the stated total must match the backend, and the three parts
  // must sum to it. That survives a new market appearing — which is exactly what
  // broke the old frozen "48 V1 lend · 9 V1 mint · 2 V2".
  const census = body.match(/(\d+) markets listed \((\d+) V1 lend · (\d+) V1 mint · (\d+) V2\)/);
  const [total, lend, mint, v2n] = (census ?? []).slice(1).map(Number);
  checkVsWire(
    "markets: census total matches the wire and its parts sum to it",
    WIRE.marketCount,
    census != null && total === WIRE.marketCount && lend + mint + v2n === total,
    census ? `${total} = ${lend}+${mint}+${v2n}, wire ${WIRE.marketCount}` : "census line not found",
  );
  check(
    "markets: non-crvUSD carve-out section names WETH",
    /Markets that do not borrow crvUSD/.test(body) && /borrows\s+WETH/s.test(body),
  );
  check("markets: utilisation bases stated", body.includes("crvUSD debt ceiling") && body.includes("lender deposits"));
  check("markets: no page errors", pageErrors.length === 0, pageErrors.join(" | "));

  // ── 2. /llamalend listing — REAL index rows through the proxy ───────────────
  pageErrors.length = 0;
  await page.goto(`${BASE}${EXPLORER}`, { waitUntil: "networkidle", timeout: 180000 });
  body = await page.textContent("body");
  check("listing: OPEN cards render from the live index", /OPEN/.test(body));
  check("listing: market pair identity on rows", /\/ crvUSD/.test(body));
  check("listing: no page errors", pageErrors.length === 0, pageErrors.join(" | "));

  await page.goto(`${BASE}${EXPLORER}?status=liquidated`, { waitUntil: "networkidle", timeout: 180000 });
  body = await page.textContent("body");
  // The closed-card outcome pill renders "Liquidated" (mixed case — asserted
  // against the actual render, not an assumed all-caps).
  check(
    "listing: status=liquidated filter renders Liquidated cards",
    /Liquidated/.test(body) && !/\bOPEN\b/.test(body),
  );

  // The soft-liq subject, found at run time — see findSoftLiq(). Everything
  // from here to the end of section 3 asserts against the chain read it
  // confirmed the subject with, so a run that found no soft-liquidating
  // position anywhere has not tested the overlay at all and says so.
  const SOFTLIQ = await findSoftLiq();
  if (!SOFTLIQ) {
    console.log(
      "\nNO EVIDENCE — no open position is soft-liquidating right now, so the converted-amount " +
        "overlay and the band axis were never exercised. This is not a pass.",
    );
    await browser.close();
    process.exit(1);
  }
  const sl = SOFTLIQ.chain;
  const converted = compact(sl.converted);
  console.log(
    `INFO  soft-liq subject discovered after ${SOFTLIQ.scanned} open rows: ` +
      `${SOFTLIQ.controller}/${SOFTLIQ.user} — ${sl.collateralSymbol}/${sl.borrowedSymbol}, ` +
      `${sl.converted} ${sl.borrowedSymbol} converted across ${sl.bands} bands`,
  );

  // The subject's row must carry the converted column (the O(page) user_state
  // overlay on an open row) and say it is soft-liquidating. The figure is the
  // per-position chain read's, formatted the way the card formats it — so this
  // is the batched page overlay checked against the single-position multicall,
  // two code paths over the same contracts, not the listing checked against
  // itself.
  await page.goto(`${BASE}${EXPLORER}?q=${SOFTLIQ.user}`, { waitUntil: "networkidle", timeout: 180000 });
  body = await page.textContent("body");
  check(
    `listing: soft-liq overlay lands on the searched row (${converted} converted)`,
    /In soft-liquidation/.test(body) && body.includes(converted),
    body.includes(converted) ? converted : "no converted figure matching the chain read",
  );

  // ── 3. detail — index + chain, the full soft-liq surface ────────────────────
  pageErrors.length = 0;
  await page.goto(`${BASE}${EXPLORER}/${SOFTLIQ.controller}/${SOFTLIQ.user}`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  // Gate on the risk strip's "Soft-liquidation:" label — the one caption every
  // band state kept through the 07-27 axis redraws. This gate has now rotted
  // TWICE on retired copy ("converted by the AMM", then "soft-liquidation
  // begins" — which survives only inside the closed Learn-More modal, so the
  // locator resolved forever to a hidden span). Gate on chrome labels, not
  // explanatory prose.
  await page.waitForSelector("text=Soft-liquidation:", { timeout: 120000 });
  body = await page.textContent("body");
  check(
    `detail: card renders (index + chain merged) — ${sl.collateralSymbol} / ${sl.borrowedSymbol}`,
    body.includes(`${sl.collateralSymbol} / ${sl.borrowedSymbol}`),
  );
  // The wei-exact cross-check is no longer card prose: it moved into the
  // converted figure's RECEIPT (llamalendConvertedProv — "matched to the wei at
  // this block"), with only the plain-words caution for the mismatch case left on
  // the card. That is the charter's register split working, so asserting "to the
  // wei" against the page body was asserting a defect. What the card owes the
  // reader is the figure and its soft-liq state.
  check(
    `detail: converted amount renders with its soft-liq state (${converted})`,
    // The figure is not always adjacent to its unit — the card renders the
    // compact form against a separate label, the bullet the exact
    // "1,158.711886859685 crvUSD". Match the figure itself, not one layout of
    // it, and take the expected value from the chain read rather than a pin.
    body.includes(converted) && /fully converted|In soft-liquidation/i.test(body),
  );
  // The redrawn axis (4f8e08e) carries the band count + edge prices in its
  // caption strip and the onset multiple in the strip label; the tick pair
  // moved into event-detail receipts and no longer renders on the card. The
  // count is the chain read's `bands`, so a caption that renders some other
  // number of bands is a red rather than a match on any digit at all.
  check(
    `detail: band axis caption (${sl.bands} bands + onset multiple)`,
    // `body` is textContent, which carries no line breaks, so `\b` is useless
    // here — the caption follows "Converting now" and a word boundary between
    // "w" and "4" does not exist. A negative lookbehind on a digit says what is
    // actually meant: this count, not the tail of a longer number.
    new RegExp(`(?<!\\d)${sl.bands} bands:`).test(body) && /Soft-liquidation: [\d.,]+× the onset price/.test(body),
  );
  check(
    "detail: REAL timeline events render (borrow rows)",
    /Borrow/.test(body) && !/No transaction history/.test(body),
  );
  check("detail: no page errors", pageErrors.length === 0, pageErrors.join(" | "));

  // ── 4. detail — hard liquidation (partial) + self-liquidation legs ──────────
  pageErrors.length = 0;
  await page.goto(`${BASE}${EXPLORER}/${LIQCASE.controller}/${LIQCASE.user}`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  // ⚠️ Gate on the timeline's liquidation ROW HEADER, not on `text=Liquidation`.
  // The bare text locator resolves to nine nodes on this page and picks the
  // first — an explanatory span inside a collapsed pane, which never becomes
  // visible — so the gate spent its whole 120s waiting on prose that was never
  // going to paint. It is the same trap the soft-liq gate above already carries
  // a warning about: gate on chrome, not on explanation. The header button is
  // the row itself and is the thing the checks below are about.
  await page
    .getByRole("button", { name: /^(Self-)?[Ll]iquidation/ })
    .first()
    .waitFor({ timeout: 120000 });
  body = await page.textContent("body");
  check("liq detail: closed/liquidated card renders (no false OPEN)", /LIQUIDATED|CLOSED/.test(body));
  check("liq detail: hard-liquidation row renders with 'liquidated by' chip", /liquidated by/.test(body));
  check("liq detail: SELF-liquidation renders as its own label", /Self-liquidation/.test(body));
  // Assert absence of the caption open cards DO render — "soft-liquidation
  // begins" no longer renders anywhere, so testing for it was vacuously green.
  check("liq detail: no band figures on a closed position (stale ticks withheld)", !/\d+ bands:/.test(body));

  // The explainer bullets mount only when a card's detail panel and its
  // icon-only Explanation tab (aria-label "Show explanation") are opened —
  // drive the disclosures like a reader would, then assert. Expand every
  // liquidation-family row so both the partial hard-liq and the self-liq
  // explainers are in the DOM.
  {
    const liqHeaders = page.getByRole("button", { name: /^(Self-)?[Ll]iquidation/ });
    const n = await liqHeaders.count();
    for (let i = 0; i < n; i++) {
      await liqHeaders
        .nth(i)
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(200);
    }
    // Opening a tab flips its aria-label to "Hide explanation" and reflows the
    // page — so always click the FIRST remaining "Show explanation", re-located
    // fresh each pass, force-clicked (the icon can sit under the fixed strips).
    for (let pass = 0; pass < 10; pass++) {
      const tab = page.locator("[aria-label='Show explanation']").first();
      if ((await tab.count().catch(() => 0)) === 0) break;
      await tab.scrollIntoViewIfNeeded().catch(() => {});
      const ok = await tab
        .click({ timeout: 8000, force: true })
        .then(() => true)
        .catch(() => false);
      if (!ok) break;
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(400);
  }
  body = await page.textContent("body");
  // Was: /unstated/ && /partial/. Neither word is the page's treatment of an
  // unstated after-image — and the page's actual treatment is the CORRECT one:
  // it OMITS the stat rather than printing a zero the chain never stated ("a dash
  // is an omission"). So assert the real invariant, counted against the wire:
  // exactly the rows the chain left silent are the rows with no Collateral stat.
  // Verified on this fixture: 4 liquidations, 1 with a null after-image (the
  // partial), 3 that genuinely zeroed the position and rightly render 0.
  {
    const perRow = await page.evaluate(() =>
      [...document.querySelectorAll("div.flex.w-full.items-start.relative.rounded-xl")]
        .filter((c) => /iquidation/.test(c.innerText))
        .map((c) => /Collateral/.test(c.innerText)),
    );
    const omitted = perRow.filter((hasStat) => !hasStat).length;
    check(
      "liq detail: a chain-silent after-image is OMITTED, never rendered as zero",
      perRow.length === WIRE.liqRows && omitted === WIRE.liqNoAfterImage,
      `${perRow.length} rows (wire ${WIRE.liqRows}); ${omitted} omit the stat (wire says ${WIRE.liqNoAfterImage} chain-silent)`,
    );
  }
  check("liq detail: converted-taken stated (both AMM legs seized)", /already converted/.test(body));
  check("liq detail: no page errors", pageErrors.length === 0, pageErrors.join(" | "));

  // ── 5. detail — add-collateral rendering (borrow with loan=0) ───────────────
  await page.goto(`${BASE}${EXPLORER}/${ADDCOLL.controller}/${ADDCOLL.user}`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  await page.waitForSelector("text=Add collateral", { timeout: 120000 });
  body = await page.textContent("body");
  check("add-collateral: 'Add collateral' label renders (never a zero Borrow)", /Add collateral/.test(body));

  // The screenshot is a debugging aid, not an assertion. It used to hard-code an
  // absolute path into one long-dead session's scratchpad directory, which throws
  // ENOENT anywhere else — a guard must not die decorating its own output. Opt in
  // with SHOT=/some/path.png.
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
} catch (err) {
  check("browser: the run reached the end of its route list", false, err && err.message);
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
