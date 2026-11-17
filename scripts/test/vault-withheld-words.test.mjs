// The withheld and re-fetch sentences of a vault holder page come from one
// source (lib/shared/vault-withheld-words.ts, ui-jobs 683), used by the pane
// and the receipt of Aave, Yearn V3 and MetaMorpho, so the two cannot drift:
// the receipts are checked here to carry the helper's sentences word for word.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const W = await import("../../lib/shared/vault-withheld-words.ts");
const A = await import("../../lib/aave-vaults/vault-timeline-provenance.ts");
const Y = await import("../../lib/yearn/vault-timeline-provenance.ts");
const M = await import("../../lib/morpho-base/vault-timeline-provenance.ts");

const BASES = ["checked", "floor", "unchecked"];
const INTERNALS = /walked|\blane\b|store of chain readings|balanceOf|convertToAssets|eth_|_URL|refused|too large/;

test("the bound: above the ceiling, at or below it, and none on a floor or an unchecked count", () => {
  assert.equal(W.withheldBoundWords("checked", 15_000, 14_000), ", above the 14,000 rows a page can draw.");
  const under = W.withheldBoundWords("checked", 6_000, 11_000);
  assert.match(under, /above the 5,000 rows a page can draw without a stored history, and none could be kept/);
  assert.doesNotMatch(under, /11,000|keeps a stored history/);
  assert.equal(W.withheldBoundWords("floor", 5_970, 11_000), ".");
  assert.equal(W.withheldBoundWords("unchecked", 1_200, 11_000), ".");
});

test("the count says 'at least' on a floor only", () => {
  assert.equal(W.withheldCountWords("floor", 5_970), "at least 5,970");
  assert.equal(W.withheldCountWords("checked", 15_000), "15,000");
  assert.equal(W.withheldCountWords("unchecked", 1_200), "1,200");
});

test("the reasons: the floor states 5,000 and what the node did, without the size inference", () => {
  const floor = W.withheldReasonWords("floor", "block 0");
  assert.match(floor, /did not return the whole range at once/);
  assert.match(floor, /passed 5,000/);
  assert.match(floor, /from block 0/);
  assert.doesNotMatch(floor, /keeps a stored history/);
  assert.match(W.withheldReasonWords("unchecked", "the vault's creation block"), /balance check did not run/);
  assert.match(W.withheldReasonWords("checked", "block 0"), /balance check ran and agreed/);
  for (const b of BASES) assert.doesNotMatch(W.withheldReasonWords(b, "block 0"), INTERNALS, b);
});

test("the pane's short line: the bound and the rows, without the receipt's account of the query", () => {
  assert.equal(
    W.withheldPaneWords("floor", 5_970, 11_000),
    ", above the 5,000 rows a page can draw. No rows are drawn.",
  );
  assert.equal(
    W.withheldPaneWords("unchecked", 1_200, 11_000),
    ". The balance check did not run, so no rows are drawn.",
  );
  assert.equal(
    W.withheldPaneWords("checked", 15_000, 14_000),
    ", above the 14,000 rows a page can draw. The count is exact.",
  );
  assert.match(
    W.withheldPaneWords("checked", 6_000, 11_000),
    /without a stored history, and none could be kept on this request\. The count is exact\.$/,
  );
  for (const b of BASES) assert.doesNotMatch(W.withheldPaneWords(b, 6_000, 11_000), /chunk|node|query|newest rows/, b);
});

test("the re-fetch sentence never claims a second answer that did not come back", () => {
  assert.match(W.refetchWords(true), /second answer held a different number of logs/);
  const same = W.refetchWords(false);
  assert.match(same, /no second answer came back with a different number of logs/);
  assert.doesNotMatch(same, /same (number|count)/);
  for (const d of [true, false]) assert.doesNotMatch(W.refetchWords(d), INTERNALS);
});

const c = { blockNumber: 24_000_000, vault: "0x0000000000000000000000000000000000000abc", vaultName: "v" };
const families = [
  ["Aave", (n, b) => A.vaultTimelineHorizonProv(c, n, 14_000, b), 14_000, "block 0", A.vaultTimelineGateProv],
  [
    "Yearn V3",
    (n, b) => Y.yearnVaultTimelineHorizonProv(c, n, 5_000, b),
    5_000,
    "the vault's creation block",
    Y.yearnVaultTimelineGateProv,
  ],
  [
    "MetaMorpho",
    (n, b) => M.morphoVaultTimelineHorizonProv({ ...c, chainId: 8453 }, n, 11_000, b),
    11_000,
    "the vault's creation block",
    M.morphoVaultTimelineGateProv,
  ],
];
const reconcile = {
  reconciled: false,
  replayed: "1",
  onChain: "2",
  logsIn: 1,
  logsOut: 1,
  refetched: true,
  refetchDiffered: false,
  lane: "x",
  fromBlock: 0,
  toBlock: 24_000_000,
  cutBalance: null,
};

for (const [family, horizon, ceiling, from, gate] of families) {
  test(`${family}: the receipt says the helper's sentences, word for word`, () => {
    for (const b of BASES)
      for (const count of [1_200, 6_000, ceiling + 1_000]) {
        const s = horizon(count, b).summary;
        assert.ok(s.includes(W.withheldCountWords(b, count) + " transfers on this vault"), `${b} ${count}: count`);
        assert.ok(s.includes(W.withheldBoundWords(b, count, ceiling)), `${b} ${count}: bound`);
        assert.ok(s.includes(W.withheldReasonWords(b, from)), `${b} ${count}: reason`);
      }
    for (const d of [true, false])
      assert.ok(gate(c, { ...reconcile, refetchDiffered: d }).summary.includes(W.refetchWords(d)), `refetch ${d}`);
  });
}
