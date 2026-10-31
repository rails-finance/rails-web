// A page whose indexed read fails says so (rails-ops ui-jobs 461). Five page
// kinds, one at a time, 2 s apart: the Aave V3 Ethereum position page, the
// Aave V3 listing, the home page, the wallet page and /vaults. Each must answer
// 200 and draw no error page (Next's or ours, `[data-page-error]`).
//
//   EXPECT=down  the server's RAILS_API_URL points at a closed port: each page
//                draws the index notice (`[data-index-down]`) with its text.
//   EXPECT=up    (default) the api answers: no page draws the notice.
//
// The listing and the position page draw the notice only after the client's
// refetch fails too, so this needs a browser and a running server:
//
//   RAILS_API_URL=http://127.0.0.1:9 npx next dev -p 3085   # the outage
//   EXPECT=down BASE=http://localhost:3085 node scripts/verify/verify-index-outage.mjs
//   BASE=http://localhost:3085 node scripts/verify/verify-index-outage.mjs   # real api

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const EXPECT = process.env.EXPECT === "down" ? "down" : "up";
const WALLET = "0xc593352eefa7c45863525a3194870929fd6f5948";
const PAGES = [
  ["position", `/ethereum/aave-v3/${WALLET}`, "The index did not answer. Retry"],
  ["listing", "/ethereum/aave-v3", "The index did not answer. Retry"],
  ["home", "/", "The index did not answer. Retry"],
  ["wallet", `/wallet/${WALLET}`, "The index did not answer. Retry"],
  ["vaults", "/vaults", "The index did not answer; the figures below are read from the chain."],
];
// How long a page has to settle before the notice is ruled absent or missing:
// the client refetch on the listing and the position page lands after hydration.
const SETTLE_MS = 20_000;

const browser = await chromium.launch();
const context = await browser.newContext({ extraHTTPHeaders: bypassHeaders() });
let failed = 0;
for (const [i, [kind, path, text]] of PAGES.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, 2000));
  const page = await context.newPage();
  const problems = [];
  const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const status = res?.status() ?? 0;
  if (status !== 200) problems.push(`answered ${status}`);
  if (EXPECT === "down") {
    await page.waitForSelector("[data-index-down]", { timeout: SETTLE_MS }).catch(() => {});
  } else {
    await page.waitForLoadState("networkidle", { timeout: SETTLE_MS }).catch(() => {});
  }
  const notices = await page.$$eval("[data-index-down]", (els) => els.map((e) => e.textContent?.trim() ?? ""));
  const errorPage = await page.$$eval("[data-page-error], #__next_error__, .next-error-h1", (els) => els.length);
  // Next's dev overlay and its default error page both render the h1 class;
  // dev pages carry it in a style tag only, so the element count is the test.
  if (errorPage > 0) problems.push("drew an error page");
  if (EXPECT === "down" && !notices.includes(text))
    problems.push(`no notice "${text}" (saw ${JSON.stringify(notices)})`);
  if (EXPECT === "up" && notices.length > 0)
    problems.push(`drew the notice with the api up: ${JSON.stringify(notices)}`);
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${kind} ${path} ${status}${notices.length ? ` "${notices.join(" | ")}"` : ""}${ok ? "" : ` — ${problems.join("; ")}`}`,
  );
  await page.close();
}
await browser.close();
console.log(
  failed === 0
    ? `ALL CHECKS GREEN (${PAGES.length}, EXPECT=${EXPECT})`
    : `${failed} CHECK(S) FAILED (EXPECT=${EXPECT})`,
);
process.exit(failed === 0 ? 0 : 1);
