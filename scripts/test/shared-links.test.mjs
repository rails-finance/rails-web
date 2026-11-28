// The shared timeline link sites on LinkedValue (ui-jobs 878 round 2, anatomy
// L14): the T1 hash, BlockRef, LinkedAddress, LinkedTx, the prose words, the
// boundary card, the coverage footer, a vault row's counterparty, the receipt's
// contract and source tx, and T2's transaction cell. The markup captured
// before the change is scripts/fixtures/shared-links/before.json: an unlinked
// form renders it byte for byte, and a linked form reads the same text inside
// the LinkedValue wrapper, its name holding the tooltip's words. The render
// runs in tsx (shared-links.render.mjs). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CHAINS } from "./shared-links.cases.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const after = JSON.parse(
  execFileSync(
    process.execPath,
    [
      path.join(REPO, "node_modules/tsx/dist/cli.mjs"),
      "--tsconfig",
      "tsconfig.json",
      "scripts/test/shared-links.render.mjs",
    ],
    { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
const before = JSON.parse(readFileSync(path.join(REPO, "scripts/fixtures/shared-links/before.json"), "utf8"));

const EXPLORER = {
  1: { name: "Etherscan", host: "https://etherscan.io" },
  8453: { name: "Basescan", host: "https://basescan.org" },
  42161: { name: "Arbiscan", host: "https://arbiscan.io" },
  11155111: { name: "Etherscan", host: "https://sepolia.etherscan.io" },
};
const TX = "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
const ADDR = "0x1234567890abcdef1234567890abcdef12345678";

/** Every link in the markup whose name is the one given. */
const linksNamed = (html, name) =>
  [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((a) => a.includes(`aria-label="${name}"`));
/** The one LinkedValue link with this name: in the house tooltip, the L14 hook
 *  on it, no native title. */
function linked(html, name) {
  const all = linksNamed(html, name);
  assert.equal(all.length, 1, `one link named "${name}"`);
  const a = all[0];
  assert.ok(html.includes(`<span data-reveal-tip="" class="relative inline-flex cursor-pointer items-center ">${a}`));
  assert.match(a, /data-anatomy="L14"/);
  assert.doesNotMatch(a, /\btitle=/, "no native title beside the house tooltip");
  return a;
}
const external = (a, href) => {
  assert.ok(a.includes(`href="${href}"`), href);
  assert.match(a, /target="_blank"/);
  assert.match(a, /rel="noopener"/);
};
/** The text a reader sees: the markup without its tags. */
const text = (html) => html.replace(/<[^>]*>/g, "");

for (const name of ["plainBlockRef", "plainBlockRefString", "plainProse", "plainBoundary", "plainReceipt"]) {
  test(`an unlinked form renders as before LinkedValue: ${name}`, () => {
    assert.equal(after[name], before[name]);
  });
}

for (const name of Object.keys(before)) {
  test(`a linked form reads the text it read before: ${name}`, () => {
    assert.equal(text(after[name]), text(before[name]));
  });
}

for (const c of CHAINS) {
  const { name: explorer, host } = EXPLORER[c];
  test(`the T1 hash names the transaction and the explorer, the whole hash in its name: ${c}`, () => {
    const html = after[`txHash-${c}`];
    const a = linked(html, `${TX}: Transaction 0x5c50…2060, View on ${explorer}`);
    external(a, `${host}/tx/${TX}`);
    assert.match(a, new RegExp(`data-event-tx-hash="${TX}"`));
    assert.match(html, /^<span class="hidden sm:inline">/, "hidden below 640px, as before");
  });

  test(`a block stamp names the block and the explorer: ${c}`, () => {
    const a = linked(after[`blockRef-${c}`], `Block 12,345,678, View on ${explorer}`);
    external(a, `${host}/block/12345678`);
    assert.match(a, /data-block-ref=""/);
    assert.match(a, /class="[^"]*\blink-external\b/);
  });

  test(`an address with no Rails page names it and the explorer: ${c}`, () => {
    external(
      linked(after[`addressExplorer-${c}`], `Address 0x1234…5678, View on ${explorer}`),
      `${host}/address/${ADDR}`,
    );
  });

  test(`a transaction in prose names it and the explorer: ${c}`, () => {
    external(linked(after[`tx-${c}`], `Transaction 0x5c50…2060, View on ${explorer}`), `${host}/tx/${TX}#eventlog`);
  });

  test(`the boundary card's block names it and the explorer: ${c}`, () => {
    external(linked(after[`boundary-${c}`], `Block 12,345,678, View on ${explorer}`), `${host}/block/12345678`);
  });

  test(`the coverage footer's blocks and dropped transaction name the explorer: ${c}`, () => {
    const html = after[`coverage-${c}`];
    for (const b of ["12,000,000", "11,000,000"]) linked(html, `Block ${b}, View on ${explorer}`);
    external(linked(html, `Transaction 0x5c50…2060, View on ${explorer}`), `${host}/tx/${TX}#eventlog`);
  });

  test(`a vault row's counterparty names the address and the explorer: ${c}`, () => {
    const html = after[`counterparty-${c}`];
    const a = linked(html, `Address 0x1234…5678, View on ${explorer}`);
    external(a, `${host}/address/${ADDR}`);
    assert.match(html, /^<p [^>]*data-figure="row-counterparty"/);
  });

  test(`a receipt's contract and source transaction name the explorer: ${c}`, () => {
    const html = after[`receipt-${c}`];
    const contracts = linksNamed(html, `TroveManager 0x1234…5678: Contract 0x1234…5678, View on ${explorer}`);
    assert.equal(contracts.length, 2, "the input row's contract and the source row's");
    for (const a of contracts) {
      assert.match(a, /data-anatomy="L14"/);
      external(a, `${host}/address/${ADDR}`);
    }
    external(linked(html, `Transaction 0x5c50…2060, View on ${explorer}`), `${host}/tx/${TX}#eventlog`);
  });
}

for (const [name, chainId] of [
  ["txCellLiquity", 1],
  ["txCellPolaris", 11155111],
  ["txCell-8453", 8453],
  ["txCell-42161", 42161],
  ["txCellNoReceipt", 1],
]) {
  const { name: explorer, host } = EXPLORER[chainId];
  test(`T2's transaction cell names the transaction, the block and the explorer: ${name}`, () => {
    const html = after[name];
    const a = linked(html, `Transaction 0x5c50…2060, View on ${explorer}`);
    external(a, `${host}/tx/${TX}`);
    assert.match(a, /class="[^"]*link-muted font-mono text-xs"/);
    external(linked(html, `Block 12,345,678, View on ${explorer}`), `${host}/block/12345678`);
    assert.equal(text(html), "0x5c50…2060 ↗Block 12,345,678");
  });
}

test("an address with a Rails page names the page", () => {
  for (const [name, words, href] of [
    ["addressWallet", "Wallet 0x1234…5678", `/wallet/${ADDR}`],
    ["addressListing", "Aave V3 positions of 0x1234…5678", `/ethereum/aave-v3?q=${ADDR}`],
    ["addressRedeemer", "Redeemer 0x1234…5678", `/ethereum/liquity-v2/redeemer/${ADDR}`],
  ]) {
    const a = linked(after[name], words);
    assert.ok(a.includes(`href="${href}"`), href);
    assert.doesNotMatch(a, /target=/, "a Rails page opens in the same tab");
  }
});

test("prose links its address, its transaction and its words, each naming where it goes", () => {
  const html = after.prose;
  linked(html, "Wallet 0x1234…5678");
  linked(html, "Transaction 0x5c50…2060, View on Etherscan");
  const a = linked(html, "the trade: This trade on the wallet&#x27;s CoW page");
  assert.match(a, /data-prose-link=""/);
  assert.match(a, /href="\/wallet\/0x1234\/cow"/);
});
