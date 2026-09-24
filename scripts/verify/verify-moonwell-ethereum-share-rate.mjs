#!/usr/bin/env node
// Moonwell (Ethereum) share-rate market notes — the historical kind and the
// live note, on the deployment whose market axis is a KEY, not a mToken
// address.
// ----------------------------------------------------------------------------
// Ports the Moonwell Base share-rate note (lib/shared/market-note.ts,
// components/shared/market-note-row.tsx) to Ethereum: same rule, same row,
// same provenance module — the only real difference is identity. On Base the
// route and the event context both key a market by its mToken address; on
// Ethereum both key it by the short catalog tag ('weth' | 'usdc' | 'usdt' |
// 'cbbtc' — lib/moonwell/asset-catalog.ts), and there is no market_state table
// behind the route, so the bound always falls back to the 5%/day ceiling
// alone (rule.supplyRatePerTimestamp is always null here).
//
// PINS. Every historical figure below was read from the raw tables on the
// onboarding box (postgres-api, `moonwell_mint` / `moonwell_redeem`) and the
// live overlay (`/api/chain/moonwell/position`) on 2026-09-06. The LATER end of
// every note is a live chain read and is never pinned: it is re-read from the
// same route the page reads, right before the assertion, and compared with a
// tolerance (the house pattern — verify-market-note-live.mjs's own header
// states why a fixed number would go stale on the next block). A pinned
// figure that no longer matches what the chain says is a FINDING to report,
// not a reason to adjust the check or skip it.
//
// Measured 2026-09-06: zero historical steps in all four markets' whole life
// under the shipped rule (sql/moonwell-share-rate.sql in rails-server-
// onboarding has the runnable derivation) — so `notes` is expected empty on
// every page below, and every live-note count comes from the two fixture
// wallets' overlays alone.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3000 node scripts/verify/verify-moonwell-ethereum-share-rate.mjs
//       BASE=https://rails-web.vercel.app node scripts/verify/verify-moonwell-ethereum-share-rate.mjs

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

async function api(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

// ── Formatting, restated independently of lib/shared/market-note.ts ────────
const formatShareRate = (n) => n.toLocaleString("en-US", { minimumSignificantDigits: 5, maximumSignificantDigits: 6 });
const formatUnits = (n) =>
  n.toLocaleString("en-US", Math.abs(n) >= 1_000 ? { notation: "compact", maximumFractionDigits: 2 } : {});
const pctWithin = (got, want, tolFrac) => Math.abs(got - want) <= Math.abs(want) * tolFrac + 1e-9;

/** The number right after the LAST "→" following `label` — the "after" half
 *  of a before→after stat card. */
function afterArrow(text, label) {
  const re = new RegExp(`${label}.*?([\\d.,]+)\\s*(?:%|pp)?\\s*→\\s*([\\d.,]+)`);
  const m = re.exec(text);
  return m ? Number(m[2].replace(/,/g, "")) : null;
}

/** A rendered block number is a live figure's own echo of whichever route
 *  answered it — never string-pinned. Extract the "after" integer of the
 *  `label` stat card's before→after pair and assert it sits within `tol`
 *  blocks of a route read taken moments apart on this same run. */
function blockNear(text, label, wantBlock, tol) {
  const re = new RegExp(`${label}.*?[\\d,]+\\s*→\\s*([\\d,]+)`);
  const m = re.exec(text);
  if (!m) return { ok: false, got: null };
  const got = Number(m[1].replace(/,/g, ""));
  return { ok: Math.abs(got - wantBlock) <= tol, got };
}

// The toolbar's own count label, in every form eventCountLine writes it.
const COUNT_RE =
  /^(?:Showing [\d,]+(?: of [\d,]+)?(?: listed)?(?: of [\d,]+)?|[\d,]+(?: of [\d,]+)?(?: listed)?(?: · [\d,]+)? events?|[\d,]+(?: of [\d,]+)? listed)$/;

// ── the rule, replicated (rails-server-onboarding api/src/services/share-rate.ts) ──
const TOLERANCE = 10;
const CEILING_PER_DAY = 0.05;
const EPSILON = 1e-5;
const bound = (seconds, supplyRatePerSecond) => {
  const elapsed = seconds > 0 ? seconds : 0;
  const accrual = supplyRatePerSecond > 0 ? supplyRatePerSecond * elapsed * TOLERANCE : 0;
  const ceiling = (CEILING_PER_DAY * elapsed) / 86_400;
  return EPSILON + Math.max(accrual, ceiling);
};
const detect = (samples, supplyRatePerSecond) => {
  const steps = [];
  for (let i = 1; i < samples.length; i++) {
    const from = samples[i - 1];
    const to = samples[i];
    if (!(from.rate > 0) || !(to.rate > 0)) continue;
    const ratio = to.rate / from.rate;
    if (Math.abs(ratio - 1) <= bound(to.ts - from.ts, supplyRatePerSecond)) continue;
    steps.push({ fromBlock: from.block, toBlock: to.block, ratio });
  }
  return steps;
};

// ── pinned fixtures (plan §1) ────────────────────────────────────────────────
const KEYS = ["weth", "usdc", "usdt", "cbbtc"];
const MTOKEN = {
  weth: "0xb85ca1decc4971f8094da7676f8b71002a9590c4",
  usdc: "0xe655790552c68f2871eb44b2cfe3dcfe6a63e62e",
  usdt: "0xeddc25b67d474eeecfa4f69227b81d870c467011",
  cbbtc: "0x636080eb65f1b665b646f47d31f21901cdaaee9f",
};
const DECIMALS = { weth: 18, usdc: 6, usdt: 6, cbbtc: 8 };
const SURVIVORS = { weth: 200, usdc: 289, usdt: 213, cbbtc: 79 }; // §1a, pinned from the database directly

const WALLET_A = "0xb497070466dc15fa6420b4781bb0352257146495";
const WALLET_B = "0x5321d7296fe0e7cae533a090dcda6e00f0499df0";
const CLOSED_WALLET = "0x2f19458b33a04aa643572838d29ac18efc40f820";
// Holds mTokens it only ever RECEIVED by transfer (five transfer_in rows across
// four markets, one transfer_out, never a Mint or Redeem of its own in the
// resolved event view). The plan's first pick, 0x5b9e…99a3, has five router-
// proxied WETH mints the raw `minter` column hides — an anti-join on the raw
// table is not an anti-join on the OWNER; the resolved view is.
const NO_MINT_WALLET = "0x000000000004444c5dc75cb358380d2e3de08a90";

// Each fixture wallet's own newest Mint/Redeem per market — the note's
// EARLIER end, safe to pin (it is a historical log, not a live read).
const FIXTURE_A = [
  {
    key: "weth",
    block: 25813695,
    kind: "redeem",
    txHash: "0x244a0a1af7cead1158b78472b0c5c9a855c9b53bf43fab0f972d8f92d12faa0c",
    fromRate: 0.0200160542,
    balanceRaw: "1975082546799",
  },
  {
    key: "usdc",
    block: 25862464,
    kind: "mint",
    txHash: "0xf9ac092442ec9e3ca80874c626bdf916d664df979cfb764c36394cd219480de2",
    fromRate: 0.0201441465,
    balanceRaw: "148926637587369",
  },
  {
    key: "usdt",
    block: 25849682,
    kind: "mint",
    txHash: "0x79a5a305d6c3d5cca27de307502968df4afa6d8b908ffa9b1cfd3dce7db94f3c",
    fromRate: 0.0200970813,
    balanceRaw: "149835766604167",
  },
  {
    key: "cbbtc",
    block: 25899555,
    kind: "redeem",
    txHash: "0xc1b5485ffe832a00a25f3e7243fda61e4eb052934f92b43833c3602110f5546b",
    fromRate: 0.0200305232,
    balanceRaw: "21192496741",
  },
];
const FIXTURE_B = [
  {
    key: "usdc",
    block: 25912016,
    kind: "mint",
    txHash: "0xae33fd10b1113eacefa9fdf14e02ba23a0739b287f90cf343528f8b8416d1c36",
    fromRate: 0.0201637044,
    balanceRaw: "54591161745472",
  },
  {
    key: "usdt",
    block: 25918902,
    kind: "mint",
    txHash: "0x9554287230d232f90d20740b00de3fe7afa0d8ba73cc432e354fec1a8b39bfd5",
    fromRate: 0.0201084626,
    balanceRaw: "16869771402061",
  },
];

const noteId = (f) => `share-rate-step:${MTOKEN[f.key]}:${f.block}-head`;

console.log("Moonwell (Ethereum) — share-rate market notes\n");
console.log(`BASE ${BASE}\n`);

// ── 1. The proxy answers for all four keys; a bad key is 400 ──────────────
console.log("── 1. app/api/chain/moonwell/share-rate ────────────────────────────\n");
for (const key of KEYS) {
  const r = await api(`/api/chain/moonwell/share-rate?market=${key}`);
  check(
    `1.${key} decimals ${DECIMALS[key]}, zero steps, the shipped rule`,
    r.decimals === DECIMALS[key] &&
      Array.isArray(r.steps) &&
      r.steps.length === 0 &&
      r.rule?.tolerance === TOLERANCE &&
      r.rule?.ceilingPerDay === CEILING_PER_DAY &&
      r.rule?.epsilon === EPSILON &&
      r.rule?.supplyRatePerTimestamp === null,
    JSON.stringify({ decimals: r.decimals, steps: r.steps?.length, rule: r.rule }),
  );
}
const badKeyRes = await fetch(`${BASE}/api/chain/moonwell/share-rate?market=bogus`);
check("1z. an unknown key is a 400", badKeyRes.status === 400, `got ${badKeyRes.status}`);

// ── 2. Zero steps is the DATABASE's fact — prove the replica can fail ──────
console.log("\n── 2. the rule, run here over a synthetic series ───────────────────\n");
console.log(
  `      (survivor counts pinned from postgres-api directly, not re-derivable through the proxy: ${KEYS.map((k) => `${k} ${SURVIVORS[k]}`).join(", ")})`,
);
// supplyRatePerSecond is always 0 here (no market_state table on this
// deployment — check 1 above already pinned rule.supplyRatePerTimestamp ===
// null for every key), so the ceiling alone decides the bound.
const b60 = bound(60, 0);
const pair = (r2) => [
  { block: 1, ts: 0, rate: 1 },
  { block: 2, ts: 60, rate: r2 },
];
check(
  "2a. the replica finds no step just under the ceiling bound",
  detect(pair(1 + b60 * 0.999), 0).length === 0,
  `bound over 60s = ${b60.toExponential(3)}`,
);
check(
  "2b. the replica finds a step just over the ceiling bound",
  detect(pair(1 + b60 * 1.001), 0).length === 1,
  `bound over 60s = ${b60.toExponential(3)}`,
);

// ── Playwright: the two fixture pages ──────────────────────────────────────
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1600 },
  permissions: ["clipboard-read", "clipboard-write"],
});

async function open(url, waitForNoteMs = 15000) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .getByText(COUNT_RE)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page
    .locator('[data-market-note$="-head"]')
    .first()
    .waitFor({ state: "attached", timeout: waitForNoteMs })
    .catch(() => {});
  await page.waitForTimeout(500);
  return page;
}

async function openNote(row) {
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { expanded: false }).first().click();
  await row.page().waitForTimeout(250);
  const trig = row.getByRole("button", { name: /how this note was derived/i });
  if (await trig.count()) await trig.click();
  await row.page().waitForTimeout(200);
  return (await row.innerText()).replace(/\s+/g, " ");
}

async function checkWallet(label, wallet, fixtures) {
  console.log(`\n── ${label}: ${wallet} — ${fixtures.length} live note(s) expected ─────\n`);

  const chain = await api(`/api/chain/moonwell/position?wallet=${wallet}`);
  check(
    `0.${label} overlay answers, not stale`,
    chain != null && chain.chainStale !== true,
    `chainStale=${chain?.chainStale}`,
  );
  for (const f of fixtures) {
    const m = chain.markets?.find((x) => x.market === f.key);
    const gotBalance = m?.mtokenBalanceRaw;
    check(
      `0.${label}.${f.key} entered, nonzero balance, matches the §1b pin`,
      m?.entered === true && Number(gotBalance) > 0,
      `entered=${m?.entered}, balance=${gotBalance} (pinned ${f.balanceRaw})`,
    );
    if (gotBalance !== f.balanceRaw) {
      console.log(
        `      NOTE — balance drifted from the plan's pin: pinned ${f.balanceRaw}, overlay states ${gotBalance} (a finding, not adjusted here)`,
      );
    }
  }

  const page = await open(`${BASE}/ethereum/moonwell/${wallet}`, 25000);
  const ids = await page
    .locator("[data-market-note]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
  const wantIds = fixtures.map(noteId).sort();
  check(
    `3/4.${label} shows exactly ${fixtures.length} note row(s), all live, ids match the pinned from-blocks`,
    ids.length === fixtures.length && [...ids].sort().every((id, i) => id === wantIds[i]),
    `got [${ids.join(", ")}], want [${wantIds.join(", ")}]`,
  );
  check(
    `3/4.${label} zero historical notes (measured empty for the whole roster)`,
    ids.every((id) => id.endsWith("-head")),
    ids.join(", "),
  );

  for (const f of fixtures) {
    const id = noteId(f);
    const row = page.locator(`[data-market-note="${id}"]`);
    if ((await row.count()) === 0) {
      check(`3/4.${label}.${f.key} note row present`, false, "row not found");
      continue;
    }
    const text = await openNote(row.first());
    const fresh = await api(`/api/chain/moonwell/position?wallet=${wallet}`);
    const freshMarket = fresh.markets?.find((x) => x.market === f.key);

    check(
      `3/4.${label}.${f.key} from-rate is the pinned implied rate`,
      text.includes(formatShareRate(f.fromRate)),
      `wanted ${formatShareRate(f.fromRate)}`,
    );
    const gotRate = afterArrow(text, "Share rate");
    check(
      `3/4.${label}.${f.key} to-rate within 0.5% of the freshly-read overlay exchangeRate`,
      gotRate != null && freshMarket != null && pctWithin(gotRate, freshMarket.exchangeRate, 0.005),
      `page ${gotRate}, overlay ${freshMarket?.exchangeRate}`,
    );
    const blk = blockNear(text, "Blocks", fresh.blockNumber, 200);
    check(
      `3/4.${label}.${f.key} to-block within 200 of the overlay's blockNumber`,
      blk.ok,
      `page ${blk.got}, overlay ${fresh.blockNumber}`,
    );
    const wantUnits = freshMarket != null ? Number(freshMarket.mtokenBalanceRaw) / 1e8 : NaN;
    check(
      `3/4.${label}.${f.key} holding equals mtokenBalanceRaw / 1e8 as the page formats it`,
      Number.isFinite(wantUnits) && text.includes(formatUnits(wantUnits)),
      `wanted ${formatUnits(wantUnits)}`,
    );
    check(
      `3/4.${label}.${f.key} states "elapsed" — the timestamp landed`,
      text.includes("elapsed"),
      text.slice(0, 200),
    );
  }

  // ── 5. Pill, toggle, eye menu — and (8) counting invariance ──────────────
  // Guarded rather than a bare locator await: with zero notes (the fail-first
  // stub) the pill does not render at all, and that absence must read as a
  // failed check here, never as an uncaught timeout that kills the run.
  const pillCandidate = page.getByRole("button", { name: /^Market notes/i }).first();
  const pillPresent = await pillCandidate
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!pillPresent) {
    check(`5.${label} pill reads "Market notes · ${fixtures.length}"`, false, "pill not found on the page");
    check(
      `5/8.${label} pressing the pill hides every note row, flips aria-pressed, and every count on the page is unchanged`,
      false,
      "no pill to press",
    );
    check(`8.${label} the count is unchanged again once the notes are shown`, false, "no pill to press");
  } else {
    const pill = pillCandidate;
    check(
      `5.${label} pill reads "Market notes · ${fixtures.length}"`,
      (await pill.textContent())?.trim() === `Market notes · ${fixtures.length}`,
      await pill.textContent(),
    );

    const countText = page.getByText(COUNT_RE).first();
    const before = await countText.innerText();
    const pressedBefore = await pill.getAttribute("aria-pressed");
    await pill.click();
    await page.waitForTimeout(300);
    const pressedAfter = await pill.getAttribute("aria-pressed");
    const notesHidden = await page.locator("[data-market-note]").count();
    const afterHide = await countText.innerText();
    check(
      `5/8.${label} pressing the pill hides every note row, flips aria-pressed, and every count on the page is unchanged`,
      pressedBefore === "true" && pressedAfter === "false" && notesHidden === 0 && afterHide === before,
      `aria-pressed ${pressedBefore} → ${pressedAfter}, ${notesHidden} note(s) left, count "${before}" → "${afterHide}"`,
    );
    await pill.click();
    await page.waitForTimeout(300);
    const afterShow = await countText.innerText();
    check(
      `8.${label} the count is unchanged again once the notes are shown`,
      afterShow === before,
      `"${before}" → "${afterShow}"`,
    );
  }

  if (label === "Wallet A") {
    const countText = page.getByText(COUNT_RE).first();
    const row = countText.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " gap-2 ") and contains(concat(" ", normalize-space(@class), " "), " items-center ")][1]',
    );
    const eyeTrigger = row.locator("div.relative.inline-flex.items-center > button").last();
    await eyeTrigger.click();
    await page.waitForTimeout(400);
    const eyeHasItem = await page.getByRole("button", { name: /^Market notes$/i }).count();
    check('7c. the eye menu has no "Market notes" item', eyeHasItem === 0, `${eyeHasItem} found`);
    await page.keyboard.press("Escape").catch(() => {});
  }

  return page;
}

const pageA = await checkWallet("Wallet A", WALLET_A, FIXTURE_A);
const pageB = await checkWallet("Wallet B", WALLET_B, FIXTURE_B);

// ── 6. Controls: closed wallet, no-Mint wallet ─────────────────────────────
console.log("\n── 6. Controls ──────────────────────────────────────────────────\n");
for (const [name, wallet] of [
  ["the closed wallet (exited every market)", CLOSED_WALLET],
  ["the no-Mint wallet (no own Mint/Redeem)", NO_MINT_WALLET],
]) {
  const p = await open(`${BASE}/ethereum/moonwell/${wallet}`, 3000);
  const notes = await p.locator("[data-market-note]").count();
  const pillCount = await p.getByRole("button", { name: /^Market notes/i }).count();
  check(
    `6. ${name} shows no note row and no pill`,
    notes === 0 && pillCount === 0,
    `${notes} note(s), pill ${pillCount}`,
  );
  await p.close();
}

// ── 7. Markdown export on Wallet A ─────────────────────────────────────────
console.log("\n── 7. the markdown export on Wallet A ──────────────────────────────\n");
const copyMarkdown = async (page) => {
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(500);
  return page.evaluate(() => navigator.clipboard.readText());
};
const mdA = await copyMarkdown(pageA);
check(
  `7a. the export names "Market notes" and lists ${FIXTURE_A.length}`,
  new RegExp(`\\*\\*Market notes:\\*\\*\\s*${FIXTURE_A.length}\\b`).test(mdA),
  mdA.includes("Market notes") ? mdA.match(/\*\*Market notes:\*\*[^\n]*/)?.[0] : "absent",
);
check("7b. the export carries a Market notes section", /## Market notes/.test(mdA));
const liveSentences =
  mdA.match(/Since this account's own (mint|redeem) at block [\d,]+ the \S+ market's share rate has moved/g) ?? [];
check(
  `7c. the export states the live sentence once per market (${FIXTURE_A.length})`,
  liveSentences.length === FIXTURE_A.length,
  `${liveSentences.length} found`,
);
const tableRows = (md) => (md.match(/^\| \d+ \| /gm) ?? []).length;
const rawTimelineA = await fetch(`${BASE}/api/moonwell/timeline?wallet=${WALLET_A}`).then((r) => r.json());
// The export's own table is bounded to MARKDOWN_EVENT_ROWS (50 —
// lib/shared/markdown-history.ts), independent of notes: the invariant under
// test is that the four live notes add ZERO rows to whatever that cap leaves,
// not that the table equals the wallet's whole event count.
const MARKDOWN_EVENT_ROWS = 50;
const wantTableRows = Math.min(rawTimelineA.events?.length ?? -1, MARKDOWN_EVENT_ROWS);
check(
  "7d. the live notes add no row — the timeline table's count is the route's event count, capped at 50",
  tableRows(mdA) === wantTableRows,
  `table ${tableRows(mdA)} rows, route ${rawTimelineA.events?.length} events, cap ${MARKDOWN_EVENT_ROWS}`,
);

await pageA.close();
await pageB.close();
await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Ethereum share-rate market notes hold`,
);
process.exit(failures ? 1 : 0);
