// A position swap an Aave V3 position made through CoW Protocol or ParaSwap draws
// ONE card: the kind's label ("Collateral swap", "Debt swap", "Repay with
// collateral", "Withdraw and swap"), a swap mark on the spine, and "via CoW
// Protocol" or "via ParaSwap" with the venue's mark. The mark sits on the node where both legs stayed in the position,
// and on the flow (a badge on the withdrawn reserve) for a withdraw and swap. The two legs it
// merges never draw their own "to/from CoW Protocol" rows, and on the adapter
// route the one-order contract that owned the Trade is never a party. A ParaSwap
// swap's leftover row (a repay or supply back) draws no row of its own either: it
// nets into its leg (D4). rails-ops TO-DO-ui-jobs §15 is the build; the pairing is
// server migs 243, 245, 247 and 248 and the merge is lib/sources/api/aave-v3-timeline.ts.
//
// Fixtures are pinned by the chain facts that make them swaps, not by counts of
// other events (every wallet is live). Each names its TRANSACTION, and the list
// is paged until that transaction's row is drawn before anything is read: the
// page lands on `TIMELINE_PAGE_ROWS` rows (lib/shared/timeline-opening-balance.ts)
// and the rest is one press, so a wallet that keeps acting sinks its old swap
// below the landing. Read without pressing, 0x56b8a8's debt swap (row 206 on
// 2026-09-25) and 0xf0838f's repay with collateral (row 161) were both off the
// page, and the run reported a card the served history had and the page was
// never asked to draw.
//
// The fixtures:
//   0x81dbec…ad5a tx 0x8a01f2c1…7614 (block 25,971,859): aUSDC → aWETH, permit route
//   0xfe28…5820  tx 0xc2596fc8…078d (block 25,963,602) and a second CoW swap ten
//     blocks from it: both legs of each against GPv2Settlement, permit route
//   0x682ef9…1a88 tx 0x9be7bbcd…d8d8 (block 25,925,650): aUSDC to the order's proxy
//     0xd46c…be79, wstETH supplied on the owner's behalf, adapter route
//   0x56b8a8…6ac1 tx 0xaf0a493a…21c3 (block 25,925,584): debt swap, USDC repaid and
//     WETH borrowed by the order's proxy 0x4545…84d8
//   0xfa356e…95fc tx 0xa3ac83ba…7a6d (block 25,925,977): repay with collateral,
//     aWBTC to the order's proxy 0x51c1…a689, which repaid USDT
//   0xbc8c…3dc4  tx 0x061ae6a7…4d33 (block 25,967,823): withdraw and swap, aEthWETH
//     to GPv2Settlement under the wallet's own order, which bought 1,345.10 USDT
//   0x650e…ee14  tx 0xff98b829…ce9d (block 25,934,997): supply from a swap, the wallet's
//     own order sold 527.237082 USDT for 0.2113 aEthWETH, sent to the position
//   0xb466…f3ff  tx 0x087968de…b520 (block 25,950,831): ParaSwap debt swap, repay
//     16,152.98 EURC, borrow 18,801.83 USDC and 37.53 USDC repaid back, all by
//     ParaSwapDebtSwapAdapterV3GHO 0xd785…b442; the card reads 18,764.31 USDC
//   0xf083…d1d7  tx 0x6e28d6e4…d11a: ParaSwap repay with collateral, 18,749 aWBTC sat
//     sent and 61 supplied back, 14.632443 USDC repaid
//   0xe72b…abcc8 tx 0xa1eee65b…cbd4: ParaSwap collateral swap, aUSDT for USDC
//   0xf6b7…9589  tx 0x803c61bc…47b4 (block 25,425,436): ParaSwap withdraw and swap,
//     913,365 aWBTC sat to ParaSwapWithdrawSwapAdapter 0x78f8…20e0, whose Swapped
//     log bought 0.338803 WETH for the wallet (server mig 254)
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-swap-cards.mjs

import { chromium } from "playwright";
import { PRESS_SHOW_MORE } from "../lib/timeline-draw.mjs";

const BASE = process.env.BASE || "http://localhost:3000";
const COW_ICON = "/icons/protocols/cow.png";
const COW_VENUE = { text: "via CoW Protocol", icon: COW_ICON };
const PARASWAP_VENUE = { text: "via ParaSwap", icon: "/icons/protocols/paraswap.png" };
const VENUES = [COW_VENUE, PARASWAP_VENUE];
const SWAP_NODE = '[role="img"][aria-label="Swap"]';
const KIND_LABEL = /Collateral swap|Debt swap|Repay with collateral|Withdraw and swap|Supply from a swap/;

const FIXTURES = [
  {
    label: "aave-v3 core 0x81dbec (permit route)",
    path: "/ethereum/aave-v3/0x81dbec9d661cdbe17650a6cbb9098ccf3eabad5a?market=core",
    tx: "0x8a01f2c1",
    minCards: 1,
    kind: "Collateral swap",
  },
  {
    label: "aave-v3 core 0xfe28 (two permit swaps)",
    path: "/ethereum/aave-v3/0xfe28854b855ab09a47adbd893a5f580cdffc5820?market=core",
    tx: "0xc2596fc8",
    minCards: 2,
    kind: "Collateral swap",
  },
  {
    label: "aave-v3 core 0x682ef9 (adapter route)",
    path: "/ethereum/aave-v3/0x682ef980b9732fc7606d2632339fe2d8fedf1a88?market=core",
    tx: "0x9be7bbcd",
    minCards: 1,
    kind: "Collateral swap",
    // The per-order proxy that owned the Trade: never named on the page.
    neverNamed: "0xd46c",
  },
  {
    label: "aave-v3 core 0x56b8a8 (debt swap)",
    path: "/ethereum/aave-v3/0x56b8a8dfae36edd33df91606fe4ece49e4d76ac1?market=core",
    tx: "0xaf0a493a",
    minCards: 1,
    kind: "Debt swap",
    axis: "debt",
    neverNamed: "0x4545",
  },
  {
    label: "aave-v3 core 0xfa356e (repay with collateral)",
    path: "/ethereum/aave-v3/0xfa356e93d17a5d80dc1d64e3d181009e594295fc?market=core",
    tx: "0xa3ac83ba",
    minCards: 1,
    kind: "Repay with collateral",
    axis: "mixed",
    neverNamed: "0x51c1",
  },
  {
    label: "aave-v3 core 0xbc8c (withdraw and swap)",
    path: "/ethereum/aave-v3/0xbc8c609e7df8658dc9c494434058e6389fef3dc4?market=core",
    tx: "0x061ae6a7",
    minCards: 1,
    kind: "Withdraw and swap",
    mark: "flow",
  },
  {
    label: "aave-v3 core 0x650e (supply from a swap)",
    path: "/ethereum/aave-v3/0x650e0262d165bcfcbd6fb78cedf083089bcbee14?market=core",
    tx: "0xff98b829",
    minCards: 1,
    kind: "Supply from a swap",
    mark: "flow",
  },
  {
    label: "aave-v3 core 0xb466 (ParaSwap debt swap, leftover repaid back)",
    path: "/ethereum/aave-v3/0xb466d8e3e4873b43730950911fc1a7a19603ff3e?market=core",
    tx: "0x087968de",
    minCards: 1,
    kind: "Debt swap",
    axis: "debt",
    venue: PARASWAP_VENUE,
    // D4: the open card reads the Borrowed balance ending at the net 18,76x (the
    // gross borrow alone would end at 18.8K), the Borrow row at its gross, and the
    // leftover as its own "Repaid back" row. The balance is the exact one read when
    // the card opens (rails-ops TO-DO-ui-jobs §19) and is stated by the position
    // block's Borrowed row alone (§47), so the account beneath it shows too.
    readsWhenOpen: [/Borrowed .*\b0 18,76\d\b/, "Borrow 18.8K", "Repaid back 37.528", "Health factor"],
  },
  {
    label: "aave-v3 core 0xf0838f (ParaSwap repay with collateral, leftover supplied back)",
    path: "/ethereum/aave-v3/0xf0838f0fb5daaf808cf1ebad6c09460e1701d1d7?market=core",
    tx: "0x6e28d6e4",
    minCards: 1,
    kind: "Repay with collateral",
    axis: "mixed",
    venue: PARASWAP_VENUE,
  },
  {
    label: "aave-v3 core 0xe72b71 (ParaSwap collateral swap)",
    path: "/ethereum/aave-v3/0xe72b71f97a4ceb0077e468054b788163e72abcc8?market=core",
    tx: "0xa1eee65b",
    minCards: 1,
    kind: "Collateral swap",
    venue: PARASWAP_VENUE,
  },
  {
    label: "aave-v3 core 0xf6b75b (ParaSwap withdraw and swap)",
    path: "/ethereum/aave-v3/0xf6b75b0475d09e4a92e4316185c383d74a9d9589?market=core",
    tx: "0x803c61bc",
    minCards: 1,
    kind: "Withdraw and swap",
    venue: PARASWAP_VENUE,
    mark: "flow",
    // The bought WETH has no position row: it reads from the adapter's Swapped log,
    // so it keeps its grid cell. The WBTC it sold is stated by the position block's
    // Supplied row (§47), exact, interest to the block included: 0.00913 down to 0.
    // The pattern stopped requiring the amounts to follow "Supplied" directly on
    // 2026-09-25 — 30d7665 groups that panel under "Collateral on" / "Collateral
    // off" headings, which now sit between the two. The panel and the figures are
    // what the check is about, and both still read.
    readsWhenOpen: [/Supplied\b.{0,200}?\b0\.00913 0\b/, "Bought 0.339", "Total collateral"],
  },
];

/** Presses allowed before a transaction is called undrawable. The served window
 *  is TIMELINE_WINDOW_ROWS (1,000) and a press paints TIMELINE_PAGE_ROWS (50),
 *  so twenty reaches the bottom of it; the rest is slack. */
const PRESSES_MAX = 30;

/** Is the fixture's transaction drawn? The row's `data-event-id` is Aave V3's
 *  own event key, `action:contract:txHash:logIndex`, so the hash is in it. */
const rowDrawn = (page, tx) =>
  page.evaluate(
    (t) =>
      [...document.querySelectorAll("[data-event-id]")].some((e) =>
        (e.getAttribute("data-event-id") ?? "").includes(t),
      ),
    tx,
  );

/** Page the list until the fixture's transaction is on it. Returns the presses
 *  it took, or −1 when the transaction never arrived. */
async function drawUntilTx(page, tx) {
  for (let presses = 0; presses <= PRESSES_MAX; presses++) {
    if (await rowDrawn(page, tx)) return presses;
    if (!(await page.evaluate(PRESS_SHOW_MORE))) {
      await page.waitForTimeout(600);
      if (!(await page.evaluate(PRESS_SHOW_MORE))) break;
    }
    await page.waitForTimeout(400);
  }
  return (await rowDrawn(page, tx)) ? PRESSES_MAX : -1;
}

const only = process.env.FIXTURES ? new RegExp(process.env.FIXTURES) : null;
let pass = 0;
let fail = 0;
const ok = (msg) => {
  pass++;
  console.log(`PASS  ${msg}`);
};
const bad = (msg) => {
  fail++;
  console.log(`FAIL  ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

for (const fx of FIXTURES) {
  if (only && !only.test(fx.label)) continue;
  let read;
  let presses = 0;
  try {
    await page.goto(`${BASE}${fx.path}`, { waitUntil: "load", timeout: 120000 });
    // Wait on the swap node itself: a page on a build without the merge draws
    // the two legs instead and never shows one, which is the failure to catch.
    await page.waitForSelector(SWAP_NODE, { timeout: 90000 }).catch(() => null);
    await page.waitForTimeout(1500);
    presses = await drawUntilTx(page, fx.tx);
    if (presses < 0) bad(`${fx.label}: ${fx.tx}… is drawn by no row in the served window`);
    else ok(`${fx.label}: ${fx.tx}… is drawn (${presses} press${presses === 1 ? "" : "es"})`);
    await page.waitForTimeout(500);
    read = await page.evaluate(
      ({ swapNode, kindLabel, neverNamed }) => {
        const chipsIn = (root) =>
          [...root.querySelectorAll("span.text-rb-500")]
            .filter((s) => /^(to|from|via|by)$/.test((s.textContent || "").trim()))
            .map((p) => {
              const chip = p.parentElement;
              const icon = chip.querySelector("img[data-party-icon]");
              return {
                prefix: (p.textContent || "").trim(),
                text: (chip.textContent || "").replace(/\s+/g, " ").trim(),
                icon: icon ? new URL(icon.getAttribute("src"), location.href).pathname : null,
              };
            });
        // A card is the nearest ancestor of a swap node that holds exactly one
        // swap node and at least one party chip: the spine column and the header
        // are sibling subtrees of the same card.
        const cards = [...document.querySelectorAll(swapNode)].map((node) => {
          let el = node.parentElement;
          while (el && !(el.querySelectorAll(swapNode).length === 1 && chipsIn(el).length > 0)) el = el.parentElement;
          if (!el || el.querySelectorAll(swapNode).length !== 1) return null;
          return {
            chips: chipsIn(el),
            label: ((el.textContent || "").match(new RegExp(kindLabel)) || [])[0] ?? null,
            mark: node.getAttribute("data-swap-mark"),
            // rails-ops TO-DO-ui-jobs §19: the node glyph's axis hues, the legs stacked beside it, and
            // no disc behind it.
            axis: node.getAttribute("data-swap-axis"),
            legs: [...(node.parentElement?.querySelectorAll("[data-swap-legs] > span") ?? [])].map((l) =>
              (l.textContent || "").trim(),
            ),
            filled: getComputedStyle(node).backgroundColor !== "rgba(0, 0, 0, 0)",
            text: (el.textContent || "").replace(/\s+/g, " ").trim(),
          };
        });
        const pageChips = chipsIn(document);
        return {
          cards,
          cowTransferChips: pageChips
            .filter((c) => /^(to|from)\s*(CoW Protocol|ParaSwap .*adapter)$/.test(c.text))
            .map((c) => c.text),
          // Rendered text only: the page's serialized payload (a <script>) carries
          // the Trade's owner as data, which names nobody to a reader.
          named: neverNamed ? (document.body.innerText || "").toLowerCase().includes(neverNamed) : false,
        };
      },
      { swapNode: SWAP_NODE, kindLabel: KIND_LABEL.source, neverNamed: fx.neverNamed ?? null },
    );
  } catch (err) {
    bad(`${fx.label}: threw during the run — ${err && err.message}`);
    continue;
  }

  const cards = read.cards.filter(Boolean);
  if (cards.length < fx.minCards) {
    bad(`${fx.label}: ${cards.length} swap card(s) drawn, expected at least ${fx.minCards}`);
  } else {
    ok(`${fx.label}: ${cards.length} swap card(s) drawn`);
  }
  if (read.cards.length !== cards.length) bad(`${fx.label}: a swap node sits outside any card with a party chip`);

  cards.forEach((card, i) => {
    const via = card.chips.filter((c) => c.prefix === "via");
    const others = card.chips.filter((c) => c.prefix !== "via");
    if (!card.label) bad(`${fx.label}: card ${i + 1} reads no swap kind`);
    const venueText = via.length === 1 ? via[0].text.replace(/^via\s*/, "via ") : null;
    const venue = VENUES.find((v) => v.text === venueText);
    card.venue = venue ?? null;
    if (!venue) {
      bad(`${fx.label}: card ${i + 1} venue chip is ${via.map((c) => c.text).join(" | ") || "absent"}`);
    } else if (via[0].icon !== venue.icon) {
      bad(`${fx.label}: card ${i + 1} venue chip mark is ${via[0].icon ?? "none"}, expected ${venue.icon}`);
    } else if (others.length > 0) {
      bad(`${fx.label}: card ${i + 1} also carries ${others.map((c) => c.text).join(" | ")}`);
    } else {
      ok(`${fx.label}: card ${i + 1} reads "${card.label}" ${venue.text} with its mark, no other party`);
    }
  });
  // The fixture's own kind is drawn at its own venue.
  const wantVenue = fx.venue ?? COW_VENUE;
  if (cards.some((c) => c.label === fx.kind && c.venue === wantVenue))
    ok(`${fx.label}: a "${fx.kind}" card reads ${wantVenue.text}`);
  else bad(`${fx.label}: no "${fx.kind}" card reads ${wantVenue.text}`);
  // The fixture's own kind wears its mark where the grammar puts it: the node
  // for a swap that stayed in the position, the flow for a withdraw and swap.
  const want = fx.mark ?? "node";
  const own = cards.filter((c) => c.label === fx.kind);
  if (own.length && own.every((c) => c.mark === want))
    ok(`${fx.label}: each "${fx.kind}" card wears the swap mark on the ${want}`);
  else if (own.length)
    bad(
      `${fx.label}: a "${fx.kind}" card's swap mark is on the ${own.map((c) => c.mark ?? "none").join(", ")}, expected ${want}`,
    );
  // rails-ops TO-DO-ui-jobs §19: a node swap draws a bare glyph in its axis hues, with both legs,
  // amounts and all, beside it (Timeline values are on by default).
  if (want === "node" && own.length) {
    const wantAxis = fx.axis ?? "supply";
    if (own.every((c) => c.axis === wantAxis)) ok(`${fx.label}: each "${fx.kind}" glyph reads the ${wantAxis} axis`);
    else
      bad(
        `${fx.label}: a "${fx.kind}" glyph reads ${own.map((c) => c.axis ?? "none").join(", ")}, expected ${wantAxis}`,
      );
    if (own.every((c) => c.legs.length === 2 && c.legs.every((t) => /\d/.test(t))))
      ok(`${fx.label}: each "${fx.kind}" node carries its two legs (${own[0].legs.join(" | ")})`);
    else bad(`${fx.label}: a "${fx.kind}" node's legs read ${own.map((c) => `[${c.legs.join(" | ")}]`).join(", ")}`);
    if (own.some((c) => c.filled)) bad(`${fx.label}: a "${fx.kind}" swap node still has a filled disc`);
    else ok(`${fx.label}: no "${fx.kind}" swap node has a filled disc`);
  }
  if (fx.readsWhenOpen) {
    const reads = (t, want) => (want instanceof RegExp ? want.test(t) : t.includes(want));
    const wanted = fx.readsWhenOpen.map(String).join(" and ");
    // The fixture's own transaction, not whichever card of that kind the page
    // drew first: a press can put a second one above it.
    const candidates = page
      .locator(`[data-event-id*="${fx.tx}"]`)
      .filter({ hasText: fx.kind })
      .filter({ hasText: wantVenue.text.replace(/^via /, "") });
    const n = Math.min(await candidates.count(), 5);
    const opened = [];
    for (let i = 0; i < n; i++) {
      const card = candidates.nth(i);
      await card
        .locator('[role="button"]')
        .first()
        .click()
        .catch(() => {});
      // The balances are read when the card opens: wait for that answer, not for
      // text the card draws before it.
      await card
        .locator('[data-position-state="ready"], [data-position-state="unavailable"]')
        .first()
        .waitFor({ timeout: 60000 })
        .catch(() => {});
      opened.push(((await card.innerText().catch(() => "")) || "").replace(/\s+/g, " "));
    }
    if (opened.some((t) => fx.readsWhenOpen.every((want) => reads(t, want))))
      ok(`${fx.label}: an open "${fx.kind}" card reads ${wanted}`);
    else
      bad(
        `${fx.label}: no open "${fx.kind}" card reads ${wanted} (opened ${n}: ${opened.map((t) => t.slice(0, 300)).join(" | ") || "none"})`,
      );
    if (opened.some((t) => t.includes("Position state isn’t available")))
      bad(`${fx.label}: an open "${fx.kind}" card says its position state isn't available`);
  }
  if (cards.some((c) => c.label === fx.kind)) ok(`${fx.label}: a card reads "${fx.kind}"`);
  else
    bad(
      `${fx.label}: no card reads "${fx.kind}" (read: ${[...new Set(cards.map((c) => c.label))].join(", ") || "none"})`,
    );

  if (read.cowTransferChips.length > 0) {
    bad(`${fx.label}: a swap leg still draws its own row (${read.cowTransferChips.join(" | ")})`);
  } else {
    ok(`${fx.label}: no leg draws its own "to/from CoW Protocol" row`);
  }
  if (fx.neverNamed) {
    if (read.named) bad(`${fx.label}: the order's adapter ${fx.neverNamed}… is named on the page`);
    else ok(`${fx.label}: the order's adapter ${fx.neverNamed}… is never named`);
  }
}

await browser.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (pass + fail === 0) {
  console.log("No checks ran — a verdict over zero checks is not a pass.");
  process.exit(1);
}
process.exit(fail === 0 ? 0 : 1);
