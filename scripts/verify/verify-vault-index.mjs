#!/usr/bin/env node
// The vault overview — /vaults (rails-ops ui-jobs 776; decision 0028 point 8)
// — checked against the rosters its cards link.
// ----------------------------------------------------------------------------
// EVERY EXPECTED COUNT IS A ROSTER'S STATEMENT OR THIS SCRIPT'S PARSE:
// Morpho's, Aave's and Yearn's vaults info pages each state their vault count
// in their census sentence, Maple's pools are parsed out of
// lib/maple/asset-catalog.ts, and sBOLD is one vault. Each card's lead is held
// to the page it is the first sentence of (lib/vaults/family-leads.ts).
//
// Run:
//   BASE=http://localhost:3033 node scripts/verify/verify-vault-index.mjs
// Needs nothing from .env.local: the server makes every read.
//
// ── WHAT EACH SECTION ASSERTS ─────────────────────────────────────────
// A ROSTER IS A PROTOCOL ON A CHAIN (ui-jobs 486): Morpho has two, MetaMorpho on
// Base and on Ethereum, keyed `morpho:8453` and `morpho:1` (a row's
// `data-overview-row`; the card is the family's, `data-overview-card=morpho`).
//
//   0  /vaults answers 200, "Vaults" its h1; the menu lists Overview (current),
//      Products, Fronts and Compare;
//      the family cards lead; then the ways in (E6.3, ui-jobs 782): Products,
//      Fronts and Compare, each card one link answering 200; then the
//      questions (E6.4), four, closed on arrival, a press opening one, the
//      answers linking Fronts, Compare and Products and no wallet page; every
//      lead-in a full sentence, no fragment ending in a colon; under ?asset=
//      neither the ways in nor the questions
//   1  a row per listed roster (an unlaunched IPOR Fusion chain draws none), in
//      one card per family (ui-jobs 782), the card no link
//   2  each card's count equals its roster's, at a block, in a receipt, with the
//      roster's read stamp at that block
//   3  each card's lead is the first sentence of its family's info page (sBOLD:
//      the line under its page's header)
//   4  each row is the link to its roster, which answers 200, named for family,
//      chain and count ("Morpho on Base: 516 vaults. Open the roster"); the chain an icon named for a screen reader, no name shown
//   5  no roster links the overview: each opens on its read stamp alone (ui-jobs 771)
//   6  the counts carry receipts and the page offers the inspector (ui-jobs 571)
//   7  /vaults/about is gone (404); Products, Fronts and Compare light their menu entry
//   8  ?asset=: the line names the asset, the cards count its vaults, the roster
//      links carry it, and a roster opens on those rows; removing its Asset pill
//      takes ?asset= out of the URL
//   9  /vaults/products (E7, ui-jobs 773): a row per listed family in the
//      table and the cards; each row states the six facts; each count equals
//      the overview card's (Aave's three families summing to its card), at the
//      card's block, in a receipt; a "Not read" head is muted; steward roles
//      use the lexicon's words; no USD figure and no curator brand; every
//      row links its roster (name, count, pointers), its info page and docs,
//      each internal link answers 200, no link goes to a protocol's app, and
//      one link name never names two places

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { armInspector } from "./lib/prov-inspector.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3033";

let failures = 0;
let passes = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};

/** The rosters, by `protocol:chain`: the roster page, the info page stating
 *  its count (`figure`), and the page the card's lead is taken from. */
const ROSTER = {
  "morpho:8453": {
    href: "/base/morpho/vaults",
    info: "/base/morpho/vaults/info",
    figure: "directory-census",
    lead: "/base/morpho/vaults/info",
  },
  "morpho:1": {
    href: "/ethereum/morpho/vaults",
    info: "/ethereum/morpho/vaults/info",
    figure: "directory-census",
    lead: "/ethereum/morpho/vaults/info",
  },
  "aave:1": {
    href: "/ethereum/aave-v3/vaults",
    info: "/ethereum/aave-v3/vaults/info",
    figure: "directory-catalogue",
    lead: "/ethereum/aave-v3/vaults/info",
  },
  "yearn:1": {
    href: "/ethereum/yearn/vaults",
    info: "/ethereum/yearn/vaults/info",
    figure: "roster-census",
    lead: "/ethereum/yearn/vaults/info",
  },
  "maple:1": { href: "/ethereum/maple/pools", figure: null, lead: "/ethereum/maple/info" },
  // sBOLD (ui-jobs 765): one vault no explorer deploys; its card links its page.
  "sbold:1": { href: "/ethereum/vaults/sbold", figure: null, lead: "/ethereum/vaults/sbold" },
};
const KEYS = Object.keys(ROSTER);

const strip = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

async function get(pathname) {
  const res = await fetch(`${BASE}${pathname}`, { signal: AbortSignal.timeout(300_000) });
  return { status: res.status, html: await res.text() };
}

/** The text of the element carrying `data-figure="<figure>"`. */
function figureText(html, figure) {
  const i = html.indexOf(`data-figure="${figure}"`);
  if (i < 0) return null;
  const open = html.lastIndexOf("<", i);
  const tag = html.slice(open + 1).match(/^(\w+)/)[1];
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  re.lastIndex = open;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === "/") depth--;
    else if (!m[0].endsWith("/>")) depth++;
    if (depth === 0) return strip(html.slice(open, m.index));
  }
  return null;
}

// ── the rosters, as their pages state them ─────────────────────────────────
const rosterPages = {};
const leadPages = {};
const expected = {};
for (const k of KEYS) {
  rosterPages[k] = await get(ROSTER[k].href);
  leadPages[k] = strip((await get(ROSTER[k].lead)).html);
  if (ROSTER[k].figure) {
    const text = figureText((await get(ROSTER[k].info)).html, ROSTER[k].figure) ?? "";
    const m = text.match(/([\d,]+) (?:vaults|of them)/);
    expected[k] = m ? Number(m[1].replace(/,/g, "")) : null;
  }
}
{
  const src = fs.readFileSync(path.join(ROOT, "lib/maple/asset-catalog.ts"), "utf8");
  const body = src.slice(src.indexOf("export const MAPLE_POOLS"), src.indexOf("/** Pool key → catalog entry"));
  expected["maple:1"] = (body.match(/^\s+key: "/gm) || []).length;
}
expected["sbold:1"] = 1;
console.log(`rosters state: ${KEYS.map((k) => `${k} ${expected[k]}`).join(", ")}`);

// ── 0: the route, the head, the intro ───────────────────────────────────────
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const res = await page.goto(`${BASE}/vaults`, { waitUntil: "networkidle", timeout: 300_000 });
check("0a /vaults answers 200", res?.status() === 200, String(res?.status()));
await page.waitForSelector("[data-overview-row]", { timeout: 120_000 });
const MENU = ["/vaults", "/vaults/products", "/vaults/fronts", "/vaults/compare"];
const readMenu = async (p) => {
  await p.locator("[data-vault-index-head] [data-sections-trigger]").click();
  const entries = await p.locator('[data-vault-index-head] [data-sections-menu] [role="menuitem"]').evaluateAll((els) =>
    els.map((el) => ({
      href: el.getAttribute("href"),
      name: el.textContent.trim(),
      current: el.getAttribute("aria-current"),
    })),
  );
  await p.keyboard.press("Escape");
  return entries;
};
{
  const h1 = await page.locator("h1").allTextContents();
  check('0b "Vaults" is the page\'s one h1', h1.length === 1 && h1[0].trim() === "Vaults", h1.join(" | "));
  const entries = await readMenu(page);
  check(
    "0c the menu lists Overview (current), Products, Fronts and Compare",
    entries.map((e) => e.href).join() === MENU.join() &&
      entries.map((e) => e.name).join() === "Overview,Products,Fronts,Compare" &&
      entries[0]?.current === "page",
    entries.map((e) => `${e.name} ${e.href}${e.current ? " (current)" : ""}`).join(", "),
  );
  const order = await page.evaluate(() => {
    const c = [...document.querySelectorAll("[data-overview-card]")].at(-1);
    const w = document.querySelector("[data-vault-ways-in]");
    const f = document.querySelector("[data-vault-faq]");
    const after = (x, y) => !!(x && y && x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      ok: after(c, w) && after(w, f),
      intro: !!document.querySelector("[data-vault-overview-intro]"),
      // The cards' lead-in, one sentence under the head, naming the cards.
      leadIn: document.querySelector("[data-overview-lead-in]")?.textContent.trim() ?? "",
      leadInAbove: after(
        document.querySelector("[data-overview-lead-in]"),
        document.querySelector("[data-overview-card]"),
      ),
      // Every heading on the page that is not the head's h1 and sits above the cards.
      above: [...document.querySelectorAll("h2")].filter((h) =>
        after(h, document.querySelector("[data-overview-card]")),
      ).length,
    };
  });
  check(
    "0d one sentence naming the cards, then the family cards, the ways in and the questions; no intro",
    order.ok &&
      !order.intro &&
      order.above === 0 &&
      order.leadInAbove &&
      /^The cards below .+\.$/.test(order.leadIn) &&
      order.leadIn.split(". ").length === 1,
    JSON.stringify(order),
  );
  const ways = await page.evaluate(() => {
    const w = document.querySelector("[data-vault-ways-in]");
    const f = document.querySelector("[data-vault-faq]");
    return {
      heading: w?.querySelector("h2")?.textContent.trim() ?? "",
      lead: w?.querySelector("[data-vault-ways-in-lead]")?.textContent.trim() ?? "",
      cards: [...(w?.querySelectorAll("[data-way-in]") ?? [])].map((a) => ({
        key: a.getAttribute("data-way-in"),
        href: a.getAttribute("href"),
        tag: a.tagName,
      })),
      // The summary's words, without its aria-hidden chevron.
      questions: [...(f?.querySelectorAll("details > summary") ?? [])].map((s) =>
        [...s.childNodes]
          .filter((n) => !(n.nodeType === 1 && n.getAttribute("aria-hidden") != null))
          .map((n) => n.textContent)
          .join("")
          .trim(),
      ),
      open: f?.querySelectorAll("details[open]").length ?? -1,
      // Every paragraph before a list in the ways in and the answers.
      leadIns: [...document.querySelectorAll("[data-vault-ways-in] p, [data-vault-faq] p")]
        .filter((p) => /^(UL|OL)$/.test(p.nextElementSibling?.tagName ?? ""))
        .map((p) => p.textContent.trim()),
      faqLinks: [...(f?.querySelectorAll("a[href]") ?? [])].map((a) => a.getAttribute("href")),
    };
  });
  check('0w1 headed "Explore vaults on Rails"', ways.heading === "Explore vaults on Rails", ways.heading);
  check(
    "0w2 three cards, each one link: products, fronts, compare",
    ways.cards.map((c) => c.key).join() === "products,fronts,compare" &&
      ways.cards.map((c) => c.href).join() === "/vaults/products,/vaults/fronts,/vaults/compare" &&
      ways.cards.every((c) => c.tag === "A"),
    ways.cards.map((c) => `${c.key} ${c.href}`).join(", "),
  );
  for (const c of ways.cards) {
    const r = await page.request.get(`${BASE}${c.href}`, { timeout: 300_000 });
    check(`0w3 ${c.key} links ${c.href}, which answers 200`, r.status() === 200, String(r.status()));
  }
  check(
    "0w4 every lead-in is a sentence, none a fragment ending in a colon",
    ways.leadIns.length >= 1 && ways.leadIns.every((t) => /[.!?]$/.test(t)) && /[.]$/.test(ways.lead),
    [...ways.leadIns, ways.lead].join(" | "),
  );
  check(
    "0q1 the questions (E6.4), closed on arrival",
    ways.questions.join("|") ===
      [
        "What is a vault?",
        "How does Rails cover vaults?",
        "I opened a vault through Coinbase, Kraken or another app. Can I see it on Rails?",
        "How do I compare vaults?",
      ].join("|") && ways.open === 0,
    ways.questions.join(" | "),
  );
  check(
    "0q2 the answers link Fronts, Compare and Products, and no wallet page",
    ["/vaults/fronts", "/vaults/compare", "/vaults/products"].every((h) => ways.faqLinks.includes(h)) &&
      !ways.faqLinks.some((h) => h.startsWith("/wallet")),
    ways.faqLinks.join(", "),
  );
  await page.locator('[data-vault-faq-item="what"] summary').click();
  check(
    "0q3 a question opens on a press",
    await page
      .locator('[data-vault-faq-item="what"]')
      .evaluate((d) => d.open && d.textContent.includes("issues shares")),
  );
}

// ── 1–4: the cards, a row per roster ───────────────────────────────────────
// One card per family (ui-jobs 782); each roster is a row in it, the row the
// link. `cards` is keyed by roster, as every later section reads it.
const families = await page.locator("[data-overview-card]").evaluateAll((els) =>
  els.map((el) => ({
    family: el.getAttribute("data-overview-card"),
    tag: el.tagName,
    lead: el.querySelector("[data-overview-lead]")?.textContent.replace(/\s+/g, " ").trim() ?? "",
    rows: [...el.querySelectorAll("[data-overview-row]")].map((r) => r.getAttribute("data-overview-row")),
  })),
);
const cards = await page.locator("[data-overview-row]").evaluateAll((els) =>
  els.map((el) => ({
    key: el.getAttribute("data-overview-row"),
    count: el.getAttribute("data-overview-count"),
    block: Number(el.getAttribute("data-overview-block")),
    lead:
      el
        .closest("[data-overview-card]")
        ?.querySelector("[data-overview-lead]")
        ?.textContent.replace(/\s+/g, " ")
        .trim() ?? "",
    receipted: !!el.querySelector(
      "[data-overview-vaults] [data-prov-covered], [data-overview-vaults] .prov-locate-box",
    ),
    stampBlock: Number(el.querySelector("[data-roster-read-block]")?.getAttribute("data-roster-read-block") ?? 0),
    tag: el.tagName,
    href: el.getAttribute("href"),
    name: el.getAttribute("aria-label"),
    chainShown: el.querySelector("[data-chain-label]")?.textContent.trim() ?? null,
    chainName: el.querySelector("[data-chain-label]")?.getAttribute("aria-label") ?? null,
  })),
);
const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
check(
  "1  a row per listed roster, an unlaunched IPOR Fusion chain drawing none",
  KEYS.every((k) => byKey[k]) && cards.every((c) => KEYS.includes(c.key) || c.key.startsWith("ipor-fusion:")),
  cards.map((c) => c.key).join(", "),
);
check(
  "1b one card per family, not a link, its rows that family's rosters (Morpho's two in one card)",
  new Set(families.map((f) => f.family)).size === families.length &&
    families.every(
      (f) => f.tag === "ARTICLE" && f.rows.length > 0 && f.rows.every((r) => r.startsWith(`${f.family}:`)),
    ) &&
    families.find((f) => f.family === "morpho")?.rows.length === 2,
  families.map((f) => `${f.family}[${f.rows.join(" ")}]`).join(", "),
);
const CHAIN = { 1: "Ethereum", 8453: "Base", 42161: "Arbitrum" };
for (const k of KEYS) {
  const c = byKey[k];
  if (!c) continue;
  check(
    `2  ${k}: the row's count equals the roster's, at a block, in a receipt, with the roster's stamp`,
    expected[k] != null && Number(c.count) === expected[k] && c.block > 0 && c.receipted && c.stampBlock === c.block,
    `roster ${expected[k]}, row ${c.count} at ${c.block}, stamp ${c.stampBlock}, receipt ${c.receipted}`,
  );
  // MetaMorpho's card names every chain it holds; its info page names one.
  const chain = CHAIN[k.split(":")[1]];
  const lead = k.startsWith("morpho:")
    ? c.lead
        .replace("rosters list every vault the MetaMorpho", "roster lists every vault the two MetaMorpho")
        .replace(/ made on [^,]+,/, ` made on ${chain},`)
    : c.lead;
  check(
    `3  ${k}: the card's lead is ${ROSTER[k].lead}'s sentence${k.startsWith("morpho:") ? " over its chains" : ""}`,
    lead.length > 40 && leadPages[k].includes(lead),
    c.lead.slice(0, 120),
  );
  check(
    `4  ${k}: the row is the link to ${ROSTER[k].href}, which answers 200`,
    c.tag === "A" && c.href === ROSTER[k].href && rosterPages[k].status === 200,
    `${c.href} ${rosterPages[k].status}`,
  );
  check(
    `4b ${k}: the link is named for its family, chain and count, the row's count`,
    /^.+ on (Base|Ethereum|Arbitrum): ([\d,]+ [A-Za-z ]*vaults?|count not read)\. Open the (roster|pools page|vault)$/.test(
      c.name ?? "",
    ) && (c.name ?? "").includes(`: ${Number(c.count).toLocaleString("en-US")} vault`),
    c.name ?? "no name",
  );
  check(
    `4c ${k}: the row's chain is an icon, its name in the label alone`,
    c.chainShown === "" && c.chainName === chain && (c.name ?? "").includes(` on ${chain}: `),
    `shown "${c.chainShown}", label ${c.chainName}`,
  );
}

// ── 5: no roster links the overview (ui-jobs 771) ───────────────────────────
// Each roster opens on its read stamp alone. sBOLD's page is a vault page,
// whose header links back to /vaults, and stays out.
for (const k of KEYS.filter((k) => !k.startsWith("sbold:"))) {
  const html = rosterPages[k].html;
  check(
    `5  ${ROSTER[k].href} draws no /vaults link`,
    rosterPages[k].status === 200 && !html.includes('data-link="vault-index"') && !html.includes('href="/vaults"'),
  );
}

// ── 6: receipts and the inspector (ui-jobs 571, decision 0062) ──────────────
{
  const armed = await armInspector(page);
  const picks = await page.locator("[data-overview-row] [data-prov-pickable]").count();
  check(
    "6  the profile menu's switch arms the cards' counts",
    armed && picks >= KEYS.length,
    `${picks} pickable values`,
  );
  if (armed) await page.keyboard.press("Escape");
}

// ── 7: /vaults/about is gone; Products, Fronts and Compare light their entry ─
{
  const about = await get("/vaults/about");
  check("7a /vaults/about answers 404", about.status === 404, String(about.status));
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  for (const href of ["/vaults/products", "/vaults/fronts", "/vaults/compare"]) {
    await p.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    await p.waitForSelector("[data-vault-index-head] [data-sections-trigger]", { timeout: 60_000 });
    const entries = await readMenu(p);
    const lit = entries.find((e) => e.current === "page")?.href;
    const h1 = await p.locator("h1").allTextContents();
    const name = entries.find((e) => e.current === "page")?.name;
    // The old title headings, as any element's whole text in the page header.
    const h2 = await p
      .locator("header :is(h1, h2, h3, p)")
      .evaluateAll((els) => els.filter((e) => !e.closest("[data-vault-index-head]")).map((e) => e.textContent));
    check(
      `7b ${href} draws the head, its entry lit, one h1 "Vaults" naming the entry for a screen reader, no title heading`,
      lit === href &&
        h1.length === 1 &&
        h1[0].trim() === `Vaults — ${name}` &&
        !h2.some((t) => /^(Vault products|Vault fronts|Compare vaults)$/.test(t.trim())),
      `lit ${lit}, h1 ${h1.join(" | ")}`,
    );
  }
  await p.close();
}

// ── 8: ?asset= (ui-jobs 482, 488, 776) ──────────────────────────────────────
// The start page, the asset step and the search link /vaults?asset=: the line
// names the asset, each card counts that asset's vaults on its roster, and a
// roster that reads ?asset= gets it passed on and opens on those rows alone.
{
  const all = Object.fromEntries(cards.map((c) => [c.key, Number(c.count)]));
  for (const [param, words] of [
    ["USDC", "Vaults over USDC"],
    ["stablecoins", "Vaults over stablecoins"],
  ]) {
    const html = (await get(`/vaults?asset=${param}`)).html;
    const line = strip(html.match(/<p[^>]*data-overview-asset="[^"]*"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "");
    const got = [...html.matchAll(/data-overview-row="([^"]+)" data-overview-count="(\d*)"/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]);
    const links = [...html.matchAll(/<a[^>]*data-overview-roster=""[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    check(
      `8a ?asset=${param}: the line reads "${words}", every row counts no more than its roster`,
      line.startsWith(words) && got.length > 0 && got.every(([k, c]) => c > 0 && c <= (all[k] ?? 0)),
      `${line} | ${got.map(([k, c]) => `${k} ${c}/${all[k]}`).join(", ")}`,
    );
    check(
      `8b ?asset=${param}: the Morpho, Aave and Yearn roster links carry it`,
      links.filter((h) => /\/(morpho|aave|yearn)\/vaults/.test(h)).every((h) => h.endsWith(`?asset=${param}`)) &&
        links.some((h) => h.endsWith(`?asset=${param}`)),
      links.join(", "),
    );
    check(
      `8w ?asset=${param}: no ways in (E6.3) and no questions (E6.4)`,
      !html.includes("data-vault-ways-in") && !html.includes("data-vault-faq"),
    );
  }
  const roster = (await get("/ethereum/morpho/vaults?asset=USDC")).html;
  const tokens = [...roster.matchAll(/data-vault-row="[^"]*"[^>]*data-token="([^"]*)"/g)].map((m) => m[1]);
  check(
    "8c /ethereum/morpho/vaults?asset=USDC opens on USDC rows alone",
    tokens.length > 0 && tokens.every((t) => t === "USDC"),
    `${tokens.length} rows, ${[...new Set(tokens)].join(", ")}`,
  );
  // Removing the Asset pill takes ?asset= out of the URL, so a reload does not
  // bring the filter back.
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await p.goto(`${BASE}/ethereum/morpho/vaults?asset=USDC&show=all`, {
    waitUntil: "domcontentloaded",
    timeout: 300_000,
  });
  await p.waitForSelector("[data-vault-row]", { timeout: 120_000 });
  await p.waitForTimeout(1500);
  await p.locator('[data-filter-pill="Asset"] [data-pill-remove]').first().click();
  await p.waitForTimeout(300);
  const url = new URL(p.url());
  check(
    "8d removing the Asset pill takes ?asset= out of the URL, the other params kept",
    !url.searchParams.has("asset") && url.searchParams.get("show") === "all",
    url.search,
  );
  await p.close();
}

// ── 9: /vaults/products (E7, ui-jobs 773) ──────────────────────────────────
// /vaults is read again just before, so its cards and the products rows come
// from one index read (cached five minutes), and rows are matched to cards by
// protocol and chain.
{
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await p.goto(`${BASE}/vaults`, { waitUntil: "networkidle", timeout: 300_000 });
  await p.waitForSelector("[data-overview-row]", { timeout: 120_000 });
  const fresh = await p.locator("[data-overview-row]").evaluateAll((els) =>
    els.map((el) => ({
      key: el.getAttribute("data-overview-row"),
      count: el.getAttribute("data-overview-count"),
      block: Number(el.getAttribute("data-overview-block")),
    })),
  );
  const r = await p.goto(`${BASE}/vaults/products`, { waitUntil: "networkidle", timeout: 300_000 });
  check("9a /vaults/products answers 200", r?.status() === 200, String(r?.status()));
  await p.waitForSelector('[data-product-layout="table"] [data-product-row]', { timeout: 120_000 });
  // The family each listed roster carries (Aave's roster carries three).
  const FAMILIES = {
    morpho: ["metamorpho"],
    aave: ["sgho", "stata", "umbrella-stake"],
    yearn: ["yearn-v3"],
    maple: ["maple-pool"],
    sbold: ["sbold"],
    "ipor-fusion": ["ipor-fusion"],
  };
  const want = [...new Set(fresh.flatMap((c) => FAMILIES[c.key.split(":")[0]] ?? []))];
  const rows = await p.locator('[data-product-layout="table"] [data-product-row]').evaluateAll((els) =>
    els.map((el) => ({
      family: el.getAttribute("data-product-row"),
      cells: [...el.querySelectorAll("[data-product-cell]")].map((c) => c.getAttribute("data-product-cell")),
      counts: [...el.querySelectorAll("[data-product-count]")].map((c) => ({
        roster: c.getAttribute("data-product-roster"),
        count: c.getAttribute("data-product-count"),
        block: Number(c.getAttribute("data-product-block")),
        receipted: !!c.querySelector("[data-prov-covered], .prov-locate-box, [data-prov-pickable]"),
      })),
      roles: [...el.querySelectorAll("[data-product-role]")].map((c) => c.getAttribute("data-product-role")),
      unreadLoud: [...el.querySelectorAll('[data-product-read="not-read"] > span:first-child')].some(
        (s) => !s.className.includes("text-rb-500"),
      ),
    })),
  );
  const cardRows = await p.locator('[data-product-layout="cards"] [data-product-row]').count();
  check(
    "9b a row per listed family, in the table and the cards",
    rows.map((r) => r.family).join() === want.join() && cardRows === want.length,
    `${rows.map((r) => r.family).join(", ")} | ${cardRows} cards`,
  );
  const SIX = ["withdrawals", "stewards", "timelock", "fees", "vaults", "withdrawable"];
  check(
    "9c every row states the six facts",
    rows.every((r) => SIX.every((k) => r.cells.includes(k))),
    rows.map((r) => `${r.family} ${r.cells.join("/")}`).join("; "),
  );
  for (const c of fresh) {
    const fams = FAMILIES[c.key.split(":")[0]] ?? [];
    const chain = Number(c.key.split(":")[1]);
    const mine = fams.flatMap((f) => rows.find((r) => r.family === f)?.counts.filter((m) => m.roster === c.key) ?? []);
    const total = mine.reduce((a, m) => a + Number(m.count), 0);
    check(
      `9d ${c.key}: the products count${fams.length > 1 ? "s sum" : ""} to the overview card's, at its block, in a receipt`,
      mine.length === fams.length &&
        total === Number(c.count) &&
        mine.every((m) => m.block === c.block && m.receipted && m.count !== ""),
      `${fams.join("+")} on ${chain}: ${mine.map((m) => `${m.count}@${m.block}`).join(", ")} vs card ${c.count}@${c.block}`,
    );
  }
  check(
    '9e a "Not read" head is muted',
    rows.every((r) => !r.unreadLoud),
  );
  const LEXICON = new Set([
    "Owner",
    "Curator",
    "Guardian",
    "Role manager",
    "Accountant",
    "Pool delegate",
    "Owner and curator",
  ]);
  const roles = rows.flatMap((r) => r.roles);
  check(
    "9f steward roles use the lexicon's words",
    roles.length > 0 && roles.every((x) => LEXICON.has(x)),
    roles.join(", "),
  );
  const text = await p.locator("[data-products-page]").innerText();
  check(
    "9g no USD figure, no curator brand",
    !/\$\s?\d|USD\b/.test(text) &&
      !/\b(Gauntlet|Steakhouse|Re7|MEV Capital|Block Analitica|Hyperithm|Keyrock)\b/.test(text),
  );
  // The links (Miles, 20 Nov 2026): roster, count, pointers, About, Docs.
  const links = await p.locator('[data-product-layout="table"] [data-product-link]').evaluateAll((els) =>
    els.map((a) => ({
      kind: a.getAttribute("data-product-link"),
      href: a.getAttribute("href"),
      name: a.getAttribute("aria-label") || a.textContent.trim(),
      row: a.closest("[data-product-row]")?.getAttribute("data-product-row"),
    })),
  );
  const kinds = (f) => new Set(links.filter((l) => l.row === f).map((l) => l.kind));
  check(
    "9h every row links its roster by name and count, and its info page and docs where it has them",
    rows.every((r) => kinds(r.family).has("family") && kinds(r.family).has("count")) &&
      rows
        .filter((r) => r.family !== "sbold")
        .every((r) => kinds(r.family).has("about") && kinds(r.family).has("docs")),
    rows.map((r) => `${r.family}: ${[...kinds(r.family)].join("/")}`).join("; "),
  );
  const pointerRows = rows.filter((r) => links.some((l) => l.row === r.family && l.kind === "pointer"));
  check(
    "9i each pointer links the row's roster",
    pointerRows.length > 0 &&
      links
        .filter((l) => l.kind === "pointer")
        .every((l) => links.some((x) => x.row === l.row && x.kind === "family" && x.href === l.href)),
    `${pointerRows.length} rows with pointers`,
  );
  const internal = [...new Set(links.filter((l) => l.href.startsWith("/")).map((l) => l.href))];
  const statuses = await Promise.all(internal.map(async (h) => [h, (await get(h)).status]));
  check(
    "9j each internal link answers 200",
    statuses.every(([, st]) => st === 200),
    statuses.map(([h, st]) => `${h} ${st}`).join(", "),
  );
  const DOCS_HOSTS = new Set(["docs.morpho.org", "aave.com", "docs.yearn.fi", "docs.maple.finance", "ipor.io"]);
  const external = links.filter((l) => !l.href.startsWith("/")).map((l) => new URL(l.href).hostname);
  check(
    "9k every external link is a docs page, none a protocol's app",
    external.length > 0 && external.every((h) => DOCS_HOSTS.has(h) && !h.startsWith("app.")),
    [...new Set(external)].join(", "),
  );
  const byName = new Map();
  for (const l of links) byName.set(l.name, new Set([...(byName.get(l.name) ?? []), l.href]));
  const clash = [...byName].filter(([, hrefs]) => hrefs.size > 1);
  check(
    "9l one link name never names two places",
    clash.length === 0,
    clash.map(([n, h]) => `${n}: ${[...h].join(" | ")}`).join("; "),
  );
  await p.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
