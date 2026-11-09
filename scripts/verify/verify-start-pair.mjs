#!/usr/bin/env node
// The /start "I have two assets" door (anatomy G1, G10, G10.1; rails-ops TO-DO-ui-jobs 556,
// door 2): the top level's five cards, the pair list, and the ETH and USDC pair step with its
// order presses and the "Show them" toggle over the set-aside pools. Structure and stable text
// only: the number of pools and how many are set aside move with the chain, so each is read
// off the page and checked against the page's own count.
// ----------------------------------------------------------------------------
// Checks:
//   1. /start at 390px and 1440px: five cards, "Have two assets?" among them, one row at
//      1440px and one column at 390px, no sideways scroll.
//   2. /start/pair (G10): "Which two?" and five pair rows, ETH and USDC's opening
//      /start/pair/eth-usdc.
//   3. /start/pair/eth-usdc (G10.1) at 390px: the step hook, the chosen chip
//      (`aria-current="page"`), the heading "Pools that take ETH and USDC", three order
//      presses with Largest pressed, at least one card (`data-pool-card`), every drawn card
//      outside the set-aside, no card a link, every card's sub line ending "no hook", no
//      sideways scroll.
//   4. A press on "Highest 30-day fees" presses it and rewrites the intro.
//   5. "Setting aside N pools …" with "Show them"; a press draws N more cards, each
//      `data-pool-card-aside` with its "Set aside: …" line, and the line turns to "Showing N
//      … Hide them"; "Hide them" takes them away again.
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-start-pair.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const WAIT = 180000;

let failures = 0;
let checks = 0;
function check(name, cond, detail = "") {
  checks++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const noScroll = (page) =>
  page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.documentElement.clientWidth }));

const browser = await chromium.launch();

// ── 1. The top level ───────────────────────────────────────────────────────
for (const w of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(`${BASE}/start`, NAV);
  const cards = page.locator("[data-start-level] [data-start-card]");
  await cards.first().waitFor({ timeout: WAIT });
  const got = await cards.evaluateAll((els) => ({
    titles: els.map((e) => e.querySelector("span")?.textContent?.trim()),
    tops: [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))].length,
  }));
  check(`1a /start ${w}px five cards`, got.titles.length === 5, got.titles.join(", "));
  check(`1b /start ${w}px "Have two assets?" is a card`, got.titles.includes("Have two assets?"));
  check(
    `1c /start ${w}px ${w === 390 ? "one column" : "one row"}`,
    got.tops === (w === 390 ? 5 : 1),
    `${got.tops} row(s)`,
  );
  const s = await noScroll(page);
  check(`1d /start ${w}px no sideways scroll`, s.sw <= s.cw, `${s.sw} vs ${s.cw}`);
  await page.close();
}

// ── 2. The pair list ───────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/start/pair`, NAV);
  const list = page.locator("[data-start-pairs]");
  await list.waitFor({ timeout: WAIT });
  check("2a G10 asks Which two?", norm(await list.locator("h2").textContent()) === "Which two?");
  const rows = await list
    .locator("[data-start-pair]")
    .evaluateAll((els) => els.map((e) => [e.getAttribute("data-start-pair"), e.getAttribute("href")]));
  check("2b five pair rows", rows.length === 5, rows.map((r) => r[0]).join(","));
  const eu = rows.find((r) => r[0] === "eth-usdc");
  check("2c ETH and USDC opens its step", eu?.[1] === "/start/pair/eth-usdc", eu?.[1]);
  await page.close();
}

// ── 3–5. The pair step ─────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/start/pair/eth-usdc`, NAV);
  const step = page.locator('[data-start-pair-step="eth-usdc"]');
  const ready = await step
    .locator("[data-pool-card]")
    .first()
    .waitFor({ timeout: WAIT })
    .then(() => true)
    .catch(() => false);
  check("3a the step draws its cards", ready);
  if (ready) {
    await page.waitForTimeout(500);
    const chosen = await step
      .locator('[data-start-pair-chip][aria-current="page"]')
      .getAttribute("data-start-pair-chip");
    check("3b the chosen chip is ETH and USDC", chosen === "eth-usdc", chosen);
    check(
      "3c the heading",
      norm(await step.locator("h2").textContent()) === "Pools that take ETH and USDC",
      norm(await step.locator("h2").textContent()),
    );
    const orders = await step
      .locator("[data-pair-order]")
      .evaluateAll((els) => els.map((e) => [e.textContent.trim(), e.getAttribute("aria-pressed")]));
    check(
      "3d three order presses, Largest pressed",
      orders.length === 3 && orders[0][0] === "Largest" && orders[0][1] === "true",
      JSON.stringify(orders),
    );
    const cardsOf = () =>
      step.locator("[data-pool-card]").evaluateAll((els) =>
        els.map((e) => ({
          aside: e.getAttribute("data-pool-card-aside"),
          link: e.closest("a") !== null || e.querySelector("a") !== null,
          sub: e.querySelector(".truncate.text-xs")?.textContent ?? "",
          text: e.textContent,
        })),
      );
    const before = await cardsOf();
    check("3e at least one card", before.length > 0, String(before.length));
    check(
      "3f no drawn card is set aside",
      before.every((c) => c.aside === null),
    );
    check(
      "3g no card is a link",
      before.every((c) => !c.link),
    );
    check(
      '3h every card says "no hook"',
      before.every((c) => /· no hook$/.test(c.sub.trim())),
      before.map((c) => c.sub).join(" | "),
    );
    const s = await noScroll(page);
    check("3i no sideways scroll at 390px", s.sw <= s.cw, `${s.sw} vs ${s.cw}`);

    // ── 4. An order press ─────────────────────────────────────────────────
    const fees = step.locator('[data-pair-order="fees"]');
    await fees.click();
    await page.waitForTimeout(300);
    check("4a Highest 30-day fees pressed", (await fees.getAttribute("aria-pressed")) === "true");
    const intro = norm(await step.locator("[data-pair-intro]").textContent());
    check("4b the intro follows the order", intro.startsWith("By what a full-range position earned"), intro);
    await step.locator('[data-pair-order="size"]').click();

    // ── 5. The set-aside toggle ───────────────────────────────────────────
    const line = step.locator("[data-pair-aside]");
    const has = (await line.count()) === 1;
    check("5a the set-aside line is drawn", has);
    if (has) {
      const n = Number(await line.getAttribute("data-pair-aside"));
      const toggle = line.locator("button");
      check(
        "5b it reads Setting aside, with Show them",
        /^Setting aside \d+ pools? that are empty or thin in range/.test(norm(await line.textContent())) &&
          norm(await toggle.textContent()) === "Show them",
        norm(await line.textContent()),
      );
      await toggle.click();
      await page.waitForTimeout(300);
      const open = await cardsOf();
      const aside = open.filter((c) => c.aside !== null);
      check(
        "5c Show them draws the set-aside cards",
        open.length === before.length + n && aside.length === n,
        `${before.length} + ${n} → ${open.length}`,
      );
      check('5d each says "Set aside:"', aside.length > 0 && aside.every((c) => /Set aside: .+\./.test(c.text)));
      check(
        "5e the line turns to Showing, with Hide them",
        norm(await line.textContent()).startsWith(`Showing ${n.toLocaleString("en-US")} pool`) &&
          norm(await toggle.textContent()) === "Hide them" &&
          (await toggle.getAttribute("aria-pressed")) === "true",
        norm(await line.textContent()),
      );
      await toggle.click();
      await page.waitForTimeout(300);
      check("5f Hide them takes them away", (await cardsOf()).length === before.length);
    }
  }
  await page.close();
}

await browser.close();
if (checks === 0) {
  console.log("\nCRASH: no checks ran");
  process.exit(2);
}
console.log(failures === 0 ? `\nALL PASS (${checks})` : `\n${failures} FAILURE(S) of ${checks}`);
process.exit(failures === 0 ? 0 : 1);
