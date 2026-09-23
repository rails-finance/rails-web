#!/usr/bin/env node
// One Aave vault on Ethereum, checked against the chain rather than against
// itself. /ethereum/aave/vaults/<vault> and /ethereum/aave/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ OR ITS OWN PARSE.
// Each page states the block it read at; this script then makes its OWN
// `eth_call`s AT THAT BLOCK — the enumerators, the vault's scalars, every
// family's mechanic, the `asset()` hops, the holder's balance, and
// `eth_getCode` on the holder — and recomputes the figures, the labels and the
// printed text from them. The one thing taken from the DOM is the block number,
// which is check 0b's subject and not a source of truth for anything else.
//
// AN EXPECTATION NEVER COMES FROM THE THING UNDER TEST. The served set's
// expectation is the CHAIN's roster, not the page's own answer and not a list
// committed in this repo: check 1c walks every address the two enumerators
// returned and asserts each has a page, which is what would go red if the route
// ever grew a hand-picked roster (the Base build's one recorded mistake). The
// holder fixtures below are INPUTS — which address to ask about, and which
// shape to expect — never expected figures: every number is re-read at the
// block the page states.
//
// ⚠️ A FIXTURE THAT HAS EXITED IS A FAILURE, NEVER A SKIP. The holder fixtures
// were found by a census at block 25,920,356 and addresses move. Check 6a
// asserts each still holds a POSITIVE balance at the page's own block and FAILS
// if it does not — a fixture that has left makes every check resting on it
// green-but-vacuous, and a silent pass would hide that.
//
// Run:
//   BASE=http://localhost:3612 node scripts/verify/verify-ethereum-vault-page.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed). NO eth_getLogs
// anywhere: every read here is an eth_call, an eth_getCode or an ENS lookup at
// one block, so the whole run works on a state endpoint.
//
// ── 2026-09-08 · THE HOLDER IS A PATH SEGMENT ──────────────────────────────
// `?holder=` is gone: a position is `/ethereum/aave/vaults/<vault>/<holder>`, and
// the vault's own route is the MARKET VIEW. 1d reads the roster's vault links
// inside the listing's drawer (the listing's own cards link to a holder, whose
// last segment is not a vault). 6d reads the printed shares, fraction and claim
// from the position CARD, which is now the one statement of them — the four
// tiles that repeated it are gone. That move was proved by making it: with the
// tiles removed and before the card named its figures, `FAIL 6d … 0x0c88…b63e
// shares "null" vs "8,175,545.013027"; fraction "null" vs "5.026%"; claim
// "null" vs "8,286,004.503258"` (40/41). Restored: 41/41.
//
// ── 2026-09-09 · ONE HEADLINE FORM ─────────────────────────────────────────
// The card no longer prints a second, six-decimal precision on the position
// page: every headline is the magnitude above a thousand ("8.18M") wherever the
// card is drawn. 6d therefore expects the HEADLINE form of its own read, and
// asserts the EXACT figure on the same element's `title=` — the statement did
// not leave the page, it moved to the attribute, and a check that only read the
// printed text would have been weakened by the move.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   0  the four sampled vault pages answer 200, each states a block near this
//      script's own head, and each lights VAULTS in the section rail — a
//      market view is the roster's child
//   1  the served test IS the catalogue: a real ERC-4626 outside the
//      enumerators' answer 404s with the stated reason, every address INSIDE it
//      answers 200, and the directory's own vault links point at those pages
//   2  the three common figures — totalAssets, totalSupply and the share price
//      with the exponent read PER VAULT — wei-exact against this script's own
//      reads, on a 6-decimal and an 18-decimal share token, printed by the
//      section's own amount and share-price rules
//   3  sGHO's mechanic: target rate, cap, remaining capacity (and the exact
//      cap − total == maxDeposit invariant, from this script's own reads), the
//      GHO the contract holds, the signed gap, both RAY slots, and the stored
//      update timestamp in en-GB UTC
//   4  a static aToken's mechanic: the wrapped aToken, the Pool the wrapper
//      names, that Pool's liquidity index, the link proved from BOTH ends, the
//      aToken balance, the signed custody gap and the reward registry
//   5  an Umbrella stake token's mechanic: cooldown and window, the slashable
//      amount and its floor (with totalAssets − floor == slashable proved from
//      this script's own reads), the reserve reached by this script's OWN
//      asset() hops, the deficit figures, the owner, the wrapper hop and its
//      share price — and that stkGHO, which holds GHO directly, has no wrapper
//   6  the holder half: shares, claim, maxRedeem, fraction, the shape label
//      against this script's own eth_getCode classification, the cooldown state
//      against the block's OWN timestamp, and the catalogue-member cross-link
//   7  ENS: a name resolves to the address this script's own resolver returns,
//      and a name that does not resolve states that rather than reading nothing
//   8  no USD anywhere on any of the four pages, and no rate of return
//   9  every figure is formatted in en-US (the block names it explicitly)
//  10  the dev provenance tripwire reports no uncovered figure on any of them
//
// ── PROVED IT CAN FAIL, 2026-09-06, BASE=http://localhost:3612 ───────────────
// Restored run: 41/41. Seven breaks, applied one at a time and reverted. The
// vault page itself is uncached (the loader reads the roster and the figures at
// one block per request), so no cache had to be cleared between them; the
// directory reading check 1d reads IS cached for five minutes, and B6 left it
// untouched because that break is in the vault loader, not the directory's.
//
//  B1  the vault loader asked `convertToAssets(10^18)` on every vault instead
//      of 10 ** its own `decimals()` — the decimals trap, made live. 39/41.
//      FAIL 2c ("0xd4fa…d23e: page 1184661635637719397 vs own 1184661;
//      0x6bf1…8aa6: page 1000000000000000000 vs own 1000000") and FAIL 2e
//      ("0xd4fa…d23e price \"1,184,661,635,637.7192\" vs \"1.184661\"").
//      🔑 2d stayed green, which is what it is for: the sample still spanned
//      both decimal classes, so 2c's premise held and the break landed on the
//      check meant to catch it.
//  B2  +1 raw unit on `data-total-assets-raw` in the view. 40/41.
//      FAIL 2a ("0xe175…ca1d: page 166867967276638790224538835 vs own
//      …834", and the same on all four).
//      🔑 2e stayed GREEN, and that is correct: this script re-formats its OWN
//      chain read rather than the page's attribute, so the printed text and the
//      raw attribute are two independent claims and the break forged only one.
//  B3  the holder's share balance salted (+1000 wei in the loader). 38/41.
//      FAIL 6a ("0x0c88…b63e on 0xe175…ca1d: page 7228713951590349280937773 vs
//      own …936773"), FAIL 6b (the claim no longer matched this script's own
//      `convertToAssets` of its OWN balance read) and FAIL 6d
//      ("0xcbc4…6b25 shares \"1,310,002.230431\" vs \"1,310,002.229431\"").
//      🔑 6c stayed green — `maxRedeem` is a separate call the break did not
//      touch, which is why the balance and the redeemable figure are compared
//      separately rather than one assumed from the other.
//  B4  the cooldown line dropped from the holder section
//      (`{holder.cooldown && (` → `{false && holder.cooldown && (`). 40/41.
//      FAIL 6f ("0x6bf1…8aa6: no cooldown line for a holder whose
//      getStakerCooldown() answers amount 2761242583125", and the two whose
//      snapshot is empty).
//      🔑 6c stayed green: `maxRedeem` still read 0, and a page can print a
//      truthful zero while dropping the sentence that says why — which is the
//      whole reason the STATE is checked and not only the number.
//      🔑 This break also found a fault in the check. On its first run every
//      stake-token fixture had an EMPTY snapshot, so 6f only ever met the
//      "none" branch and a page printing "none" for everyone would have passed
//      it. A holder with a real (expired) snapshot was added, and 6f now
//      asserts the sample spans more than one state.
//  B5  a USD figure added to the page's closing paragraph ("About $166,867,000
//      in all"). 40/41. FAIL 8a ("4 USD token(s): 0xe175…ca1d: $, …").
//      Every other check stayed green: a chain-truth violation of this shape is
//      an ADDITION, and nothing else in this file looks for one.
//  B6  the served test replaced by a hand-picked roster of the four sampled
//      addresses. 39/41. FAIL 1c ("14 catalogued vaults do not answer 200:
//      0x0bfc…1202 404, 0x7bc3…3af8 404, …") and FAIL 1d ("13 links; 0 to an
//      address the chain did not name; 9 to a page that 404s").
//      🔑 1a and 1b stayed green — a non-catalogue address still 404s and still
//      says why — which is exactly why the served test is checked from BOTH
//      sides: refusing the right address proves nothing about serving the right
//      ones. 🔑 1d's first wording reported the failure as "0 to an address the
//      chain did not name", which was true and useless; it now counts the dead
//      links separately and names them.
//  B7  the sign test in `signedText` reversed (`> 0` → `< 0`). 39/41.
//      FAIL 3c ("gap \"1,635.217747\" vs \"+1,635.217747\"") and FAIL 4d
//      ("gap \"0.01\" vs \"+0.01\"). Worth running because both gaps happen to
//      be positive at the sampled block: a check that compared only the digits
//      would have passed, and these two compare the sign of this script's own
//      subtraction as part of the expected string.
//
// ── PROVED IT CAN FAIL, 2026-09-09, BASE=http://localhost:3010 ──────────────
// Restored run: 42/42.
//  B8  the exact figure behind the shares headline truncated to whole units —
//      `formatUnitsExact(row.live.shares.raw, shareDecimals).split(".")[0]` in
//      components/vaults/vault-position-card.tsx. 41/42.
//      FAIL 6d — 'shares title "8175545 sGho" vs
//                 "8175545.013027052500995945 sGho"' (and on the other two).
//      🔑 The PRINTED headline was untouched and stayed green on its own terms,
//      which is the whole reason 6d gained the title assertion when the card
//      moved to one headline form: the compact text no longer carries the
//      wei-level figure, so the check would have gone quietly weaker without it.
//
// ── 2026-09-10 · THE NESTING SENTENCE (section 11) ──────────────────────────
// A static aToken's page now names the Umbrella stake token staked on it and the
// share of the vault that token holds, with the way through to that token's own
// holders; the position page whose holder is a catalogue vault carries the same
// way through; and the section's (i) page says once that the two layers hold the
// same assets. 44 → 50 checks.
//
// ── PROVED IT CAN FAIL, 2026-09-10, BASE=http://localhost:3767 ─────────────
// Restored run: 50/50. Six breaks, applied one at a time to a throwaway copy of
// the tree and reverted; the lines below are those runs' own output.
//
//  (a) THE SENTENCE NEVER RENDERED — `<BackedBySentence>` taken out of the
//      market view. 46/50.
//      FAIL 11a — 'page null null "null"; own 0x6bf1…8aa6 49334226126838
//                  "79.76%" (stkwaEthUSDC.v1) · sentence ""'
//      FAIL 11b — 'page "null", own balanceOf÷totalSupply "79.76%"'
//      FAIL 11c — 'href "null", want "/ethereum/aave/vaults/positions?vault=0x6bf1…8aa6"'
//      FAIL 11e — "0xb80b…a4df (of 10 unbacked) draws 0 sentence(s);
//                  0xd4fa…d23e draws 0"
//      🔑 11e is why it is a PAIR. "The unbacked vault says nothing" is true of a
//      build with no sentence anywhere, so the check asserts the backed page
//      still speaks in the same breath — otherwise P3 would be green on the one
//      outcome it exists to catch.
//
//  (b) THE SHARE OVER TOTAL ASSETS instead of the share supply. 48/50.
//      FAIL 11a — 'page … "67.30%"; own … "79.76%"'
//      FAIL 11b — 'page "67.30%", own balanceOf÷totalSupply "79.76%"'
//      🔑 Twelve points apart on an accruing wrapper, which is why 11b states
//      which denominator it means rather than just comparing a percentage.
//
//  (c) THE WAY THROUGH POINTING AT THE VAULT'S OWN PAGE rather than the listing
//      filtered to it — the link-not-list rule undone. 49/50.
//      FAIL 11c — 'href "/ethereum/aave/vaults/0x6bf1…8aa6", want
//                  "/ethereum/aave/vaults/positions?vault=0x6bf1…8aa6"'
//
//  (d) THE `asset()` GUARD DROPPED in the loader — any stake token, backing or
//      not. 50/50: IT STAYED GREEN, and the reason is worth keeping. The
//      zero-balance guard beside it already excludes a stake token that holds
//      none of the vault, and a stake token that is not staked on this wrapper
//      holds none of it — so one guard covers the other's case here. Dropping
//      BOTH is what the page would look like with no rule at all:
//  (d2) BOTH GUARDS DROPPED. 49/50.
//      FAIL 11e — "0xb80b…a4df (of 10 unbacked) draws 4 sentence(s);
//                  0xd4fa…d23e draws 4"
//
//  (e) THE POSITION PAGE'S WAY THROUGH REMOVED. 49/50.
//      FAIL 11f — 'holder-vault-holders null, href "null"'
//
//  (f) THE (i) PARAGRAPH REMOVED. 49/50.
//      FAIL 11g — "no [data-intro-layers] paragraph on /ethereum/aave/vaults/info"
//
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3612";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// ── the catalogue's own claims, parsed out of the TS ─────────────────────────
// Only the enumerator addresses are taken from the repo, and only to know WHOM
// TO ASK. Every judgement below comes from what they answer.
const CATALOG = (() => {
  const src = fs.readFileSync(path.join(ROOT, "lib/aave-vaults/vault-catalog.ts"), "utf8");
  const stataFactory = src.match(/AAVE_STATA_FACTORY = "(0x[0-9a-f]{40})"/)?.[1];
  const umbrella = src.match(/AAVE_UMBRELLA = "(0x[0-9a-f]{40})"/)?.[1];
  const sgho = src.match(/address: "(0x[0-9a-f]{40})",\s*\n\s*family: "sgho"/)?.[1];
  if (!stataFactory || !umbrella || !sgho) throw new Error("vault-catalog parse: enumerator or sGHO missing");
  return { stataFactory, umbrella, sgho };
})();

// ── the sample: one vault per family, plus a second stake token ─────────────
// stkGHO is here because it is the ONE stake token whose asset is not a
// wrapper — a reader written against the other three would never meet it.
const SGHO = CATALOG.sgho;
const WA_USDC = "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e";
const STK_USDC = "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6";
const STK_GHO = "0x4f827a63755855cdf3e8f3bcd20265c833f15033";
const SAMPLE = [SGHO, WA_USDC, STK_USDC, STK_GHO];

/** A real ERC-4626 on Ethereum mainnet that Aave's catalogue does not name:
 *  Maker's savings DAI. Check 1a proves BOTH halves from chain — that it
 *  answers the 4626 accessors, and that neither enumerator returned it —
 *  before asserting the page 404s, so "an Aave-shaped 4626 outside the
 *  catalogue is not a vault this section knows" is tested rather than asserted. */
const OUTSIDE_4626 = "0x83f20f44975d03b1b09e64809b757c47f942beea";

/** Holder fixtures — INPUTS, from the census at block 25,920,356 (per-vault
 *  JSON in the session scratchpad). Each names an address to ask about and the
 *  SHAPE the census classified it as; every figure is re-read here. Chosen to
 *  span the classes the shape reader has branches for. */
const HOLDERS = [
  // Re-pinned 2026-09-20: the previous sGHO EOA fixture
  // (0x0c88…b63e) had left the vault, so 6a/6b/6d were red — a changed-state
  // fixture is a failure for a person to re-pin, which is what this is. Chosen
  // from a Transfer sweep of the share token over its whole life (deploy
  // 25,028,623 → head 26,018,615): of the live EOA holders it is the one that
  // has NEVER sent a share out — four transfers in, zero out — so it is the
  // least likely of the candidates to exit again. 3,806,723.919824294854186120
  // sGho at block 26,018,615 (2.36% of supply, figures worth checking), first
  // Transfer-in at block 25,152,729, and eth_getCode answers 0x.
  { vault: SGHO, holder: "0xc2b7d2aedf1f24d3409788e3a95d021ceb2238f8", shape: "eoa" },
  { vault: SGHO, holder: "0x1676d23711186076fa74aa53511dda750a1f0d9a", shape: "safe" },
  { vault: STK_USDC, holder: "0xcbc463beae0da08a439dc9d10a5690c084ef6b25", shape: "delegated-account" },
  { vault: STK_GHO, holder: "0x3e43a976a28e593ef2494a8fda4135bf3260f8ee", shape: "eoa" },
  // The layer holding itself: the stake token is the largest holder of the
  // wrapper it stakes. This is the cross-link's fixture.
  { vault: WA_USDC, holder: STK_USDC, shape: "aave-vault" },
  // A stake-token holder carrying a NON-EMPTY cooldown snapshot. Without it the
  // cooldown check would only ever meet the "none" branch, and a page that
  // printed "none" for every reader would pass it — check 6f asserts the sample
  // spans more than one state for that reason.
  { vault: STK_USDC, holder: "0xdd62115f601daebccfdd2aeed834513d8dc2f4e2", shape: "eoa" },
];

/** A name that resolves on mainnet, and one that does not. Both expectations
 *  come from this script's OWN resolver call, never from the page. */
const ENS_NAME = "vitalik.eth";
const ENS_MISS = "rails-verify-no-such-name-9f2c.eth";

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3 }),
});

const ENUM_ABI = parseAbi([
  "function getStataTokens() view returns (address[])",
  "function getStkTokens() view returns (address[])",
]);
const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function maxRedeem(address) view returns (uint256)",
]);
const SGHO_ABI = parseAbi([
  "function targetRate() view returns (uint16)",
  "function supplyCap() view returns (uint160)",
  "function maxDeposit(address) view returns (uint256)",
  "function yieldIndex() view returns (uint176)",
  "function ratePerSecond() view returns (uint96)",
  "function lastUpdate() view returns (uint64)",
]);
const STATA_ABI = parseAbi([
  "function aToken() view returns (address)",
  "function POOL() view returns (address)",
  "function rewardTokens() view returns (address[])",
]);
const POOL_ABI = parseAbi([
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);
const STAKE_ABI = parseAbi([
  "function getCooldown() view returns (uint256)",
  "function getUnstakeWindow() view returns (uint256)",
  "function getMaxSlashableAssets() view returns (uint256)",
  "function MIN_ASSETS_REMAINING() view returns (uint256)",
  "function owner() view returns (address)",
  "function getStakerCooldown(address) view returns ((uint192 amount, uint32 endOfCooldown, uint32 withdrawalWindow))",
]);
const UMBRELLA_ABI = parseAbi([
  "function isReserveSlashable(address reserve) view returns (bool, uint256)",
  "function getDeficitOffset(address reserve) view returns (uint256)",
  "function getPendingDeficit(address reserve) view returns (uint256)",
]);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

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
const lc = (a) => (typeof a === "string" ? a.toLowerCase() : a);

// ── the section's own print rules, restated so a change to them goes red ─────
const exactUnits = (raw, decimals) => {
  const s = String(raw).padStart(decimals + 1, "0");
  const cut = s.length - decimals;
  return (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
};
/** components/protocol/morpho-base/vault-exposure-parts.tsx `assetText`. */
const amountText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals <= 6 ? 2 : 6,
  });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
/** …its `shareText`. */
const shareText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
/** `lib/utils/format.ts` `formatApproximate`, and the ONE headline rule
 *  `components/vaults/vault-position-card.tsx` now applies on every render of
 *  the card — the listing and this position page alike (2026-09-09). The exact
 *  figure did not leave the page: it rides `title=` on the same element, which
 *  is what 6d asserts beside the printed text. */
const formatApproximate = (value) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
};
const headline = (exact, value) => (Math.abs(value) >= 1000 ? formatApproximate(value) : exact);
/** components/vaults/aave-vault-format.ts `sharePriceText`. */
const sharePriceText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
/** …its `durationText`. */
const durationText = (seconds) => {
  const n = (v) => v.toLocaleString("en-US");
  if (seconds % 86400 === 0) return `${n(seconds / 86400)} ${seconds === 86400 ? "day" : "days"}`;
  if (seconds % 3600 === 0) return `${n(seconds / 3600)} ${seconds === 3600 ? "hour" : "hours"}`;
  return `${n(seconds)} seconds`;
};
/** …its `utcInstant`: en-GB, UTC, both pinned. */
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
const pctText = (fraction) => `${(fraction * 100).toPrecision(4)}%`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
const page = await context.newPage();

const head = await client.getBlockNumber();

/** Open one vault page (optionally on a holder) and read every handle off the
 *  DOM in one pass. Nothing here is an expectation — it is the claim. */
async function readVaultPage(vault, holder) {
  const url = `${BASE}/ethereum/aave/vaults/${vault}${holder ? `/${encodeURIComponent(holder)}` : ""}`;
  const res = await page.goto(url, { waitUntil: "networkidle" });
  const status = res?.status() ?? 0;
  if (status !== 200) return { url, status };
  const grab = async (sel, attr) => {
    const el = page.locator(sel);
    if ((await el.count()) === 0) return null;
    return attr ? el.first().getAttribute(attr) : (await el.first().innerText()).replace(/\s+/g, " ").trim();
  };
  // A stat card's `[data-figure]` wraps the label, the value AND the note, so a
  // comparison against a formatted figure would either fail or pass on a
  // substring. `[data-figure-value]` is the value alone; an inline figure has no
  // such child and IS its own value.
  const figure = async (name) => {
    const value = page.locator(`[data-figure="${name}"] [data-figure-value]`);
    if ((await value.count()) > 0) return (await value.first().innerText()).replace(/\s+/g, " ").trim();
    return grab(`[data-figure="${name}"]`);
  };
  return {
    url,
    status,
    blockNumber: Number(await grab("[data-vault-block]", "data-vault-block")),
    family: await grab("[data-vault-family]", "data-vault-family"),
    attestation: await grab("[data-vault-attestation]", "data-vault-attestation"),
    totalAssetsRaw: await grab("[data-vault-figures]", "data-total-assets-raw"),
    totalSupplyRaw: await grab("[data-vault-figures]", "data-total-supply-raw"),
    sharePriceRaw: await grab("[data-vault-figures]", "data-share-price-raw"),
    totalAssetsText: await figure("total-assets"),
    sharePriceText: await figure("share-price"),
    mechanic: await grab("[data-mechanic]", "data-mechanic"),
    // sGHO
    targetRate: await figure("sgho-target-rate"),
    supplyCap: await figure("sgho-supply-cap"),
    capacity: await figure("sgho-capacity"),
    sghoAssetHeld: await figure("sgho-asset-held"),
    sghoAssetGap: await figure("sgho-asset-gap"),
    sghoLastUpdate: await figure("sgho-last-update"),
    sghoYieldIndex: await figure("sgho-yield-index"),
    sghoRatePerSecond: await figure("sgho-rate-per-second"),
    // stata
    stataAToken: await grab("[data-stata-atoken]", "data-stata-atoken"),
    stataIndex: await figure("stata-liquidity-index"),
    stataATokenBalance: await figure("stata-atoken-balance"),
    stataCustodyGap: await figure("stata-custody-gap"),
    stataRewardTokens: await figure("stata-reward-tokens"),
    stataLinkAgrees: await grab("[data-stata-link-agrees]", "data-stata-link-agrees"),
    // umbrella
    cooldown: await figure("umbrella-cooldown"),
    maxSlashable: await figure("umbrella-max-slashable"),
    minRemaining: await figure("umbrella-min-remaining"),
    umbrellaAssetHeld: await figure("umbrella-asset-held"),
    deficitOffset: await figure("umbrella-deficit-offset"),
    pendingDeficit: await figure("umbrella-pending-deficit"),
    reserveLine: await figure("umbrella-reserve"),
    umbrellaOwner: await grab("[data-umbrella-owner]", "data-umbrella-owner"),
    wrapperHop: await grab("[data-wrapper-hop]", "data-wrapper-hop"),
    wrapperPrice: await figure("umbrella-wrapper-price"),
    wrapperIndex: await figure("umbrella-wrapper-index"),
    // holder
    holderAddress: await grab("[data-holder]", "data-holder"),
    holderSharesRaw: await grab("[data-holder]", "data-holder-shares-raw"),
    holderClaimRaw: await grab("[data-holder]", "data-holder-claim-raw"),
    holderMaxRedeemRaw: await grab("[data-holder]", "data-max-redeem-raw"),
    holderShapeKind: await grab("[data-holder]", "data-holder-shape-kind"),
    holderCooldownState: await grab("[data-holder]", "data-holder-cooldown-state"),
    holderSharesText: await figure("holder-shares"),
    holderFraction: await figure("holder-fraction"),
    holderClaim: await figure("holder-claim"),
    // `StatValue` puts `title` and `data-figure` on ONE element, so the exact
    // figure behind each headline is read off the very element that printed the
    // headline — not off a neighbour that could agree by accident.
    holderSharesTitle: await grab('[data-figure="holder-shares"]', "title"),
    holderClaimTitle: await grab('[data-figure="holder-claim"]', "title"),
    holderMaxRedeem: await figure("holder-max-redeem"),
    holderShape: await figure("holder-shape"),
    holderCooldown: await figure("holder-cooldown"),
    holderCatalogued: await figure("holder-catalogued"),
    catalogueMember: await grab("[data-catalogue-member]", "data-catalogue-member"),
    // The nesting sentence: whose backing these shares are (plan §5). The
    // paragraph carries the stake token and its raw balance as attributes; the
    // share is its own figure, and the way through to that token's holders is a
    // link whose href is the listing filtered to it.
    backedBy: await grab('[data-figure="vault-backed-by"]', "data-backed-by"),
    backedBySharesRaw: await grab('[data-figure="vault-backed-by"]', "data-backed-by-shares-raw"),
    backedByShare: await figure("vault-backed-by-share"),
    backedBySentence: await grab('[data-figure="vault-backed-by"]'),
    backedByCount: await page.locator('[data-figure="vault-backed-by"]').count(),
    backedByHoldersHref: await grab("[data-link='backed-by-holders']", "href"),
    holderVaultHolders: await grab("[data-holder-vault-holders]", "data-holder-vault-holders"),
    holderVaultHoldersHref: await grab("[data-link='holder-vault-holders']", "href"),
    wrapperClaim: await figure("holder-wrapper-claim"),
    lookupError: await grab("[data-lookup-error]", "data-lookup-error"),
    ensNote: (await page.getByText("resolved through mainnet ENS").count()) > 0,
    blockText: await grab("[data-vault-block]"),
    bodyText: (await page.locator("main, body").first().innerText()).replace(/\s+/g, " "),
    // The section rail's tabs — a vault's market view is the roster's child,
    // so VAULTS is the slot that must be lit here (0c).
    railTabs: await page.locator('nav[aria-label="Explorer sections"] a').evaluateAll((els) =>
      els.map((e) => ({
        href: e.getAttribute("href"),
        current: e.getAttribute("aria-current"),
      })),
    ),
    tripwire: await page.locator("[data-prov-tripwire]").count(),
    uncovered: await page
      .locator("[data-prov-uncovered]")
      .evaluateAll((els) => els.map((e) => e.textContent?.trim().slice(0, 40))),
  };
}

// ── 0: the pages answer, and each states its own block ──────────────────────
const PAGES = new Map();
for (const v of SAMPLE) PAGES.set(v, await readVaultPage(v));
const bad0 = SAMPLE.filter((v) => PAGES.get(v).status !== 200);
check(
  "0a every sampled vault page answers 200 — one per family, plus the stake token whose asset is not a wrapper",
  bad0.length === 0,
  bad0.length ? bad0.map((v) => `${short(v)} ${PAGES.get(v).status}`).join(", ") : `${SAMPLE.length} pages`,
);
const bad0b = SAMPLE.filter((v) => {
  const b = PAGES.get(v).blockNumber;
  // The bound is on the DRIFT, either way: this script reads its head once and
  // the pages read theirs per request, so a page's block can sit a block or two
  // ahead of it. What must not happen is a page stating a block from an hour
  // ago and figures read at the head.
  return !Number.isInteger(b) || b <= 0 || Math.abs(Number(head) - b) >= 200;
});
check(
  "0b each page states the block it read at, and it is within 200 blocks of this script's own head",
  bad0b.length === 0,
  `own head ${head}; pages ${SAMPLE.map((v) => PAGES.get(v).blockNumber).join(", ")}`,
);
// A market view is the ROSTER's child — the roster is where a reader met this
// vault — so the explorer rail lights VAULTS here, and lights exactly one tab.
const bad0c = SAMPLE.filter((v) => {
  const lit = (PAGES.get(v).railTabs ?? []).filter((t) => t.current === "page");
  return lit.length !== 1 || lit[0].href !== "/ethereum/aave/vaults";
});
check(
  "0c the explorer rail on a market view lights VAULTS, and nothing else",
  bad0c.length === 0,
  bad0c.length
    ? bad0c
        .map((v) => `${short(v)} lit ${JSON.stringify((PAGES.get(v).railTabs ?? []).filter((t) => t.current))}`)
        .join(" · ")
    : `${SAMPLE.length} pages light /ethereum/aave/vaults`,
);

// ── the chain's own roster, at the block one of the pages named ─────────────
const rosterBlock = BigInt(PAGES.get(SGHO).blockNumber || Number(head));
const [stataRaw, stakeRaw] = await Promise.all([
  client.readContract({
    address: CATALOG.stataFactory,
    abi: ENUM_ABI,
    functionName: "getStataTokens",
    blockNumber: rosterBlock,
  }),
  client.readContract({
    address: CATALOG.umbrella,
    abi: ENUM_ABI,
    functionName: "getStkTokens",
    blockNumber: rosterBlock,
  }),
]);
const stata = stataRaw.map(lc);
const stake = stakeRaw.map(lc);
const CHAIN_ROSTER = [SGHO, ...stata, ...stake];

// ── 1: the served test IS the catalogue, checked from both sides ────────────
const outside = await client.multicall({
  contracts: [
    { address: OUTSIDE_4626, abi: VAULT_ABI, functionName: "asset" },
    { address: OUTSIDE_4626, abi: VAULT_ABI, functionName: "convertToAssets", args: [BigInt(10) ** BigInt(18)] },
  ],
  allowFailure: true,
  batchSize: 0,
  blockNumber: rosterBlock,
});
const outsideIs4626 = outside.every((r) => r.status === "success");
const outsideNotInRoster = !CHAIN_ROSTER.includes(OUTSIDE_4626);
// The STATUS is correct for every reader; the WORDS are drawn by the browser
// from the flight payload (components/shared/route-not-found.tsx records the
// measurement), so the body is read after the client has settled rather than
// off the server's HTML.
const outsideRes = await page.goto(`${BASE}/ethereum/aave/vaults/${OUTSIDE_4626}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=No vault page for this address", { timeout: 15000 }).catch(() => {});
check(
  "1a a real ERC-4626 the enumerators did not name answers 404 — the served test is membership, not shape",
  outsideIs4626 && outsideNotInRoster && outsideRes?.status() === 404,
  `${short(OUTSIDE_4626)} answers the 4626 accessors: ${outsideIs4626}; in the chain's roster: ${!outsideNotInRoster}; page status ${outsideRes?.status()}`,
);
const nfText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
check(
  "1b the 404 states WHY — the address book plus the two enumerators Aave names",
  /address book/i.test(nfText) && nfText.includes("getStataTokens()") && nfText.includes("getStkTokens()"),
  `body: "${nfText.slice(0, 140)}…"`,
);
const roster404 = [];
for (const v of CHAIN_ROSTER) {
  const r = await page.goto(`${BASE}/ethereum/aave/vaults/${v}`, { waitUntil: "domcontentloaded" });
  if (r?.status() !== 200) roster404.push(`${short(v)} ${r?.status()}`);
}
check(
  "1c EVERY address the chain's enumerators named has a page — a hand-picked roster on this route would go red here",
  roster404.length === 0 && CHAIN_ROSTER.length > 1,
  roster404.length
    ? `${roster404.length} catalogued vaults do not answer 200: ${roster404.slice(0, 4).join(", ")}`
    : `${CHAIN_ROSTER.length} vaults answered 200`,
);
// The roster is the VAULTS tab's landing page — /ethereum/aave/vaults —
// the section rail — so its links are read there, and read INSIDE the panel,
// because the listing's own cards link to /ethereum/aave/vaults/<vault>/<holder>,
// whose last segment is a holder rather than a vault.
await page.goto(`${BASE}/ethereum/aave/vaults`, { waitUntil: "networkidle" });
await page.waitForSelector("[data-roster-panel] [data-vault-row]", { timeout: 90000 });
const dirLinks = await page
  .locator('[data-roster-panel] a[href^="/ethereum/aave/vaults/0x"]')
  .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("href")))]);
const dirTargets = dirLinks.map((h) => h.split("/").pop());
const dirBad = dirTargets.filter((a) => !CHAIN_ROSTER.includes(a));
// A link into a route that 404s is worse than no link: the directory would be
// promising a reading the section refuses to give.
const dirDead = dirTargets.filter((a) => roster404.some((r) => r.startsWith(short(a))));
check(
  "1d the directory's vault links point INTO this route, at addresses the chain's enumerators named, and none of them 404s",
  dirLinks.length > 0 && dirBad.length === 0 && dirDead.length === 0,
  `${dirLinks.length} links; ${dirBad.length} to an address the chain did not name; ${dirDead.length} to a page that 404s${dirDead.length ? ` (${dirDead.slice(0, 3).map(short).join(", ")})` : ""}`,
);

// ── this script's own reads of the four sampled vaults, at their own blocks ──
const OWN = new Map();
for (const v of SAMPLE) {
  const bn = BigInt(PAGES.get(v).blockNumber);
  const r = await client.multicall({
    contracts: ["decimals", "asset", "totalAssets", "totalSupply", "symbol"].map((functionName) => ({
      address: v,
      abi: VAULT_ABI,
      functionName,
    })),
    allowFailure: true,
    batchSize: 0,
    blockNumber: bn,
  });
  const g = (i) => (r[i].status === "success" ? r[i].result : null);
  const decimals = g(0);
  const sp = await client.readContract({
    address: v,
    abi: VAULT_ABI,
    functionName: "convertToAssets",
    args: [BigInt(10) ** BigInt(decimals ?? 18)],
    blockNumber: bn,
  });
  OWN.set(v, {
    block: bn,
    decimals,
    asset: lc(g(1)),
    totalAssets: g(2),
    totalSupply: g(3),
    symbol: g(4),
    sharePrice: sp,
  });
}
// Every distinct token's symbol and decimals — the units the page prints in.
const tokenAddrs = [...new Set([...OWN.values()].map((o) => o.asset).filter(Boolean))];
const tokenMeta = await client.multicall({
  contracts: tokenAddrs.flatMap((a) => [
    { address: a, abi: VAULT_ABI, functionName: "symbol" },
    { address: a, abi: VAULT_ABI, functionName: "decimals" },
  ]),
  allowFailure: true,
  batchSize: 0,
  blockNumber: rosterBlock,
});
const TOKEN = new Map(
  tokenAddrs.map((a, i) => [
    a,
    {
      symbol: tokenMeta[i * 2].status === "success" ? tokenMeta[i * 2].result : null,
      decimals: tokenMeta[i * 2 + 1].status === "success" ? tokenMeta[i * 2 + 1].result : null,
    },
  ]),
);
const assetDecimalsOf = (v) => Number(TOKEN.get(OWN.get(v).asset)?.decimals);

// ── 2: the three common figures ─────────────────────────────────────────────
const cmp = (name, get, want) => {
  const bad = SAMPLE.filter((v) => get(PAGES.get(v)) !== want(v));
  return {
    ok: bad.length === 0,
    detail: bad.length
      ? bad.map((v) => `${short(v)}: page ${get(PAGES.get(v))} vs own ${want(v)}`).join("; ")
      : `${SAMPLE.length} compared`,
  };
};
const r2a = cmp(
  "totalAssets",
  (p) => p.totalAssetsRaw,
  (v) => String(OWN.get(v).totalAssets),
);
check(
  "2a every page's raw totalAssets() equals this script's own read at the block it states, wei-exact",
  r2a.ok,
  r2a.detail,
);
const r2b = cmp(
  "totalSupply",
  (p) => p.totalSupplyRaw,
  (v) => String(OWN.get(v).totalSupply),
);
check("2b every page's raw totalSupply() equals this script's own read, wei-exact", r2b.ok, r2b.detail);
const r2c = cmp(
  "sharePrice",
  (p) => p.sharePriceRaw,
  (v) => String(OWN.get(v).sharePrice),
);
check(
  "2c the raw share price equals this script's own convertToAssets(10 ** the vault's OWN decimals) — the decimals trap",
  r2c.ok,
  r2c.detail + ` (exponents ${SAMPLE.map((v) => `10^${OWN.get(v).decimals}`).join(", ")})`,
);
const six = SAMPLE.filter((v) => Number(OWN.get(v).decimals) === 6);
const eighteen = SAMPLE.filter((v) => Number(OWN.get(v).decimals) === 18);
check(
  "2d the share-price comparison covers a 6-decimal AND an 18-decimal share token — a sample of one class proves nothing",
  six.length > 0 && eighteen.length > 0,
  `6-dec ${six.map(short).join(", ") || "none"}; 18-dec ${eighteen.map(short).join(", ") || "none"}`,
);
const printBad = [];
for (const v of SAMPLE) {
  const p = PAGES.get(v);
  const o = OWN.get(v);
  const ad = assetDecimalsOf(v);
  const wantTotal = amountText(o.totalAssets, ad);
  const wantPrice = sharePriceText(o.sharePrice, ad);
  if (!p.totalAssetsText?.startsWith(wantTotal))
    printBad.push(`${short(v)} total "${p.totalAssetsText}" vs "${wantTotal}"`);
  if (!p.sharePriceText?.startsWith(wantPrice))
    printBad.push(`${short(v)} price "${p.sharePriceText}" vs "${wantPrice}"`);
}
check(
  "2e the printed total and share price follow the section's own amount and share-price rules, on both decimal classes",
  printBad.length === 0,
  printBad.slice(0, 3).join("; ") || `${SAMPLE.length * 2} figures re-formatted from this script's own reads`,
);

// ── 3: sGHO's mechanic ──────────────────────────────────────────────────────
const sghoPage = PAGES.get(SGHO);
const sghoBlock = OWN.get(SGHO).block;
const sghoAd = assetDecimalsOf(SGHO);
const sghoOwn = await client.multicall({
  contracts: [
    { address: SGHO, abi: SGHO_ABI, functionName: "targetRate" },
    { address: SGHO, abi: SGHO_ABI, functionName: "supplyCap" },
    { address: SGHO, abi: SGHO_ABI, functionName: "maxDeposit", args: [SGHO] },
    { address: SGHO, abi: SGHO_ABI, functionName: "yieldIndex" },
    { address: SGHO, abi: SGHO_ABI, functionName: "ratePerSecond" },
    { address: SGHO, abi: SGHO_ABI, functionName: "lastUpdate" },
    { address: OWN.get(SGHO).asset, abi: ERC20_ABI, functionName: "balanceOf", args: [SGHO] },
  ],
  allowFailure: false,
  batchSize: 0,
  blockNumber: sghoBlock,
});
const [ownRate, ownCap, ownMaxDeposit, ownIndex, ownRatePerSec, ownLastUpdate, ownGhoHeld] = sghoOwn;
check(
  "3a the sGHO page states this script's own targetRate(), in the basis points the contract stores",
  sghoPage.mechanic === "sgho" && sghoPage.targetRate === Number(ownRate).toLocaleString("en-US"),
  `page "${sghoPage.targetRate}" vs own ${ownRate}`,
);
check(
  "3b the cap and the remaining capacity are this script's own supplyCap() and maxDeposit(), and cap − total == maxDeposit exactly",
  sghoPage.supplyCap?.startsWith(amountText(ownCap, sghoAd)) &&
    sghoPage.capacity?.startsWith(amountText(ownMaxDeposit, sghoAd)) &&
    ownCap - OWN.get(SGHO).totalAssets === ownMaxDeposit,
  `cap "${sghoPage.supplyCap}" vs "${amountText(ownCap, sghoAd)}"; capacity "${sghoPage.capacity}" vs "${amountText(ownMaxDeposit, sghoAd)}"; invariant ${ownCap - OWN.get(SGHO).totalAssets === ownMaxDeposit}`,
);
const ownGap = ownGhoHeld - OWN.get(SGHO).totalAssets;
const wantGapText = (ownGap > BigInt(0) ? "+" : "") + amountText(ownGap, sghoAd);
check(
  "3c the GHO the contract holds is a separate read from totalAssets(), and the gap is stated with the sign of this script's own subtraction",
  sghoPage.sghoAssetHeld?.startsWith(amountText(ownGhoHeld, sghoAd)) && sghoPage.sghoAssetGap?.startsWith(wantGapText),
  `held "${sghoPage.sghoAssetHeld}" vs "${amountText(ownGhoHeld, sghoAd)}"; gap "${sghoPage.sghoAssetGap}" vs "${wantGapText}" (own ${ownGap})`,
);
check(
  "3d both RAY slots print as the contract stores them — the yield index and the rate per second, neither compounded out",
  sghoPage.sghoYieldIndex === String(ownIndex) && sghoPage.sghoRatePerSecond === String(ownRatePerSec),
  `index page "${sghoPage.sghoYieldIndex}" vs own ${ownIndex}; rate page "${sghoPage.sghoRatePerSecond}" vs own ${ownRatePerSec}`,
);
check(
  "3e the stored lastUpdate() prints as a UTC instant in en-GB, and is NOT this block's own timestamp",
  sghoPage.sghoLastUpdate === utcInstant(Number(ownLastUpdate)),
  `page "${sghoPage.sghoLastUpdate}" vs own ${utcInstant(Number(ownLastUpdate))} (slot ${ownLastUpdate})`,
);

// ── 4: a static aToken's mechanic ───────────────────────────────────────────
const stataPage = PAGES.get(WA_USDC);
const stataBlock = OWN.get(WA_USDC).block;
const stataAd = assetDecimalsOf(WA_USDC);
const stataOwn = await client.multicall({
  contracts: [
    { address: WA_USDC, abi: STATA_ABI, functionName: "aToken" },
    { address: WA_USDC, abi: STATA_ABI, functionName: "POOL" },
    { address: WA_USDC, abi: STATA_ABI, functionName: "rewardTokens" },
  ],
  allowFailure: false,
  batchSize: 0,
  blockNumber: stataBlock,
});
const [ownAToken, ownPool, ownRewards] = stataOwn;
const ownReserveData = await client.readContract({
  address: ownPool,
  abi: POOL_ABI,
  functionName: "getReserveData",
  args: [OWN.get(WA_USDC).asset],
  blockNumber: stataBlock,
});
const ownATokenBalance = await client.readContract({
  address: ownAToken,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [WA_USDC],
  blockNumber: stataBlock,
});
check(
  "4a the wrapped aToken on the page is the one this script's own aToken() call returns",
  stataPage.mechanic === "stata" && lc(stataPage.stataAToken) === lc(ownAToken),
  `page ${stataPage.stataAToken} vs own ${lc(ownAToken)}`,
);
check(
  "4b the liquidity index is this script's own getReserveData() on the Pool the WRAPPER names, not on a Pool assumed here",
  stataPage.stataIndex === String(ownReserveData.liquidityIndex) && stataPage.bodyText.includes(short(lc(ownPool))),
  `index page "${stataPage.stataIndex}" vs own ${ownReserveData.liquidityIndex}; pool ${short(lc(ownPool))} named: ${stataPage.bodyText.includes(short(lc(ownPool)))}`,
);
check(
  "4c the wrapper→aToken link is stated from BOTH ends, and this script's own two reads agree with the page's verdict",
  stataPage.stataLinkAgrees === String(lc(ownReserveData.aTokenAddress) === lc(ownAToken)),
  `page says "${stataPage.stataLinkAgrees}"; own wrapper.aToken() ${lc(ownAToken)}, own Pool aTokenAddress ${lc(ownReserveData.aTokenAddress)}`,
);
const ownCustodyGap = ownATokenBalance - OWN.get(WA_USDC).totalAssets;
const wantCustodyText = (ownCustodyGap > BigInt(0) ? "+" : "") + amountText(ownCustodyGap, stataAd);
check(
  "4d the aToken balance and the signed custody gap are this script's own balanceOf() and its own subtraction",
  stataPage.stataATokenBalance?.startsWith(amountText(ownATokenBalance, stataAd)) &&
    stataPage.stataCustodyGap?.startsWith(wantCustodyText),
  `balance "${stataPage.stataATokenBalance}" vs "${amountText(ownATokenBalance, stataAd)}"; gap "${stataPage.stataCustodyGap}" vs "${wantCustodyText}" (own ${ownCustodyGap})`,
);
check(
  "4e the reward registry is stated as what rewardTokens() answered — an empty list is a reading, and it is named as a registry",
  (ownRewards.length === 0
    ? /returned an empty list/.test(stataPage.stataRewardTokens ?? "")
    : new RegExp(`returned ${ownRewards.length} address`).test(stataPage.stataRewardTokens ?? "")) &&
    /registry/.test(stataPage.stataRewardTokens ?? ""),
  `own rewardTokens() length ${ownRewards.length}; page "${(stataPage.stataRewardTokens ?? "").slice(0, 110)}…"`,
);

// ── 5: an Umbrella stake token's mechanic ───────────────────────────────────
const stkPage = PAGES.get(STK_USDC);
const stkBlock = OWN.get(STK_USDC).block;
const stkAd = assetDecimalsOf(STK_USDC);
const stkOwn = await client.multicall({
  contracts: [
    { address: STK_USDC, abi: STAKE_ABI, functionName: "getCooldown" },
    { address: STK_USDC, abi: STAKE_ABI, functionName: "getUnstakeWindow" },
    { address: STK_USDC, abi: STAKE_ABI, functionName: "getMaxSlashableAssets" },
    { address: STK_USDC, abi: STAKE_ABI, functionName: "MIN_ASSETS_REMAINING" },
    { address: STK_USDC, abi: STAKE_ABI, functionName: "owner" },
    { address: OWN.get(STK_USDC).asset, abi: ERC20_ABI, functionName: "balanceOf", args: [STK_USDC] },
  ],
  allowFailure: false,
  batchSize: 0,
  blockNumber: stkBlock,
});
const [ownCooldown, ownWindow, ownSlashable, ownMinRemaining, ownOwner, ownStkCustody] = stkOwn;
// The reserve, reached by THIS SCRIPT's own asset() hops — never taken from the
// page and never from getStakeTokenData(), whose first word is not the asset.
const stkAsset = OWN.get(STK_USDC).asset;
const ownWrapperAsset = stata.includes(stkAsset)
  ? lc(await client.readContract({ address: stkAsset, abi: VAULT_ABI, functionName: "asset", blockNumber: stkBlock }))
  : stkAsset;
const reserveMeta = await client.multicall({
  contracts: [
    { address: ownWrapperAsset, abi: VAULT_ABI, functionName: "symbol" },
    { address: ownWrapperAsset, abi: VAULT_ABI, functionName: "decimals" },
  ],
  allowFailure: false,
  batchSize: 0,
  blockNumber: stkBlock,
});
const [reserveSymbol, reserveDecimals] = reserveMeta;
const umbrellaOwn = await client.multicall({
  contracts: [
    { address: CATALOG.umbrella, abi: UMBRELLA_ABI, functionName: "isReserveSlashable", args: [ownWrapperAsset] },
    { address: CATALOG.umbrella, abi: UMBRELLA_ABI, functionName: "getDeficitOffset", args: [ownWrapperAsset] },
    { address: CATALOG.umbrella, abi: UMBRELLA_ABI, functionName: "getPendingDeficit", args: [ownWrapperAsset] },
  ],
  allowFailure: false,
  batchSize: 0,
  blockNumber: stkBlock,
});
const [ownSlashableFlag, ownDeficitOffset, ownPendingDeficit] = umbrellaOwn;
check(
  "5a the cooldown and the unstake window are this script's own getCooldown() and getUnstakeWindow(), by the section's duration rule",
  stkPage.mechanic === "umbrella-stake" &&
    stkPage.cooldown === `${durationText(Number(ownCooldown))}, then ${durationText(Number(ownWindow))}`,
  `page "${stkPage.cooldown}" vs "${durationText(Number(ownCooldown))}, then ${durationText(Number(ownWindow))}" (own ${ownCooldown}s / ${ownWindow}s)`,
);
check(
  "5b the slashable amount and its floor are this script's own reads, and totalAssets − floor == slashable exactly",
  stkPage.maxSlashable?.startsWith(amountText(ownSlashable, stkAd)) &&
    stkPage.minRemaining?.startsWith(amountText(ownMinRemaining, stkAd)) &&
    OWN.get(STK_USDC).totalAssets - ownMinRemaining === ownSlashable,
  `slashable "${stkPage.maxSlashable}" vs "${amountText(ownSlashable, stkAd)}"; floor "${stkPage.minRemaining}" vs "${amountText(ownMinRemaining, stkAd)}"; invariant ${OWN.get(STK_USDC).totalAssets - ownMinRemaining === ownSlashable}`,
);
check(
  "5c the reserve is the one THIS SCRIPT's own asset() hops reach, and Umbrella's answers about it are this script's own",
  stkPage.reserveLine?.includes(`covers ${reserveSymbol}`) &&
    stkPage.reserveLine?.includes(
      ownSlashableFlag[0] ? "reports a slashable deficit" : "reports no slashable deficit",
    ) &&
    stkPage.deficitOffset?.startsWith(amountText(ownDeficitOffset, Number(reserveDecimals))) &&
    stkPage.pendingDeficit?.startsWith(amountText(ownPendingDeficit, Number(reserveDecimals))),
  `own hops → ${reserveSymbol} (${short(ownWrapperAsset)}); line "${(stkPage.reserveLine ?? "").slice(0, 90)}…"; offset "${stkPage.deficitOffset}" vs "${amountText(ownDeficitOffset, Number(reserveDecimals))}"; pending "${stkPage.pendingDeficit}" vs "${amountText(ownPendingDeficit, Number(reserveDecimals))}"`,
);
check(
  "5d the only address that can slash it is this script's own owner() read, and the asset custody is its own balanceOf()",
  lc(stkPage.umbrellaOwner) === lc(ownOwner) && stkPage.umbrellaAssetHeld?.startsWith(amountText(ownStkCustody, stkAd)),
  `owner page ${stkPage.umbrellaOwner} vs own ${lc(ownOwner)}; custody "${stkPage.umbrellaAssetHeld}" vs "${amountText(ownStkCustody, stkAd)}"`,
);
const ownWrapperDecimals = await client.readContract({
  address: stkAsset,
  abi: VAULT_ABI,
  functionName: "decimals",
  blockNumber: stkBlock,
});
const ownWrapperPrice = await client.readContract({
  address: stkAsset,
  abi: VAULT_ABI,
  functionName: "convertToAssets",
  args: [BigInt(10) ** BigInt(ownWrapperDecimals)],
  blockNumber: stkBlock,
});
check(
  "5e the middle hop is stated: the wrapper is the token's own asset(), it is linked as a catalogue member, and its share price is this script's own read",
  lc(stkPage.wrapperHop) === stkAsset &&
    stata.includes(stkAsset) &&
    stkPage.wrapperPrice?.startsWith(sharePriceText(ownWrapperPrice, Number(reserveDecimals))),
  `hop ${stkPage.wrapperHop} vs own asset() ${short(stkAsset)}; in the chain's stata roster: ${stata.includes(stkAsset)}; price "${stkPage.wrapperPrice}" vs "${sharePriceText(ownWrapperPrice, Number(reserveDecimals))}"`,
);
const ghoPage = PAGES.get(STK_GHO);
const ghoAsset = OWN.get(STK_GHO).asset;
check(
  "5f stkGHO holds its reserve directly — this script's own asset() is not in the stata roster, and the page draws NO wrapper hop",
  !stata.includes(ghoAsset) && ghoPage.wrapperHop === null && ghoPage.mechanic === "umbrella-stake",
  `own asset() ${short(ghoAsset)} in stata roster: ${stata.includes(ghoAsset)}; wrapper block on the page: ${ghoPage.wrapperHop ?? "none"}`,
);

// ── 6: the holder half ──────────────────────────────────────────────────────
const holderPages = new Map();
for (const f of HOLDERS) holderPages.set(`${f.vault}:${f.holder}`, await readVaultPage(f.vault, f.holder));

const holderOwn = new Map();
for (const f of HOLDERS) {
  const p = holderPages.get(`${f.vault}:${f.holder}`);
  const bn = BigInt(p.blockNumber);
  const decimals =
    OWN.get(f.vault)?.decimals ??
    (await client.readContract({ address: f.vault, abi: VAULT_ABI, functionName: "decimals", blockNumber: bn }));
  const [bal, supply] = await client.multicall({
    contracts: [
      { address: f.vault, abi: VAULT_ABI, functionName: "balanceOf", args: [f.holder] },
      { address: f.vault, abi: VAULT_ABI, functionName: "totalSupply" },
    ],
    allowFailure: false,
    batchSize: 0,
    blockNumber: bn,
  });
  const maxRedeem = await client.readContract({
    address: f.vault,
    abi: VAULT_ABI,
    functionName: "maxRedeem",
    args: [f.holder],
    blockNumber: bn,
  });
  const claim =
    bal > BigInt(0)
      ? await client.readContract({
          address: f.vault,
          abi: VAULT_ABI,
          functionName: "convertToAssets",
          args: [bal],
          blockNumber: bn,
        })
      : null;
  const code = await client.getCode({ address: f.holder, blockNumber: bn });
  holderOwn.set(`${f.vault}:${f.holder}`, { bn, decimals, bal, supply, maxRedeem, claim, code: code ?? "0x" });
}

const zeroFixtures = HOLDERS.filter((f) => holderOwn.get(`${f.vault}:${f.holder}`).bal === BigInt(0));
check(
  "6a every pinned holder fixture STILL holds a positive balance at the page's own block, and the page's raw balance is this script's own",
  zeroFixtures.length === 0 &&
    HOLDERS.every(
      (f) =>
        holderPages.get(`${f.vault}:${f.holder}`).holderSharesRaw ===
        String(holderOwn.get(`${f.vault}:${f.holder}`).bal),
    ),
  zeroFixtures.length
    ? `${zeroFixtures.length} fixture(s) have exited — every check resting on them would be vacuous: ${zeroFixtures.map((f) => short(f.holder)).join(", ")}`
    : HOLDERS.map((f) => {
        const p = holderPages.get(`${f.vault}:${f.holder}`);
        const o = holderOwn.get(`${f.vault}:${f.holder}`);
        return p.holderSharesRaw === String(o.bal)
          ? null
          : `${short(f.holder)} on ${short(f.vault)}: page ${p.holderSharesRaw} vs own ${o.bal}`;
      })
        .filter(Boolean)
        .join("; ") || `${HOLDERS.length} fixtures still funded and wei-exact`,
);
const claimBad = HOLDERS.filter((f) => {
  const p = holderPages.get(`${f.vault}:${f.holder}`);
  const o = holderOwn.get(`${f.vault}:${f.holder}`);
  return p.holderClaimRaw !== String(o.claim);
});
check(
  "6b the claim is the vault's own convertToAssets of THIS SCRIPT's balance read, wei-exact",
  claimBad.length === 0,
  claimBad
    .map(
      (f) =>
        `${short(f.holder)}: page ${holderPages.get(`${f.vault}:${f.holder}`).holderClaimRaw} vs own ${holderOwn.get(`${f.vault}:${f.holder}`).claim}`,
    )
    .join("; ") || `${HOLDERS.length} compared`,
);
const redeemBad = HOLDERS.filter((f) => {
  const p = holderPages.get(`${f.vault}:${f.holder}`);
  const o = holderOwn.get(`${f.vault}:${f.holder}`);
  return p.holderMaxRedeemRaw !== String(o.maxRedeem);
});
const zeroRedeem = HOLDERS.filter((f) => holderOwn.get(`${f.vault}:${f.holder}`).maxRedeem === BigInt(0));
check(
  "6c maxRedeem is this script's own read and is compared SEPARATELY from the balance — the sample includes a positive balance reading zero",
  redeemBad.length === 0 && zeroRedeem.length > 0,
  redeemBad
    .map(
      (f) =>
        `${short(f.holder)}: page ${holderPages.get(`${f.vault}:${f.holder}`).holderMaxRedeemRaw} vs own ${holderOwn.get(`${f.vault}:${f.holder}`).maxRedeem}`,
    )
    .join("; ") || `${HOLDERS.length} compared, ${zeroRedeem.length} of them redeeming zero against a positive balance`,
);
const printedBad = [];
for (const f of HOLDERS) {
  const p = holderPages.get(`${f.vault}:${f.holder}`);
  const o = holderOwn.get(`${f.vault}:${f.holder}`);
  const sd = Number(o.decimals);
  const ad = Number(TOKEN.get(OWN.get(f.vault)?.asset)?.decimals ?? sd);
  const shareSymbol = OWN.get(f.vault)?.symbol ?? null;
  const assetSymbol = TOKEN.get(OWN.get(f.vault)?.asset)?.symbol ?? null;
  // The HEADLINE is the magnitude — the card states every figure this way now,
  // on the listing and here. The exact figure is asserted straight after, off
  // the same element's `title`, so the compact form costs the check nothing.
  const wantShares = headline(shareText(o.bal, sd), Number(o.bal) / Math.pow(10, sd));
  const wantSharesTitle = `${exactUnits(o.bal, sd)} ${shareSymbol}`;
  const fraction = Number(o.bal) / Number(o.supply);
  const wantFraction = fraction < 0.000001 ? "less than 0.0001%" : pctText(fraction);
  if (!p.holderSharesText?.startsWith(wantShares))
    printedBad.push(`${short(f.holder)} shares "${p.holderSharesText}" vs "${wantShares}"`);
  if (p.holderSharesTitle !== wantSharesTitle)
    printedBad.push(`${short(f.holder)} shares title "${p.holderSharesTitle}" vs "${wantSharesTitle}"`);
  if (!p.holderFraction?.startsWith(wantFraction))
    printedBad.push(`${short(f.holder)} fraction "${p.holderFraction}" vs "${wantFraction}"`);
  if (o.claim != null) {
    const wantClaim = headline(amountText(o.claim, ad), Number(o.claim) / Math.pow(10, ad));
    const wantClaimTitle = `${exactUnits(o.claim, ad)} ${assetSymbol}`;
    if (!p.holderClaim?.startsWith(wantClaim))
      printedBad.push(`${short(f.holder)} claim "${p.holderClaim}" vs "${wantClaim}"`);
    if (p.holderClaimTitle !== wantClaimTitle)
      printedBad.push(`${short(f.holder)} claim title "${p.holderClaimTitle}" vs "${wantClaimTitle}"`);
  }
}
check(
  "6d the printed shares, fraction and claim are the card's headline form of this script's own reads, with the EXACT figure on each stat's title=, in en-US",
  printedBad.length === 0,
  printedBad.slice(0, 3).join("; ") ||
    `${HOLDERS.length * 5} figures compared (3 headlines, 2 exact titles per holder)`,
);
// The shape, classified here from the same code read the page makes.
const classify = (code) => {
  if (!code || code === "0x") return "eoa";
  if (/^0xef0100[0-9a-f]{40}$/i.test(code)) return "delegated-account";
  return null; // everything else needs the storage reads; 6e checks those apart
};
const shapeBad = [];
for (const f of HOLDERS) {
  const p = holderPages.get(`${f.vault}:${f.holder}`);
  const o = holderOwn.get(`${f.vault}:${f.holder}`);
  const fromCode = classify(o.code);
  const expected = fromCode ?? (CHAIN_ROSTER.includes(lc(f.holder)) ? "aave-vault" : f.shape);
  if (p.holderShapeKind !== expected) shapeBad.push(`${short(f.holder)}: page "${p.holderShapeKind}" vs "${expected}"`);
  if (!p.holderShape) shapeBad.push(`${short(f.holder)}: no shape sentence`);
}
check(
  "6e the shape label matches this script's own eth_getCode classification — an externally owned account, an EIP-7702 delegation, a Safe, and a catalogue member",
  shapeBad.length === 0 &&
    new Set(HOLDERS.map((f) => holderPages.get(`${f.vault}:${f.holder}`).holderShapeKind)).size >= 3,
  shapeBad.join("; ") ||
    `classes seen: ${[...new Set(HOLDERS.map((f) => holderPages.get(`${f.vault}:${f.holder}`).holderShapeKind))].join(", ")}`,
);
// The cooldown, against the block's OWN timestamp.
const cooldownBad = [];
for (const f of HOLDERS.filter((h) => stake.includes(h.vault))) {
  const p = holderPages.get(`${f.vault}:${f.holder}`);
  const o = holderOwn.get(`${f.vault}:${f.holder}`);
  const snap = await client.readContract({
    address: f.vault,
    abi: STAKE_ABI,
    functionName: "getStakerCooldown",
    args: [f.holder],
    blockNumber: o.bn,
  });
  const blk = await client.getBlock({ blockNumber: o.bn });
  const now = Number(blk.timestamp);
  const want =
    snap.amount === BigInt(0) || Number(snap.endOfCooldown) === 0
      ? "none"
      : now < Number(snap.endOfCooldown)
        ? "waiting"
        : now < Number(snap.endOfCooldown) + Number(snap.withdrawalWindow)
          ? "open"
          : "expired";
  if (p.holderCooldownState !== want)
    cooldownBad.push(
      `${short(f.holder)}: page "${p.holderCooldownState}" vs own "${want}" (snapshot amount ${snap.amount}, ends ${snap.endOfCooldown}, block ts ${now})`,
    );
  if (!p.holderCooldown)
    cooldownBad.push(
      `${short(f.vault)}: no cooldown line for a holder whose getStakerCooldown() answers amount ${snap.amount}`,
    );
}
const cooldownStates = new Set(
  HOLDERS.filter((h) => stake.includes(h.vault)).map(
    (f) => holderPages.get(`${f.vault}:${f.holder}`).holderCooldownState,
  ),
);
check(
  "6f every stake-token holder carries a cooldown line, in the state this script's own getStakerCooldown() and the block's OWN timestamp put it in",
  cooldownBad.length === 0 && cooldownStates.size > 1,
  cooldownBad.join("; ") ||
    `${HOLDERS.filter((h) => stake.includes(h.vault)).length} stake-token holders across ${cooldownStates.size} state(s): ${[...cooldownStates].join(", ")}`,
);
// The cross-link: the layer holding itself.
const memberPage = holderPages.get(`${WA_USDC}:${STK_USDC}`);
check(
  "6g a holder that is itself in the chain's roster is said to be, and links to that vault's page",
  CHAIN_ROSTER.includes(STK_USDC) &&
    lc(memberPage.catalogueMember) === STK_USDC &&
    /itself/.test(memberPage.holderCatalogued ?? ""),
  `holder in the chain's roster: ${CHAIN_ROSTER.includes(STK_USDC)}; link target ${memberPage.catalogueMember}; line "${(memberPage.holderCatalogued ?? "").slice(0, 90)}…"`,
);
// The third hop, for a stake-token holder over a wrapper.
const hopFixture = HOLDERS.find((f) => f.vault === STK_USDC);
const hopPage = holderPages.get(`${hopFixture.vault}:${hopFixture.holder}`);
const hopOwn = holderOwn.get(`${hopFixture.vault}:${hopFixture.holder}`);
const ownHopClaim = await client.readContract({
  address: stkAsset,
  abi: VAULT_ABI,
  functionName: "convertToAssets",
  args: [hopOwn.claim],
  blockNumber: hopOwn.bn,
});
check(
  "6h the third hop is the wrapper's own convertToAssets of this script's own claim read, printed in the RESERVE's units",
  hopPage.wrapperClaim?.startsWith(amountText(ownHopClaim, Number(reserveDecimals))),
  `page "${hopPage.wrapperClaim}" vs "${amountText(ownHopClaim, Number(reserveDecimals))}" (own claim ${hopOwn.claim} ${OWN.get(STK_USDC).symbol} → ${ownHopClaim} ${reserveSymbol})`,
);

// ── 7: ENS ──────────────────────────────────────────────────────────────────
const ownEns = await client.getEnsAddress({ name: normalize(ENS_NAME) });
const ensPage = await readVaultPage(SGHO, ENS_NAME);
check(
  "7a a typed ENS name reads the address THIS SCRIPT's own resolver returns, and the page says which registry answered",
  ownEns != null && lc(ensPage.holderAddress) === lc(ownEns) && ensPage.ensNote,
  `own resolver ${ownEns}; page holder ${ensPage.holderAddress}; registry stated: ${ensPage.ensNote}`,
);
const ownMiss = await client.getEnsAddress({ name: normalize(ENS_MISS) }).catch(() => null);
const missPage = await readVaultPage(SGHO, ENS_MISS);
check(
  "7b a well-formed name mainnet has no address for is stated as unresolved, not read as nothing",
  ownMiss == null && missPage.lookupError === "unresolved" && missPage.holderAddress === null,
  `own resolver ${ownMiss}; page error "${missPage.lookupError}", holder ${missPage.holderAddress}`,
);

// ── 8: no USD, no rate of return ────────────────────────────────────────────
// A violation of this shape is an ADDITION — a "$" or an "APY" that was not
// there — so nothing else in this file would notice it.
const usdHits = [];
const rateHits = [];
for (const v of SAMPLE) {
  const t = PAGES.get(v).bodyText;
  for (const m of t.matchAll(/\$|\d[\d,]*(?:\.\d+)?\s?USD\b(?![A-Za-z])|\bUSD\s?\d[\d,]*(?:\.\d+)?/g))
    usdHits.push(`${short(v)}: ${m[0]}`);
  // The pattern is a rate FIGURE, not the vocabulary: the page's own copy says
  // "not annualised here", which is the disclaimer this check exists to require
  // and must not be what turns it red.
  for (const m of t.matchAll(
    /\bAPY\b|\bAPR\b|%\s*(?:\/|per\s+)\s*(?:yr|year)|\d[\d.,]*\s?%\s+(?:a|per)\s+year|\bannualised (?:rate|return|yield)\b/gi,
  ))
    rateHits.push(`${short(v)}: ${m[0]}`);
}
check(
  "8a no sampled page states a USD figure — no dollar sign anywhere, and no amount beside a bare USD",
  usdHits.length === 0,
  usdHits.length ? `${usdHits.length} USD token(s): ${usdHits.slice(0, 3).join(", ")}` : "none in any of the four",
);
check(
  "8b no sampled page states a rate of return — the rate slots render as the contract stores them and nothing annualises them",
  rateHits.length === 0,
  rateHits.length
    ? `${rateHits.length} hit(s): ${rateHits.slice(0, 3).join(", ")}`
    : "no APY, APR, %/yr, per year or annualised",
);

// ── 11: the nesting — whose backing a stata vault's shares are ──────────────
// The subject is the sentence plan §5 asked for: a static aToken's page naming
// the Umbrella stake token staked on it and the share of the vault that token
// holds, with the way through to that token's own holders.
//
// THE EXPECTATION IS THIS SCRIPT'S OWN PAIR OF READS AT THE PAGE'S OWN BLOCK —
// every stake token in the chain's roster asked for its `asset()`, then
// `balanceOf` and `totalSupply` on the vault whose page is under test. Which
// stake token (if any) backs which vault is therefore the chain's answer and
// never a pair written down here; the fixture is only WHICH PAGE to open.
const waPage = PAGES.get(WA_USDC);
const waBlock = BigInt(waPage.blockNumber);
const stkAssetRes = await client.multicall({
  contracts: stake.map((s) => ({ address: s, abi: VAULT_ABI, functionName: "asset" })),
  allowFailure: true,
  batchSize: 0,
  blockNumber: waBlock,
});
const assetOfStake = new Map(
  stake.map((s, i) => [s, stkAssetRes[i].status === "success" ? lc(stkAssetRes[i].result) : null]),
);
/** What this script's own reads say one vault's backing is, at one block: the
 *  stake tokens whose asset() is that vault and which hold some of it. */
async function ownBacking(vault, blockNumber) {
  const backers = stake.filter((s) => assetOfStake.get(s) === lc(vault));
  const res = await client.multicall({
    contracts: [
      { address: vault, abi: VAULT_ABI, functionName: "totalSupply" },
      ...backers.map((s) => ({ address: vault, abi: VAULT_ABI, functionName: "balanceOf", args: [s] })),
      ...backers.map((s) => ({ address: s, abi: VAULT_ABI, functionName: "symbol" })),
    ],
    allowFailure: true,
    batchSize: 0,
    blockNumber,
  });
  const supply = res[0].status === "success" ? res[0].result : null;
  return backers
    .map((s, i) => ({
      address: s,
      balance: res[1 + i].status === "success" ? res[1 + i].result : null,
      symbol: res[1 + backers.length + i].status === "success" ? res[1 + backers.length + i].result : null,
    }))
    .filter((b) => b.balance != null && b.balance > BigInt(0))
    .map((b) => ({ ...b, fraction: supply && supply > BigInt(0) ? Number(b.balance) / Number(supply) : 0 }));
}
const waBacking = await ownBacking(WA_USDC, waBlock);
check(
  "11z the sampled stata vault IS backed by a stake token at its own block — the fixture P1 rests on",
  waBacking.length === 1,
  `${short(WA_USDC)} at block ${waPage.blockNumber}: ${
    waBacking.map((b) => `${b.symbol ?? short(b.address)} ${pctText(b.fraction)}`).join(", ") ||
    "no stake token holds it"
  }`,
);
const want = waBacking[0];
check(
  "11a P1 the page names that stake token and states its share — both this script's own reads at the page's own block",
  want != null &&
    waPage.backedBy === want.address &&
    waPage.backedBySharesRaw === want.balance.toString() &&
    waPage.backedByShare === pctText(want.fraction) &&
    (waPage.backedBySentence ?? "").includes(want.symbol ?? ""),
  want == null
    ? "no backing read, see 11z"
    : `page ${waPage.backedBy} ${waPage.backedBySharesRaw} "${waPage.backedByShare}"; own ${want.address} ${want.balance} "${pctText(want.fraction)}" (${want.symbol}) · sentence "${(waPage.backedBySentence ?? "").slice(0, 120)}"`,
);
check(
  "11b and the share is balanceOf ÷ totalSupply, not over total ASSETS — the two differ on an accruing wrapper",
  want != null && waPage.backedByShare === pctText(want.fraction),
  `page "${waPage.backedByShare}", own balanceOf÷totalSupply "${want ? pctText(want.fraction) : "?"}"`,
);
// P2 — the way through is a LINK to the listing filtered to that token, and the
// listing answers with that token's own positions. A list on the vault page is
// what this replaces (memory `market-views-link-not-list`), so the check is on
// the href AND on what the href actually serves.
const wantHref = `/ethereum/aave/vaults/positions?vault=${want?.address}`;
check(
  "11c P2 the share's sentence links to the listing filtered to that stake token",
  waPage.backedByHoldersHref === wantHref,
  `href "${waPage.backedByHoldersHref}", want "${wantHref}"`,
);
const listingRes = await page.goto(`${BASE}${wantHref}`, { waitUntil: "networkidle" });
const listingCards = await page
  .locator("[data-position-card]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-position-card")));
check(
  "11d …and that listing's own cards are positions in it — the holders the sentence says are there",
  listingRes?.status() === 200 &&
    listingCards.length > 0 &&
    listingCards.every((id) => id?.toLowerCase().startsWith(`${want?.address}:`)),
  `status ${listingRes?.status()}, ${listingCards.length} cards, first "${listingCards[0] ?? "(none)"}"`,
);
// P3 — the absence is asserted, or P1 is vacuous. A stata vault no stake token
// holds must render NO sentence, and the pair is checked together so that a
// build with the sentence removed altogether cannot pass this.
const unbacked = [];
for (const v of stata) {
  if (![...assetOfStake.values()].includes(v)) unbacked.push(v);
}
const unbackedPage = unbacked.length > 0 ? await readVaultPage(unbacked[0]) : null;
check(
  "11e P3 a stata vault no stake token is staked on states nothing — and the backed one still does",
  unbacked.length > 0 && unbackedPage?.status === 200 && unbackedPage.backedByCount === 0 && waPage.backedByCount === 1,
  unbacked.length === 0
    ? "every stata vault in the roster is backed — no absence left to assert"
    : `${short(unbacked[0])} (of ${unbacked.length} unbacked) draws ${unbackedPage?.backedByCount} sentence(s); ${short(WA_USDC)} draws ${waPage.backedByCount}`,
);
// The other end of the same hop, on the POSITION page: the holder IS a
// catalogue vault, so the line that says so carries the way through to the
// holders behind that balance.
const nestedPos = await readVaultPage(WA_USDC, STK_USDC);
check(
  "11f the position page whose holder is a catalogue vault links to the holders behind that balance",
  nestedPos.status === 200 &&
    nestedPos.holderVaultHolders === STK_USDC &&
    nestedPos.holderVaultHoldersHref === `/ethereum/aave/vaults/positions?vault=${STK_USDC}`,
  `holder-vault-holders ${nestedPos.holderVaultHolders}, href "${nestedPos.holderVaultHoldersHref}"`,
);
// D3 — the trap, said once, in the section's own (i) page and nowhere else.
const infoRes = await page.goto(`${BASE}/ethereum/aave/vaults/info`, { waitUntil: "networkidle" });
const layers = await page.locator("[data-intro-layers]").count();
const layersText =
  layers > 0 ? (await page.locator("[data-intro-layers]").first().innerText()).replace(/\s+/g, " ") : "";
check(
  "11g the (i) page says once that the two layers hold the same assets and must not be added",
  infoRes?.status() === 200 &&
    layers === 1 &&
    /must not add them|not add them together/i.test(layersText) &&
    /stake token/i.test(layersText) &&
    /static aToken/i.test(layersText),
  layers === 0 ? "no [data-intro-layers] paragraph on /ethereum/aave/vaults/info" : `"${layersText.slice(0, 160)}…"`,
);

// ── 9: the locale is pinned ─────────────────────────────────────────────────
// Every figure above was compared against a `toLocaleString("en-US")` of this
// script's own read, so a runtime-locale format would already be red on 2e and
// 6d. This names the one figure those do not cover — the block.
const blockBad = SAMPLE.filter(
  (v) => !PAGES.get(v).blockText?.includes(PAGES.get(v).blockNumber.toLocaleString("en-US")),
);
check(
  "9  every page prints its block in en-US, not in the runtime's locale",
  blockBad.length === 0,
  blockBad.map((v) => `${short(v)}: "${PAGES.get(v).blockText?.slice(0, 40)}…"`).join("; ") ||
    `${SAMPLE.length} blocks`,
);

// ── 10: the dev provenance tripwire ─────────────────────────────────────────
const withHolder = [...holderPages.values()];
const all = [...SAMPLE.map((v) => PAGES.get(v)), ...withHolder];
if (all.every((p) => p.tripwire > 0)) {
  const uncovered = all.flatMap((p) => p.uncovered.map((t) => `${p.url.split("/").pop().slice(0, 12)}… "${t}"`));
  check(
    "10 the dev provenance tripwire reports no uncovered figure on any sampled page, with and without a holder",
    uncovered.length === 0,
    uncovered.length
      ? `${uncovered.length} uncovered: ${uncovered.slice(0, 4).join(" · ")}`
      : `${all.length} page loads swept`,
  );
} else {
  skip(
    "10 the dev provenance tripwire reports no uncovered figure",
    "no tripwire bookends on this build (production renders none)",
  );
}

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures > 0 ? 1 : 0);
