// A page whose indexed read fails says so (rails-ops ui-jobs 461). Page kinds
// one at a time, 2 s apart: the Aave V3 Ethereum position page, the Aave V3
// listing, the home page, the wallet page, /vaults, and one position page for
// each other family that reads its history through loadPositionTail (ids taken
// from each family's listing on 31 Oct 2026). Each must answer
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
  ...[
    [
      "morpho",
      "/ethereum/morpho/e23380494e365453f72f736f2d941959ae945773eb67a06cf4f538c7c4201264-0x272c39c82ca9f10e5338a6ee75927cfe00c82e2c",
    ],
    ["frankencoin", "/ethereum/frankencoin/0x4ffc7e8a17a793beb4bd750ec69920cda82e0882"],
    ["fx", "/ethereum/fx/wsteth-480"],
    ["compound-v2", "/ethereum/compound-v2/0xe08d97e151473a848c3d9ca3f323cb720472d015"],
    ["compound-v3", "/ethereum/compound-v3/usdc/0xee2b64d950f38a338129196a4be4dfd359ccdc69"],
    ["maple", "/ethereum/maple/0xc16bf684dce6d3bbccb324537e5289e896fb5f7f"],
    ["aave-v4", "/ethereum/aave-v4/spoke/main/0x6eac30e598697e49d782c491df9516917ef33014"],
    ["liquity-v1", "/ethereum/liquity-v1/0xf23cd4c0cffc6cebd92c189b961b51bef93bd5f1"],
    [
      "liquity-v2",
      "/ethereum/liquity-v2/trove/wstETH/19637415915845063529691472571981524597420629400849605482742369806375355807889",
    ],
    ["makerdao", "/ethereum/makerdao/0x3d25235b7c414cb67bf09561a33fd6ce62c11dcf"],
    ["fluid", "/ethereum/fluid/19526"],
    ["polaris", "/sepolia/polaris/goldp/78038"],
    [
      "dolomite",
      "/ethereum/dolomite/0x92bbd8110393350dda7e9c32089e95af071a9b6f/32240150336664509314013882100458201794439878083374431556084268488477773350727",
    ],
    [
      "llamalend",
      "/ethereum/llamalend/0x4e59541306910ad6dc1dac0ac9dfb29bd9f15c67/0x0314897962ed3e25af5dc731eb488a53f4624bca",
    ],
    ["pwn", "/ethereum/pwn/0x62ee13473eb1f771c3788f70ea988499a6008881"],
    ["moonwell", "/ethereum/moonwell/0xe3e56da9addc2e29532669140fb94fa7f21f6e4f"],
    [
      "asymmetry",
      "/ethereum/asymmetry/sUSDS/8309122898133156698498852897464396224593631760337811282458430493454418132410",
    ],
    ["ebisu", "/ethereum/ebisu/sUSDe/87142273507301491546594869769469556221191943811042234974226220181932990285269"],
    [
      "basedollar",
      "/base/basedollar/WETH/27530468316785795935447409145630139572750806430083500027941214034241540223984",
    ],
  ].map(([kind, path]) => [kind, path, "The index did not answer. Retry"]),
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
