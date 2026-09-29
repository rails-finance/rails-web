#!/usr/bin/env node
// verify-sky-savings — the Sky Savings explorer against the sUSDS contract and
// the api, for three holders: the largest by value, a small one, and a mixed
// one (deposits, a withdrawal, transfers both ways, referral codes).
//
//   A. Chain, at the api's sealed block: balanceOf(holder) equals the page's
//      shares, convertToAssets(shares) its worth, convertToAssets(1e27) the
//      share price — each to the wei.
//   B. The ledger: interest earned = worth + USDS out − USDS in; where the page
//      holds the whole history, the signed shares of every row add up to the
//      balance and each row's balance-after follows from the one before.
//   C. The pages: the card's balance and interest earned carry the api's exact
//      figures, the rate is the api's, the scrubber draws one bar, every
//      referral code is on its row, the listing opens on the largest holder,
//      and the rate history lists every change.
//
// Run: BASE=http://localhost:3916 node scripts/verify/verify-sky-savings.mjs
// Needs ALCHEMY_URL, RAILS_API_URL and API_BEARER_TOKEN in .env.local (read,
// never printed).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);
for (const k of ["ALCHEMY_URL", "RAILS_API_URL", "API_BEARER_TOKEN"])
  if (!env[k]) throw new Error(`need ${k} in .env.local`);
const scrub = (e) =>
  String(e?.shortMessage ?? e?.message ?? e)
    .replace(/https?:\/\/\S+/g, "<endpoint>")
    .slice(0, 160);

const SUSDS = "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd";
const HOLDERS = {
  top: "0x176f3dab24a159341c0509bb36b833e7fdd0a132",
  small: "0xb5df363a682478ec9f01f6718513c9bc9e12e2c8",
  mixed: "0xef42cf85be6adf3081ada73af87e27996046fe63",
};
const abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);
const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL) });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
};

const api = async (p) => {
  const res = await fetch(`${env.RAILS_API_URL}/api/sky-savings${p}`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) throw new Error(`api ${p.split("?")[0]}: ${res.status}`);
  return res.json();
};

/** A raw 18-decimal integer as its exact decimal (the page's data-prov-exact). */
const exact = (raw, places = 18) => {
  let s = BigInt(raw) < 0n ? (-BigInt(raw)).toString() : BigInt(raw).toString();
  const neg = BigInt(raw) < 0n;
  s = s.padStart(places + 1, "0");
  const out = `${s.slice(0, -places)}.${s.slice(-places)}`.replace(/\.?0+$/, "");
  return (neg ? "-" : "") + out;
};

const RAY = 10n ** 27n;
const positions = {};
for (const [name, holder] of Object.entries(HOLDERS)) {
  const pos = await api(`/position/${holder}`);
  positions[name] = pos;
  check(`${name}: the gate passed`, pos.gate?.ok === true);
  const block = BigInt(pos.asOf.block);
  const p = pos.data;

  // ── A. chain at the sealed block ──
  try {
    const [bal, worth, chi] = await Promise.all([
      client.readContract({ address: SUSDS, abi, functionName: "balanceOf", args: [holder], blockNumber: block }),
      client.readContract({
        address: SUSDS,
        abi,
        functionName: "convertToAssets",
        args: [BigInt(p.shares.raw)],
        blockNumber: block,
      }),
      client.readContract({ address: SUSDS, abi, functionName: "convertToAssets", args: [RAY], blockNumber: block }),
    ]);
    check(`${name}: balanceOf at ${block} = shares`, bal.toString() === p.shares.raw, `${bal} vs ${p.shares.raw}`);
    check(`${name}: convertToAssets(shares) = worth`, worth.toString() === p.value.raw, `${worth} vs ${p.value.raw}`);
    check(`${name}: convertToAssets(1e27) = chi`, chi.toString() === pos.asOf.chi, `${chi} vs ${pos.asOf.chi}`);
  } catch (e) {
    check(`${name}: chain reads at the sealed block`, false, scrub(e));
  }

  // ── B. the ledger ──
  const earned = BigInt(p.value.raw) + BigInt(p.usdsOut.raw) - BigInt(p.usdsIn.raw);
  check(`${name}: earned = worth + out − in`, earned.toString() === p.earned.raw, `${earned} vs ${p.earned.raw}`);
  const tl = await api(`/position/${holder}/timeline?limit=1000&order=asc`);
  if (tl.pagination.total <= 1000) {
    let shares = 0n;
    let chained = true;
    for (const e of tl.data.events) {
      const c = e.context.data;
      shares += BigInt(c.sharesDelta);
      if (shares.toString() !== c.sharesAfter) chained = false;
    }
    check(`${name}: every row's balance-after follows from the one before`, chained);
    check(`${name}: the rows add up to the balance`, shares.toString() === p.shares.raw);
  }
  positions[name].events = tl.data.events;
}

const mixedCodes = positions.mixed.events
  .map((e) => e.context.data.referral)
  .filter((r) => r != null)
  .sort((a, b) => a - b);
check("mixed: the api states its referral codes", mixedCodes.length >= 2, JSON.stringify(mixedCodes));

// ── C. the pages ──
const rates = await api(`/rates`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [name, holder] of Object.entries(HOLDERS)) {
  const pos = positions[name];
  await page.goto(`${BASE}/ethereum/sky-savings/${holder}`, { waitUntil: "networkidle", timeout: 120000 });
  const got = await page.evaluate(() => ({
    shares: document.querySelector('[data-prov-symbol="sUSDS"]')?.getAttribute("data-prov-exact"),
    usds: [...document.querySelectorAll('[data-prov-symbol="USDS"]')].map((e) => e.getAttribute("data-prov-exact")),
    text: document.body.innerText,
    gate: document.querySelector("[data-sky-gate]") != null,
    asof: document.querySelector("[data-sky-asof]")?.getAttribute("data-sky-asof"),
    bars: [...document.querySelectorAll("button[aria-label]")]
      .map((b) => b.getAttribute("aria-label"))
      .filter((l) => / show what came in, what left and each asset$/.test(l)),
    saved: [...document.querySelectorAll("[aria-label]")].some((e) =>
      /^Balance: .* still saved, of /.test(e.getAttribute("aria-label") ?? ""),
    ),
    rateMarkers: [...document.querySelectorAll("[data-note-marker]")]
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((l) => l.startsWith("Savings Rate change")).length,
  }));
  check(`${name} page: no refusal while the gate passes`, !got.gate);
  check(`${name} page: states the sealed block`, got.asof === String(pos.asOf.block), `${got.asof}`);
  check(`${name} page: balance is the api's exact shares`, got.shares === exact(pos.data.shares.raw), `${got.shares}`);
  check(
    `${name} page: interest earned is the api's exact figure`,
    got.usds.includes(exact(pos.data.earned.raw)),
    `${got.usds.join(", ")}`,
  );
  const rate = `${(Number(pos.asOf.ssrAnnual) * 100).toFixed(2)}%`;
  check(`${name} page: Savings Rate ${rate}`, got.text.includes(rate));
  check(`${name} page: Lifetime flows draw one bar`, got.bars.length === 1, `${got.bars.length} bars`);
  check(`${name} page: the bar reads Balance`, got.bars[0]?.startsWith("Balance:"), `${got.bars[0]}`);
  check(`${name} page: the solid segment reads still saved`, got.saved);
  // Every Savings Rate change from the first event to the page's block is
  // drawn, the ones after the last event in the timeline's head.
  const changes = rates.data.ssr.filter(
    (r) => r.blockNumber > pos.data.activity.firstBlock && r.blockNumber <= pos.asOf.block,
  ).length;
  if (pos.data.activity.events <= 1000)
    check(
      `${name} page: every rate change since the first event is drawn`,
      got.rateMarkers === changes,
      `${got.rateMarkers} of ${changes}`,
    );
  if (name === "mixed")
    for (const code of mixedCodes)
      check(`mixed page: referral ${code} on its row`, got.text.includes(`Referral ${code}`));
}

const top = await api(`/positions?sortBy=value&limit=1`);
await page.goto(`${BASE}/ethereum/sky-savings`, { waitUntil: "networkidle", timeout: 120000 });
const firstHref = await page.evaluate(
  () => [...document.querySelectorAll("a[href^='/ethereum/sky-savings/0x']")].map((a) => a.getAttribute("href"))[0],
);
check(
  "listing opens on the largest holder by value",
  firstHref === `/ethereum/sky-savings/${top.data[0].holder}`,
  firstHref,
);

await page.goto(`${BASE}/ethereum/sky-savings/rates`, { waitUntil: "networkidle", timeout: 120000 });
const rows = await page.evaluate(() =>
  document.querySelector("[data-sky-rate-history]")?.getAttribute("data-sky-rate-history"),
);
check("rate history lists every change", rows === String(rates.data.ssr.length), `${rows} vs ${rates.data.ssr.length}`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 || pass === 0 ? 1 : 0);
