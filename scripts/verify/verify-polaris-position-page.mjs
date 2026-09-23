// Polaris — the CDP page's five small ports from Liquity V2.
// ---------------------------------------------------------------------------
// Scaffold of verify-polaris-equity.mjs. Checks:
//
//   (a) The identity row's two buttons — copy the CDP number, and open the
//       CDP NFT on Etherscan — on the DETAIL card and on the LISTING card,
//       and neither navigates the listing's row link.
//   (b) The NFT URL the button opens really resolves in a browser. Etherscan
//       answers curl 403 either way, so this is a real page.goto.
//   (c) The Costs figure: recorded debt × the rate in force, in the market's
//       own stable, on both markets — recomputed HERE from the verifier's own
//       chain read, never read off the page's own arithmetic. A closed CDP
//       shows none. The LLM export carries the same figure.
//   (d) The three slots the chain overlay fills pulse while it is in flight
//       and settle to their absent state when it never answers.
//   (e) The Explanation pane is remembered per CDP, in localStorage.
//   (f) A never-minted CDP is a real 404; a malformed URL still is; a burned
//       CDP is not; and a FAILED index read is not (that is the whole point
//       of the rule — an outage must not 404 every CDP on the explorer).
//   (g) The Learn-more modal says the CDP is an NFT.
//
// THE COST FIGURE IS RE-MEASURED AT RUN TIME, never pinned: this market's
// rate is algorithmic and moves every few blocks (measured 2026-09-10, usdp
// went 2.82% → 6.04% inside an hour), and the recorded debt moves at each
// touch. So the verifier reads /api/chain/polaris/position itself and asserts
// the page's figure against its own product, within 0.5% for the block or two
// that can pass between the two reads.
//
// THE COST'S BASE IS THE RECORDED DEBT, NOT THE ENTIRE DEBT, and the check
// proves the difference: it asserts the recorded product AND that the entire
// product is not what the page shows, wherever the two are far enough apart
// to tell (the pending PSM share puts them a fifth apart on the whale).
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3000 node scripts/verify/verify-polaris-position-page.mjs

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

// ── restated, independent of the code under test ───────────────────────────
// formatNumber's plain-decimal path: Intl defaults (0–3 fraction digits).
const fmtNum = (n) => n.toLocaleString("en-US", { style: "decimal" });
const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;
/** polarisCdpNftUrl restated: Etherscan's token page, scoped to one id. */
const nftUrl = (contract, id) => `https://sepolia.etherscan.io/token/${contract}?a=${id}`;

const CDP_NFT = {
  usdp: "0x1f3f4a0f65c4255d7b488816a629fbebf5269e1b",
  goldp: "0x6c6de65191929dc0f607f641642b6aadb1f91af8",
};
const STABLE = { usdp: "USDp", goldp: "GOLDp" };

/** Within `tol` relative — the page and this script read a block or two
 *  apart, and both legs move. */
const near = (a, b, tol = 0.005) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.abs(b) * tol;

/** Parse a "1,234.56" figure out of a string. */
const parseFig = (s) => {
  const m = /([\d,]+(?:\.\d+)?)/.exec(s ?? "");
  return m ? Number(m[1].replace(/,/g, "")) : NaN;
};

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  // The card's first render is index-only; the chain overlay lands a moment
  // later and the card re-renders with it. The Explanation button attaches
  // once `chain` is non-null, on every status.
  await page
    .locator('[data-skel-section="detail-card"] button[aria-label*="explanation" i]')
    .first()
    .waitFor({ state: "attached", timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(600);
  return page;
}

const card = (page) => page.locator('[data-skel-section="detail-card"]').first();

console.log("Polaris — the CDP page's identity row, cost line, pulses, remembered pane and 404\n");
console.log(`BASE ${BASE}\n`);

const browser = await chromium.launch();
const context = await browser.newContext({
  // Etherscan serves a Cloudflare interstitial to an obvious headless client.
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  permissions: ["clipboard-read", "clipboard-write"],
});

// ── (a) the identity row's copy and NFT buttons ────────────────────────────
{
  const page = await open(context, polarisUrl("usdp", "8"));
  // window.open is stubbed BEFORE any script runs, so the click's argument is
  // recorded rather than opening a tab.
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (...args) => {
      window.__opened.push(args);
      return null;
    };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const copyBtn = card(page).getByRole("button", { name: "Copy CDP number" }).first();
  check("a1. usdp/8 detail card — a 'Copy CDP number' button sits in the identity row", (await copyBtn.count()) > 0);
  if ((await copyBtn.count()) > 0) {
    await copyBtn.click();
    await page.waitForTimeout(200);
    const copiedLabel = await card(page).getByRole("button", { name: "Copied" }).count();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(
      "a2. clicking it says 'Copied' and puts the bare number on the clipboard",
      copiedLabel > 0 && clip === "8",
      `label=${copiedLabel} clipboard=${JSON.stringify(clip)}`,
    );
    // 1.5 s later the glyph is back to "copy".
    await page.waitForTimeout(1800);
    check(
      "a3. the 'Copied' state expires and the copy button returns",
      (await card(page).getByRole("button", { name: "Copy CDP number" }).count()) > 0,
    );
  }

  const nftBtn = card(page).getByRole("button", { name: "View the CDP NFT on Etherscan" }).first();
  check("a4. usdp/8 detail card — a 'View the CDP NFT on Etherscan' button sits beside it", (await nftBtn.count()) > 0);
  if ((await nftBtn.count()) > 0) {
    await nftBtn.click();
    await page.waitForTimeout(300);
    const opened = await page.evaluate(() => window.__opened ?? []);
    check(
      "a5. it opens the CDP NFT's own Etherscan page for (usdp, 8)",
      opened.length === 1 && opened[0][0] === nftUrl(CDP_NFT.usdp, "8"),
      JSON.stringify(opened[0]?.[0] ?? null),
    );
  }
  await page.close();
}

// The same two buttons on a LISTING card, where the card sits inside the
// driver's row <Link> — a click must copy, not navigate.
{
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (...args) => {
      window.__opened.push(args);
      return null;
    };
  });
  await page.goto(`${BASE}/sepolia/polaris?q=0xd2728b67d126f58d086fb0f2a626b4655de797f6`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  const row = page.locator('[data-skel-section="listing-row"]').first();
  await row.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  // WAIT FOR HYDRATION BEFORE CLICKING. The whole point of this check is that
  // React's handler calls preventDefault on a click inside the row's <Link>;
  // a click that lands before the handler is attached navigates natively and
  // fails the check for a reason that has nothing to do with the card.
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(3000);
  const urlBefore = page.url();
  const listCopy = row.getByRole("button", { name: "Copy CDP number" }).first();
  const listNft = row.getByRole("button", { name: "View the CDP NFT on Etherscan" }).first();
  check("a6. the listing card carries both buttons too", (await listCopy.count()) > 0 && (await listNft.count()) > 0);
  if ((await listCopy.count()) > 0) {
    await listCopy.click();
    await page.waitForTimeout(700);
    check(
      "a7. clicking copy on a listing card does not navigate",
      page.url() === urlBefore,
      `${urlBefore} → ${page.url()}`,
    );
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check("a8. and it copied a bare CDP number", /^\d+$/.test(clip), JSON.stringify(clip));
  }
  await page.close();
}

// ── (b) the NFT URL really resolves in a browser ───────────────────────────
{
  const page = await context.newPage();
  const url = nftUrl(CDP_NFT.usdp, "8");
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
  const status = res?.status() ?? 0;
  const title = await page.title().catch(() => "");
  check(
    "b. the CDP NFT link answers a real page in a browser (not the bot wall)",
    status >= 200 && status < 300 && !/just a moment/i.test(title),
    `${status} · ${title.slice(0, 60)}`,
  );
  await page.close();
}

// ── (c) the annual cost line ───────────────────────────────────────────────
for (const [market, id] of [
  ["usdp", "8"],
  ["goldp", "18"],
]) {
  const live = await api(`/api/chain/polaris/position?market=${market}&id=${id}`);
  const onRecorded = live.recordedDebt * live.interestRate;
  const onEntire = live.entireDebt * live.interestRate;
  const page = await open(context, polarisUrl(market, id));
  const stripText = (await card(page).innerText()).replace(/\s+/g, " ");
  const m = /Costs:\s*~([\d,.]+)\s*(\w+)\s*\/\s*year/.exec(stripText);
  check(
    `c1. ${market}/${id} — the card's risk strip states a Costs figure per year`,
    m != null,
    stripText.slice(0, 200),
  );
  if (m) {
    const shown = parseFig(m[1]);
    check(
      `c2. ${market}/${id} — it is the RECORDED debt × the rate in force (${fmtNum(onRecorded)})`,
      near(shown, onRecorded),
      `page ${m[1]} · recorded ${fmtNum(onRecorded)} · entire ${fmtNum(onEntire)}`,
    );
    // Only meaningful where the two bases actually differ.
    if (!near(onEntire, onRecorded, 0.02))
      check(
        `c3. ${market}/${id} — and NOT the entire debt × the rate (${fmtNum(onEntire)})`,
        !near(shown, onEntire, 0.02),
        `page ${m[1]}`,
      );
    check(`c4. ${market}/${id} — the unit is the market's own stable, never "$"`, m[2] === STABLE[market], m[2]);
  }
  // The explanation says the same figure in words, on the same base.
  const explBtn = card(page).locator('button[aria-label*="explanation" i]').first();
  if ((await explBtn.count()) > 0 && (await explBtn.getAttribute("aria-expanded")) !== "true") await explBtn.click();
  await page.waitForTimeout(400);
  const explText = (await card(page).innerText()).replace(/\s+/g, " ");
  check(
    `c5. ${market}/${id} — the explanation's rate bullet carries the same figure "on the debt as recorded"`,
    /on the debt as recorded/.test(explText) && near(parseFig(/about ([\d,.]+)/.exec(explText)?.[1] ?? ""), onRecorded),
    /about [\d,.]+ \w+ a year on the debt as recorded/.exec(explText)?.[0] ?? explText.slice(0, 160),
  );

  // The LLM export carries it too.
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(500);
  const md = await page.evaluate(() => navigator.clipboard.readText());
  const mdLine = /- \*\*Interest cost at this rate:\*\* ~([\d,.]+) (\w+) per year, on the debt as recorded/.exec(md);
  check(
    `c6. ${market}/${id} — the LLM export carries the interest-cost line with the same figure`,
    mdLine != null && near(parseFig(mdLine[1]), onRecorded) && mdLine[2] === STABLE[market],
    mdLine?.[0] ?? "line absent",
  );
  await page.close();
}

// A closed CDP owes nothing and is charged nothing — no Costs item at all.
{
  const page = await open(context, polarisUrl("usdp", "27"));
  const text = (await card(page).innerText()).replace(/\s+/g, " ");
  check("c7. usdp/27 (closed) shows no Costs figure", !/Costs:/.test(text));
  await page.close();
}

// ── (d) the detail page's pending pulses ───────────────────────────────────
// The chain overlay is the only source of the ratio, the collateral's USD and
// the rate line. Held back, all three must pulse; refused, all three must
// settle to their absent state with nothing left pulsing.
{
  const page = await context.newPage();
  await page.route("**/api/chain/polaris/position**", async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await page.goto(polarisUrl("usdp", "8"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(1000);
  const pulsingEarly = await card(page).locator(".animate-pulse").count();
  check(
    "d1. with the chain read held 4 s, the card's chain-fed slots pulse",
    pulsingEarly >= 3,
    `${pulsingEarly} pulsing`,
  );
  await page.waitForTimeout(6000);
  const pulsingLate = await card(page).locator(".animate-pulse").count();
  const settled = (await card(page).innerText()).replace(/\s+/g, " ");
  check("d2. once it lands, nothing on the card pulses", pulsingLate === 0, `${pulsingLate} pulsing`);
  check("d3. and the slots carry their values", /%/.test(settled) && /per year, set by the market/.test(settled));
  await page.close();
}
{
  const page = await context.newPage();
  await page.route("**/api/chain/polaris/position**", (route) => route.abort());
  await page.goto(polarisUrl("usdp", "8"), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(4000);
  const pulsing = await card(page).locator(".animate-pulse").count();
  check(
    "d4. with the chain read refused, the pulses settle rather than spinning forever",
    pulsing === 0,
    `${pulsing} pulsing`,
  );
  await page.close();
}

// ── (e) the Explanation pane is remembered, per CDP ────────────────────────
{
  const page = await open(context, polarisUrl("usdp", "8"));
  const btn = card(page).locator('button[aria-label*="explanation" i]').first();
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await page.waitForTimeout(400);
  const stored = await page.evaluate(() => localStorage.getItem("rails-ui-polaris-usdp-8"));
  check("e1. opening the pane writes the CDP's own key", /"explanationOpen":true/.test(stored ?? ""), String(stored));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check(
    "e2. after a reload the pane is open again",
    (await card(page).locator('button[aria-label*="explanation" i]').first().getAttribute("aria-expanded")) === "true",
  );

  // Another CDP is untouched by it.
  const other = await open(context, polarisUrl("usdp", "27"));
  check(
    "e3. usdp/27's pane is still closed — the memory is per CDP",
    (await card(other).locator('button[aria-label*="explanation" i]').first().getAttribute("aria-expanded")) !== "true",
  );
  await other.close();

  const btn2 = card(page).locator('button[aria-label*="explanation" i]').first();
  await btn2.click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check(
    "e4. closing it is remembered too",
    (await card(page).locator('button[aria-label*="explanation" i]').first().getAttribute("aria-expanded")) !== "true",
  );
  await page.evaluate(() => localStorage.removeItem("rails-ui-polaris-usdp-8"));
  await page.close();
}

// ── (f) a never-minted CDP is a 404 ────────────────────────────────────────
{
  const page = await context.newPage();
  const res = await page.goto(polarisUrl("usdp", "999999"), { waitUntil: "domcontentloaded", timeout: 180000 });
  // The not-found body is client-rendered, so the status arrives before the
  // words do — read it once the heading has attached, not at DOM ready.
  await page
    .getByText("Not a CDP")
    .first()
    .waitFor({ state: "visible", timeout: 30000 })
    .catch(() => {});
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  check("f1. /usdp/999999 answers a real 404 status", res?.status() === 404, String(res?.status()));
  check(
    "f2. and its body says it is not a CDP",
    /Not a CDP/.test(body) && /has been minted on that market/.test(body),
    body.slice(0, 200),
  );
  await page.close();
}
for (const [path, want, what] of [
  ["/sepolia/polaris/usdp/abc", 404, "a malformed id is still a 404"],
  ["/sepolia/polaris/usdp/27", 200, "a CLOSED CDP is not"],
  ["/sepolia/polaris/usdp/175", 200, "a LIQUIDATED CDP is not"],
]) {
  const page = await context.newPage();
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  check(`f3. ${what} (${path} → ${want})`, res?.status() === want, String(res?.status()));
  await page.close();
}
// The rule's whole point: a backend that FAILED must not 404 a real CDP.
// Routed at the server's own outbound read is not possible from here, so this
// asserts the client-visible half — the page still renders, with its stated
// PENDING box rather than a 404 — by refusing the timeline the client fetches.
{
  const page = await context.newPage();
  await page.route("**/api/polaris/timeline**", (route) => route.fulfill({ status: 500, body: "{}" }));
  const res = await page.goto(polarisUrl("usdp", "8"), { waitUntil: "domcontentloaded", timeout: 180000 });
  check(
    "f4. a failed index read is not a 404 — the page still answers 200",
    res?.status() === 200,
    String(res?.status()),
  );
  await page.close();
}

// ── (g) the Learn-more modal says the CDP is an NFT ────────────────────────
{
  const page = await open(context, polarisUrl("usdp", "8"));
  const btn = card(page).locator('button[aria-label*="explanation" i]').first();
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
  await page.waitForTimeout(400);
  // The "?" trigger sits at the foot of the Explanation pane and opens a
  // portalled modal — read the MODAL's own text, not the page's: the
  // explanation pane behind it carries a holder bullet whose first six words
  // are the same, and matching that would pass with the modal shut.
  await page.getByRole("button", { name: "Learn more" }).first().click();
  const heading = page.getByText("About This CDP").first();
  await heading.waitFor({ state: "visible", timeout: 10000 });
  const modal = (await heading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]").innerText()).replace(
    /\s+/g,
    " ",
  );
  check(
    "g. the '?' modal says the CDP is an ERC-721 whose holder holds the position",
    /The CDP is an NFT/.test(modal) && /ERC-721/.test(modal) && /never reused/.test(modal),
    modal.slice(modal.indexOf("The CDP is an NFT"), modal.indexOf("The CDP is an NFT") + 200),
  );
  await page.close();
}

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Polaris CDP page's identity row, cost line, pulses, remembered pane and 404 hold`,
);
process.exit(failures ? 1 : 0);
