// Every explorer's Assets (decision 0069, ui-jobs 786 stage 1b; anatomy A6,
// A7, H5): each explorer whose roster entry names an "assets" sub-page serves
// it, lists its assets and opens a page for each. Server-rendered HTML read by
// fetch, no browser: two requests per explorer.
// Run against a dev server:  BASE=http://localhost:3031 node scripts/verify/verify-protocol-assets-all.mjs
//
// Per explorer:
//   a. /<chain>/<slug>/assets answers 200 with at least one line;
//   b. its sections menu reads "Assets" and then "About" last;
//   c. the first line's page answers 200 under the protocol (A7), and the
//      protocol links of "Also reads this oracle" and the oracle table (A2.3,
//      A2.4) each open an explorer's page for the same token.
// Then every distinct "In <protocol>" link answers with its market (reserve
// pages checked against their market's read), and one explorer the roster
// gives no Assets has no such page (a 404).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

/** The roster entries with an Assets sub-page: id and route. */
function rosterWithAssets() {
  const src = fs.readFileSync(path.join(ROOT, "lib/shared/protocols.ts"), "utf8");
  const chains = fs.readFileSync(path.join(ROOT, "lib/shared/chains.ts"), "utf8");
  const slugOf = new Map(
    [...chains.slice(chains.indexOf("export const CHAINS")).matchAll(/^ {2}(\d+): \{[\s\S]*?slug: "([^"]+)"/gm)].map(
      (m) => [Number(m[1]), m[2]],
    ),
  );
  const body = src.slice(src.indexOf("const SPECS"), src.indexOf("const SEEN"));
  const out = [];
  for (const m of body.matchAll(/id: "([^"]+)",[\s\S]*?chainId: (\d+),[\s\S]*?slug: "([^"]+)",/g)) {
    const rest = body.slice(m.index);
    const block = rest.slice(0, rest.indexOf("\n  },"));
    if (/segment: "assets"/.test(block.slice(block.indexOf("subPages:"))))
      out.push({ id: m[1], href: `/${slugOf.get(Number(m[2]))}/${m[3]}` });
  }
  return out;
}

const get = async (p) => {
  const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
  return { status: r.status, html: r.status === 200 ? await r.text() : "" };
};
const attrs = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

const explorers = rosterWithAssets();
check("the roster names Assets on 25 explorers", explorers.length === 25, `${explorers.length}`);

for (const e of explorers) {
  const list = await get(`${e.href}/assets`);
  const lines = attrs(list.html, /data-asset-line="\d+:(0x[0-9a-f]{40})"/g);
  check(
    `${e.id} a. ${e.href}/assets lists its assets`,
    list.status === 200 && lines.length > 0,
    `${list.status}, ${lines.length} lines`,
  );
  // The sections menu stays in the page while closed: its entries in order,
  // up to the chain row (ui-jobs 854), whose glyphs carry no text.
  const menu = list.html.slice(list.html.indexOf("data-sections-menu"));
  const end = menu.search(/data-sections-chains|<\/nav>/);
  const entries = attrs(menu.slice(0, end), /role="menuitem"[^>]*>(?:<[^>]+>)*([^<]+)</g).map((s) => s.trim());
  check(`${e.id} b. the menu ends Assets, About`, entries.slice(-2).join("|") === "Assets|About", entries.join("|"));
  if (!lines.length) continue;
  const token = lines[0];
  const page = await get(`${e.href}/assets/${token}`);
  const alsoHrefs = [...page.html.matchAll(/<a[^>]*data-asset-oracle-link="([^"]*)"[^>]*>/g)].map((m) => [
    m[1],
    /href="([^"]+)"/.exec(m[0])?.[1] ?? "",
  ]);
  const wrong = alsoHrefs.filter(([, h]) => !(h.startsWith("/") && h.endsWith(`/assets/${token}`)));
  // A page whose table has rows for other protocols (a row href is set) must
  // link them; a row of the page's protocol has no link, so no link names it.
  const linkable = [...page.html.matchAll(/data-asset-oracle-href="(\/[^"]*)"/g)].length;
  const own = alsoHrefs.filter(([id]) => id === e.id);
  check(
    `${e.id} c. its page for ${token.slice(0, 10)}… answers under the protocol, its protocol links opening explorers' pages`,
    page.status === 200 &&
      page.html.includes('data-anatomy="A7"') &&
      wrong.length === 0 &&
      own.length === 0 &&
      !(linkable > 0 && alsoHrefs.length === 0),
    `${page.status}; ${alsoHrefs.length} others${wrong.length ? `; wrong ${JSON.stringify(wrong.slice(0, 2))}` : ""}`,
  );
}

// The "In <protocol>" links (A6.2), every distinct one: an Aave-family
// reserve page is drawn in the browser from its market's read, so the token
// must be in that read; every other page answers 200 without the reserve
// page's missing state, and a Comptroller market page names its market.
const AAVE_API = {
  "aave-v3": {
    core: "/api/chain/aave-v3/market",
    prime: "/api/chain/aave-v3/market?market=prime",
    etherfi: "/api/chain/aave-v3/market?market=etherfi",
  },
  "aave-v3-base": { core: "/api/chain/aave-v3-base/market" },
  spark: { core: "/api/chain/spark/market" },
  seamless: { core: "/api/chain/seamless/market" },
};
const apiText = new Map();
const readApi = async (p) => {
  if (!apiText.has(p))
    apiText.set(
      p,
      fetch(`${BASE}${p}`)
        .then((r) => (r.ok ? r.text() : ""))
        .then((t) => t.toLowerCase()),
    );
  return apiText.get(p);
};
const marketLinks = [];
for (const e of explorers) {
  const list = await get(`${e.href}/assets`);
  const hrefs = [...new Set(attrs(list.html, /data-asset-market="([^"]+)"/g).map((h) => h.replace(/&amp;/g, "&")))];
  for (const h of hrefs) marketLinks.push({ id: e.id, href: h });
}
const bad = [];
const queue = [...marketLinks];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const { id, href } = queue.shift();
      const reserve = /\/markets\/(0x[0-9a-f]{40})(?:\?market=([a-z]+))?$/.exec(href);
      if (AAVE_API[id] && reserve) {
        const api = AAVE_API[id][reserve[2] ?? "core"];
        const text = api ? await readApi(api) : "";
        if (!text.includes(reserve[1])) bad.push(`${id} ${href}: not a reserve of ${api ?? "an unknown market"}`);
        continue;
      }
      const r = await fetch(`${BASE}${href}`, { redirect: "follow" });
      const html = r.ok ? await r.text() : "";
      if (r.status !== 200) bad.push(`${id} ${href}: ${r.status}`);
      else if (/data-reserve-missing=""/.test(html)) bad.push(`${id} ${href}: the market's missing state`);
      else if (
        /\/(compound-v2|moonwell)\/markets\/0x/.test(href) &&
        !/data-reserve-symbol="">(?!Reserve<)[^<]+</.test(html)
      )
        bad.push(`${id} ${href}: names no market`);
    }
  }),
);
check(
  `the "In <protocol>" links: ${marketLinks.length} distinct, each a page that names its market, reserve, branch or listing`,
  marketLinks.length > 100 && bad.length === 0,
  bad.slice(0, 8).join(" | ") + (bad.length > 8 ? ` | +${bad.length - 8} more` : ""),
);

const none = await get("/ethereum/uniswap-v3/assets");
check("an explorer without Assets has no such page", none.status === 404, `${none.status}`);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
