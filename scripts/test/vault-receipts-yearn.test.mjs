// The Yearn V3 vault receipts are in the receipt grammar's words (rails-ops
// standards/provenance-receipts-grammar.md §3, ui-jobs 683): a summary carries
// meaning only, so no backticked name and no RPC method; a check line opens
// "To check:"; a via line keeps at least two " · " segments, because the
// inspector drops the first as custody. Each builder is built with
// representative inputs and its text read as the inspector would show it.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const V = await import("../../lib/yearn/vault-provenance.ts");
const T = await import("../../lib/yearn/vault-timeline-provenance.ts");

const VAULT = "0x0000000000000000000000000000000000000abc";
const HOLDER = "0x0000000000000000000000000000000000000def";
const STRATEGY = "0x0000000000000000000000000000000000000123";
const c = { blockNumber: 24_000_000, vault: VAULT, vaultName: "USDC-1 yVault", assetSymbol: "USDC" };
const row = { ...c, holder: HOLDER, shareSymbol: "yvUSDC-1", txHash: "0x" + "ab".repeat(32) };
const reconcile = (over = {}) => ({
  reconciled: true,
  replayed: "1000000",
  onChain: "1000000",
  logsIn: 3,
  logsOut: 1,
  refetched: false,
  refetchDiffered: false,
  lane: "ALCHEMY_URL",
  fromBlock: 19_000_000,
  toBlock: 24_000_000,
  ...over,
});

/** Every receipt the two Yearn files build, each arm of each ternary once. */
const receipts = () => [
  ["census", V.yearnRosterCensusProv(c, { catalogSize: 412, censusBlock: 24_000_000 })],
  ["name", V.yearnVaultNameProv(c)],
  ["total assets", V.yearnVaultTotalAssetsProv(c)],
  ["share price", V.yearnVaultSharePriceProv(c)],
  ["endorsed", V.yearnVaultEndorsedProv(c, true)],
  ["not endorsed", V.yearnVaultEndorsedProv(c, false)],
  ["shut down", V.yearnVaultShutdownProv(c)],
  ["empty count", V.yearnEmptyCountProv(c, 40, 412)],
  ["endorsed count", V.yearnEndorsedCountProv(c, 120, 412)],
  ["shares issued", V.yearnVaultTotalSupplyProv(c)],
  ["idle", V.yearnVaultIdleProv(c)],
  ["debt", V.yearnVaultDebtProv(c)],
  ["queue", V.yearnVaultQueueProv(c, 3)],
  ["strategy debt", V.yearnVaultStrategyDebtProv(c, STRATEGY)],
  ["strategy cap", V.yearnVaultStrategyCapProv(c, STRATEGY)],
  ["accountant", V.yearnVaultRoleProv(c, "accountant")],
  ["role manager", V.yearnVaultRoleProv(c, "role manager")],
  ["unlock zero", V.yearnVaultUnlockProv(c, 0)],
  ["unlock", V.yearnVaultUnlockProv(c, 604_800)],
  ["gate agreed", T.yearnVaultTimelineGateProv(row, reconcile())],
  [
    "gate refetched",
    T.yearnVaultTimelineGateProv(row, reconcile({ reconciled: false, onChain: "1", refetched: true })),
  ],
  [
    "gate refetch differed",
    T.yearnVaultTimelineGateProv(
      row,
      reconcile({ reconciled: false, onChain: "1", refetched: true, refetchDiffered: true }),
    ),
  ],
  ...horizons(),
  ...["deposit", "withdrawal", "transfer-in", "transfer-out", "transfer-self"].map((k) => [
    `shares ${k}`,
    T.yearnVaultTimelineSharesProv(row, k),
  ]),
  ["balance after", T.yearnVaultTimelineBalanceAfterProv(row)],
  ["balance before", T.yearnVaultTimelineBalanceBeforeProv(row)],
  ["deposited", T.yearnVaultTimelineAssetsProv(row, "deposit")],
  ["withdrawn", T.yearnVaultTimelineAssetsProv(row, "withdrawal")],
  ["row share price", T.yearnVaultTimelineSharePriceProv(row, 6)],
  ["harvest", T.yearnVaultTimelineAccrualProv(row)],
];

function horizons() {
  return [
    ["withheld exact", T.yearnVaultTimelineHorizonProv(row, 6_200, 5_000, false)],
    ["withheld floor", T.yearnVaultTimelineHorizonProv(row, 5_970, 5_000, true)],
  ];
}

test("Yearn V3 receipts: summaries in words, check lines open \"To check:\", via lines keep two segments", () => {
  for (const [name, p] of receipts()) {
    assert.ok(p.summary, `${name}: has a summary`);
    assert.ok(!p.summary.includes("`"), `${name}: no backtick in the summary — ${p.summary}`);
    assert.ok(!/eth_/.test(p.summary), `${name}: no RPC method in the summary`);
    assert.ok(!/Re-run/i.test(p.summary), `${name}: no "Re-run" in the summary`);
    if (p.verify?.text) {
      assert.ok(p.verify.text.startsWith("To check:"), `${name}: check line opens "To check:" — ${p.verify.text}`);
      assert.ok(!/eth_|Re-run/i.test(p.verify.text), `${name}: check line names no tool`);
    }
    if (p.via) {
      assert.ok(!/eth_/.test(p.via), `${name}: no RPC method on the via line — ${p.via}`);
      assert.ok(p.via.split(" · ").length >= 2, `${name}: via line keeps two segments — ${p.via}`);
    }
  }
});

test("Yearn V3 history check: a second reading that changed nothing is not stated as one that answered", () => {
  const same = T.yearnVaultTimelineGateProv(row, reconcile({ reconciled: false, onChain: "1", refetched: true }));
  assert.match(same.summary, /no second answer came back with a different number of logs/);
  assert.doesNotMatch(same.summary, /returned the same log count/);
});
