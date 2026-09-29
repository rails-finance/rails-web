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
//      and the rate history lists every change. The words: the balance names
//      sUSDS, every Full breakdown row names its unit, the scrubber's
//      balancing item reads "Interest earned" at every stop, its last stop
//      states the header's block, and at 390px consecutive Savings Rate
//      changes draw as one row that counts them.
//   D. The receipts (newcomer round 3): the share price's receipt carries
//      every operand its formula names (chi and rho read at the sealed block,
//      rpow over them reproduces convertToAssets(1e27) to the wei), no Sky
//      receipt shows the "Untraced input" caution, a scaling line writes its
//      power of ten as 10¹⁸, and the Sent and Received explanations say who
//      keeps the interest earned before the transfer.
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
import { armInspector } from "./lib/prov-inspector.mjs";

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
  "function chi() view returns (uint192)",
  "function rho() view returns (uint64)",
  "function ssr() view returns (uint256)",
]);

/** SUsds._rpow: x^n at 27 decimals, each step rounded half up. */
const rpow = (x, n) => {
  let z = n % 2n === 0n ? RAY : x;
  const half = RAY / 2n;
  for (n /= 2n; n > 0n; n /= 2n) {
    x = (x * x + half) / RAY;
    if (n % 2n === 1n) z = (z * x + half) / RAY;
  }
  return z;
};
const RAY = 10n ** 27n;
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
    if (name === "mixed") {
      const [stored, rho, ssr, blk] = await Promise.all([
        client.readContract({ address: SUSDS, abi, functionName: "chi", blockNumber: block }),
        client.readContract({ address: SUSDS, abi, functionName: "rho", blockNumber: block }),
        client.readContract({ address: SUSDS, abi, functionName: "ssr", blockNumber: block }),
        client.getBlock({ blockNumber: block }),
      ]);
      const grown = blk.timestamp > rho ? (rpow(ssr, blk.timestamp - rho) * stored) / RAY : stored;
      check(
        "share price receipt: rpow(ssr, t − rho) × chi ÷ 10^27 = convertToAssets(1e27)",
        grown === chi,
        `${grown} vs ${chi}`,
      );
      check("share price receipt: ssr() is the api's ssr", ssr.toString() === pos.asOf.ssr, `${ssr}`);
    }
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

  // The words (newcomer round 2).
  // Final pass: the card's check line states the block only; the population
  // counts are the listing's, at its own block. The header says when figures
  // are read; a gap in holding shows the days held, computed here from the api.
  check(
    `${name} page: the check line names the block and no population count`,
    /Checked against the contract at block [\d,]+/.test(got.text) && !/addresses that ever held/.test(got.text),
  );
  check(
    `${name} page: figures are read at the newest block when the page loads`,
    /the newest block when the page loaded/.test(got.text),
  );
  check(`${name} page: no "exactly" in the copy`, !/\bexactly\b/.test(got.text));
  if (positions[name].events.length === pos.data.activity.events) {
    const ev = positions[name].events;
    const endTs = pos.data.status === "open" ? Math.floor(Date.now() / 1000) : ev[ev.length - 1].timestamp;
    let sec = 0;
    ev.forEach((e, i) => {
      if (BigInt(e.context.data.sharesAfter) > 0n) sec += (ev[i + 1]?.timestamp ?? endTs) - e.timestamp;
    });
    const held = Math.floor(sec / 86400);
    const span = Math.floor((endTs - ev[0].timestamp) / 86400);
    const m = got.text.match(/held on ([\d,]+) of ([\d,]+) days/);
    if (held < span)
      check(
        `${name} page: days held ${held} of ${span}`,
        !!m &&
          Math.abs(Number(m[1].replace(/,/g, "")) - held) <= 1 &&
          Math.abs(Number(m[2].replace(/,/g, "")) - span) <= 1,
        m ? m[0] : "no pill",
      );
    else check(`${name} page: no held-days pill without a gap`, !m, m?.[0]);
  }
  const words = await page.evaluate(() => {
    const bal = document.querySelector('[data-prov-symbol="sUSDS"]')?.parentElement?.innerText ?? "";
    const live = document.querySelector("p[aria-live=polite]")?.innerText ?? "";
    return { bal, live };
  });
  check(`${name} page: the balance names sUSDS`, /sUSDS/.test(words.bal), words.bal);
  if (pos.data.status === "open")
    check(
      `${name} page: the scrubber's last stop is the header's block`,
      words.live === `Position at block ${Number(pos.asOf.block).toLocaleString("en-US")}`,
      words.live,
    );
  await page
    .getByRole("button", { name: /Full breakdown/ })
    .first()
    .click();
  await page.locator('button[aria-controls="flows-collateral-zoom"]').click();
  await page.waitForTimeout(300);
  const zoomAt = () => page.locator("#flows-collateral-zoom").innerText();
  // The Full breakdown's rows: from its heading to its first bullet or the
  // timeline's eyebrow.
  const breakdown = await page.evaluate(() => {
    const t = document.body.innerText;
    const at = t.indexOf("Full breakdown");
    const ends = ["•", "\nHolding since", "\nHeld "].map((w) => t.indexOf(w, at)).filter((i) => i > at);
    return t.slice(at, Math.min(...ends, t.length));
  });
  const rowCount = [...breakdown.matchAll(/^(Deposited \(all.time\)|Worth now)$/gm)].length;
  check(`${name} page: the Full breakdown opened`, rowCount > 0, breakdown.slice(0, 120));
  const unitless = [
    ...breakdown.matchAll(
      /^(Deposited \(all.time\)|Received|Interest earned|Withdrawn|Sent|Worth now)\n\s*([^\n]+)$/gm,
    ),
  ]
    .filter((m) => /^[0-9.,KMB]+$/.test(m[2].trim()))
    .map((m) => `${m[1]} ${m[2].trim()}`);
  check(`${name} page: every Full breakdown row names its unit`, unitless.length === 0, unitless.join("; "));
  const stops = [await zoomAt()];
  await page.getByRole("button", { name: "Previous event", exact: true }).click();
  await page.waitForTimeout(300);
  stops.push(await zoomAt());
  check(
    `${name} page: the balancing item reads Interest earned at the last stop and the one before`,
    stops.every((z) => z.includes("Interest earned") && !/Market move|Price change/.test(z)),
    stops.map((z) => z.replace(/\s+/g, " ").slice(0, 160)).join(" || "),
  );
}

// At 390px, consecutive Savings Rate changes draw as one row that counts them.
{
  const phone = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const pos = positions.small;
  await phone.goto(`${BASE}/ethereum/sky-savings/${HOLDERS.small}`, { waitUntil: "networkidle", timeout: 120000 });
  const got = await phone.evaluate(() => ({
    runs: [...document.querySelectorAll("[data-phone-note-run]")].map((e) => ({
      n: Number(e.getAttribute("data-phone-note-run")),
      text: e.innerText.split("\n")[0],
    })),
    single: document.querySelectorAll("[data-market-note]").length,
    width: document.documentElement.scrollWidth,
  }));
  const changes = rates.data.ssr.filter(
    (r) => r.blockNumber > pos.data.activity.firstBlock && r.blockNumber <= pos.asOf.block,
  ).length;
  const inRuns = got.runs.reduce((a, r) => a + r.n, 0);
  check("small page at 390: rate changes draw as run rows", got.runs.length > 0, JSON.stringify(got.runs));
  check(
    "small page at 390: every rate change is in a run or its own row",
    inRuns + got.single === changes,
    `${inRuns} in runs + ${got.single} rows of ${changes}`,
  );
  check(
    "small page at 390: each run row names its count",
    got.runs.every((r) => r.text.startsWith(`${r.n} Savings Rate changes, `)),
    JSON.stringify(got.runs),
  );
  check("small page at 390: no horizontal overflow", got.width <= 390, `${got.width}`);
  await phone.close();
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

// ── D. the receipts and the transfer explanations (mixed holder) ──
{
  const pos = positions.mixed;
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.goto(`${BASE}/ethereum/sky-savings/${HOLDERS.mixed}`, { waitUntil: "networkidle", timeout: 120000 });
  const heads = p2.locator('[role="button"][class*="group/evt"]');
  const nh = await heads.count();
  for (let i = 0; i < nh; i++) {
    await heads.nth(i).scrollIntoViewIfNeeded();
    await heads.nth(i).click();
    await p2.waitForTimeout(150);
  }
  const explain = p2.locator('button[aria-label="Show explanation"]');
  for (let i = (await explain.count()) - 1; i >= 0; i--) {
    await explain.nth(i).scrollIntoViewIfNeeded();
    await explain.nth(i).click();
    await p2.waitForTimeout(100);
  }
  const text = await p2.evaluate(() => document.body.innerText);
  check(
    "mixed page: a Received row says the sender keeps what the shares earned",
    text.includes(
      "The sender keeps the interest the shares earned while it held them, and from then on they earn for this address.",
    ),
  );
  check(
    "mixed page: a Sent row says this address keeps what the shares earned",
    text.includes(
      "This address keeps the interest the shares earned while it held them, and from then on they earn for the recipient.",
    ),
  );
  check(
    'mixed page: the interest tile reads "since the first event"',
    /Interest earned since the first event/.test(text) && !/Interest earned to date/.test(text),
  );
  const lm = p2.locator('button[aria-label="Learn more"]');
  let modal = "";
  for (let i = 0; i < (await lm.count()); i++) {
    if (!(await lm.nth(i).isVisible())) continue;
    await lm.nth(i).click();
    await p2.waitForTimeout(300);
    const t = await p2.evaluate(() => document.body.innerText);
    if (t.includes("How Sky Savings Works")) {
      modal = t;
      break;
    }
    await p2.keyboard.press("Escape");
  }
  for (const t of ["chi", "rho", "ssr", "drip", "Vow", "suck", "wei"])
    check(`learn more: defines ${t}`, modal.includes(`Term: ${t}`));
  await p2.keyboard.press("Escape");
  check("mixed page: the inspector arms", await armInspector(p2));
  const boxes = p2.locator("span.prov-locate-box");
  const nb = await boxes.count();
  let opened = 0;
  const untraced = [];
  let scaling = null;
  let share = null;
  for (let i = 0; i < nb; i++) {
    const bx = boxes.nth(i);
    if (!(await bx.isVisible())) continue;
    await bx.scrollIntoViewIfNeeded();
    await bx.click();
    const pop = await p2.waitForSelector(".prov-inspect-pop", { timeout: 5000 }).catch(() => null);
    if (!pop) continue;
    const t = await pop.innerText();
    opened++;
    if (/Untraced input/.test(t)) untraced.push(t.split("\n")[0]);
    if (!scaling && /dividing by/.test(t)) scaling = t.match(/dividing by (\S+)/)[1];
    if (!share && /^Share price\n1 sUSDS = /.test(t)) share = t;
    await p2.keyboard.press("Escape");
    await p2.waitForTimeout(80);
  }
  check(
    `mixed page: no receipt shows "Untraced input" (${opened} opened)`,
    opened > 50 && untraced.length === 0,
    [...new Set(untraced)].join("; "),
  );
  check("mixed page: the scaling line reads 10¹⁸", scaling === "10¹⁸", `${scaling}`);
  const blockN = BigInt(pos.asOf.block);
  const [stored, rho] = await Promise.all([
    client.readContract({ address: SUSDS, abi, functionName: "chi", blockNumber: blockN }),
    client.readContract({ address: SUSDS, abi, functionName: "rho", blockNumber: blockN }),
  ]).catch(() => [null, null]);
  const pageBlock = share?.match(/at block ([\d,]+)/)?.[1]?.replace(/,/g, "");
  // The page may seal a later block than the api read above; compare at the page's block.
  const [pStored, pRho] =
    pageBlock && pageBlock !== String(pos.asOf.block)
      ? await Promise.all([
          client.readContract({ address: SUSDS, abi, functionName: "chi", blockNumber: BigInt(pageBlock) }),
          client.readContract({ address: SUSDS, abi, functionName: "rho", blockNumber: BigInt(pageBlock) }),
        ])
      : [stored, rho];
  check(
    "share price receipt: names chi at the last Drip and rho as read at its block",
    !!share && share.includes(String(pStored)) && share.includes(String(pRho)) && /rpow/.test(share),
    share ? share.replace(/\s+/g, " ").slice(0, 200) : "no receipt",
  );
  await p2.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 || pass === 0 ? 1 : 0);
