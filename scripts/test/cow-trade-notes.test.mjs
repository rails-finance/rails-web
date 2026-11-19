// The CoW trade card's opened notes (components/protocol/cow/cow-settlement-panel.tsx,
// `CowTradeNotes`, ui-jobs 712): rendered to markup from settlement fixtures, the
// lines a page cannot show without opening the card. The settlements are the
// files in scripts/fixtures/cow-settlement/ and the server's ten Aave swaps in
// scripts/fixtures/cow-surplus-trades.json, each as the settlement route serves it.
// The component is bundled with esbuild (tsx's copy; the repo has no JSX loader for
// node:test) into a temporary module under node_modules/.cache, React and Next left to node_modules.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("tsx"))("esbuild");
// Under node_modules, so the bundle resolves React and Next as the app does.
mkdirSync(join(ROOT, "node_modules/.cache"), { recursive: true });
const dir = mkdtempSync(join(ROOT, "node_modules/.cache/cow-notes-"));
const out = join(dir, "notes.mjs");
let React, renderToStaticMarkup, CowTradeNotes;
try {
  await esbuild.build({
    entryPoints: [join(ROOT, "components/protocol/cow/cow-settlement-panel.tsx")],
    bundle: true,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    outfile: out,
    tsconfig: join(ROOT, "tsconfig.json"),
    packages: "external",
    // Next's subpaths have no exports map: node's ESM resolver needs the file's name.
    plugins: [
      {
        name: "next-subpaths",
        setup: (b) => b.onResolve({ filter: /^next\/[a-z-]+$/ }, (a) => ({ path: `${a.path}.js`, external: true })),
      },
    ],
    logLevel: "silent",
  });
  React = await import("react");
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ CowTradeNotes } = await import(pathToFileURL(out).href));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const SWAPS = json("../fixtures/cow-surplus-trades.json");
const settlementFile = (hash) => json(`../fixtures/cow-settlement/${hash}.json`);

const label = (address, s) => ({ address, symbol: s?.symbol ?? null, decimals: s?.decimals ?? null });

/** The card's trade for a Trade log of the settlement, as the wallet listing serves it. */
const cardTrade = (s, t, n = s.trades.length) => ({
  id: `${s.txHash}:${t.logIndex}`,
  blockNumber: s.blockNumber,
  timestamp: s.timestamp ?? 0,
  txHash: s.txHash,
  logIndex: t.logIndex,
  txFrom: s.txFrom ?? "0x",
  owner: t.owner,
  sellToken: t.sellToken,
  buyToken: t.buyToken,
  sellAmount: t.sellAmount,
  buyAmount: t.buyAmount,
  feeAmount: t.feeAmount,
  orderUid: t.orderUid,
  validTo: null,
  settlementTrades: n,
});

function render(s, t, n) {
  const sell = label(t.sellToken, s.tokens?.[t.sellToken]);
  const buy = label(t.buyToken, s.tokens?.[t.buyToken]);
  return renderToStaticMarkup(
    React.createElement(CowTradeNotes, { settlement: s, trade: cardTrade(s, t, n), sell, buy }),
  );
}

const swapSettlement = (hash, over = {}) => {
  const f = SWAPS[hash];
  return {
    blockNumber: f.block,
    txHash: hash,
    trades: [f.trade],
    settle: { status: "decoded", call: f.call, offset: f.offset },
    tokens: {},
    ...over,
  };
};
const swapHash = (prefix) => Object.keys(SWAPS).find((h) => h.startsWith(prefix));
const count = (html, re) => (html.match(re) ?? []).length;

test("a lone trade: the two lines and no panel", () => {
  const h = swapHash("0x2a41be3b");
  const s = swapSettlement(h);
  const html = render(s, SWAPS[h].trade, 1);
  assert.match(html, /data-cow-surplus="sell"/);
  assert.match(html, /Received beyond the limit signed/);
  assert.match(html, /data-cow-fee=""/);
  assert.match(html, /Fees in the trade(&#x27;|')s price/);
  assert.match(html, /32\.28 bp/, "the server's 32.277 bp");
  assert.doesNotMatch(html, /data-cow-settlement-panel/);
});

test("a buy order through an adapter: the plain buy-order words", () => {
  const h = swapHash("0xa3eff66c");
  const html = render(swapSettlement(h), SWAPS[h].trade, 1);
  assert.match(html, /data-cow-surplus="buy"/);
  assert.match(html, /Paid less than the limit signed/);
  assert.doesNotMatch(html, /Returned to the wallet/);
  assert.match(html, /27\.51 bp/);
});

test("the shared-pair settlement: the lines, then the panel, its fee column the card's figure", () => {
  const s = settlementFile("0x1fc438bb77a22c1d9200f55d52730975812364127ace1e9906af02553c8ac793");
  const self = s.trades.find((t) => t.owner.startsWith("0x854dea"));
  const html = render(s, self);
  assert.match(html, /data-cow-surplus="sell"/);
  assert.match(html, /data-cow-settlement-panel="pair"/);
  assert.ok(html.indexOf("data-cow-fee") < html.indexOf("data-cow-settlement-panel"), "lines above the panel");
  assert.doesNotMatch(html, /From clearing price|bp worse|bp better/);
  // The card's line and its own row: one figure, 88.907 bp.
  assert.equal(count(html, /88\.91 bp/g), 2);
  assert.match(html, /0\.09 bp/);
  assert.equal(
    count(html, /CoW charges an order(&#x27;|’|')s fees through its own price/g),
    1,
    "the sentence on the 88.9 bp row",
  );
});

test("before block 19,815,319: the signed fee alone", () => {
  const s = settlementFile("0xdb1245e3e227568f4167b7358040b840099768daa52433edd03b87f4f0081650");
  const html = render(s, s.trades[0]);
  assert.match(html, /data-cow-fee=""/);
  assert.match(html, /data-cow-settlement-panel/);
  // 2023: market makers on their own entries; the gap cannot tell a fee from their price: no fee line, "—" in the column.
  const mm = settlementFile("0x9da9e41580fd115c41baf4072da17da2e815be8f676cc8b01e6ea3a58c43c5a2");
  const mmHtml = render(
    mm,
    mm.trades.find((t) => t.logIndex === 31),
  );
  assert.match(mmHtml, /data-cow-surplus="sell"/);
  assert.doesNotMatch(mmHtml, /data-cow-fee/);
  assert.doesNotMatch(mmHtml, /\d bp/);
  assert.equal(count(mmHtml, /<td class="py-0.5 text-right">—<\/td>/g), 2, "both rows of the pair");
});

test("a trade priced better than the clearing price: no fee line, no minus sign", () => {
  const s = settlementFile("0x1fc438bb77a22c1d9200f55d52730975812364127ace1e9906af02553c8ac793");
  const t = s.trades[1];
  const better = { ...t, buyAmount: (BigInt(t.buyAmount) * 2n).toString() };
  const html = render({ ...s, trades: [better] }, better, 1);
  assert.match(html, /data-cow-surplus/);
  assert.doesNotMatch(html, /data-cow-fee/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /[-−]\s?\d/, "no negative figure in the text");
});

test("no lines where the settle call is unread, refused or does not match", () => {
  const h = swapHash("0x2a41be3b");
  for (const status of ["unread", "no-selector", "no-match"]) {
    const s = swapSettlement(h, { settle: { status } });
    assert.equal(render(s, SWAPS[h].trade, 1), "", `${status}, lone: nothing`);
    const shared = render(s, SWAPS[h].trade, 2);
    assert.doesNotMatch(shared, /data-cow-surplus|data-cow-fee/, `${status}, shared`);
  }
});
