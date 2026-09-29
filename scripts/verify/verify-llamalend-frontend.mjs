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

/** Open every collapsed disclosure on the page (the event rows' (i) panes,
 *  the card's explanation), then read what a reader sees. */
async function openAllAndRead(pg) {
  for (const b of await pg.$$('button[aria-expanded="false"]')) {
    try {
      await b.click({ timeout: 1000 });
    } catch {}
  }
  await pg.waitForTimeout(2500);
  return pg.evaluate(() => document.body.innerText);
}

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
  // The vitals band: "Markets listed" then the count, the lineage split in
  // its notes.
  const vitals = await page.evaluate(() => document.body.innerText);
  const census = vitals.match(/Markets listed\s*(\d+)[\s\S]*?\b(\d+) V1 lend · (\d+) V1 mint · (\d+) V2/i);
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
    const liqHeaders = page.getByRole("button", { name: /^(Self-)?[Ll]iquidat/ });
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
  // A partial liquidation logs no after-state. The row states what the
  // position held from the chain read at its block (event-state), so every
  // liquidation row carries a Collateral stat, and none prints a zero the
  // chain never stated: the partial rows' figures are the read's.
  {
    // The read is two archive calls per row; give it time to land.
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll("div.flex.w-full.items-start.relative.rounded-xl")]
            .filter((c) => /iquidat/.test(c.innerText) && /Position state|Collateral/.test(c.innerText))
            .every((c) => /Collateral/.test(c.innerText)),
        null,
        { timeout: 30000 },
      )
      .catch(() => {});
    const perRow = await page.evaluate(() =>
      [...document.querySelectorAll("div.flex.w-full.items-start.relative.rounded-xl")]
        .filter((c) => /iquidat/.test(c.innerText) && /Position state|Collateral/.test(c.innerText))
        .map((c) => /Collateral/.test(c.innerText)),
    );
    check(
      "liq detail: every opened liquidation row states its collateral after (log or chain read)",
      perRow.length > 0 && perRow.every(Boolean),
      `${perRow.length} opened rows (wire ${WIRE.liqRows}, ${WIRE.liqNoAfterImage} with no after-image)`,
    );
  }
  check("liq detail: converted-taken stated (both AMM legs seized)", /the AMM had converted/.test(body));
  check("liq detail: no page errors", pageErrors.length === 0, pageErrors.join(" | "));

  // ── 5. detail — add-collateral rendering (borrow with loan=0) ───────────────
  await page.goto(`${BASE}${EXPLORER}/${ADDCOLL.controller}/${ADDCOLL.user}`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  // The row reads "Add ◊": the collateral verb alone, no Borrow beside it.
  await page.waitForSelector("text=/^Add$/", { timeout: 120000 });
  const addRow = await page.locator("text=/^Add$/").first().locator("xpath=..").textContent();
  check(
    "add-collateral: the row reads Add with no Borrow verb (never a zero Borrow)",
    !/Borrow/.test(addRow ?? ""),
    addRow ?? "",
  );

  // ── 6. the newcomer-review fixture — reads at block − 1 and block ─────────
  // A closed block's state never changes, so these raw figures are exact
  // forever (rails-ops item 77, the LlamaLend loop; checked against the
  // answer key's chain reads).
  const NR = {
    controller: "0xaade9230aa9161880e13a38c83400d3d1995267b",
    user: "0x8f1e003313650b3629a0d73b26a227574bad6c2d",
  };
  const es = async (block) =>
    (
      await fetch(`${BASE}/api/chain/llamalend/event-state?controller=${NR.controller}&user=${NR.user}&block=${block}`)
    ).json();
  const addColl = await es(25305369);
  check(
    "event-state: add-collateral row reads 1.0472 → 2.0480 WETH",
    addColl.before?.collateralRaw === "1047182052278762595" && addColl.after?.collateralRaw === "2048046494738597881",
    `${addColl.before?.collateralRaw} → ${addColl.after?.collateralRaw}`,
  );
  check(
    "event-state: bands 76…79 → 122…125, health 109.48% after",
    addColl.before?.n1 === "76" && addColl.after?.n1 === "122" && addColl.after?.healthRaw === "1094808657500230440",
    `${addColl.before?.n1} → ${addColl.after?.n1}, ${addColl.after?.healthRaw}`,
  );
  const repayIn = await es(25388879);
  check(
    "event-state: in-band repay holds 1,484.58 crvUSD converted, health 2.35% → 5.08%",
    repayIn.before?.convertedRaw === "1484575794186193099399" &&
      repayIn.before?.healthRaw === "23488142984460246" &&
      repayIn.after?.healthRaw === "50844625291548962",
  );
  const live = await (
    await fetch(`${BASE}/api/chain/llamalend/position?controller=${NR.controller}&user=${NR.user}`)
  ).json();
  check(
    "position: health(user, true) and the stored discount ride the live read",
    typeof live.healthFull === "number" && live.liquidationDiscount === 0.04,
    `${live.healthFull} · ${live.liquidationDiscount}`,
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "rails-open-cards-v1",
        JSON.stringify({
          "llamalend:borrow:413b4e3d3cc6a7c487b619e137e5e5f54d7727ca22e107544921a9defde26c3c:187:self": true,
        }),
      );
    } catch {}
  });
  await page.goto(`${BASE}${EXPLORER}/${NR.controller}/${NR.user}`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForSelector("text=Lost to soft-liquidation", { timeout: 120000 });
  await page.waitForSelector("text=fewer than after the 11 Jun event", { timeout: 120000 });
  body = await page.textContent("body");
  check("nr: card states health", /Health:\s*[\d.]+%/.test(body));
  // Deposited 7.61413 WETH, held 7.42038 WETH while the collateral is unchanged.
  check(
    "nr: card states the collateral lost to soft-liquidation",
    /Lost to soft-liquidation:\s*0\.19375 WETH/.test(body),
  );
  check(
    "nr: the add-collateral row reads its before from the chain",
    /1\.0472/.test(body) && /0\.0061 WETH fewer/.test(body),
  );
  check("nr: no 'reversibly' in the page copy", !/reversibl/i.test(body));
  body = await openAllAndRead(page);
  check(
    "nr: the add-collateral row says the direction in price",
    /moved the bands 46 down in price, to 122…125/.test(body) && !/placed the bands/.test(body),
  );

  // ── 7. round 2: a position in its bands now, and a closed-and-reopened one ─
  const INBAND = {
    controller: "0x4e59541306910ad6dc1dac0ac9dfb29bd9f15c67",
    user: "0xfd4b674df85d12f63efd4093dd0c30dd6de60645",
    open: "borrow:96ab9822058bad72ec9b1f7780b5fd38f33cbbc0dd1c5e2436c6469e1fe6fef1:785:self",
    repay: "repay:e253c80b92e0fb286e3c77f1eff18f479f8b29fc20f5d63021c6d15b74d1af1f:727:self",
  };
  const inbandLive = await (
    await fetch(`${BASE}/api/chain/llamalend/position?controller=${INBAND.controller}&user=${INBAND.user}`)
  ).json();
  const p2 = await browser.newPage();
  await p2.addInitScript(
    (keys) => {
      try {
        const o = {};
        for (const k of keys) o[`llamalend:${k}`] = true;
        localStorage.setItem("rails-open-cards-v1", JSON.stringify(o));
      } catch {}
    },
    [INBAND.open, INBAND.repay],
  );
  await p2.goto(`${BASE}${EXPLORER}/${INBAND.controller}/${INBAND.user}`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  await p2.waitForSelector("text=83,966.3", { timeout: 120000 });
  await p2.waitForSelector("text=Sold by the AMM, net", { timeout: 120000 });
  body = await openAllAndRead(p2);
  // The opening row's band prices are a closed block's read (exact forever);
  // the card's are today's, higher by the interest multiplier since.
  const nowTop = Number((body.match(/10 bands:\s*([\d,.]+)/) ?? [])[1]?.replace(/,/g, ""));
  check(
    "inband: opening row prices bands −79…−70 at 83,966.3 → 75,937.6; the card prices them higher now",
    /83,966\.3 → 75,937\.6/.test(body) && nowTop > 83966.3,
    `now ${nowTop}`,
  );
  check(
    "inband: the card says band prices rise with interest",
    /Band prices rise over time with the market/.test(body),
  );
  check(
    "inband: converted tile is named Converted, with no method note",
    /Converted\s*1\.8K/.test(body) && !/read live, cross-checked/.test(body),
  );
  if (inbandLive.healthFull != null && inbandLive.healthFull > 0 && inbandLive.healthFull < 0.05) {
    check("inband: health near 0 carries its plain line", /close to 0; below 0 anyone may liquidate it/.test(body));
  } else {
    console.log(`SKIP  inband: near-0 health line — health is ${inbandLive.healthFull} now`);
  }
  check(
    "inband: net sold 0.02734 WBTC stated on the card and in the flows",
    /Sold by the AMM, net:\s*0\.02734 WBTC/.test(body) && /sold 0\.02734 WBTC more than it bought back/.test(body),
  );
  check(
    "inband: flows name the converted balance with the collateral",
    /Collateral and converted/.test(body) && /The card's Collateral figure counts the WBTC alone/.test(body),
  );
  check("inband: mint market line on the card", /This is a mint market/.test(body));
  check("inband: opening row reads Open · Deposit · Borrow", /Open\s*Deposit\s*Borrow/.test(body));
  check("inband: freshness pill says last activity", /last activity \d+ days ago/.test(body));
  await p2.close();

  const REOPEN = {
    controller: "0x5756a035f276a8095a922931f224f4ed06149608",
    user: "0xa76532c17f4cdef7db3e554e0338a68b7952cb63",
    ids: [
      "borrow:989800b59b994e38dc7cefa9c267e41192bbcd491e84d836bee52a84601ba834:327:self",
      "borrow:9c9920a5d99941277b70ce26ce2fad21a0978988100e2f185f25fc3bcbf085d3:435:self",
      "repay:46fcdde48dbbe70804074e44c9315adad2dac503bbd3c2320ce194d0476aec0e:496:self",
      "borrow:11fbec31661912bd1ec5c2e151a97f501123493489335d43364950c64780435c:116:self",
    ],
  };
  const p3 = await browser.newPage();
  await p3.addInitScript((keys) => {
    try {
      const o = {};
      for (const k of keys) o[`llamalend:${k}`] = true;
      localStorage.setItem("rails-open-cards-v1", JSON.stringify(o));
    } catch {}
  }, REOPEN.ids);
  await p3.goto(`${BASE}${EXPLORER}/${REOPEN.controller}/${REOPEN.user}`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  await p3.waitForSelector("text=Loan 2 of 2", { timeout: 120000 });
  await p3.waitForSelector("text=74 … 83", { timeout: 120000 });
  body = await openAllAndRead(p3);
  check("reopen: first borrow of each loan opens it", /Opened loan 1,/.test(body) && /Opened loan 2,/.test(body));
  check("reopen: no top-up wording on loan 2's first borrow", !/Borrowed another 9,000/.test(body));
  check("reopen: band move said in price", /moved the bands 2 up in price, to 74…83/.test(body));
  check("reopen: the full repay reads Close · Withdraw · Repay", /Close\s*Withdraw\s*Repay/.test(body));
  check(
    "reopen: last activity sits before first opened",
    /Open again since[\s\S]{0,60}last activity[\s\S]{0,40}first opened/.test(body),
  );
  check("reopen: lend market line on the card", /This is a lend market/.test(body));
  await p3.close();

  const SPOT = {
    controller: "0xa920de414ea4ab66b97da1bfe9e6eca7d4219635",
    user: "0x1d737e0122c270c5fa476dab9038d05363ad3a3c",
  };
  await page.goto(`${BASE}${EXPLORER}/${SPOT.controller}/${SPOT.user}`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForSelector("text=liquidated by", { timeout: 120000 });
  body = await page.textContent("body");
  check("spot: 4 transactions (two borrows, two liquidations)", /4 transactions/.test(body));
  check(
    "spot: liquidation row states the converted leg and the debt apart",
    /converted/.test(body) && /debt/.test(body),
  );
  // Round 3: open every row and its explanation, wait for the reads.
  {
    const cards = page.locator("div.flex.w-full.items-start.relative.rounded-xl");
    const nc = await cards.count();
    for (let i = 0; i < nc; i++) {
      await cards
        .nth(i)
        .locator('[role="button"], button')
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
      await page.waitForTimeout(200);
    }
    for (let pass = 0; pass < 20; pass++) {
      const tab = page.locator("[aria-label='Show explanation']").first();
      if ((await tab.count().catch(() => 0)) === 0) break;
      const ok = await tab
        .click({ timeout: 5000, force: true })
        .then(() => true)
        .catch(() => false);
      if (!ok) break;
      await page.waitForTimeout(250);
    }
    await page
      .waitForFunction(() => /before the bands/.test(document.body.innerText), null, { timeout: 60000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
  }
  body = await page.evaluate(() => document.body.innerText);
  check("spot N1: a positive health near 0 keeps its digits", /0\.0019%/.test(body) && !/Health\s*0\.00%/.test(body));
  check(
    "spot N1: liquidation 1 states why it was eligible",
    /Health was 0\.0019% at the end of the block before\. By this block’s time the oracle price had moved from [\d,.]+ to [\d,.]+ crvUSD, and health stood at −0\.0058% before the block’s transactions ran: below 0/.test(
      body,
    ),
  );
  check("spot N1: the grid states health at the start of the block", /−0\.0058% at the start of this block/.test(body));
  check(
    "spot N2: the owner's outcome on the card and in the row",
    /For the owner: kept the 95,000 crvUSD borrowed; lost the 36\.4374 WETH deposited\./.test(body) &&
      /The owner receives nothing from a hard liquidation and keeps the crvUSD they borrowed\./.test(body) &&
      /the liquidator paid the other 39,794\.17\d? crvUSD and received the 16\.323\d? WETH/.test(body),
  );
  {
    const m = body.match(
      /In WETH, the ([\d.]+) deposited is ([\d.]+) sold by the AMM \+ ([\d.]+) taken in liquidation\./,
    );
    const ok =
      m && Math.abs(Number(m[1]) - Number(m[2]) - Number(m[3])) < 0.0002 && Math.abs(Number(m[1]) - 36.4374) < 0.0001;
    check("spot N3: the collateral side adds up in WETH", !!ok, m ? m[0] : "no ledger sentence");
    check(
      "spot N3: sold, taken and the converted crvUSD are their own rows",
      /Converted by the AMM/.test(body) && /Sold by the AMM/.test(body) && /Converted, taken in liquidation/.test(body),
    );
  }
  check("spot N4: each liquidation figure is named", /−16\.32\s*taken\s*−57K\s*converted\s*−96K\s*cleared/.test(body));
  check(
    "spot N5: the borrow row states the distance to the bands",
    /the price could fall 24% before the bands/.test(body),
  );
  check(
    "spot N6: the position's discount beside the market's",
    /liquidation discount on this position was 6%, copied from the market’s when the owner opened or added to the loan; the market’s is 9\.21% now/.test(
      body,
    ),
  );
  check(
    "spot N8: the remainder and the close are stated",
    /The remainder stayed open until 6 Dec 2025, when its health had fallen to −3\.41% and a second liquidation cleared it\./.test(
      body,
    ) && /The debt is cleared and the loan closed\./.test(body),
  );
  check("spot N11: market kind beside the pair", /WETH \/ crvUSD · mint market/.test(body));

  const CRVSPOT = "/0xeda215b7666936ded834f76f3fbc6f323295110a/0xcbce52b5576771c7c8f5c21e29640d29e9636a8f";
  await page.goto(`${BASE}${EXPLORER}${CRVSPOT}`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForSelector("text=Health:", { timeout: 120000 });
  body = await openAllAndRead(page);
  check(
    "spot N7: a price under 1 keeps its digits",
    /today's CRV price, 0\.\d{3,4} crvUSD/.test(body) && !/today's CRV price, 0 crvUSD/.test(body),
  );
  check(
    "spot N9: an underwater position states what a liquidator would lose",
    /A liquidator taking the whole position would repay [\d,.]+ crvUSD of debt and receive the [\d,.]+ crvUSD the AMM holds and 0 CRV: [\d,.]+ crvUSD less than it pays\. Curve’s docs call a shortfall like this bad debt/.test(
      body,
    ),
  );
  check("spot N11: lend market beside the pair", /CRV \/ crvUSD · lend market/.test(body));

  await page.goto(`${BASE}${EXPLORER}/markets`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForSelector("text=A =", { timeout: 120000 });
  body = await page.textContent("body");
  check(
    "markets: near-zero-rate markets state their policy bounds",
    /minimum and maximum at 3 wei a second/.test(body),
  );
  check(
    "markets: terms defined once, no contract names in the stamp",
    /Loan discount/.test(body) && /Liquidation discount/.test(body) && !/OneWayLendingFactory/.test(body),
  );
  check(
    "markets: yield-bearing shares say why they price above 1",
    /sDOLA is a yield-bearing share of DOLA/.test(body),
  );

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
