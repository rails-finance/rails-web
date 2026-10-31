// A timeline read the index refuses says so (rails-ops ui-jobs 275): a 429, a
// 503 or a month read that fails draws the index notice (`[data-index-down]`,
// "The index did not answer. Retry") in the timeline's slot, never the empty
// label; a 200 with no rows keeps the empty label.
//
// The refusals are made by a proxy this script starts in front of the api, so
// the server's tail read and the client's both meet them. Start the dev server
// with its RAILS_API_URL at the proxy, and give this script the real api:
//
//   RAILS_API_URL=http://127.0.0.1:3196 npx next dev -p 3096
//   UPSTREAM=<the real RAILS_API_URL> BASE=http://localhost:3096 \
//     node scripts/verify/verify-timeline-429.mjs
//
// UPSTREAM defaults to RAILS_API_URL in .env.local (read, never printed).
// Page loads one at a time, 2 s apart.

import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { BASE } from "./lib/host.mjs";

const PROXY_PORT = Number(process.env.API_PROXY_PORT ?? 3196);
const UPSTREAM = (() => {
  if (process.env.UPSTREAM) return process.env.UPSTREAM;
  if (!existsSync(".env.local")) return null;
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith("RAILS_API_URL="));
  return line ? line.slice("RAILS_API_URL=".length).trim().replace(/^"|"$/g, "") : null;
})();
if (!UPSTREAM) {
  console.log("CRASH — no UPSTREAM api (set UPSTREAM or RAILS_API_URL in .env.local)");
  process.exit(2);
}

const NOTICE = "The index did not answer. Retry";
// A history read: `/timeline` with no further segment (not `/timeline/summary`
// or `/timeline/folder`).
const isTimeline = (url) => /\/timeline(\?|$)/.test(url);
const isSpan = (url) => isTimeline(url) && /[?&]from=/.test(url);

/** What the proxy does to a history read: pass it, refuse it, or empty it. */
let mode = { refuse: null, only: isTimeline, empty: false };
let refused = 0;

const upstream = new URL(UPSTREAM);
const client = upstream.protocol === "https:" ? await import("node:https") : http;
const proxy = http.createServer((req, res) => {
  const url = req.url ?? "";
  if (mode.refuse && mode.only(url)) {
    refused++;
    res.writeHead(mode.refuse, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: mode.refuse === 429 ? "Too Many Requests" : "Service Unavailable" }));
    return;
  }
  const headers = { ...req.headers, host: upstream.host, "accept-encoding": "identity" };
  const up = client.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
      path: upstream.pathname.replace(/\/$/, "") + url,
      method: req.method,
      headers,
    },
    (ur) => {
      const out = [];
      ur.on("data", (c) => out.push(c));
      ur.on("end", () => {
        let body = Buffer.concat(out);
        if (mode.empty && isTimeline(url) && ur.statusCode === 200) {
          const json = JSON.parse(body.toString("utf8"));
          json.events = [];
          json.totalEvents = 0;
          // The grouped answer carries its rows as `rowPlan`, or as `rows`
          // under `shapes=1`.
          if (Array.isArray(json.rowPlan)) json.rowPlan = [];
          if (Array.isArray(json.rows)) json.rows = [];
          if (typeof json.eventsServed === "number") json.eventsServed = 0;
          if (json.pagination) json.pagination = { ...json.pagination, hasMore: false };
          body = Buffer.from(JSON.stringify(json));
        }
        const h = { ...ur.headers };
        delete h["content-length"];
        delete h["transfer-encoding"];
        res.writeHead(ur.statusCode ?? 502, h);
        res.end(body);
      });
    },
  );
  up.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(up);
});
await new Promise((r) => proxy.listen(PROXY_PORT, "127.0.0.1", r));

const TROVE =
  "/ethereum/liquity-v2/trove/wstETH/19637415915845063529691472571981524597420629400849605482742369806375355807889";
const MORPHO =
  "/ethereum/morpho/e23380494e365453f72f736f2d941959ae945773eb67a06cf4f538c7c4201264-0x272c39c82ca9f10e5338a6ee75927cfe00c82e2c";
// A cut below the preload: the page reads the cut's month after hydration.
const SPARK_CUT = "/ethereum/spark/0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5?to=2023-05-17";
const EMPTY_LABEL = "No transaction history available";
const SETTLE_MS = 30_000;

const browser = await chromium.launch();
let failed = 0;
let counted = 0;
let opened = 0;

async function open(path) {
  if (opened++ > 0) await new Promise((r) => setTimeout(r, 2000));
  const page = await browser.newPage();
  const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  return { page, status: res?.status() ?? 0 };
}
const read = (page) =>
  page.evaluate(() => ({
    notices: [...document.querySelectorAll("[data-index-down]")].map((e) => e.textContent?.trim() ?? ""),
    empty: [...document.querySelectorAll("[data-timeline-empty]")].map((e) => e.textContent?.trim() ?? ""),
    cards: document.querySelectorAll("[data-event-id]").length,
  }));
function check(name, ok, detail) {
  counted++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}
const said = (s) => `notice ${JSON.stringify(s.notices)}, empty ${JSON.stringify(s.empty)}, ${s.cards} card(s)`;

try {
  for (const [kind, path] of [
    ["liquity-v2", TROVE],
    ["morpho", MORPHO],
  ]) {
    for (const status of [429, 503]) {
      mode = { refuse: status, only: isTimeline, empty: false };
      refused = 0;
      const { page, status: http } = await open(path);
      await page.waitForSelector("[data-index-down]", { timeout: SETTLE_MS }).catch(() => {});
      const s = await read(page);
      check(
        `${kind} timeline ${status}: the notice, no empty label`,
        http === 200 && refused > 0 && s.notices.includes(NOTICE) && !s.empty.some((t) => t.includes(EMPTY_LABEL)),
        `page ${http}, ${refused} refused, ${said(s)}`,
      );
      await page.close();
    }
  }

  // A month read refused, then answered on Retry.
  for (const status of [429, 503]) {
    mode = { refuse: status, only: isSpan, empty: false };
    refused = 0;
    const { page, status: http } = await open(SPARK_CUT);
    await page.waitForSelector("[data-index-down]", { timeout: SETTLE_MS }).catch(() => {});
    const s = await read(page);
    check(
      `spark month read ${status}: the notice in the timeline slot`,
      http === 200 && refused > 0 && s.notices.includes(NOTICE),
      `page ${http}, ${refused} refused, ${said(s)}`,
    );
    if (status === 503) {
      mode = { refuse: null, only: isTimeline, empty: false };
      await page
        .locator("[data-index-down] button")
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForSelector('[data-boundary-row="cut"]', { timeout: SETTLE_MS }).catch(() => {});
      await page.waitForTimeout(2000);
      const after = await read(page);
      check(
        "spark Retry with the api answering: the month's rows, no notice",
        after.notices.length === 0 && after.cards + (await page.locator("[data-group-frame]").count()) > 0,
        said(after),
      );
    }
    await page.close();
  }

  // A 200 with rows, and a 200 with none.
  for (const [kind, path] of [
    ["liquity-v2", TROVE],
    ["morpho", MORPHO],
  ]) {
    mode = { refuse: null, only: isTimeline, empty: false };
    let { page, status: http } = await open(path);
    await page.waitForSelector("[data-event-id]", { timeout: SETTLE_MS }).catch(() => {});
    let s = await read(page);
    check(`${kind} 200 with rows: rows, no notice`, http === 200 && s.cards > 0 && s.notices.length === 0, said(s));
    await page.close();

    mode = { refuse: null, only: isTimeline, empty: true };
    ({ page, status: http } = await open(path));
    await page.waitForSelector("[data-timeline-empty]", { timeout: SETTLE_MS }).catch(() => {});
    s = await read(page);
    check(
      `${kind} 200 with no rows: the empty label, no notice`,
      http === 200 && s.empty.length > 0 && s.notices.length === 0,
      said(s),
    );
    await page.close();
  }
} finally {
  await browser.close();
  proxy.close();
}

if (counted === 0) {
  console.log("CRASH — zero checks ran");
  process.exit(2);
}
console.log(failed === 0 ? `ALL CHECKS GREEN (${counted})` : `${failed} of ${counted} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
