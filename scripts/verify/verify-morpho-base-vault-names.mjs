#!/usr/bin/env node
// Catalogued MetaMorpho vault names on Morpho Base surfaces (Task A of the
// 2026-09-05 vault-names change): wherever a Morpho Base page prints an
// address that is a catalogued vault, it now names the vault and links to
// /base/morpho/vaults/<address> instead of drawing a bare hex pill.
// ----------------------------------------------------------------------------
// EVERY EXPECTED NAME HERE IS THIS SCRIPT'S OWN PARSE of lib/morpho-base/
// vault-catalog.ts (copied verbatim from scripts/verify/verify-morpho-base-
// vault-exposure.mjs's own parser — completeness against the file's own row
// count is asserted the same way), never the page's. Playwright only; no
// chain reads, because nothing checked here is a chain figure — it is
// whether a name the catalog already states gets drawn where an address
// would otherwise be.
//
// Run:
//   BASE=http://localhost:3022 node scripts/verify/verify-morpho-base-vault-names.mjs
// Default BASE is localhost:3022, this repo's Morpho Base verifier
// convention — chosen so a stray `next dev` on 3000 cannot be verified by
// accident.
//
// ── WHICH SURFACE THIS RUNS ON, AND WHY NOT "THE MARKET VIEW'S TOP
//    SUPPLIERS" ───────────────────────────────────────────────────────────
// The brief that produced this script named a specific surface to find: "the
// cbBTC/USDC market's top suppliers include six MetaMorpho vaults" on "the
// per-market lender/borrower listings". That fact about the CHAIN is real —
// this script confirmed it by querying this deployment's own market-read
// route (/api/chain/morpho-base/markets): market 0x9103c3b4e834476c9a62ea
// 009ba2c884ee42e94e6e314a26f04d312434191836 (USDC / cbBTC) books 1.556B
// USDC supplied, and the sibling verifier's own chain reads already show the
// case-study vault (Steakhouse Prime USDC) supplying 19,051,906 USDC into
// exactly that market as one leg of its withdraw queue. But there is no UI
// surface that lists a market's suppliers at all, on this app, today:
//
//   • components/protocol/morpho/morpho-markets-view.tsx (the market views
//     under /base/morpho/markets/**) draws ONE ROW PER MARKET — aggregate
//     totals, a utilisation bar, an lltv — and never an address. The two
//     addresses it does print (collateral token, oracle) are ERC-20/oracle
//     contracts, not position owners.
//   • The position LISTING (/base/morpho, and every market/loan filter of
//     it) is BORROWER-scoped at its root: rails-server's `mv_morpho_positions`
//     keys a row on (marketId, BORROWER) — `owner: r.borrower` in
//     lib/sources/api/morpho-positions.ts — and a MetaMorpho vault never
//     borrows; it only ever calls Blue's supply/withdraw/reallocate on its
//     OWN address. Confirmed empirically below (check 0), not assumed: this
//     script queries /api/morpho-base/positions?user=<vault> for the
//     case-study vault and four more of the catalog's largest, and every one
//     answers zero rows.
//
// So "a market view where a catalogued vault is a lender" does not exist to
// check — the fact is real, the listing is not. What DOES exist, and what
// checks 1–5 below run against instead, are the two surfaces that genuinely
// render an arbitrary Morpho Base address today: the WALLET page (a vault's
// own address is one, like any other, and /base/morpho/<vault> draws its
// live supply-only positions through MorphoLenderOpenCard — the exact code
// path Task A threaded a vault name through) and the BORROWER position
// listing (which never draws a vault, so the negative case — an ordinary
// borrower still renders as hex — is checked there instead).
//
// ── THE EVENT-CARD COUNTERPARTY CHECK: SKIPPED, WITH THE EVIDENCE ──────────
// The brief also asked for a wallet whose EVENT cards show a vault as an
// on_behalf/counterparty party chip (components/protocol/morpho/morpho-event-
// header.tsx's `externalActor`, drawn only when the transaction's caller
// differs from the position's owner). That chip lives on a BORROWER
// position's timeline. Since a MetaMorpho vault is never a borrower (check 0
// above), it can never be the OWNER of a position whose timeline could name
// a different caller, and it is vanishingly unlikely to be some OTHER
// wallet's caller either — MetaMorpho only ever calls Blue as itself. Check
// 0 below is the cheap search the brief asked for; it comes back empty, and
// this script reports SKIP for that reason rather than inventing a wallet
// that does not exist.
//
// ── PROVED IT CAN FAIL, 2026-09-05, BASE=http://localhost:3022 ──────────────
// Four breaks, each made then reverted; the restored run is 8/8 · 1 SKIP.
//
//  A1  EXPECTED_NAME salted (`Steakhouse Prime USDC` → `Steakhouse Prime
//      USDCx`, in this script only) → FAIL 1 (the banner) and FAIL 3 ("0 of 6
//      read \"Steakhouse Prime USDCx\""), each quoting the salted expectation
//      against the page's unchanged text. Checks 2/4/4b stayed green — they
//      do not compare against the name, which is exactly the isolation this
//      run is for.
//  A2  EXPECTED_HREF salted (the case-study address's last hex nibble
//      flipped, in this script only) → FAIL 4 ("0 of 6 target …83b3") and
//      FAIL 4b (the real click landed on …83b2, the page's actual href,
//      which the salted expectation no longer matches).
//  A3  NON_CATALOGUED_BORROWER swapped for the case-study vault's own
//      address, and the guard that refuses a catalogued fixture disabled for
//      the swap (both in this script only) → FAIL 5a: the search resolved to
//      NO row at all, because the vault has no borrower position to find —
//      the same fact check 0 establishes. A vault masquerading as an
//      ordinary borrower fixture is caught upstream of 5b/5c, not by them —
//      recorded as observed rather than the outcome guessed beforehand.
//  A4  components/shared/wallet-pill.tsx's `href` (the value `router.push`
//      actually navigates to) reordered so `filterProtocol`'s wallet-listing
//      link wins over `vault.href` (one line, reverted after) → FAIL 4b
//      only: the real click landed on `/base/morpho`, not the vault's page.
//      Check 4 (the `data-vault-href` attribute) stayed green, because that
//      attribute is computed separately and this break did not touch it —
//      which is exactly why 4b exists alongside 4: an attribute can be right
//      while the click it describes is wrong.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3022";

// ── the census, parsed out of the generated TS ──────────────────────────────
// Copied verbatim from scripts/verify/verify-morpho-base-vault-exposure.mjs,
// completeness assertion included: a formatting change that hid rows from
// this regex is an error, not a quietly shorter roster.
const catalogSrc = fs.readFileSync(path.join(ROOT, "lib/morpho-base/vault-catalog.ts"), "utf8");
const CATALOG = (() => {
  const flat = catalogSrc.match(/const ROWS[^=]*=\s*\[([\s\S]*?)\n\];/)[1].replace(/\s+/g, " ");
  const str = `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
  const re = new RegExp(`\\[ ?"(0x[0-9a-f]{40})" ?, ?(\\d) ?, ?(\\d+) ?, ?${str} ?, ?${str} ?, ?(\\d+) ?,? ?\\]`, "g");
  const rows = [...flat.matchAll(re)].map((m) => ({
    address: m[1],
    factory: m[2] === "1" ? "v1.1" : "v1.0",
    createdBlock: Number(m[3]),
    name: m[4][0] === '"' ? JSON.parse(m[4]) : m[4].slice(1, -1),
  }));
  const expected = (flat.match(/\[ ?"0x/g) || []).length;
  if (rows.length !== expected) throw new Error(`vault-catalog parse read ${rows.length} of ${expected} rows`);
  return rows;
})();

const CASE_STUDY_VAULT = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";
const catalogued = CATALOG.find((r) => r.address === CASE_STUDY_VAULT);
if (!catalogued) throw new Error(`${CASE_STUDY_VAULT} is not in lib/morpho-base/vault-catalog.ts`);
const EXPECTED_NAME = catalogued.name;
const EXPECTED_HREF = `/base/morpho/vaults/${CASE_STUDY_VAULT}`;

// A non-catalogued borrower, read straight off this deployment's own market
// listing (the cbBTC/USDC market above) — not invented. Re-checked against
// the catalog below rather than assumed.
const NON_CATALOGUED_BORROWER = "0x4420c9f331f67f5a0f0542976dfd408a9e761e41";
if (CATALOG.some((r) => r.address === NON_CATALOGUED_BORROWER))
  throw new Error(`${NON_CATALOGUED_BORROWER} fixture is catalogued — pick a different owner`);

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

// ── 0: the cheap search for a lender/borrower listing that names a vault ───
// Confirms, rather than assumes, that no catalogued vault is ever a BORROWER
// — the fact the whole "market view" / "event card counterparty" branch of
// the brief turned on. The case-study vault plus four more of the catalog's
// largest by createdBlock spread (early v1.0, late v1.1) — five API calls,
// not five hundred.
const SAMPLE_VAULTS = [
  CASE_STUDY_VAULT,
  ...CATALOG.filter((r) => r.address !== CASE_STUDY_VAULT)
    .sort((a, b) => a.createdBlock - b.createdBlock)
    .filter((_, i, arr) => i === 0 || i === arr.length - 1 || i === Math.floor(arr.length / 2))
    .slice(0, 4)
    .map((r) => r.address),
];
let borrowerHits = 0;
const hitDetail = [];
for (const addr of SAMPLE_VAULTS) {
  const r = await fetch(`${BASE}/api/morpho-base/positions?user=${addr}&limit=5`);
  const j = await r.json();
  const n = j.pagination?.total ?? j.data?.length ?? 0;
  if (n > 0) {
    borrowerHits++;
    hitDetail.push(`${addr} has ${n}`);
  }
}
if (borrowerHits === 0) {
  skip(
    "0 a market/event-card surface naming a vault as borrower or counterparty",
    `queried ${SAMPLE_VAULTS.length} catalogued vaults (incl. the case study) against /api/morpho-base/positions?user= — every one answers 0 borrower positions, so no listing or event-card timeline can name one as owner or as an external caller; see the header`,
  );
} else {
  // A vault DID show up as a borrower somewhere — the premise this script's
  // header argues from would be wrong, so this is a fact worth a real check,
  // not a silent SKIP. Recorded as a FAIL so a future run investigates rather
  // than quietly keeps skipping.
  check(
    "0 no catalogued vault sampled has a borrower position (this script's own premise for skipping check 6)",
    false,
    hitDetail.join(", "),
  );
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// ── 1–4: the vault's OWN wallet page names itself, everywhere it appears ───
await page.goto(`${BASE}/base/morpho/${CASE_STUDY_VAULT}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-skel-section="page-header"], [data-back-row]', { timeout: 15000 }).catch(() => {});
// The banner Task A's server-side lookup already draws (see [wallet]/page.tsx)
// — checked first because it needs no chain read to have settled.
await page.waitForFunction(() => document.body.innerText.includes("This address is a MetaMorpho vault"), {
  timeout: 15000,
});
const banner = (await page.locator("body").innerText()).match(/This address is a MetaMorpho vault,[^.]*\./)?.[0] ?? "";
check("1 the wallet page's banner names the vault", banner.includes(EXPECTED_NAME), banner);

// The position cards below it: every wallet pill for THIS SAME address, drawn
// while the live chain read settles (LenderOpenCard) or once it has —
// data-wallet-label="vault" is the structural hook wallet-pill.tsx renders
// for exactly this branch (never for a plain name or a bare address).
await page
  .waitForFunction(() => document.querySelectorAll('[data-wallet-label="vault"]').length > 0, { timeout: 20000 })
  .catch(() => {});
const vaultPills = page.locator('[data-wallet-label="vault"]');
const pillCount = await vaultPills.count();
check("2 at least one position card on the vault's own wallet page names it", pillCount > 0, `${pillCount} pills`);

let namedRight = 0;
let linkedRight = 0;
for (let i = 0; i < pillCount; i++) {
  const el = vaultPills.nth(i);
  const text = (await el.textContent())?.trim() ?? "";
  const href = await el.getAttribute("data-vault-href");
  if (text === EXPECTED_NAME) namedRight++;
  if (href === EXPECTED_HREF) linkedRight++;
}
check(
  "3 every one of those pills reads the catalog's own name, not a hex fallback",
  pillCount > 0 && namedRight === pillCount,
  `${namedRight} of ${pillCount} read "${EXPECTED_NAME}"`,
);
check(
  "4 every one of those pills targets the vault's own exposure page",
  pillCount > 0 && linkedRight === pillCount,
  `${linkedRight} of ${pillCount} target ${EXPECTED_HREF}`,
);

// A real click, not just the attribute: the pill is a <button> with
// router.push (wallet-pill.tsx — a listing row already wraps in a <Link>, so
// a real <a> would be invalid HTML), and this proves the click actually
// navigates rather than merely carrying a correct-looking data attribute.
if (pillCount > 0) {
  await vaultPills.first().click();
  await page.waitForURL(`**${EXPECTED_HREF}`, { timeout: 10000 }).catch(() => {});
  const url = new URL(page.url());
  check("4b clicking the pill actually navigates to the vault's page", url.pathname === EXPECTED_HREF, url.pathname);
}

// ── 5: a non-catalogued address on the borrower listing still renders as
//      hex, with no vault link — the negative case the same code must not
//      draw for an address the catalog does not know ─────────────────────
await page.goto(`${BASE}/base/morpho?q=${NON_CATALOGUED_BORROWER}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-wallet-label]", { timeout: 15000 }).catch(() => {});
// The listing settles client-side after the selector first resolves (a
// server-rendered row, then the client driver's own fetch confirms it) — a
// count taken at the exact instant the selector resolves can read 0 for one
// tick. A short settle avoids that race rather than trusting the first read.
await page.waitForTimeout(1000);
const ordinaryPills = page.locator("[data-wallet-label]");
const ordinaryCount = await ordinaryPills.count();
let noneMarkedVault = true;
let noneLinked = true;
for (let i = 0; i < ordinaryCount; i++) {
  const label = await ordinaryPills.nth(i).getAttribute("data-wallet-label");
  const href = await ordinaryPills.nth(i).getAttribute("data-vault-href");
  if (label === "vault") noneMarkedVault = false;
  if (href != null) noneLinked = false;
}
check(
  "5a the ordinary borrower's row renders — the search resolved to a real position",
  ordinaryCount > 0,
  `${ordinaryCount} pill(s)`,
);
check("5b none of them is drawn as a catalogued vault", noneMarkedVault, `${ordinaryCount} pill(s) checked`);
check("5c none of them carries a vault href", noneLinked, `${ordinaryCount} pill(s) checked`);

await browser.close();
console.log(
  `\n${passes} passed · ${failures} failed · ${skipped} skipped` +
    `\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} FAILED`}${skipped ? ` · ${skipped} skipped` : ""}`,
);
process.exit(failures > 0 ? 1 : 0);
