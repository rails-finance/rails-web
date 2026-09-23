#!/usr/bin/env node
// What we FILE a position as, and what we SAY about it, are one claim.
// ---------------------------------------------------------------------------
// Every explorer serves a `status` word with its rows and narrates the same
// position in prose on its detail page. Nothing anywhere asserted that the two
// agree, and on 2026-09-20 they did not: 212 of the 8,575 Fluid positions the
// route served as OPEN carried the sentence "This position is closed — the
// collateral is withdrawn and the debt repaid", the largest of them holding a
// whole ETH (nft 9295). See rails-ops TO-DO-ui-jobs.md §45.
//
// The cause is a lane, not a rounding. A Fluid position has three sources for
// its current figures, and the route ranks them (api/src/routes/fluid.ts:323-333
// — the same COALESCE decides status, the facets, the sort and the total):
//
//   live    the resolver read at head, when the page's effect has landed
//   settled the worker's stamped overlay — interest and liquidations applied
//   Σ       the replay: deposits less withdrawals
//
// The Σ lane is a PRINCIPAL-FLOW number. A position that has paid out the
// interest its collateral earned nets BELOW zero while still holding a balance:
// nft 9295 deposited 693.55 ETH across 148 events, withdrew 695.09, and holds
// 1.01 ETH on chain. Asked "is this empty?" it answers yes, always, and the
// route says in as many words that it must not be asked. The pane asked it
// anyway whenever `live` was null — which is every server render and every
// first paint, because position-view.tsx initialises the chain read to null.
//
// So the subjects here are chosen for the gap: a position the index serves as
// OPEN whose Σ lane reads empty. On the unfixed tree every one of them narrates
// closed. The fixtures come from the INDEX, never from the page under test, and
// the band's population is asserted before anything is read off a page — a
// section over an empty band would pass without proving anything, so it reports
// instead.
//
// Each subject is read TWICE: with the live route held (the first-paint state,
// and the only state a reader without JS ever sees) and with it allowed. A rule
// that only holds once the RPC lands is not the rule.
//
// The negative control is the other half: a position the index serves as CLOSED
// must still narrate closed. Without it this file would pass on a page that had
// simply forgotten how to say "closed".
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  node scripts/verify/verify-status-against-narration.mjs
//       FAMILIES=fluid node scripts/verify/verify-status-against-narration.mjs
//
// ── PROVED IT CAN FAIL, 2026-09-20 ──────────────────────────────────────────
//   fluid-position-explanation.tsx reverted to the pre-fix tree (the verdict
//   read off the Σ lane whenever `live` was absent) → 3 of the 14 went red, and
//   which 3 is the point: every HELD check, none of the landed ones. That is the
//   defect's exact shape — the page corrected itself once the RPC answered, and
//   was wrong until then, which is the whole of the SSR render, the whole of the
//   first paint, the OG image, and everything a reader without JS ever sees.
//   nft 19222, 6589 and 18959 each rendered "This position is closed — the
//   collateral is withdrawn and the debt repaid" over a card face showing their
//   collateral. Restored; checksum verified identical.
//
//   Which is also why the landed mode waits for the response rather than for
//   words to appear: before that wait it read the first paint a second time and
//   went red alongside the held mode, reporting a defect twice and the live lane
//   not at all.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);

const FAMILIES = (process.env.FAMILIES ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const wants = (name) => FAMILIES.length === 0 || FAMILIES.some((f) => name.toLowerCase().includes(f));
if (FAMILIES.length > 0) console.log(`FAMILIES=${FAMILIES.join(",")} — only the matching sections run\n`);

/** One API read, retried — the dev server compiles a route on first hit. */
async function api(path_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path_}`, { cache: "no-store" }).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path_}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path_}`);
}
const rowsOf = (j) => (Array.isArray(j) ? j : (j?.data ?? j?.rows ?? []));

const body = async (page) => (await page.evaluate(() => document.body.textContent ?? "")).replace(/\s+/g, " ");

/** The page's own words, whitespace-flattened, in one of two states.
 *
 *  `textContent` rather than `innerText`: the pane sits in a collapsible, so the
 *  sentence is in the DOM before anyone opens it — which is also how a crawler
 *  and the LLM export read it.
 *
 *    held    the live route is aborted, so the page never gets its RPC read.
 *            That is the SSR state, the first paint, and everything a reader
 *            without JS ever sees.
 *    landed  the live route is allowed AND waited for, then the page is given a
 *            beat to re-render. Without that wait this mode reads the first
 *            paint a second time — the words appear before the RPC answers, so
 *            polling for "has it said anything yet" always wins the race, and
 *            the mode asserts the state it was meant to leave. `landedOk`
 *            reports whether the read arrived, so it can never do so quietly. */
async function narration(page, spec, mode) {
  if (mode === "held") await page.route(spec.liveRoute, (r) => r.abort());
  const live =
    mode === "landed"
      ? page.waitForResponse((r) => r.url().includes(spec.liveMatch), { timeout: 90000 }).catch(() => null)
      : null;
  await page.goto(`${BASE}${spec.href(spec.subject)}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  for (let i = 0; i < 40; i += 1) {
    if (spec.said(await body(page)) != null) break;
    await page.waitForTimeout(500);
  }
  if (mode !== "landed") return { text: await body(page), landedOk: null };
  const res = await live;
  if (res) await page.waitForTimeout(2000);
  return { text: await body(page), landedOk: res != null };
}

// ═══════════════════════════════════════════════════════════════════════════
// The roster. One entry per explorer whose detail page narrates a status.
// ═══════════════════════════════════════════════════════════════════════════
const ROSTER = [
  {
    name: "Fluid",
    index: (qs) => `/api/fluid/positions?${qs}`,
    href: (r) => `/ethereum/fluid/${r.nftId}`,
    id: (r) => `nft ${r.nftId}`,
    narrowLane: "the \u03a3 lane",
    /** The rule that must not decide the word, restated here as a second
     *  implementation — this file never imports what it checks. A row it calls
     *  closed while the index serves it open is a subject.
     *
     *  Fluid: the Σ lane, a principal-flow replay. */
    wouldReadClosed: (r) => Number(r.colNet) <= 1e-9 && Number(r.debtNet) <= 1e-9,
    describe: (r) => `Σ(${r.colNet}, ${r.debtNet}) settled(${r.settled?.supply ?? "—"})`,
    /** The pane narrates from the settled overlay when the live read is absent,
     *  so the held mode can assert the OPEN words, not merely their absence. */
    narratesWithoutLive: true,
    /** Is the lane the status was served FROM still current? The overlay is
     *  stamped by a worker; events land between stamps. A row whose last event
     *  is newer than its overlay block carries a status the chain may already
     *  have moved past, and the page is right to prefer the live read over it —
     *  so such a row proves nothing about the page and is not a subject.
     *  Measured 2026-09-20: nft 16869 was served open at 32,347.96 USDC from an
     *  overlay stamped at block 26020874 while the position had been emptied at
     *  26021015, 141 blocks earlier than the live read that found it at zero. */
    servedFresh: (r) => r.settled?.updatedBlock != null && Number(r.lastBlockNumber) <= Number(r.settled.updatedBlock),
    liveRoute: "**/api/chain/fluid/position**",
    liveMatch: "/api/chain/fluid/position",
    /** Which word the page said, or null while it has said neither yet. Both
     *  panes are covered — the open pane's own closed verdict ("This position is
     *  closed"), and the terminal pane's three leads, which name the pair
     *  between "This" and the verb. */
    said: (t) =>
      t.includes("This position is closed") ||
      t.includes("was emptied by liquidation") ||
      t.includes("ran its course and closed")
        ? "closed"
        : t.includes("This position holds")
          ? "open"
          : null,
    /** The card face's own lifecycle badge, beside the sentence. */
    badgeClosed: (t) => t.includes("CLOSED"),
  },
  {
    // Morpho's gap was not a lane ranking — there was no second lane to rank.
    // The server words status off `collateral_final > 0` on RAW base units and
    // the web re-derived it off `> 1e-6` DISPLAY tokens, a factor of 10\u00b9\u00b2 at 18
    // decimals, which is most of Morpho's collateral. 532 rows across 177
    // markets sat between the two lines: served open, rendered closed, and their
    // collateral zeroed rather than shown (rails-ops TO-DO-ui-jobs.md \u00a746).
    // Fixed 2026-09-20 by the web rendering the word the route filed.
    name: "Morpho Blue",
    index: (qs) => `/api/morpho/positions?${qs}`,
    href: (r) => `/ethereum/morpho/${r.positionId}`,
    id: (r) => `${r.owner.slice(0, 10)}\u2026 in ${r.marketLabel}`,
    narrowLane: "the client's old 1e-6 display-token rule",
    /** The rule that must not decide the word, restated as a second
     *  implementation. `borrowSharesRaw` at 1e6 is the share leg both sides
     *  already agreed on, so a subject differs from the server on collateral
     *  alone \u2014 which is the defect, not a side of it. */
    wouldReadClosed: (r) => Number(r.collateral.amount) <= 1e-6 && Number(r.borrowSharesRaw) <= 1e6,
    describe: (r) => `${r.collateral.amountRaw} raw ${r.collateralSymbol ?? "\u2014"}, ${r.borrowSharesRaw} shares`,
    /** Every row here IS the replay, with no worker stamp between it and its own
     *  events, so nothing can be stale against them. Fluid needs that exclusion
     *  because its served status comes from a stamped overlay. */
    servedFresh: () => true,
    /** The open pane takes the oracle price and the health verdict from the live
     *  read and renders nothing without it (position-view.tsx: `chain ? \u2026 :
     *  undefined`). Declining is the charter-correct answer \u2014 there is no second
     *  lane holding those facts \u2014 so the held mode asserts that the page does not
     *  say CLOSED rather than that it says open, and check 2's badge, which IS
     *  server-rendered, carries the positive half. */
    narratesWithoutLive: false,
    liveRoute: "**/api/chain/morpho/position**",
    liveMatch: "/api/chain/morpho/position",
    /** The open pane's two leads, and the terminal pane's two. */
    said: (t) =>
      t.includes("ran its course and closed") || t.includes("was emptied by liquidation")
        ? "closed"
        : t.includes("This position owes") || t.includes("This position holds")
          ? "open"
          : null,
    /** "CLOSED" only, as Fluid's: the liquidation RECORD is drawn on open cards
     *  too, so a liquidation word here would red a position that is open and
     *  has been liquidated before. */
    badgeClosed: (t) => t.includes("CLOSED"),
  },
];

for (const spec of ROSTER) {
  if (!wants(spec.name)) continue;
  console.log(`\n── ${spec.name} ──────────────────────────────────────────────`);
  const label = (s) => `${spec.name} ${s}`;

  // ── the band, from the index ──────────────────────────────────────────────
  // Walk the open set until enough subjects are in hand or the walk is spent.
  // The band is a small fraction of a large index, so a first page is not a
  // sample of it.
  const band = [];
  let scanned = 0;
  let stale = 0;
  for (let off = 0; off < 1500 && band.length < 3; off += 100) {
    const page_ = rowsOf(await api(spec.index(`status=open&limit=100&offset=${off}`)));
    if (page_.length === 0) break;
    scanned += page_.length;
    for (const r of page_) {
      if (!spec.wouldReadClosed(r)) continue;
      if (!spec.servedFresh(r)) {
        stale += 1;
        continue;
      }
      if (band.length < 3) band.push(r);
    }
  }
  if (stale > 0)
    info(
      label("fixtures"),
      `${stale} band row(s) skipped: their last event is newer than the overlay their status came from`,
    );
  const openTotal = (await api(spec.index("status=open&limit=1")))?.pagination?.total ?? null;
  info(label("fixtures"), `${band.length} band subject(s) in the first ${scanned} of ${openTotal} open positions`);

  if (band.length === 0) {
    // Not a pass. A section over an empty band asserts nothing, and saying so is
    // the only truthful outcome — the band being empty today is a fact about the
    // index, not evidence about the page.
    info(
      label("0. NOT ASSERTED"),
      `no position in the scanned window would read closed under ${spec.narrowLane} — nothing to prove here`,
    );
  } else {
    // The row came back from a `status=open` request, so the FILTER that
    // selected it is the server's. The `status` field on it is whatever the web
    // tier put there. Asserting the two agree is therefore not circular — it is
    // the whole §46 defect in one line, and it goes red on the unfixed tree.
    check(
      label(`0. the band is real — the index serves these open while ${spec.narrowLane} reads closed`),
      band.every((r) => spec.wouldReadClosed(r) && r.status === "open"),
      band.map((r) => `${spec.id(r)} ${spec.describe(r)}`).join("; "),
    );

    const browser = await chromium.launch();
    try {
      for (const subject of band) {
        spec.subject = subject;
        for (const mode of ["held", "landed"]) {
          const when =
            mode === "held"
              ? "with the live read held (first paint, and every non-JS reader)"
              : "after the live read landed";
          const ctx = await browser.newContext();
          const page = await ctx.newPage();
          const { text, landedOk } = await narration(page, spec, mode);
          const said = spec.said(text);
          if (landedOk === false) {
            info(
              label(`1. ${spec.id(subject)} NOT ASSERTED`),
              "the live read never answered, so this mode has nothing of its own to say",
            );
          } else {
            if (mode === "held" && !spec.narratesWithoutLive) {
              // This family's open pane declines to narrate until the live read
              // lands — it has no second lane holding the facts it states, and
              // saying nothing is the charter-correct answer. So the held mode
              // asserts what it can: the page never says the opposite of what
              // the row was served as. Check 2's badge is the positive half
              // here, and it IS server-rendered.
              check(
                label(`1. ${spec.id(subject)} is not narrated CLOSED, ${when}`),
                said !== "closed",
                `served open, page said ${said ?? "nothing yet — this pane waits for the live read"}`,
              );
            } else {
              check(
                label(`1. ${spec.id(subject)} is narrated as it is served, ${when}`),
                said === "open",
                `served open, page said ${said ?? "nothing"}`,
              );
            }
            check(
              label(`2. ${spec.id(subject)} draws no closed badge, ${when}`),
              !spec.badgeClosed(text),
              spec.badgeClosed(text) ? "CLOSED badge on a served-open position" : "no closed badge",
            );
          }
          await ctx.close();
        }
      }

      // ── the negative control ────────────────────────────────────────────────
      const closed = rowsOf(await api(spec.index("status=closed&limit=20"))).find((r) => r.status === "closed");
      if (!closed) {
        info(label("3. NOT ASSERTED"), "the index serves no closed position to control against");
      } else {
        spec.subject = closed;
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const { text } = await narration(page, spec, "held");
        check(
          label(`3. a served-CLOSED position still narrates closed (${spec.id(closed)})`),
          spec.said(text) === "closed",
          `served closed, page said ${spec.said(text) ?? "nothing"} — without this, check 1 passes on a page that never says "closed"`,
        );
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  }
}

console.log(
  failures === 0
    ? `\nALL ${checked} CHECKS PASS — what each position is filed as is what the page says about it`
    : `\n${failures} CHECK(S) FAILED of ${checked}`,
);
process.exit(failures === 0 ? 0 : 1);
