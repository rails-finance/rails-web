#!/usr/bin/env node
// THE VAULT SECTION'S SEAM — the position card's context strip, the back row,
// the section's metadata and share card, and the section's bookmarks.
// ----------------------------------------------------------------------------
// Both chains. Every expected figure is THIS SCRIPT'S OWN chain read: the
// redeemable amount on each fixture's card is compared against this script's
// own `maxRedeem(holder)` (Ethereum) / `maxWithdraw(holder)` (Base) at the block
// the PAGE states it read at, formatted through this script's own copy of the
// section's print rules — never against the page's own data attribute, and
// never against the loader that produced it. The umbrella fixture's cooldown
// cluster is compared against this script's own `getStakerCooldown(holder)`,
// including which of the four states the BLOCK's own timestamp puts it in.
//
// The only things taken from the page are the block it names (`[data-vault-block]`
// — check S1's own subject, since a figure read at a different block would be a
// different figure) and the fixture addresses, which come from the census API on
// the running server and are printed in the log.
//
// THE DOM IS READ WITH A BROWSER, NEVER THE RSC PAYLOAD. A body-text check
// against an RSC payload is vacuous (memory `vaults-section-build`): the payload
// carries the props, so a card that renders none of them still "contains" them.
//
// Run:
//   BASE=http://localhost:3801 node scripts/verify/verify-vault-section-seam.mjs
// Needs ALCHEMY_URL (the Ethereum `eth_call` lane) and BASE_RPC_URL in
// .env.local — read, never printed; the lanes are named by env var NAME only.
// No `eth_getLogs` anywhere: every read here is an `eth_call` at one block.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   S1  THE STRIP. Under the detail card's heading-button row: a "Redeemable
//       now" cluster wearing the chain's own figure name, and an "Exit" cluster
//       naming the contract's own function words. No `.w-64` runway and no
//       progress/meter element anywhere in the strip — the strip is WORDS ONLY
//       (Miles, 2026-09-09). The redeemable figure equals this script's own call
//       at the page's own block, printed by this script's own copy of the
//       section's rule. The umbrella fixture's cooldown cluster agrees with this
//       script's own `getStakerCooldown` — state AND the UTC instant. And the
//       paragraphs the strip replaced are GONE: no `p[data-figure=
//       "holder-max-redeem"]` anywhere on the page.
//   S2  THE BACK ROW. `[data-back-row] button` exists, is labelled "Back", and
//       on a page opened with NO history behind it a click lands on that chain's
//       own `/…/vaults` listing.
//   S3  METADATA + SHARE CARD. `<title>` begins "Rails | Vaults" ("Rails |
//       Vaults on Base" on Base) and names a Position; `og:image` points at THIS
//       route's own `opengraph-image`, and a GET of it answers 200 `image/png`
//       with a body over 10 KB. `twitter:image` likewise.
//   S4  BOOKMARKS. The card's own bookmark toggle writes the holder into the
//       RAIL's namespace — `morpho-base-sessions` on Base, `aave-vaults-
//       sessions` on Ethereum — together with the listing it was taken on. The
//       header's bookmarks modal then shows that rail's group, whose row points
//       back at `<vault root>/positions?q=<holder>`: the listing the reader
//       bookmarked from, not whichever listing the rail happens to own first.
//       That listing's matching row reads `aria-pressed="true"`, a row stored
//       without a recorded listing still opens a live page, and toggling the
//       bookmark off removes the key entirely.
//   S5  THE SECTION RAIL. A position page draws the section's own header row
//       (`nav[aria-label="Section surfaces"]`), whose four tabs are that
//       chain's listing, roster page, find door and about page — and NO tab is
//       lit: a position is reached through the listing and has no place of its
//       own in the sub-nav, so an `aria-current` here would tell a reader they
//       are standing somewhere they are not.
//
// ── STANDING TALLY, 2026-09-09, BASE=http://localhost:3010 ──────────────────
// 86/86 · 0 SKIP (80/80 before S5, which the section's chrome move added). Fixtures that run: E-UMB stkwaEthUSDC.v1
// 0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6 / holder
// 0xdd62115f601daebccfdd2aeed834513d8dc2f4e2 (cooldown EXPIRED at the block, so
// maxRedeem reads 0 beside a 4.26M share balance — the state S1 exists to
// state); E-SAV sGho 0xe1753f2e00940cc31213dd92013cf019dfe4ca1d / holder
// 0x89d76f493aecaee10cabbc1a67dbdc92e947b85e; B-MM steakUSDC
// 0xbeef010f9cb27031ad51e3333f9af9c6b1228183 / holder
// 0x33a71179f64229e0b11a846ba64a992ca37dab5b. The fixtures are picked from the
// census on the running server each run, so the addresses move as the census
// does and the log always names the three it used.
//
// ── PROVED IT CAN FAIL, 2026-09-09, BASE=http://localhost:3801 ──────────────
// Four breaks, applied ONE AT A TIME to the real source and reverted.
//
//  A  THE STRIP STATED THE BALANCE AS REDEEMABLE — `shareText(holder.shares,
//     sd)` in place of `holder.maxRedeem` in the Ethereum page's
//     `vaultContextStrip`. 79/80.
//     FAIL S1h·E-UMB — 'card "4,260,382.04229 stkwaEthUSDC.v1", own "0
//                       stkwaEthUSDC.v1" @ 25937476'
//     🔑 Only the UMBRELLA fixture went red, and that is the point of picking
//     it: on sGHO and a static aToken `maxRedeem` reads equal to the balance,
//     so the two figures cannot be told apart there and a green on E-SAV alone
//     would have said nothing. A run whose umbrella fixture has no cooldown
//     record has not tested this.
//
//  B  THE BACK ROW FELL BACK TO THE MARKET VIEW — `fallbackHref=
//     {ethereumVaultHref(address)}` on the Ethereum page. 78/80.
//     FAIL S2c·E-UMB — "landed …/ethereum/aave/vaults/0x6bf1…8aa6, expected
//                       …/ethereum/aave/vaults"
//     FAIL S2c·E-SAV — likewise on that fixture's vault.
//     🔑 S2a and S2b stayed green, and rightly: the button and its label were
//     untouched. Where a button GOES and what it SAYS are separate claims.
//
//  C  THE ROUTE STOPPED ADVERTISING ITS OWN SHARE CARD — `image: "dynamic"`
//     dropped from the Ethereum page's `sectionPositionMetadata`. 76/80.
//     FAIL S3c·E-UMB og:image / twitter:image — "https://rails.finance/og/home.png"
//     FAIL S3c·E-SAV og:image / twitter:image — likewise.
//     🔑 S3d stayed green on the home card — it IS a >10 KB PNG — which is why
//     S3c asserts WHICH image the page points at rather than only that one
//     renders.
//
//  D  THE CARD BOOKMARKED INTO A PROTOCOL'S RAIL — `bookmarkProtocol="morpho"`
//     in components/vaults/vault-position-card.tsx. 71/80.
//     FAIL S4b — the section's own key is null on all three fixtures
//     FAIL S4c/S4d — and the modal has no Vaults group to show.
//     🔑 S4e and S4f were not reached on those runs; S4b is the assertion that
//     names the namespace, and it is the one that has to be red here.
//     (Run when the namespace WAS the section's. The rail scopes replaced it
//     since; the break and its reds stand as the record of that run.)
//
//  E  THE RECORDED LISTING DROPPED — `bookmarkListing` removed from the
//     WalletPill in components/vaults/vault-position-card.tsx, 2026-09-20.
//     85/89. FAIL S4b on all three fixtures — nothing records the listing —
//     and FAIL S4d on BASE ALONE.
//     🔑 That asymmetry is the finding, not a flaw in the break. Aave's rail is
//     `positionListing: false`, so its bookmark reaches the vault listing
//     through the older branch whichever way the listing was recorded, and
//     S4d stays green on both Ethereum fixtures while the rule is broken. An
//     Ethereum-only green says nothing about this rule at all.

import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet, base } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPositionsRoute } from "../lib/read-positions-route.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_URL = process.env.BASE ?? "http://localhost:3801";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");
if (!env.BASE_RPC_URL) throw new Error("need BASE_RPC_URL in .env.local");
// ⚠️⚠️ NO LANE URL EVER REACHES THE OUTPUT. viem puts the endpoint it called
// into every error it throws — URL, key and all — so an unhandled one prints
// the key to whatever is reading this run.
const scrub = (text) => String(text).replace(/https?:\/\/[^\s"'`)}\]]+/g, "<lane URL redacted>");
for (const signal of ["uncaughtException", "unhandledRejection"])
  process.on(signal, (error) => {
    console.error(`\nFAILED (${signal}) — ${scrub(error?.stack ?? error?.message ?? error)}`);
    process.exit(1);
  });

console.log(`\n── the vault section's seam · ${BASE_URL} ──`);
console.log(`   lanes: ALCHEMY_URL present, BASE_RPC_URL present (names only; no URL is printed)\n`);

const eth = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3, timeout: 60_000 }),
});
const bas = createPublicClient({
  chain: base,
  transport: http(env.BASE_RPC_URL, { batch: false, retryCount: 3, timeout: 60_000 }),
});

const VAULT_ABI = parseAbi([
  "function maxRedeem(address) view returns (uint256)",
  "function maxWithdraw(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function getStakerCooldown(address) view returns ((uint192 amount, uint32 endOfCooldown, uint32 withdrawalWindow))",
]);

/** The UNIT the page prints a redeemable figure in, read by this script from
 *  the chain rather than taken from the route or the page: the share token's
 *  own `symbol()`/`decimals()` on Ethereum, and the vault's `asset()`'s on
 *  Base, both at the block the page states. An expectation must never come out
 *  of the thing under test. */
async function unitAt(client, vault, blockNumber, isBase) {
  const at = { blockNumber: BigInt(blockNumber) };
  if (!isBase) {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "symbol", ...at }),
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "decimals", ...at }),
    ]);
    return { symbol: symbol || "shares", decimals: Number(decimals) };
  }
  const asset = await client.readContract({ address: vault, abi: VAULT_ABI, functionName: "asset", ...at });
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: asset, abi: VAULT_ABI, functionName: "symbol", ...at }),
    client.readContract({ address: asset, abi: VAULT_ABI, functionName: "decimals", ...at }),
  ]);
  return { symbol, decimals: Number(decimals) };
}

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

// ── the section's own print rules, restated so a change to them goes red ────
// lib/shared/vault-amount-text.ts. A restatement rather than an import: an
// expectation must never come out of the thing under test.
const exactUnits = (raw, decimals) => {
  const s = String(raw).padStart(decimals + 1, "0");
  const cut = s.length - decimals;
  return (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
};
const shareText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
const assetText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals <= 6 ? 2 : 6,
  });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
/** Where a chain's vaults live, since rails-ops decision 0028 put each one
 *  under the protocol whose factory deployed it: Base's MetaMorpho vaults are
 *  Morpho Blue's, Ethereum's are Aave's vault layer's. */
const vaultRoot = (chain) => (chain === 8453 ? "/base/morpho/vaults" : "/ethereum/aave/vaults");

/** components/vaults/aave-vault-format.ts `utcInstant` — en-GB, UTC, stated. */
const utcInstant = (unixSeconds) =>
  `${new Date(unixSeconds * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;

const readRoute = (qs) => readPositionsRoute(BASE_URL, qs);

// ── the fixtures, picked from the census on the running server ──────────────
// INPUTS, never expected figures: which vault, which shape of life. Every
// address is printed so a reader of this log can re-run any read by hand.
async function pickFixture(chain, choose, label) {
  const header = await readRoute(`chain=${chain}&limit=1&overlay=0`);
  const rows = header.census.filter((c) => c.liveCount > 0);
  const vault = choose(rows);
  if (!vault) return null;
  const page = await readRoute(
    `chain=${chain}&vault=${vault.vault}&status=live&limit=1&sortBy=shares&sortOrder=desc&overlay=0`,
  );
  const row = page.data[0];
  if (!row) return null;
  return { label, chain, vault: vault.vault, symbol: vault.symbol, holder: row.holder, family: vault.family };
}

const byParticipants = (rows) => rows.slice().sort((a, b) => b.participants - a.participants)[0];

const fixtures = [
  await pickFixture(
    1,
    (rows) => byParticipants(rows.filter((c) => c.family === "umbrella-stake" && (c.symbol ?? "").startsWith("stk"))),
    "E-UMB",
  ),
  await pickFixture(
    1,
    (rows) => byParticipants(rows.filter((c) => c.family === "sgho" || c.family === "stata")),
    "E-SAV",
  ),
  await pickFixture(8453, byParticipants, "B-MM"),
];

for (const f of fixtures) {
  if (!f) continue;
  console.log(
    `   ${f.label}  chain ${f.chain} · vault ${f.symbol ?? "?"} ${f.vault} · holder ${f.holder} · family ${f.family}`,
  );
}
console.log("");
for (const [i, f] of fixtures.entries())
  if (!f) skip(`fixture ${["E-UMB", "E-SAV", "B-MM"][i]}`, "the census answered no live holder for it on this server");

const browser = await chromium.launch();

/** The position page for one fixture, in a FRESH context — no history behind
 *  it, which is what S2's fallback is about, and no localStorage from a
 *  previous fixture, which is what S4's is. */
async function openFixture(f, init) {
  const context = await browser.newContext();
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const url = `${BASE_URL}${vaultRoot(f.chain)}/${f.vault}/${f.holder}`;
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  return { context, page, url, status: res?.status() ?? 0 };
}

// ═══ S1 · the strip ═══════════════════════════════════════════════════════
for (const f of fixtures) {
  if (!f) continue;
  const { context, page, url, status } = await openFixture(f);
  const isBase = f.chain === 8453;
  const figure = isBase ? "holder-max-withdraw" : "holder-max-redeem";
  check(`S1·${f.label} the position page answers 200`, status === 200, `status ${status} · ${url}`);

  // The card's own frame streams in behind a Suspense boundary; wait for it
  // rather than racing it, so an absent card is a finding and not a timing.
  await page.waitForSelector("[data-position-card], [data-position-card-absent]", { timeout: 120_000 }).catch(() => {});
  const strip = await page.evaluate((figureName) => {
    const inner = document.querySelector("[data-position-card]");
    if (!inner) return { card: false };
    // THE STRIP IS THE CARD'S, AND A SIBLING OF ITS STATS. PositionCardShell
    // draws `[data-position-card]` and the disclosure row that carries
    // `rowExtra` as two children of one frame, so the strip is looked for on
    // the FRAME rather than inside the stats block.
    const card = inner.parentElement ?? inner;
    const fig = card.querySelector(`[data-figure="${figureName}"]`);
    const exit = card.querySelector('[data-figure="holder-exit"]');
    const cooldown = card.querySelector('[data-figure="holder-cooldown"]');
    // THE HEADING-BUTTON ROW. `InfoTabsDisclosure` draws its disclosure
    // buttons and `rowExtra` as children of one flex row; the buttons carry no
    // text at all (an info glyph and a chevron), so the row is found by the
    // button's own aria-label. A cluster is ON that row when walking up from it
    // reaches an element that DIRECTLY contains such a button — which is what
    // riding `rowExtra` means structurally, and what a cluster rendered
    // anywhere else on the card would fail.
    const onButtonRow = (el) => {
      if (!el) return false;
      let node = el.parentElement;
      for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
        const direct = [...node.children].filter((c) => c.tagName === "BUTTON");
        if (direct.some((b) => /explanation/i.test(b.getAttribute("aria-label") || ""))) return true;
      }
      return false;
    };
    // The strip's own root — the container-query wrapper the RiskFooterStrip
    // renders. Everything below is asked of it, so a meter elsewhere on the
    // page is not this check's business.
    let root = fig;
    for (let i = 0; i < 8 && root; i++, root = root.parentElement)
      if (root.className && String(root.className).includes("@container")) break;
    return {
      card: true,
      figureText: fig ? (fig.textContent || "").trim() : null,
      figureOnRow: onButtonRow(fig),
      exitText: exit ? (exit.textContent || "").trim() : null,
      exitOnRow: onButtonRow(exit),
      cooldownText: cooldown ? (cooldown.textContent || "").trim() : null,
      runways: root ? root.querySelectorAll(".w-64").length : -1,
      meters: root ? root.querySelectorAll('progress, meter, [role="progressbar"]').length : -1,
      // The two paragraphs the strip replaced.
      oldParagraphs: document.querySelectorAll('p[data-figure="holder-max-redeem"], p[data-figure="holder-cooldown"]')
        .length,
      block: Number(document.querySelector("[data-vault-block]")?.getAttribute("data-vault-block") ?? 0),
    };
  }, figure);

  if (!strip.card) {
    check(`S1·${f.label} the detail card rendered`, false, "no [data-position-card] on the page");
    await context.close();
    continue;
  }

  check(
    `S1a·${f.label} the redeemable cluster is on the card's heading-button row`,
    strip.figureOnRow,
    JSON.stringify({ figure, text: strip.figureText }),
  );
  check(
    `S1b·${f.label} the exit cluster is on the same row`,
    strip.exitOnRow && !!strip.exitText,
    JSON.stringify(strip.exitText),
  );
  check(
    `S1c·${f.label} the exit names the contract's own functions`,
    strip.exitText ===
      (isBase ? "withdraw() or redeem()" : f.family === "umbrella-stake" ? "cooldown(), then redeem()" : "redeem()"),
    JSON.stringify(strip.exitText),
  );
  check(`S1d·${f.label} no runway in the strip`, strip.runways === 0, `.w-64 elements: ${strip.runways}`);
  check(`S1e·${f.label} no meter in the strip`, strip.meters === 0, `progress/meter elements: ${strip.meters}`);
  check(
    `S1f·${f.label} the paragraphs the strip replaced are gone`,
    strip.oldParagraphs === 0,
    `${strip.oldParagraphs} left`,
  );
  check(`S1g·${f.label} the page names the block it read at`, strip.block > 0, `block ${strip.block}`);

  // ── this script's OWN read, at the page's own block ──────────────────────
  if (strip.block > 0) {
    const client = isBase ? bas : eth;
    let own = null;
    try {
      own = await client.readContract({
        address: f.vault,
        abi: VAULT_ABI,
        functionName: isBase ? "maxWithdraw" : "maxRedeem",
        args: [f.holder],
        blockNumber: BigInt(strip.block),
      });
    } catch (error) {
      check(`S1h·${f.label} the redeemable figure is this script's own read`, false, scrub(error.message));
    }
    if (own != null) {
      const { symbol, decimals } = await unitAt(client, f.vault, strip.block, isBase);
      const expected = `${isBase ? assetText(own.toString(), decimals) : shareText(own.toString(), decimals)} ${symbol}`;
      check(
        `S1h·${f.label} the redeemable figure is this script's own read`,
        strip.figureText === expected,
        `card ${JSON.stringify(strip.figureText)}, own ${JSON.stringify(expected)} @ ${strip.block}`,
      );
    }
  }

  // ── the cooldown, for the umbrella fixture only ──────────────────────────
  if (f.family === "umbrella-stake") {
    let cd = null;
    let blockTs = null;
    try {
      cd = await eth.readContract({
        address: f.vault,
        abi: VAULT_ABI,
        functionName: "getStakerCooldown",
        args: [f.holder],
        blockNumber: BigInt(strip.block),
      });
      blockTs = Number((await eth.getBlock({ blockNumber: BigInt(strip.block) })).timestamp);
    } catch (error) {
      check(`S1i·${f.label} the cooldown cluster is this script's own read`, false, scrub(error.message));
    }
    if (cd != null && blockTs != null) {
      const amount = cd.amount ?? cd[0];
      const end = Number(cd.endOfCooldown ?? cd[1]);
      const window = Number(cd.withdrawalWindow ?? cd[2]);
      // The four states, decided against THIS BLOCK's own timestamp — never
      // against this script's clock, which is a different moment.
      const state =
        amount === BigInt(0) || end === 0
          ? "none"
          : blockTs < end
            ? "waiting"
            : blockTs < end + window
              ? "open"
              : "expired";
      const { decimals: sd } = await unitAt(eth, f.vault, strip.block, false);
      const covers = `${shareText(amount.toString(), sd)} shares`;
      const sentence =
        state === "none"
          ? "No cooldown is recorded for this address at this block"
          : state === "waiting"
            ? `A cooldown is running for ${covers}, and ends ${utcInstant(end)}`
            : state === "open"
              ? `A cooldown for ${covers} has ended and its redemption window is open until ${utcInstant(end + window)}`
              : `A cooldown for ${covers} ended ${utcInstant(end)} and its redemption window has since passed`;
      const expected = `${sentence}. ${
        state === "open"
          ? "Inside it maxRedeem() answers what the snapshot covers."
          : "Outside it maxRedeem() answers zero."
      }`;
      check(
        `S1i·${f.label} the cooldown cluster is this script's own read`,
        strip.cooldownText === expected,
        `card ${JSON.stringify(strip.cooldownText)}, own ${JSON.stringify(expected)} (state ${state} at block ts ${blockTs})`,
      );
    }
  } else if (strip.cooldownText != null) {
    check(`S1i·${f.label} no cooldown cluster on a family with no cooldown`, false, JSON.stringify(strip.cooldownText));
  } else {
    check(
      `S1i·${f.label} no cooldown cluster on a family with no cooldown`,
      true,
      "this family holds no cooldown record",
    );
  }

  await context.close();
}

// ═══ S2 · the back row ════════════════════════════════════════════════════
for (const f of fixtures) {
  if (!f) continue;
  // A FRESH TAB, simulated. Playwright's own page starts at about:blank and
  // then navigates, so `history.length` is already 2 and the smart-back path
  // would go back to about:blank — which tests the browser, not the fallback.
  // The init script makes the page look like what a pasted link actually opens:
  // one history entry, nothing behind it.
  const { context, page, url } = await openFixture(f, () => {
    Object.defineProperty(window.history, "length", { get: () => 1 });
  });
  const listing = `${BASE_URL}${vaultRoot(f.chain)}/positions`;
  const row = await page.evaluate(() => {
    const el = document.querySelector("[data-back-row] button");
    return el ? { label: (el.textContent || "").trim() } : null;
  });
  check(`S2a·${f.label} the back row carries a button`, row != null, url);
  check(`S2b·${f.label} the label is "Back"`, row?.label === "Back", JSON.stringify(row?.label));
  if (row) {
    // The context was opened straight on this URL, so there is no history to
    // go back to — which is exactly the case the fallback exists for.
    await page.click("[data-back-row] button");
    await page.waitForURL((u) => u.toString().replace(/\/$/, "") === listing, { timeout: 30_000 }).catch(() => {});
    const landed = page.url().replace(/\/$/, "");
    check(
      `S2c·${f.label} a fresh page's Back lands on the chain's own listing`,
      landed === listing,
      `landed ${landed}, expected ${listing}`,
    );
  }
  await context.close();
}

// ═══ S3 · metadata and the share card ═════════════════════════════════════
for (const f of fixtures) {
  if (!f) continue;
  const isBase = f.chain === 8453;
  const url = `${BASE_URL}${vaultRoot(f.chain)}/${f.vault}/${f.holder}`;
  const html = await (await fetch(url)).text();
  const title = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? "";
  const meta = (prop) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`);
    const m = html.match(re) ?? html.match(new RegExp(`content="([^"]*)"[^>]+(?:property|name)="${prop}"`));
    return m ? m[1].replace(/&amp;/g, "&") : null;
  };
  const wanted = isBase ? "Rails | Vaults on Base" : "Rails | Vaults";
  check(`S3a·${f.label} the title names the section`, title.startsWith(wanted), JSON.stringify(title));
  check(`S3b·${f.label} the title names a Position`, title.includes("Position"), JSON.stringify(title));
  if (!isBase)
    check(
      `S3b'·${f.label} the title does not say a chain Ethereum never says`,
      !title.includes("on Ethereum"),
      JSON.stringify(title),
    );

  for (const [prop, kind] of [
    ["og:image", "opengraph-image"],
    ["twitter:image", "twitter-image"],
  ]) {
    const src = meta(prop);
    const route = `${vaultRoot(f.chain)}/${f.vault}/${f.holder}/${kind}`;
    check(`S3c·${f.label} ${prop} points at this route's own ${kind}`, !!src && src.includes(route), String(src));
    if (src) {
      const res = await fetch(src);
      const bytes = Buffer.from(await res.arrayBuffer());
      check(
        `S3d·${f.label} ${prop} renders a PNG`,
        res.status === 200 && (res.headers.get("content-type") ?? "").includes("image/png") && bytes.length > 10_240,
        `status ${res.status}, type ${res.headers.get("content-type")}, ${bytes.length} bytes`,
      );
    }
  }
}

// ═══ S4 · bookmarks ═══════════════════════════════════════════════════════
for (const f of fixtures) {
  if (!f) continue;
  const isBase = f.chain === 8453;
  // The EXPLORER's namespace, not a section's: a vault belongs to the protocol
  // whose factory deployed it, so its holder is bookmarked on that protocol's
  // rail (rails-ops decision 0028). `vaults-sessions` and `vaults-base-sessions`
  // went with the sections, and nothing rewrote what was stored under them.
  const scope = isBase ? "morpho-base" : "aave-vaults";
  const key = `${scope}-sessions`;
  const listingPath = `${vaultRoot(f.chain)}/positions`;
  const { context, page } = await openFixture(f);

  const toggle = page.locator('[data-position-card] button[aria-label="Bookmark this wallet"]').first();
  const found = (await toggle.count()) > 0;
  check(`S4a·${f.label} the card carries a bookmark toggle`, found, `${listingPath}/${f.vault}/${f.holder}`);
  if (!found) {
    await context.close();
    continue;
  }
  await toggle.click();
  const stored = await page.evaluate((k) => window.localStorage.getItem(k), key);
  check(
    `S4b·${f.label} the bookmark lands in the RAIL's namespace ${key}, carrying the listing it was taken on`,
    !!stored && stored.toLowerCase().includes(f.holder.toLowerCase()) && stored.includes('"listing":"vaults"'),
    String(stored).slice(0, 200),
  );

  // The header's own modal — the one surface that collects every scope.
  await page.click('button[aria-label="Bookmarks"]');
  await page.waitForSelector(`[data-bookmark-group="${scope}"]`, { timeout: 15_000 }).catch(() => {});
  const group = await page.evaluate((s) => {
    const g = document.querySelector(`[data-bookmark-group="${s}"]`);
    if (!g) return null;
    const heading = g.querySelector("a");
    const rows = [...g.querySelectorAll("a")].slice(1).map((a) => a.getAttribute("href"));
    return { heading: (heading?.textContent || "").trim(), headingHref: heading?.getAttribute("href"), rows };
  }, scope);
  check(
    `S4c·${f.label} the modal shows this vault's own explorer as the group`,
    group != null && /\S/.test(group.heading),
    JSON.stringify(group),
  );
  // The bookmarks modal forms a rail's href through `bookmarkHref`, and since
  // 2026-09-20 that reads the listing the bookmark was TAKEN on off the stored
  // row. Both chains therefore land on the vault positions listing — the page
  // the reader bookmarked from. Base landed on `/base/morpho`, Morpho Blue's
  // own borrower listing, until then: a true and different page about the same
  // address, which is what made it a wrong landing rather than a lost bookmark
  // (TO-DO-ui-jobs §42 item 1).
  //
  // ⚠️ AN ETHEREUM-ONLY GREEN PROVES NOTHING HERE. Aave's rail is
  // `positionListing: false`, so its bookmark reaches the vault listing through
  // the older branch whether or not the listing was recorded; only Base
  // exercises the new one. Break test D below is run on Base for that reason.
  const wantedHref = `${vaultRoot(f.chain)}/positions?q=${f.holder.toLowerCase()}`;
  check(
    `S4d·${f.label} the group's row opens the listing the bookmark was taken on`,
    !!group && group.rows.includes(wantedHref),
    JSON.stringify({ rows: group?.rows, wanted: wantedHref }),
  );

  // BACK-COMPAT, and it is the half a reader's browser is already holding.
  // Every bookmark written before 2026-09-20 has no recorded listing, so the
  // row is stripped of one here and the modal read again: it must open the
  // explorer's own listing — which is where such a bookmark opened before, and
  // is a live page — rather than null, a 404, or nothing at all. This is the
  // expectation S4d carried until the listing began to be recorded.
  await page.evaluate(
    ([k, holder]) => {
      const rows = JSON.parse(window.localStorage.getItem(k) ?? "[]");
      for (const r of rows) if (r.addresses?.[0]?.toLowerCase() === holder.toLowerCase()) delete r.listing;
      window.localStorage.setItem(k, JSON.stringify(rows));
    },
    [key, f.holder],
  );
  await page.reload({ waitUntil: "networkidle", timeout: 180_000 });
  await page.click('button[aria-label="Bookmarks"]');
  await page.waitForSelector(`[data-bookmark-group="${scope}"]`, { timeout: 15_000 }).catch(() => {});
  const legacyRows = await page.evaluate(
    (sc) =>
      [...(document.querySelector(`[data-bookmark-group="${sc}"]`)?.querySelectorAll("a") ?? [])]
        .slice(1)
        .map((a) => a.getAttribute("href")),
    scope,
  );
  const legacyWant = `${isBase ? "/base/morpho" : `${vaultRoot(f.chain)}/positions`}?q=${f.holder.toLowerCase()}`;
  const legacyStatus = legacyRows.includes(legacyWant)
    ? await fetch(`${BASE_URL}${legacyWant}`).then((r) => r.status)
    : 0;
  check(
    `S4d2·${f.label} a bookmark stored with no listing still opens the explorer's own listing, and it answers 200`,
    legacyRows.includes(legacyWant) && legacyStatus === 200,
    JSON.stringify({ rows: legacyRows, wanted: legacyWant, status: legacyStatus }),
  );

  // …and the VAULT positions listing, filtered to the same address, shows the
  // row already bookmarked. Read there rather than at the modal's href, which
  // S4d2 has just pointed at the explorer's own listing — on Base that is
  // Morpho Blue's, and a vault holder need hold no Blue position at all.
  await page.goto(`${BASE_URL}${vaultRoot(f.chain)}/positions?q=${f.holder.toLowerCase()}`, {
    waitUntil: "networkidle",
    timeout: 180_000,
  });
  const pressed = await page.evaluate((holder) => {
    const card = [...document.querySelectorAll("[data-position-card]")].find(
      (c) => (c.getAttribute("data-holder") || "").toLowerCase() === holder.toLowerCase(),
    );
    if (!card) return { card: false };
    const b = card.querySelector(
      'button[aria-label="Remove wallet bookmark"], button[aria-label="Bookmark this wallet"]',
    );
    return { card: true, pressed: b?.getAttribute("aria-pressed") ?? null };
  }, f.holder);
  check(`S4e·${f.label} the filtered listing carries this holder's row`, pressed.card, JSON.stringify(pressed));
  check(`S4f·${f.label} that row's toggle reads bookmarked`, pressed.pressed === "true", JSON.stringify(pressed));

  if (pressed.card) {
    await page.locator('[data-position-card] button[aria-label="Remove wallet bookmark"]').first().click();
    const after = await page.evaluate((k) => window.localStorage.getItem(k), key);
    check(`S4g·${f.label} toggling it off removes the key entirely`, after === null, `key ${key} now ${String(after)}`);
  }

  await context.close();
}

// ═══ S5 · the rail on a position page ════════════════════════════════════
// A vault sits inside the explorer whose factory deployed it (rails-ops
// decision 0028), so every vault surface draws THAT explorer's `RailHeader` —
// a position page included, which is what makes the back row a convenience
// rather than the only way out. The chain-scoped section's own row is gone and
// must not be drawn anywhere. Each href is read off the DOM and then FETCHED:
// a tab pointing at a 404 is the failure this is for, and a check that only
// compared strings could not see it.
for (const f of fixtures) {
  if (!f) continue;
  const { context, page, url } = await openFixture(f);
  const rails = await page.locator('nav[aria-label="Explorer sections"]').evaluateAll((navs) =>
    navs.map((nav) =>
      Array.from(nav.querySelectorAll("a")).map((a) => ({
        href: a.getAttribute("href"),
        label: a.getAttribute("aria-label"),
        link: a.getAttribute("data-link"),
        current: a.getAttribute("aria-current"),
      })),
    ),
  );
  const sectionRails = await page.locator('nav[aria-label="Section surfaces"]').count();
  const tabs = rails[0] ?? [];
  const statuses = [];
  for (const t of tabs) {
    const r = await fetch(`${BASE_URL}${t.href}`, { redirect: "follow" });
    statuses.push(`${t.href} ${r.status}`);
  }
  check(
    `S5a·${f.label} the position page draws ONE explorer rail carrying this vault's roster, every tab answering 200, and no section rail`,
    rails.length === 1 &&
      sectionRails === 0 &&
      tabs.some((t) => t.href === vaultRoot(f.chain)) &&
      statuses.every((st) => st.endsWith(" 200")),
    `${rails.length} rail(s), ${sectionRails} section rail(s), ${tabs.length} tabs on ${url} · ${statuses.join(", ") || "none"}`,
  );
  // A position has no stable place in the sub-nav — it is reached through a
  // listing — so no tab is where the reader is standing. `aria-current="page"`
  // on any tab here would be the rail claiming otherwise.
  const lit = tabs.filter((t) => t.current != null);
  check(
    `S5b·${f.label} no tab is lit on a position page`,
    lit.length === 0,
    lit.length ? lit.map((t) => `${t.href} aria-current=${t.current}`).join(", ") : "no aria-current on any tab",
  );
  await context.close();
}

await browser.close();

console.log(`\n${passes}/${passes + failures} · ${skipped} SKIP`);
process.exit(failures > 0 ? 1 : 0);
