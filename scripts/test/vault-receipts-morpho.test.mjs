// The MetaMorpho vault receipts (Base and Ethereum, one family) are in the
// receipt grammar's words (rails-ops standards/provenance-receipts-grammar.md
// §3, ui-jobs 683): a summary carries meaning only, so no backticked name and
// no RPC method; a check line opens "To check:" and names the vault's chain; a
// via line that opens on the lane keeps a second segment, because the
// inspector drops the first. Each builder is built with representative inputs,
// every arm of its ternaries once, on chain 8453 and on chain 1.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const V = await import("../../lib/morpho-base/vault-provenance.ts");
const T = await import("../../lib/morpho-base/vault-timeline-provenance.ts");

const VAULT = "0x0000000000000000000000000000000000000abc";
const HOLDER = "0x0000000000000000000000000000000000000def";
const TX = "0x" + "ab".repeat(32);
const coords = (chainId) => ({
  chainId,
  blockNumber: 24_000_000,
  vault: VAULT,
  vaultName: "Steakhouse USDC",
  assetSymbol: "USDC",
  shareSymbol: "steakUSDC",
  holder: HOLDER,
  marketId: "0x" + "11".repeat(32),
  collateralSymbol: "cbBTC",
});
const reconcile = (over = {}) => ({
  reconciled: true,
  replayed: "1000000",
  onChain: "1000000",
  logsIn: 3,
  logsOut: 1,
  refetched: false,
  refetchDiffered: false,
  lane: "BASE_LOGS_RPC_URL",
  fromBlock: 20_000_000,
  toBlock: 24_000_000,
  cutBalance: null,
  ...over,
});
const leg = (over = {}) => ({
  marketId: "0x" + "11".repeat(32),
  queueIndex: 0,
  collateralToken: null,
  collateralSymbol: "cbBTC",
  collateralNamed: true,
  lltv: "860000000000000000",
  isIdle: false,
  supplyShares: "10",
  marketTotalSupplyAssets: "100",
  marketTotalSupplyShares: "100",
  vaultSupplied: "10",
  ...over,
});
const stored = { source: "stored+head", cut: 23_900_000, tailRows: 900, headRows: 12, storedThisRequest: false };
const fresh = { source: "chain", cut: null, tailRows: 0, headRows: 0, storedThisRequest: false };

const receipts = (chainId) => {
  const c = coords(chainId);
  const row = { ...c, txHash: TX };
  const ceiling = chainId === 1 ? 14_000 : 11_000;
  return [
    ["total assets", V.vaultTotalAssetsProv(c)],
    ["shares issued", V.vaultTotalSupplyProv(c)],
    ["share price", V.vaultSharePriceProv(c)],
    ["share price, no block", V.vaultSharePriceProv({ ...c, blockNumber: undefined })],
    ["lost assets", V.vaultLostAssetsProv(c)],
    ["held", V.vaultHeldAssetsProv(c, { totalAssets: "100", lostAssets: "1" })],
    ["leg assets", V.vaultLegAssetsProv(c)],
    ["leg share", V.vaultLegShareProv(c)],
    ["leg LLTV", V.vaultLegLltvProv(c)],
    ["allocated", V.vaultAllocatedProv(c)],
    ["unaccrued interest, V1.1", V.vaultGapProv(c, true)],
    ["unaccrued interest, V1.0", V.vaultGapProv(c, false)],
    ["census", V.vaultDirectoryCensusProv(c, { catalogSize: 505, censusBlock: 23_990_000 })],
    ["directory name", V.vaultDirectoryNameProv(c)],
    ["directory total assets", V.vaultDirectoryTotalAssetsProv(c)],
    ["directory share price", V.vaultDirectorySharePriceProv(c)],
    ["empty count", V.vaultDirectoryEmptyCountProv(c, 40, 505)],
    ["gate", T.morphoVaultTimelineGateProv(row, reconcile())],
    ["gate, stored half", T.morphoVaultTimelineGateProv(row, reconcile({ cutBalance: "400000" }))],
    [
      "gate, refetched, no second answer differed",
      T.morphoVaultTimelineGateProv(row, reconcile({ reconciled: false, onChain: "1", refetched: true })),
    ],
    [
      "gate, refetched, differed",
      T.morphoVaultTimelineGateProv(
        row,
        reconcile({ reconciled: false, onChain: "1", refetched: true, refetchDiffered: true }),
      ),
    ],
    ...["checked", "floor", "unchecked"].map((b) => [
      `withheld ${b}`,
      T.morphoVaultTimelineHorizonProv(row, ceiling + 1_000, ceiling, b),
    ]),
    ["withheld checked, no store", T.morphoVaultTimelineHorizonProv(row, 6_000, ceiling, "checked")],
    ["building", T.morphoVaultTimelineBuildingProv(row, { keptRows: 4_000, keptCut: 23_900_000, totalRows: 9_000 })],
    ...["deposit", "withdrawal", "transfer-in", "transfer-out", "transfer-self", "cooldown"].map((k) => [
      `shares ${k}`,
      T.morphoVaultTimelineSharesProv(row, k),
    ]),
    ["balance after", T.morphoVaultTimelineBalanceAfterProv(row)],
    ["deposited", T.morphoVaultTimelineAssetsProv(row, "deposit")],
    ["withdrawn", T.morphoVaultTimelineAssetsProv(row, "withdrawal")],
    ["row share price", T.morphoVaultTimelineSharePriceProv(row, 18)],
    ["share of the vault", T.morphoVaultTimelineShareOfVaultProv(row)],
    ["exponent", T.morphoVaultTimelineExponentProv(c, 18, 6, 12)],
    ["exponent, no offset", T.morphoVaultTimelineExponentProv(c, 18, 6, null)],
    ...["fee", "vault-name", "vault-symbol"].map((k) => [
      `note ${k}`,
      T.morphoVaultTimelineNoteProv(row, { kind: k, blockNumber: 22_000_000, txHash: TX }),
    ]),
    ["accrual", T.morphoVaultTimelineAccrualProv(row)],
    ["allocation grain", T.morphoVaultAllocationGrainProv(row)],
    ["allocation leg", T.morphoVaultAllocationLegProv(row, leg(), { holderShares: "5", totalSupply: "50" })],
    [
      "allocation leg, idle",
      T.morphoVaultAllocationLegProv(row, leg({ isIdle: true }), { holderShares: null, totalSupply: null }),
    ],
    ["collected", T.morphoVaultAllocationCollectedProv(row, 2, [leg(), leg({ isIdle: true })])],
    ["supplied", T.morphoVaultAllocationSuppliedProv(row, leg())],
    ["leg share of claim", T.morphoVaultAllocationLegShareProv(row, leg())],
    ["stored rows", T.morphoVaultTimelineStoredRowsProv(row, stored)],
    ["rows read now", T.morphoVaultTimelineStoredRowsProv(row, fresh)],
  ];
};

const CHAINS = [
  [8453, "Base", "Ethereum"],
  [1, "Ethereum", "Base"],
];

for (const [chainId, word, other] of CHAINS) {
  test(`MetaMorpho receipts on ${word}: summaries in words, check lines open "To check:" and name ${word}, lane via lines keep a second segment`, () => {
    for (const [name, p] of receipts(chainId)) {
      assert.ok(p.summary, `${name}: has a summary`);
      assert.ok(!p.summary.includes("`"), `${name}: no backtick in the summary — ${p.summary}`);
      assert.ok(!/eth_/.test(p.summary), `${name}: no RPC method in the summary`);
      assert.ok(!/Re-run/i.test(p.summary), `${name}: no "Re-run" in the summary`);
      for (const t of [p.summary, p.verify?.text ?? "", p.via ?? ""])
        assert.ok(!/[A-Z]+_[A-Z_]*URL/.test(t), `${name}: no env-var name — ${t}`);
      if (p.verify?.text) {
        const t = p.verify.text;
        assert.ok(t.startsWith("To check:"), `${name}: check line opens "To check:" — ${t}`);
        assert.ok(!/eth_|Re-run/i.test(t), `${name}: check line names no tool`);
        if (/archive node/.test(t)) assert.match(t, new RegExp(`any ${word} archive node`), `${name}: names ${word}`);
        assert.ok(!new RegExp(`\\b${other}\\b`).test(t), `${name}: check line does not name ${other} — ${t}`);
      }
      if (p.via) {
        assert.ok(!/eth_/.test(p.via), `${name}: no RPC method on the via line — ${p.via}`);
        if (/^live /.test(p.via))
          assert.ok(p.via.split(" · ").length >= 2, `${name}: via line keeps a second segment — ${p.via}`);
      }
      if (chainId === 1)
        assert.ok(!/\bBase\b/.test(p.summary), `${name}: no Base figure on an Ethereum page — ${p.summary}`);
    }
  });
}

const c = coords(8453);
const row = { ...c, txHash: TX };

test("the re-fetch sentence does not claim a second answer that may not have come back (C1)", () => {
  const s = T.morphoVaultTimelineGateProv(row, reconcile({ reconciled: false, onChain: "1", refetched: true })).summary;
  assert.doesNotMatch(s, /same (log )?count|same number of logs/);
  assert.match(s, /no second answer came back with a different number of logs/);
});

test("with a kept half, the history check states the two halves (C2)", () => {
  const s = T.morphoVaultTimelineGateProv(row, reconcile({ cutBalance: "400000" })).summary;
  assert.match(s, /two halves: 400000 is the signed sum of every row kept/);
  assert.doesNotMatch(s, /two sweeps hold/);
});

test("Rows withheld: the floor says 5,000 and not the ceiling; checked under the ceiling says none could be kept (C3, C11)", () => {
  for (const [chainId, ceiling] of [
    [8453, 11_000],
    [1, 14_000],
  ]) {
    const r = { ...coords(chainId), txHash: TX };
    const floor = T.morphoVaultTimelineHorizonProv(r, 5_970, ceiling, "floor").summary;
    assert.match(floor, /at least 5,970/);
    assert.match(floor, /stopped once it passed 5,000/);
    assert.doesNotMatch(floor, /11,000|14,000|keeps a stored history/);
    assert.match(floor, /did not return the whole range at once/);
    assert.doesNotMatch(floor, /too large|refused/);
    const under = T.morphoVaultTimelineHorizonProv(r, 6_000, ceiling, "checked").summary;
    assert.match(under, /none could be kept on this request/);
    assert.doesNotMatch(under, /11,000|14,000/);
    const over = T.morphoVaultTimelineHorizonProv(r, ceiling + 1, ceiling, "checked").summary;
    assert.match(over, new RegExp(`above the ${ceiling.toLocaleString("en-US")} rows a page can draw`));
  }
});

test("History still loading names no per-row call cost (C4)", () => {
  const p = T.morphoVaultTimelineBuildingProv(row, { keptRows: 4_000, keptCut: 23_900_000, totalRows: 9_000 });
  assert.doesNotMatch(p.summary, /Every row costs|getBlockByNumber/);
  assert.doesNotMatch(p.verify.text, /\/api\//);
});

test("Where these rows came from: kept rows hold the share price; a wrong one is not said to be caught (C5, C6, C7)", () => {
  const s = T.morphoVaultTimelineStoredRowsProv(row, stored).summary;
  assert.doesNotMatch(s, /643|795|L1-epoch|own words|nothing else|would be caught/);
  assert.match(s, /the share price read at its block/);
  assert.match(s, /a kept share amount that had gone wrong would fail it/);
});

test("Where these rows came from, all read now: from the creation block, and any reason the kept rows went unused (C8)", () => {
  const s = T.morphoVaultTimelineStoredRowsProv(row, fresh).summary;
  assert.match(s, /creation block/);
  assert.doesNotMatch(s, /first block|refused the store/);
  assert.match(s, /did not use what was kept/);
});

test("the accrual receipt points at nothing the share price receipt does not say (C9)", () => {
  assert.doesNotMatch(T.morphoVaultTimelineAccrualProv(row).summary, /named in that figure's receipt|replayed/);
});

test("the name note carries no Base count (C10)", () => {
  const s = T.morphoVaultTimelineNoteProv(row, { kind: "vault-name", blockNumber: 1, txHash: TX }).summary;
  assert.doesNotMatch(s, /dozens|Base vaults/);
});

test("the exponent names no setter and promises nothing beyond the offset read (C12)", () => {
  const s = T.morphoVaultTimelineExponentProv(c, 18, 6, 12).summary;
  assert.doesNotMatch(s, /factory sets|whatever the asset/);
});

test("LLTV is the docs' Liquidation Loan-To-Value, not 'the one risk parameter' (O3)", () => {
  const s = V.vaultLegLltvProv(c).summary;
  assert.doesNotMatch(s, /one risk parameter/);
  assert.match(s, /Liquidation Loan-To-Value/);
});

test("Unaccrued interest names lost assets on a V1.1 vault only, and no asset outside the queue (ui-jobs 688)", () => {
  const v11 = V.vaultGapProv(c, true).summary;
  assert.match(v11, /On this V1\.1 vault it also carries the vault's lost assets/);
  const v10 = V.vaultGapProv(c, false).summary;
  assert.doesNotMatch(v10, /lost assets|V1\.1/);
  for (const s of [v11, v10])
    assert.doesNotMatch(s, /Two readings of the same holdings|outside its Morpho Blue positions/);
});

test("total assets walks the withdraw queue; Held attributes the last holders' loss to Morpho's docs", () => {
  for (const p of [V.vaultTotalAssetsProv(c), V.vaultDirectoryTotalAssetsProv(c)]) {
    assert.match(p.summary, /walking its withdraw queue/);
    assert.doesNotMatch(p.summary, /supply queue/);
  }
  assert.match(
    V.vaultHeldAssetsProv(c, { totalAssets: "1", lostAssets: "0" }).summary,
    /by Morpho's docs, the last holders/,
  );
  assert.match(V.vaultLostAssetsProv(c).summary, /loses assets/);
});

test("reallocations are the vault's, not the curator's", () => {
  for (const p of [T.morphoVaultTimelineAccrualProv(row), T.morphoVaultAllocationGrainProv(row)])
    assert.doesNotMatch(p.summary, /curator/);
});
