#!/usr/bin/env node
// The allocation band on a holder's MetaMorpho timeline, checked against the
// chain rather than against itself. /base/morpho/vaults/<vault>?holder=<address>.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ. The page states a
// block; this script then makes its OWN two `eth_getLogs` to that block to find
// the address's own event blocks, and at EACH of those blocks its OWN
// `withdrawQueueLength()` and `withdrawQueue(i)` walk on the vault, its OWN
// `position(id, vault)` and `market(id)` on the Morpho Blue singleton, its OWN
// `balanceOf` and `totalSupply()`, and rebuilds every leg from them. The page's
// legs are then compared against that, wei-exact, from the API route's raw
// units. Nothing is asserted against a figure copied out of a plan or a header.
//
// AN EXPECTATION NEVER COMES FROM THE THING UNDER TEST. The one thing taken
// from the page is the block number it states, which is check 0's subject. The
// fixtures are INPUTS — which vault, which address, which shape to expect —
// never expected values.
//
// ⚠️ A FIXTURE THAT HAS EXITED IS A FAILURE, NEVER A SKIP. Check 0e asserts the
// case-study fixture still holds a positive balance and still has its
// zero-balance row and its queue-length change, because every check below rests
// on those and a silent pass would hide their loss.
//
// WEI-EXACT FROM THE ROUTE, GEOMETRY AND COLOUR FROM THE DOM. Sections 1–4 read
// /api/chain/morpho-base/vault, which serves the same loader in raw units.
// Sections 6 and 7 read the RENDERED DOM — the band's segments, their stamped
// raw figures, their inline widths and their computed background colours —
// never the RSC payload.
//
// ── 2026-09-08 · THE POSITION HAS A PATH, AND THE ROWS COLLAPSE ────────────
// `/base/morpho/vaults/<vault>?holder=<h>` 307s to `/base/morpho/vaults/<vault>/<h>` and the
// browser follows it, so every page read here is the POSITION page and every
// assertion is unchanged. What did have to move is the EXPANSION: the rows ride
// `ChainTruthTimeline`, a stretch of consecutive same-kind rows is painted as
// one collapsed folder, and its members' allocation panels are not mounted
// until it is opened. The reader opens them now, before the rows — see the note
// in `readPage`. 58/58 · 1 SKIP, the tally this file had before the move.
//
// Run:
//   BASE=http://localhost:3771 node scripts/verify/verify-morpho-base-vault-allocation-timeline.mjs
// Needs BASE_BACKFILL_RPC_URL in .env.local (read, never printed) — the same
// lane the reader names, and the only Base lane that answers a whole-life
// `eth_getLogs` at all.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   0  each sampled page answers 200, states a block near this script's own
//      head, and the fixtures still have the shapes every section below needs
//   1  this script's OWN withdraw-queue walk and its OWN Blue reads at each of
//      the fixture's own event blocks reproduce the page's every leg wei-exact
//      — the market ids, their queue order, the vault's supply in each and this
//      address's attributed slice — INCLUDING the block where the queue's own
//      length changes 5 → 6 inside one life
//   2  Σ attributed ≤ this script's own `convertToAssets(balanceOf)` at every
//      row, and the identity `attributed = balanceOf × vaultSupplied ÷
//      totalSupply` (floor) holds per leg against THIS SCRIPT's own operands
//   3  the market that reads zero on some rows and non-zero on another is
//      PRESENT on every one of them — a zero is a reading and never an absence
//   4  the zero-balance row draws an EMPTY, LABELLED band while the vault's own
//      allocation at that same block is non-zero, read by this script
//   5  the loader's source names no `Reallocate` event, in any form — the rule
//      that allocation is replayed from Blue's own rows, made mechanical
//   6  collapse degrades correctly on a 20-plus-leg vault: the collected
//      segment's stated sum equals this script's own Σ over the legs it names,
//      every collected leg is smaller than every drawn one, no drawn segment is
//      also collected, each drawn segment's WIDTH is its own share of this
//      script's own total, and the row's panel lists every leg uncollected
//   7  no segment carries a hue outside the neutral ramp: every segment's
//      computed background, composited by the browser itself, is within a few
//      parts in 255 of grey, and the ramp's steps are distinct
//   8  no USD, no APY, no annualised figure, no rate of return, and no total
//      across assets in the allocation surface
//   9  locale: every figure en-US, every date en-GB UTC
//  10  the dev provenance tripwire reports no uncovered figure with every band
//      and every panel expanded
//  11  an unread leg is stated as unread — SKIPPED OUT LOUD where no fixture
//      produces one, rather than passed vacuously
//
// ── PROVED IT CAN FAIL, 2026-09-07, BASE=http://localhost:3771 ──────────────
// Restored run: 58/58 · 1 SKIP (11a, and its SKIP is a finding — see below).
// Nine breaks, applied one at a time and reverted. Nothing on this path is
// cached — the page reads at one block per request and the three waves run on
// the request — so no cache had to be cleared between them.
//
//  B1  the reader attributed with the FIRST block's `totalSupply()` on every
//      row instead of each row's own. 49/56 (before B8's repair added two
//      checks). FAIL 1a on both vaults ("blk 48672755 0x9103c3b4…191836
//      attributed: page 3123846754305 vs own 749606287447"), 2a on both
//      ("blk 48672755: Σ attributed 3138313696459 > own
//      convertToAssets(balanceOf) 753077812224"), 2b on both, and 6c
//      ("band 0: collected sum 66891384 vs own Σ over its 5 ids 88857535").
//      🔑 3, 4, 7, 9 and 10 stayed GREEN, correctly: which markets are present,
//      which row is empty, what colour a segment is and what the copy says are
//      four claims a wrong denominator does not touch.
//      🔑 2a reddened on only ONE of the wide vault's five rows — a frozen
//      denominator is only too SMALL where the supply later grew, so the
//      ≤-claim check catches the break where it overstates and 2b catches it
//      everywhere. Two checks, two reaches.
//  B2  the reader dropped every leg whose `vaultSupplied` read zero. 48/56.
//      FAIL 3b ("absent at blocks 48672755, 39868618, 39320436, …"), 3c
//      ("page 1/0 vs own 1/7"), 3d ("1 of 8 panels"), and with them 1a, 1b, 6d
//      and 10d. 🔑 4 stayed GREEN: on the zero-BALANCE row every leg has a
//      non-zero supply, so nothing was dropped there — the two zeros are
//      different zeros and the checks see them separately.
//  B3  the band collected the LARGEST segment instead of the tail. 55/56, FAIL
//      6b only ("0 of 5 bands carry a collected segment"). 🔑 THIS IS A FINDING
//      ABOUT THE BUILD, not a weak check: with one leg collected the reader's
//      own "one leftover is not a group" rule moved it back into the drawn set,
//      so the break could not take effect. B3b is the real break.
//  B3b the band collected the two largest. 54/56. FAIL 6c ("band 0: collected
//      leg 0x54cf9be5…0b7354 (3799744216) is LARGER than a drawn one (223)")
//      and 6e ("band 2: 13 drawn segments under the 2% floor").
//  B4  one segment painted `bg-blue-500`. 55/56. FAIL 7a ("band 0
//      0x9103…1836: rgb(59, 130, 246) → channel spread 187, tolerance 12").
//      Everything else green: a colour is its own claim. The check composites
//      the colour in the browser's own canvas, so `oklab`, `color-mix` and
//      `rgba` all arrive as bytes and the test is on the pixel a reader sees.
//  B5  a "Total exposure across these markets" line added to each panel.
//      54/56, FAIL 8c on both vaults. 🔑 10a stayed green — the total sat in a
//      SENTENCE, which the provenance tripwire is right not to flag, so the
//      only thing that catches an addition of this shape is a check that looks
//      for it by name.
//  B6  the empty band's label dropped, leaving a blank track. 55/56, FAIL 4d
//      ("no label rendered"). 4c stayed green: the band was still empty, and
//      "empty" and "says it is empty" are two claims.
//  B7  `ReallocateSupply`'s fragment added to the allocation reader. 55/56,
//      FAIL 5a. The scan strips comments first, because all three files state
//      the rule in prose and the rule's own words must not read as a breach.
//  B8  the row's queue-change sentence compared against the row AFTER it on
//      screen — the NEWER one — instead of the earlier one.
//      🔑🔑 GREEN AT FIRST, 56/56, AND THAT WAS A FAULT IN THIS SCRIPT. The
//      check counted the sentences page-wide and matched their wording, and a
//      queue change is SYMMETRIC between two adjacent rows: comparing the wrong
//      way round produces the same number of sentences, the same wording, and
//      only a different block NAMED inside them. 10d and 10e were rewritten to
//      run per row, against the block this script's own walk says is the
//      earlier one and the market ids its own walk saw move. Re-run under the
//      same break: 55/58, FAIL 10d ("page rows [3], own walk rows [2]") and
//      10e ("row 2 (blk 47276397): names block(s) 50283585 vs this script's own
//      EARLIER row 46162976"). A check that cannot see direction is not a check
//      about direction.
//  B9  the band's widths taken from `vaultSupplied` instead of `attributed` —
//      the vault's allocation drawn where the address's slice belongs. 55/58.
//      FAIL 4c ("band 1: 4 segments, empty=false"), 4d, and 6c. 🔑 This is the
//      most misleading break of the nine and the zero-balance row is what
//      catches it: an address holding nothing would have been shown a full band
//      about somebody else's money.
//
// ── 11a SKIPS OUT LOUD ──────────────────────────────────────────────────────
// Every leg on every sampled row answered, on both vaults, so the unread-leg
// branch is written and untested rather than wrong. It cannot be forced without
// breaking the lane on purpose, and a check that manufactured its own subject
// would be checking itself. 11b guards the other half and is NOT vacuous: it
// asserts a leg that read ZERO prints a zero rather than "not read", so the two
// words can never become one.

import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector } from "viem";
import { base } from "viem/chains";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_URL = process.env.BASE ?? "http://localhost:3771";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.BASE_BACKFILL_RPC_URL) throw new Error("need BASE_BACKFILL_RPC_URL in .env.local");

// ── the sample ──────────────────────────────────────────────────────────────
// Two vaults, and they are two for the reason §6.4 gives: the case study runs
// five to six markets and draws every one of them, while the wide vault runs
// twenty-plus and cannot, so only the second exercises collapse at all. A
// sample of one would have left the collapse path written and untested.
const CASE_STUDY = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";
const CASE_HOLDER = "0xaa3e1a91fc83723e527062ff929a357354d10dcb";
// Steakhouse High Yield USDC v1.1 — the widest withdraw queue in the catalogue.
const WIDE_VAULT = "0xbeefa7b88064feef0cee02aaebbd95d30df3878f";
// Pinned by sweeping that vault's own `Transfer` stream for a party that is
// neither end zero, keeping the ones that still hold, and taking a short life:
// five logs at five blocks, all with a queue of twenty-one or more.
const WIDE_HOLDER = "0xe3cdeaf7edbb6bb276fa22ddf4c31b95fe0e321d";

/** The market that enters and leaves this holder's own reading — INPUT, not an
 *  expected value. §4.5 of the plan names it as a market that leaves the queue;
 *  measured, it stays in the queue the whole life and its BALANCE is what moves,
 *  which is the same check with a different subject: present with zero on most
 *  rows, present with a real balance on one, absent from none. */
const MOVING_MARKET = "0x38c846197ac32a752a60c25d4536ebb0c3920c532e9a859c38c91efb7b8c2abb";
/** The collapse rule this script holds the page to, restated here rather than
 *  read out of the source: an expectation read from the thing under test cannot
 *  catch a change to it. Its own value is not asserted — what is asserted is
 *  that the SMALLEST are the collected ones. */
const MIN_SEGMENT_SHARE = 0.02;
/** How wide a queue check 6 needs before it is worth calling a collapse test. */
const WIDE_QUEUE_FLOOR = 20;
/** How far from grey a segment's composited colour may sit, in parts of 255.
 *  A saturated hue is two orders of magnitude past this even at the ramp's
 *  faintest step; the page's own ink is under one part. */
const NEUTRAL_TOLERANCE = 12;

const client = createPublicClient({
  chain: base,
  // The lane meters by compute units PER SECOND, so one big batch costs the same
  // as many small ones and spends it all in an instant. Eight calls a request
  // and four requests in flight is what it takes without complaint.
  transport: http(env.BASE_BACKFILL_RPC_URL, {
    batch: { batchSize: 8, wait: 20 },
    retryCount: 3,
    retryDelay: 900,
    timeout: 120_000,
  }),
});

const TRANSFER = toEventSelector(
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
);

const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function withdrawQueueLength() view returns (uint256)",
  "function withdrawQueue(uint256) view returns (bytes32)",
  "function asset() view returns (address)",
]);
const BLUE_ABI = parseAbi([
  "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);
const ERC20_ABI = parseAbi(["function decimals() view returns (uint8)"]);
const BLUE = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";
const ZERO = BigInt(0);

let failures = 0;
let passes = 0;
let skipped = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const skip = (name, why) => {
  console.log(`SKIP  ${name} — ${why}`);
  skipped++;
};

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const shortId = (id) => `${id.slice(0, 10)}…${id.slice(-6)}`;
const pad32 = (a) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const hex = (n) => `0x${BigInt(n).toString(16)}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const isThroughput = (e) => /compute units|429|rate limit/i.test(`${e?.details ?? ""} ${e?.message ?? ""}`);
async function rpc(fn, what) {
  let last;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isThroughput(e)) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw new Error(`${what} did not answer — the lane refused eight attempts: ${last?.details ?? last?.message}`);
}
const call = (args) => rpc(() => client.readContract(args), `${args.functionName}()`);
const getLogs = (address, topics, toBlock, fromBlock = 0) =>
  rpc(
    () =>
      client.request({
        method: "eth_getLogs",
        params: [{ address, topics, fromBlock: hex(fromBlock), toBlock: hex(toBlock) }],
      }),
    "eth_getLogs",
  );

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ── this script's OWN allocation read, from the contracts ───────────────────

/**
 * The withdraw queue and every leg of it at one block, built here from this
 * script's own calls. Deliberately written a second time rather than imported:
 * a check whose expectation runs the code under test proves only that the code
 * agrees with itself.
 */
async function ownAllocationAt(vault, holder, blockNumber) {
  const [queueLength, totalSupply, balance] = await Promise.all([
    call({ address: vault, abi: VAULT_ABI, functionName: "withdrawQueueLength", blockNumber }),
    call({ address: vault, abi: VAULT_ABI, functionName: "totalSupply", blockNumber }),
    call({ address: vault, abi: VAULT_ABI, functionName: "balanceOf", args: [holder], blockNumber }),
  ]);
  const n = Number(queueLength);
  const ids = await mapLimit(
    Array.from({ length: n }, (_, i) => i),
    4,
    (i) => call({ address: vault, abi: VAULT_ABI, functionName: "withdrawQueue", args: [BigInt(i)], blockNumber }),
  );
  const legs = await mapLimit(ids, 4, async (id, queueIndex) => {
    const [position, market, params] = await Promise.all([
      call({ address: BLUE, abi: BLUE_ABI, functionName: "position", args: [id, vault], blockNumber }),
      call({ address: BLUE, abi: BLUE_ABI, functionName: "market", args: [id], blockNumber }),
      call({ address: BLUE, abi: BLUE_ABI, functionName: "idToMarketParams", args: [id], blockNumber }),
    ]);
    const supplied = market[1] === ZERO ? ZERO : (position[0] * market[0]) / market[1];
    const attributed = totalSupply === ZERO ? ZERO : (balance * supplied) / totalSupply;
    return {
      marketId: id.toLowerCase(),
      queueIndex,
      supplyShares: position[0],
      totalSupplyAssets: market[0],
      totalSupplyShares: market[1],
      supplied,
      attributed,
      isIdle: params[1].toLowerCase() === ZERO_ADDR && params[2].toLowerCase() === ZERO_ADDR,
      lltv: params[4],
    };
  });
  const claim =
    balance > ZERO
      ? await call({ address: vault, abi: VAULT_ABI, functionName: "convertToAssets", args: [balance], blockNumber })
      : ZERO;
  return {
    blockNumber: Number(blockNumber),
    queueLength: n,
    totalSupply,
    balance,
    claim,
    legs,
    allocated: legs.reduce((s, l) => s + l.supplied, ZERO),
  };
}

/** This address's own event blocks, from this script's own sweeps. */
async function ownEventBlocks(vault, holder, toBlock) {
  const [out, inn] = await Promise.all([
    getLogs(vault, [TRANSFER, pad32(holder), null], toBlock, 0),
    getLogs(vault, [TRANSFER, null, pad32(holder)], toBlock, 0),
  ]);
  const blocks = [...new Set([...out, ...inn].map((l) => BigInt(l.blockNumber).toString()))]
    .map((b) => BigInt(b))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { blocks, logs: out.length + inn.length };
}

// ── the page and the route ──────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 2600 } });

async function readApi(vault, holder) {
  const res = await fetch(`${BASE_URL}/api/chain/morpho-base/vault?vault=${vault}&holder=${holder}`);
  if (res.status !== 200) return { status: res.status, body: null };
  return { status: res.status, body: await res.json() };
}

async function readPage(vault, holder) {
  const page = await context.newPage();
  const url = `${BASE_URL}/base/morpho/vaults/${vault}?holder=${holder}`;
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  const status = res?.status() ?? 0;
  if (status !== 200) {
    await page.close();
    return { url, status };
  }
  await page.waitForSelector("[data-vault-timeline-rows]", { timeout: 120_000 }).catch(() => {});
  const blockNumber = Number(await page.locator("[data-vault-block]").first().getAttribute("data-vault-block"));

  // The bands, in the page's own row order (newest first), each with its
  // segments' STAMPED RAW figures, inline widths and composited colours. The
  // colour is composited by the browser itself onto white and onto black, so a
  // `color-mix`, an `oklab` and an `rgba` all come back as bytes and the check
  // is on the pixel a reader would see rather than on a CSS string.
  const bands = await page.locator("[data-alloc-bar]").evaluateAll((bars) =>
    bars.map((bar) => {
      const paint = (css) => {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 1;
        const ctx = cv.getContext("2d");
        const over = (bg) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, 1, 1);
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        const w = over("#ffffff");
        const b = over("#000000");
        const spread = (p) => Math.max(...p) - Math.min(...p);
        return { css, onWhite: w, onBlack: b, spread: Math.max(spread(w), spread(b)) };
      };
      return {
        segments: Number(bar.getAttribute("data-alloc-segments")),
        empty: bar.hasAttribute("data-alloc-empty"),
        legs: [...bar.querySelectorAll("[data-alloc-segment]")].map((el) => {
          const fill = el.querySelector("span[title]") ?? el.querySelector("span");
          return {
            key: el.getAttribute("data-alloc-segment"),
            collected: el.hasAttribute("data-alloc-collected"),
            attributed: el.getAttribute("data-alloc-attributed"),
            queueIndex: el.getAttribute("data-alloc-queue-index"),
            collectedCount: el.getAttribute("data-alloc-collected-count"),
            collectedSum: el.getAttribute("data-alloc-collected-sum"),
            collectedIds: el.getAttribute("data-alloc-collected-ids"),
            widthPct: parseFloat(el.style.width),
            title: fill?.getAttribute("title") ?? "",
            colour: fill ? paint(getComputedStyle(fill).backgroundColor) : null,
          };
        }),
      };
    }),
  );
  const emptyLabels = await page.locator("[data-alloc-empty-label]").allTextContents();
  const summaries = await page.locator("[data-figure='row-allocation-summary']").allTextContents();
  const ruleTexts = await page.locator("[data-figure='allocation-rule']").allTextContents();

  // ── 2026-09-08 · THE RUNS ARE OPENED FIRST ───────────────────────────────
  // The rows ride `ChainTruthTimeline` now (rails-ops plan D11), so a stretch
  // of consecutive same-kind rows is painted as ONE collapsed folder and its
  // members are not in the document at all. A panel that is not mounted is not
  // a panel that says nothing — it is a row this script never saw — so every
  // run is opened by the reader's own click before the rows are, and the
  // panels below are then the whole life's. The labels flip from "expand the
  // run" to "collapse" as they open, which is what stops the loop.
  //     FAIL 10d — "page rows [], own walk rows [2]" (case study) and
  //                "page rows [1], own walk rows [1, 2]" (wide vault)
  //     🔑 The wide vault's line is the one that reads clearly: ONE of its two
  //     queue-change rows was inside a folder, so the check saw a page that
  //     stated the sentence on some rows and not others — which is exactly the
  //     fault it exists to catch, produced by a page that was right.
  for (let guard = 0; guard < 40; guard++) {
    const toOpen = page.locator("[data-vault-timeline-rows] [aria-label*='expand the run']");
    if ((await toOpen.count()) === 0) break;
    await toOpen.first().click({ force: true });
    await page.waitForTimeout(250);
  }

  // Expand every row so the panels — the record — are in the DOM.
  const heads = page.locator("[data-vault-timeline-rows] [data-event-id] [role='button']");
  const domRows = await heads.count();
  for (let i = 0; i < domRows; i++) {
    try {
      await heads.nth(i).click({ force: true, timeout: 4000 });
    } catch {
      /* a row that would not open shows up as a missing panel below */
    }
  }
  await page.waitForTimeout(1200);

  const panels = await page.locator("[data-row-allocation]").evaluateAll((els) =>
    els.map((e) => ({
      count: Number(e.getAttribute("data-row-allocation")),
      legs: [...e.querySelectorAll("[data-alloc-leg]")].map((r) => ({
        id: r.getAttribute("data-alloc-leg"),
        supplied: r.querySelector("[data-cell='leg-supplied']")?.textContent?.trim() ?? "",
        attributed: r.querySelector("[data-cell='leg-attributed']")?.textContent?.trim() ?? "",
        share: r.querySelector("[data-cell='leg-share']")?.textContent?.trim() ?? "",
      })),
      text: e.textContent?.replace(/\s+/g, " ").trim() ?? "",
      // The queue-change sentence belongs to THIS row's panel, so it is read
      // from inside it: a page-wide collection could not say which row named
      // which block, which is the whole point of the check.
      queueChange:
        e.querySelector("[data-figure='row-allocation-queue-change']")?.textContent?.replace(/\s+/g, " ").trim() ??
        null,
    })),
  );
  const denominatorTexts = await page.locator("[data-figure='row-allocation-denominator']").allTextContents();
  const unreadTexts = await page.locator("[data-figure='row-allocation-unread']").allTextContents();
  const partialTexts = await page.locator("[data-figure='row-allocation-partial']").allTextContents();
  const out = {
    url,
    status,
    blockNumber,
    domRows,
    bands,
    emptyLabels,
    summaries,
    ruleTexts,
    panels,
    denominatorTexts,
    unreadTexts,
    partialTexts,
    bodyText: (await page.locator("body").innerText()).replace(/\s+/g, " "),
    timelineText: (await page.locator("[data-vault-timeline]").first().innerText()).replace(/\s+/g, " "),
    uncovered: await page
      .locator("[data-prov-uncovered]")
      .evaluateAll((els) => els.map((e) => e.textContent?.trim().slice(0, 60))),
    tripwireBookends: await page.locator("[data-prov-tripwire]").count(),
  };
  await page.close();
  return out;
}

// ═══ gather ════════════════════════════════════════════════════════════════

const head = await rpc(() => client.getBlockNumber(), "eth_blockNumber");
console.log(`\nBASE=${BASE_URL} · this script's own Base head ${Number(head).toLocaleString("en-US")}\n`);

const SAMPLE = [
  { label: "case study (5–6 markets)", vault: CASE_STUDY, holder: CASE_HOLDER },
  { label: "wide vault (20+ markets)", vault: WIDE_VAULT, holder: WIDE_HOLDER },
];

const OWN = new Map();
const PAGE = new Map();
const API = new Map();
for (const f of SAMPLE) {
  const page = await readPage(f.vault, f.holder);
  const api = await readApi(f.vault, f.holder);
  PAGE.set(f.label, page);
  API.set(f.label, api);
  if (page.status !== 200 || !api.body?.timeline) continue;
  const block = BigInt(page.blockNumber);
  const { blocks, logs } = await ownEventBlocks(f.vault, f.holder, block);
  const assetAddr = await call({ address: f.vault, abi: VAULT_ABI, functionName: "asset", blockNumber: block });
  const assetDecimals = Number(
    await call({ address: assetAddr, abi: ERC20_ABI, functionName: "decimals", blockNumber: block }),
  );
  const at = new Map();
  for (const b of blocks) at.set(Number(b), await ownAllocationAt(f.vault, f.holder, b));
  OWN.set(f.label, { blocks, logs, at, assetDecimals });
}

// ═══ 0: the pages answer, and the fixtures still have their shapes ═════════
for (const f of SAMPLE) {
  const p = PAGE.get(f.label);
  const a = API.get(f.label);
  check(`0a ${f.label} — the page answers 200`, p.status === 200, `${p.url} → ${p.status}`);
  check(`0b ${f.label} — the API route answers 200 with a timeline`, a.status === 200 && Boolean(a.body?.timeline));
  if (p.status !== 200 || !a.body?.timeline) continue;
  check(
    `0c ${f.label} — the page's block is within 5,000 of this script's own head`,
    Math.abs(Number(head) - p.blockNumber) < 5000,
    `page ${p.blockNumber.toLocaleString("en-US")} vs own ${Number(head).toLocaleString("en-US")}`,
  );
  const own = OWN.get(f.label);
  check(
    `0d ${f.label} — this script's own sweeps found the same number of event blocks the page drew rows in`,
    own.blocks.length === new Set(a.body.timeline.events.map((e) => e.blockNumber)).size,
    `own ${own.blocks.length} blocks from ${own.logs} logs, page ${new Set(a.body.timeline.events.map((e) => e.blockNumber)).size}`,
  );
}

{
  // The case study's own three load-bearing shapes, each re-measured. A fixture
  // that lost one of them would make sections 1, 3 and 4 vacuous.
  const own = OWN.get("case study (5–6 markets)");
  const rows = [...own.at.values()].sort((a, b) => a.blockNumber - b.blockNumber);
  const lengths = rows.map((r) => r.queueLength);
  const zeroRows = rows.filter((r) => r.balance === ZERO);
  const last = rows[rows.length - 1];
  check(
    "0e the case-study fixture still holds a positive balance at the page's own block",
    last.balance > ZERO,
    `balanceOf ${last.balance}`,
  );
  check(
    "0f …and its queue length still CHANGES inside this one life",
    new Set(lengths).size > 1,
    `queue lengths across the life: ${lengths.join(", ")}`,
  );
  check(
    "0g …and it still has exactly one row where this address held nothing",
    zeroRows.length === 1,
    zeroRows.length ? `block ${zeroRows[0].blockNumber.toLocaleString("en-US")}` : "none — check 4 would be vacuous",
  );
}

// ═══ 1: every leg wei-exact against this script's own reads ═══════════════
for (const f of SAMPLE) {
  const own = OWN.get(f.label);
  const api = API.get(f.label);
  if (!own || !api?.body?.timeline) continue;
  const bad = [];
  let legsChecked = 0;
  for (const event of api.body.timeline.events) {
    const mine = own.at.get(event.blockNumber);
    const theirs = event.extra?.allocation;
    if (!mine) {
      bad.push(`blk ${event.blockNumber}: this script read no allocation there`);
      continue;
    }
    if (!theirs) {
      bad.push(`blk ${event.blockNumber}: the page states no allocation, this script read ${mine.legs.length} legs`);
      continue;
    }
    if (theirs.length !== mine.legs.length) {
      bad.push(`blk ${event.blockNumber}: page ${theirs.length} legs vs own ${mine.legs.length}`);
      continue;
    }
    for (let i = 0; i < mine.legs.length; i++) {
      const m = mine.legs[i];
      const t = theirs[i];
      legsChecked++;
      if (t.marketId !== m.marketId)
        bad.push(`blk ${event.blockNumber} [${i}]: page ${t.marketId} vs own ${m.marketId}`);
      else if (t.queueIndex !== m.queueIndex)
        bad.push(
          `blk ${event.blockNumber} ${shortId(m.marketId)}: page queueIndex ${t.queueIndex} vs own ${m.queueIndex}`,
        );
      else if (t.vaultSupplied !== m.supplied.toString())
        bad.push(
          `blk ${event.blockNumber} ${shortId(m.marketId)} vaultSupplied: page ${t.vaultSupplied} vs own ${m.supplied}`,
        );
      else if (t.attributed !== m.attributed.toString())
        bad.push(
          `blk ${event.blockNumber} ${shortId(m.marketId)} attributed: page ${t.attributed} vs own ${m.attributed}`,
        );
      else if (t.isIdle !== m.isIdle)
        bad.push(`blk ${event.blockNumber} ${shortId(m.marketId)} isIdle: page ${t.isIdle} vs own ${m.isIdle}`);
      else if ((t.lltv ?? null) !== (m.lltv.toString() ?? null))
        bad.push(`blk ${event.blockNumber} ${shortId(m.marketId)} lltv: page ${t.lltv} vs own ${m.lltv}`);
    }
    if (event.extra?.totalSupplyAtBlock !== mine.totalSupply.toString())
      bad.push(
        `blk ${event.blockNumber} totalSupply: page ${event.extra?.totalSupplyAtBlock} vs own ${mine.totalSupply}`,
      );
    if (event.extra?.holderSharesAtBlock !== mine.balance.toString())
      bad.push(`blk ${event.blockNumber} balanceOf: page ${event.extra?.holderSharesAtBlock} vs own ${mine.balance}`);
    if (event.extra?.allocatedTotal !== mine.allocated.toString())
      bad.push(`blk ${event.blockNumber} allocatedTotal: page ${event.extra?.allocatedTotal} vs own ${mine.allocated}`);
  }
  check(
    `1a ${f.label} — every leg wei-exact against this script's own withdrawQueue walk and Blue reads`,
    bad.length === 0,
    bad.length ? bad.slice(0, 4).join(" | ") : `${legsChecked} legs across ${api.body.timeline.events.length} rows`,
  );
}

{
  // The block where the queue's own length changes, named by this script's own
  // walk rather than by the plan, and checked on its own.
  const own = OWN.get("case study (5–6 markets)");
  const api = API.get("case study (5–6 markets)");
  const rows = [...own.at.values()].sort((a, b) => a.blockNumber - b.blockNumber);
  const changed = rows.filter((r, i) => i > 0 && r.queueLength !== rows[i - 1].queueLength);
  if (!changed.length) {
    skip("1b the block where the queue's length changes", "this life no longer contains one — 0f is the alarm");
  } else {
    const bad = changed
      .map((r) => {
        const event = api.body.timeline.events.find((e) => e.blockNumber === r.blockNumber);
        const page = event?.extra?.allocation?.length ?? null;
        return page === r.queueLength ? null : `blk ${r.blockNumber}: page ${page} legs vs own ${r.queueLength}`;
      })
      .filter(Boolean);
    check(
      "1b the block where the queue's own LENGTH changes carries the new length on the page, not the old",
      bad.length === 0,
      bad.length
        ? bad.join(" | ")
        : changed
            .map(
              (r) =>
                `blk ${r.blockNumber.toLocaleString("en-US")} ${rows[rows.indexOf(r) - 1].queueLength} → ${r.queueLength}`,
            )
            .join(", "),
    );
  }
}

// ═══ 2: Σ attributed ≤ claim, and the identity per leg ════════════════════
for (const f of SAMPLE) {
  const own = OWN.get(f.label);
  const api = API.get(f.label);
  if (!own || !api?.body?.timeline) continue;
  const overClaim = [];
  const badIdentity = [];
  let rowsChecked = 0;
  for (const event of api.body.timeline.events) {
    const mine = own.at.get(event.blockNumber);
    const legs = event.extra?.allocation;
    if (!mine || !legs) continue;
    rowsChecked++;
    const sum = legs.reduce((s, l) => s + BigInt(l.attributed ?? "0"), ZERO);
    if (sum > mine.claim)
      overClaim.push(`blk ${event.blockNumber}: Σ attributed ${sum} > own convertToAssets(balanceOf) ${mine.claim}`);
    for (const leg of legs) {
      const m = mine.legs.find((x) => x.marketId === leg.marketId);
      if (!m) continue;
      // Recomputed here from THIS SCRIPT's own five operands, not from the
      // page's — the identity is only a check if both sides are independent.
      const supplied =
        m.totalSupplyShares === ZERO ? ZERO : (m.supplyShares * m.totalSupplyAssets) / m.totalSupplyShares;
      const expect = mine.totalSupply === ZERO ? ZERO : (mine.balance * supplied) / mine.totalSupply;
      if (BigInt(leg.attributed ?? "-1") !== expect)
        badIdentity.push(
          `blk ${event.blockNumber} ${shortId(leg.marketId)}: page ${leg.attributed} vs own identity ${expect}`,
        );
    }
  }
  check(
    `2a ${f.label} — Σ attributed ≤ this script's own convertToAssets(balanceOf) at every row`,
    overClaim.length === 0 && rowsChecked > 0,
    overClaim.length ? overClaim.slice(0, 3).join(" | ") : `${rowsChecked} rows`,
  );
  check(
    `2b ${f.label} — attributed = balanceOf × (supplyShares × totalSupplyAssets ÷ totalSupplyShares) ÷ totalSupply, floored, per leg`,
    badIdentity.length === 0,
    badIdentity.length ? badIdentity.slice(0, 3).join(" | ") : `identity holds on every leg of ${rowsChecked} rows`,
  );
}

// ═══ 3: a market that reads zero is present, never absent ═════════════════
{
  const own = OWN.get("case study (5–6 markets)");
  const api = API.get("case study (5–6 markets)");
  const id = MOVING_MARKET.toLowerCase();
  const ownRows = [...own.at.values()].sort((a, b) => a.blockNumber - b.blockNumber);
  const ownHas = ownRows.map((r) => r.legs.find((l) => l.marketId === id));
  const ownNonZero = ownHas.filter((l) => l && l.supplied > ZERO).length;
  const ownZero = ownHas.filter((l) => l && l.supplied === ZERO).length;
  check(
    `3a this script's own reads still show ${shortId(id)} with a balance on some rows and none on others`,
    ownNonZero >= 1 && ownZero >= 1,
    `own: non-zero on ${ownNonZero} rows, zero on ${ownZero}`,
  );
  const missing = api.body.timeline.events
    .filter((e) => e.extra?.allocation && !e.extra.allocation.some((l) => l.marketId === id))
    .map((e) => e.blockNumber);
  check(
    `3b …and the page carries it on EVERY row, zero included — a zero is a reading, an absence is an omission`,
    missing.length === 0,
    missing.length
      ? `absent at blocks ${missing.join(", ")}`
      : `present on all ${api.body.timeline.events.length} rows`,
  );
  const pageNonZero = api.body.timeline.events.filter((e) =>
    (e.extra?.allocation ?? []).some((l) => l.marketId === id && BigInt(l.vaultSupplied ?? "0") > ZERO),
  ).length;
  const pageZero = api.body.timeline.events.filter((e) =>
    (e.extra?.allocation ?? []).some((l) => l.marketId === id && l.vaultSupplied === "0"),
  ).length;
  check(
    "3c …with the same split of zero and non-zero rows this script read",
    pageNonZero === ownNonZero && pageZero === ownZero,
    `page ${pageNonZero}/${pageZero} vs own ${ownNonZero}/${ownZero}`,
  );
  // Every leg the page states as present with zero is in the RECORD too.
  const p = PAGE.get("case study (5–6 markets)");
  const panelsWithIt = p.panels.filter((panel) => panel.legs.some((l) => l.id === id)).length;
  check(
    "3d …and the row's own panel lists it on every row, which is where the record is",
    panelsWithIt === p.panels.length && p.panels.length > 0,
    `${panelsWithIt} of ${p.panels.length} panels`,
  );
}

// ═══ 4: the zero-balance row draws an empty, labelled band ════════════════
{
  const own = OWN.get("case study (5–6 markets)");
  const api = API.get("case study (5–6 markets)");
  const p = PAGE.get("case study (5–6 markets)");
  const zero = [...own.at.values()].find((r) => r.balance === ZERO);
  if (!zero) {
    skip("4a the zero-balance row", "no fixture row has a zero balance — 0g is the alarm");
  } else {
    check(
      `4a the vault's own allocation at block ${zero.blockNumber.toLocaleString("en-US")} is NOT zero, so an empty band there is a statement about the address`,
      zero.allocated > ZERO,
      `own Σ vaultSupplied ${zero.allocated}`,
    );
    const event = api.body.timeline.events.find((e) => e.blockNumber === zero.blockNumber);
    const sum = (event?.extra?.allocation ?? []).reduce((s, l) => s + BigInt(l.attributed ?? "0"), ZERO);
    check(
      "4b …the page attributes nothing to this address on that row",
      sum === ZERO && (event?.extra?.allocation?.length ?? 0) > 0,
      `Σ attributed ${sum} over ${event?.extra?.allocation?.length ?? 0} legs`,
    );
    // Rows draw NEWEST FIRST, so the band's index is the row's index in that order.
    const idx = api.body.timeline.events.findIndex((e) => e.blockNumber === zero.blockNumber);
    const band = p.bands[idx];
    check(
      "4c …and the band on exactly that row is empty in the DOM",
      Boolean(band?.empty) && band?.segments === 0 && p.bands.filter((b) => b.empty).length === 1,
      `band ${idx}: ${band?.segments} segments, empty=${band?.empty}; ${p.bands.filter((b) => b.empty).length} empty bands in all`,
    );
    check(
      "4d …and it is LABELLED empty, in words, rather than merely blank",
      p.emptyLabels.length === 1 && /empty/i.test(p.emptyLabels[0]),
      p.emptyLabels[0]?.slice(0, 110) ?? "no label rendered",
    );
    check(
      "4e …and the panel under it still states the vault's own allocation, which is not zero",
      p.panels[idx]?.legs.some((l) => l.supplied !== "" && !/^0(\.0+)?$/.test(l.supplied)),
      p.panels[idx]?.legs
        .map((l) => l.supplied)
        .slice(0, 3)
        .join(" / ") ?? "no panel",
    );
  }
}

// ═══ 5: no Reallocate anywhere in the reader's own source ═════════════════
{
  const sources = [
    "lib/sources/chain/morpho-base-vault-allocation-at.ts",
    "lib/sources/chain/morpho-base-vault-timeline.ts",
    "components/protocol/morpho-base/vault-allocation-band.tsx",
  ];
  const hits = [];
  for (const rel of sources) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    // Strip block and line comments: the RULE is stated in prose in each of
    // these files, and the rule's own words must not read as a violation of it.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(/Reallocate\w*/g)) hits.push(`${rel}: ${m[0]}`);
    // The two topic0s, in case one were ever pasted as a literal.
    for (const topic of [
      "0x89bf199df65bf65155e3e0a8abc4ad4a1be606220c8295840dba2ab5656c1f6d",
      "0xdd8bf5226dff861316e0fa7863fdb7dc7b87c614eb29a135f524eb79d5a1189a",
    ])
      if (code.includes(topic)) hits.push(`${rel}: the ${topic.slice(0, 10)}… topic0`);
  }
  check(
    "5a the allocation reader's own code names no Reallocate event and no Reallocate topic — allocation is replayed from Blue's rows",
    hits.length === 0,
    hits.length ? hits.join(" | ") : `${sources.length} files scanned, comments stripped`,
  );
}

// ═══ 6: collapse degrades correctly on a wide queue ═══════════════════════
{
  const label = "wide vault (20+ markets)";
  const own = OWN.get(label);
  const api = API.get(label);
  const p = PAGE.get(label);
  const widest = own ? Math.max(...[...own.at.values()].map((r) => r.queueLength)) : 0;
  if (!own || !api?.body?.timeline || widest < WIDE_QUEUE_FLOOR) {
    skip(
      "6a collapse on a wide queue",
      `this script read a widest queue of ${widest}, under the ${WIDE_QUEUE_FLOOR} this check needs to mean anything`,
    );
  } else {
    check(
      `6a the wide fixture's queue is still at least ${WIDE_QUEUE_FLOOR} markets deep — otherwise collapse would never fire`,
      widest >= WIDE_QUEUE_FLOOR,
      `widest queue this script read: ${widest}`,
    );
    const collapsedBands = p.bands.filter((b) => b.legs.some((l) => l.collected));
    check(
      "6b …and at least one band actually collapses a tail rather than drawing every leg",
      collapsedBands.length > 0,
      `${collapsedBands.length} of ${p.bands.length} bands carry a collected segment`,
    );
    const bad = [];
    for (let i = 0; i < p.bands.length; i++) {
      const band = p.bands[i];
      const event = api.body.timeline.events[i];
      const mine = own.at.get(event?.blockNumber);
      if (!mine || band.empty) continue;
      const collected = band.legs.find((l) => l.collected);
      const drawn = band.legs.filter((l) => !l.collected);
      const ownTotal = mine.legs.reduce((s, l) => s + l.attributed, ZERO);
      // (a) the collected sum is this script's own Σ over the ids it names
      if (collected) {
        const ids = (collected.collectedIds ?? "").split(",").filter(Boolean);
        const expect = ids.reduce((s, id) => s + (mine.legs.find((l) => l.marketId === id)?.attributed ?? ZERO), ZERO);
        if (BigInt(collected.collectedSum ?? "-1") !== expect)
          bad.push(`band ${i}: collected sum ${collected.collectedSum} vs own Σ over its ${ids.length} ids ${expect}`);
        if (Number(collected.collectedCount) !== ids.length)
          bad.push(`band ${i}: collected count ${collected.collectedCount} vs ${ids.length} ids`);
        // (b) the collected group is the TAIL — every collected leg is at or
        // below every drawn one.
        const drawnValues = drawn.map((d) => mine.legs.find((l) => l.marketId === d.key)?.attributed ?? ZERO);
        const smallestDrawn = drawnValues.reduce((m, v) => (v < m ? v : m), drawnValues[0] ?? ZERO);
        for (const id of ids) {
          const v = mine.legs.find((l) => l.marketId === id)?.attributed ?? ZERO;
          if (v > smallestDrawn)
            bad.push(`band ${i}: collected leg ${shortId(id)} (${v}) is LARGER than a drawn one (${smallestDrawn})`);
        }
        // (c) nothing is both drawn and collected
        for (const d of drawn) if (ids.includes(d.key)) bad.push(`band ${i}: ${shortId(d.key)} is drawn AND collected`);
      }
      // (d) each drawn segment's WIDTH is its own share of this script's total
      for (const d of drawn) {
        const v = mine.legs.find((l) => l.marketId === d.key)?.attributed ?? null;
        if (v == null) {
          bad.push(`band ${i}: drawn segment ${d.key} is in no leg this script read`);
          continue;
        }
        if (d.attributed !== v.toString()) bad.push(`band ${i} ${shortId(d.key)}: stamped ${d.attributed} vs own ${v}`);
        const expectPct = ownTotal === ZERO ? 0 : (Number(v) / Number(ownTotal)) * 100;
        if (Math.abs(d.widthPct - expectPct) > 0.02)
          bad.push(`band ${i} ${shortId(d.key)}: width ${d.widthPct}% vs own share ${expectPct.toFixed(4)}%`);
      }
    }
    check(
      "6c the collected segment's sum is this script's own Σ over the legs it names, the collected legs are all smaller than every drawn one, nothing is both, and every drawn segment's width is its own share",
      bad.length === 0,
      bad.length ? bad.slice(0, 4).join(" | ") : `${p.bands.length} bands checked against their own chain reads`,
    );
    // (e) the panel is the record — every leg, uncollected
    const badPanels = [];
    for (let i = 0; i < p.panels.length; i++) {
      const event = api.body.timeline.events[i];
      const mine = own.at.get(event?.blockNumber);
      if (!mine) continue;
      if (p.panels[i].count !== mine.queueLength)
        badPanels.push(
          `panel ${i} blk ${event.blockNumber}: lists ${p.panels[i].count} vs own queue ${mine.queueLength}`,
        );
      const listed = new Set(p.panels[i].legs.map((l) => l.id));
      for (const l of mine.legs)
        if (!listed.has(l.marketId)) badPanels.push(`panel ${i}: ${shortId(l.marketId)} not listed`);
    }
    check(
      "6d …while the row's own panel lists EVERY leg uncollected, at this script's own queue length",
      badPanels.length === 0,
      badPanels.length
        ? badPanels.slice(0, 3).join(" | ")
        : `panels list ${p.panels.map((x) => x.count).join(", ")} legs`,
    );
    // (f) the width rule is a width rule: no drawn segment is under the floor
    //     unless it is the largest, and no collected one is over it.
    const ruleBreaks = [];
    for (let i = 0; i < p.bands.length; i++) {
      const band = p.bands[i];
      if (band.empty) continue;
      const drawn = band.legs.filter((l) => !l.collected);
      const collected = band.legs.find((l) => l.collected);
      if (!collected) continue;
      const under = drawn.filter((d) => d.widthPct / 100 < MIN_SEGMENT_SHARE);
      // The largest always draws whatever the floor says, so one exception is
      // allowed and only one.
      if (under.length > 1)
        ruleBreaks.push(`band ${i}: ${under.length} drawn segments under the ${MIN_SEGMENT_SHARE * 100}% floor`);
    }
    check(
      `6e …and where a tail was collected, no more than the largest segment sits under the ${MIN_SEGMENT_SHARE * 100}% width floor`,
      ruleBreaks.length === 0,
      ruleBreaks.length ? ruleBreaks.join(" | ") : "the floor decides which legs draw, not a fixed count",
    );
  }
}

// ═══ 7: no hue outside the neutral ramp ══════════════════════════════════
{
  const offenders = [];
  const shades = new Set();
  let segments = 0;
  for (const f of SAMPLE) {
    const p = PAGE.get(f.label);
    if (p.status !== 200) continue;
    for (let i = 0; i < p.bands.length; i++)
      for (const leg of p.bands[i].legs) {
        segments++;
        if (!leg.colour) {
          offenders.push(`${f.label} band ${i} ${leg.key}: no fill element to read a colour from`);
          continue;
        }
        shades.add(leg.colour.css);
        if (leg.colour.spread > NEUTRAL_TOLERANCE)
          offenders.push(
            `${f.label} band ${i} ${short(leg.key)}: ${leg.colour.css} → channel spread ${leg.colour.spread} (over white ${leg.colour.onWhite.join(",")}), tolerance ${NEUTRAL_TOLERANCE}`,
          );
      }
  }
  check(
    `7a every segment's composited colour is within ${NEUTRAL_TOLERANCE}/255 of grey — Rails chose which market is which segment, so a segment carries no hue`,
    offenders.length === 0 && segments > 0,
    offenders.length
      ? offenders.slice(0, 3).join(" | ")
      : `${segments} segments, ${shades.size} distinct steps, all neutral`,
  );
  check(
    "7b …and the ramp still has more than one step, so it separates neighbours rather than painting them all alike",
    shades.size > 1,
    `${shades.size} distinct background values`,
  );
}

// ═══ 8: no USD, no APY, no total across assets ═══════════════════════════
for (const f of SAMPLE) {
  const p = PAGE.get(f.label);
  if (p.status !== 200) continue;
  const dollars = p.timelineText.match(/\$\s?[\d,]+/g) ?? [];
  check(`8a ${f.label} — no USD figure anywhere in the timeline`, dollars.length === 0, dollars.slice(0, 4).join(", "));
  // A rate word BESIDE a figure — the word alone appears in the copy that says
  // the page does not annualise, and "Apr" is a month in this section's dates.
  const rates = p.timelineText.match(/[\d.]+\s?%\s?(APY|APR|a year|per year|annual)/gi) ?? [];
  const words =
    p.timelineText.match(/\b(APY|annualised|annualized|rate of return|yield to date|profit and loss)\b/gi) ?? [];
  check(
    `8b ${f.label} — no APY, no annualised figure, no rate of return`,
    rates.length === 0 && words.length === 0,
    [...rates, ...words].slice(0, 4).join(", "),
  );
  const totals = p.timelineText.match(/\b(total exposure|total across|combined value)\b/gi) ?? [];
  check(`8c ${f.label} — no total across assets in the allocation surface`, totals.length === 0, totals.join(", "));
}

// ═══ 9: locale ═══════════════════════════════════════════════════════════
for (const f of SAMPLE) {
  const p = PAGE.get(f.label);
  if (p.status !== 200) continue;
  // en-US groups with commas; a de-DE or fr-FR render would use dots or spaces.
  const euro = p.timelineText.match(/\b\d{1,3}(?:\.\d{3})+,\d/g) ?? [];
  const spaced = p.timelineText.match(/\b\d{1,3}(?: \d{3})+/g) ?? [];
  check(
    `9a ${f.label} — every grouped figure in the timeline is en-US`,
    euro.length === 0 && spaced.length === 0,
    [...euro, ...spaced].slice(0, 4).join(", "),
  );
  // The band's own copy names blocks; each must be grouped the en-US way.
  const denominatorBlocks = p.denominatorTexts.join(" ").match(/block \d[\d,]*/g) ?? [];
  const ungrouped = denominatorBlocks.filter((s) => /block \d{5,}$/.test(s));
  check(
    `9b ${f.label} — the denominator sentence names its block in en-US grouping`,
    denominatorBlocks.length > 0 && ungrouped.length === 0,
    ungrouped.length ? ungrouped.join(", ") : denominatorBlocks.slice(0, 2).join(", "),
  );
  // en-GB dates, UTC: the row headers carry them and the sibling verifier holds
  // them; here the check is that no US-order date crept into the band's copy.
  const usDates = p.timelineText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/g) ?? [];
  check(`9c ${f.label} — no US-order date in the timeline`, usDates.length === 0, usDates.slice(0, 3).join(", "));
}

// ═══ 10: the dev provenance tripwire ═════════════════════════════════════
for (const f of SAMPLE) {
  const p = PAGE.get(f.label);
  if (p.status !== 200) continue;
  if (p.tripwireBookends === 0) {
    skip(`10a ${f.label} — the provenance tripwire`, "no dev bookends on this build; it renders in dev only");
    continue;
  }
  check(
    `10a ${f.label} — no uncovered figure with every band drawn and every panel expanded`,
    p.uncovered.length === 0,
    p.uncovered.length
      ? p.uncovered
          .slice(0, 5)
          .map((t) => `"${t}"`)
          .join(", ")
      : `${p.tripwireBookends} scopes swept`,
  );
  check(
    `10b ${f.label} — the rule that nothing is drawn between two rows is stated once, not per row`,
    p.ruleTexts.length === 1 &&
      /nothing is drawn between/i.test(p.ruleTexts[0]) &&
      /proportional/i.test(p.ruleTexts[0]),
    `${p.ruleTexts.length} rule paragraphs`,
  );
  check(
    `10c ${f.label} — every drawn row states the denominator its attributed figures were divided by`,
    p.denominatorTexts.length === p.panels.length && p.panels.length > 0,
    `${p.denominatorTexts.length} denominator statements for ${p.panels.length} panels`,
  );
}

for (const f of SAMPLE) {
  // The queue-change sentence, checked ROW BY ROW against this script's own
  // walk — which rows carry it, and which block each one names.
  //
  // 🔑 It is checked per row because a page-wide COUNT cannot see the
  // direction: comparing a row against the NEWER one beside it instead of the
  // older one produces the same number of sentences and the same wording, and
  // only the block each sentence NAMES tells the two apart.
  const own = OWN.get(f.label);
  const p = PAGE.get(f.label);
  const api = API.get(f.label);
  if (!own || !api?.body?.timeline) continue;
  // Newest first, the order the page draws in.
  const rows = api.body.timeline.events.map((e) => own.at.get(e.blockNumber)).filter(Boolean);
  const expected = new Map();
  for (let i = 0; i + 1 < rows.length; i++) {
    const here = new Set(rows[i].legs.map((l) => l.marketId));
    const earlier = new Set(rows[i + 1].legs.map((l) => l.marketId));
    const entered = [...here].filter((x) => !earlier.has(x));
    const left = [...earlier].filter((x) => !here.has(x));
    if (entered.length || left.length) expected.set(i, { earlierBlock: rows[i + 1].blockNumber, entered, left });
  }
  const carried = p.panels.map((panel, i) => (panel.queueChange ? i : -1)).filter((i) => i >= 0);
  check(
    `10d ${f.label} — the queue-change sentence sits on exactly the rows where this script's own walk saw the queue change`,
    carried.length === expected.size && carried.every((i) => expected.has(i)),
    `page rows [${carried.join(", ")}], own walk rows [${[...expected.keys()].join(", ")}]`,
  );
  const wrong = [];
  for (const [i, e] of expected) {
    const text = p.panels[i]?.queueChange;
    if (!text) continue;
    const named = (text.match(/block (\d[\d,]*)/g) ?? []).map((m) => Number(m.replace(/[^\d]/g, "")));
    if (!named.length) wrong.push(`row ${i}: names no block at all`);
    else if (named.some((b) => b !== e.earlierBlock))
      wrong.push(
        `row ${i} (blk ${rows[i].blockNumber}): names block(s) ${named.join(", ")} vs this script's own EARLIER row ${e.earlierBlock}`,
      );
    else if (named.some((b) => b >= rows[i].blockNumber))
      wrong.push(`row ${i}: names a block at or after its own — the earlier row must be earlier`);
    for (const id of [...e.entered, ...e.left])
      if (!text.includes(shortId(id)))
        wrong.push(`row ${i}: does not name ${shortId(id)}, which this script's walk saw move`);
  }
  check(
    `10e …and each one names THIS SCRIPT's own earlier block, and the markets that moved — so 'previous row' cannot be read the wrong way round`,
    wrong.length === 0 && expected.size > 0,
    wrong.length
      ? wrong.slice(0, 3).join(" | ")
      : [...expected.values()].map((e) => `earlier blk ${e.earlierBlock.toLocaleString("en-US")}`).join(", "),
  );
}

// ═══ 11: an unread leg is stated as unread ═══════════════════════════════
{
  const withUnread = [];
  for (const f of SAMPLE) {
    const api = API.get(f.label);
    if (!api?.body?.timeline) continue;
    for (const e of api.body.timeline.events)
      for (const l of e.extra?.allocation ?? [])
        if (l.attributed == null || l.vaultSupplied == null) withUnread.push(`${f.label} blk ${e.blockNumber}`);
  }
  const unreadBands = SAMPLE.flatMap((f) => PAGE.get(f.label)?.unreadTexts ?? []);
  const partial = SAMPLE.flatMap((f) => PAGE.get(f.label)?.partialTexts ?? []);
  if (withUnread.length === 0 && unreadBands.length === 0) {
    skip(
      "11a an unread leg is stated as unread",
      "every leg on every sampled row answered, so the branch is written and untested rather than wrong — it cannot be forced without breaking the lane on purpose",
    );
  } else {
    check(
      "11a a leg that did not answer is stated as unread on the page, never as zero and never dropped",
      partial.length > 0 || unreadBands.length > 0,
      `${withUnread.length} unread legs; ${partial.length} partial statements, ${unreadBands.length} unread-band statements`,
    );
  }
  // A zero that IS read must never print as "not read": the two must not be
  // one word, or the check above would be worthless.
  const zeroAsUnread = [];
  for (const f of SAMPLE) {
    const p = PAGE.get(f.label);
    for (const panel of p.panels ?? [])
      for (const leg of panel.legs)
        if (/not read/i.test(leg.supplied) && /not read/i.test(leg.attributed))
          zeroAsUnread.push(`${f.label} ${short(leg.id)}`);
  }
  check(
    "11b a leg that read ZERO prints a zero and not 'not read' — the two are different facts and the page keeps them apart",
    zeroAsUnread.length === withUnread.length,
    zeroAsUnread.length ? zeroAsUnread.slice(0, 3).join(", ") : "no read leg prints as unread",
  );
}

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
