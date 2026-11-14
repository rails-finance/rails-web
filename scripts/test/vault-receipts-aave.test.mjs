// The Aave vault receipts (sGHO, static aTokens, Umbrella stake tokens) are in
// the receipt grammar's words (rails-ops standards/provenance-receipts-grammar.md
// §3, ui-jobs 683): a summary carries meaning only, so no backticked name and
// no RPC method; a check line opens "To check:"; a via line that opens on the
// lane keeps a second segment, because the inspector drops the first. Each
// builder is built with representative inputs, every arm of its ternaries once.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const V = await import("../../lib/aave-vaults/vault-provenance.ts");
const T = await import("../../lib/aave-vaults/vault-timeline-provenance.ts");
const K = await import("../../lib/aave-vaults/vault-catalog.ts");

const VAULT = "0x0000000000000000000000000000000000000abc";
const HOLDER = "0x0000000000000000000000000000000000000def";
const c = {
  blockNumber: 24_000_000,
  vault: VAULT,
  vaultName: "Static Aave Ethereum USDC",
  assetSymbol: "USDC",
  shareSymbol: "waEthUSDC",
  reserveSymbol: "USDC",
  holder: HOLDER,
  censusBlock: 23_990_000,
};
const base = { ...c, chainId: 8453 };
const book = { kind: "book", constant: "GhoEthereum.SGHO", file: "GhoEthereum" };
const attested = (via) => ({
  address: HOLDER,
  publisher: "Aave",
  via,
  constant: "GhoEthereum.GSM_USDT",
  file: "GhoEthereum",
  commit: "0123456789abcdef",
  what: "a GHO Stability Module",
  enumerator: { call: "Umbrella.getStkTokens()", constant: "UmbrellaEthereum.UMBRELLA" },
});
const value = (over = {}) => ({
  pricedBlock: 23_990_000,
  assetSymbol: "USDC",
  assetDecimals: 6,
  pricedAsset: "0x0000000000000000000000000000000000000001",
  asset: "0x0000000000000000000000000000000000000001",
  oracle: "0x0000000000000000000000000000000000000002",
  oraclePriceE8: "100000000",
  shareUnitAssets: "1100000",
  underlyingUnitAssets: null,
  ...over,
});
const row = { ...c, txHash: "0x" + "ab".repeat(32) };
const reconcile = (over = {}) => ({
  reconciled: true,
  replayed: "1000000",
  onChain: "1000000",
  logsIn: 3,
  logsOut: 1,
  refetched: false,
  refetchDiffered: false,
  lane: "ALCHEMY_URL",
  fromBlock: 0,
  toBlock: 24_000_000,
  ...over,
});

const receipts = () => [
  ["catalogue", V.aaveVaultCatalogueProv(c, { catalogSize: 70, stataCount: 64, stakeCount: 5 })],
  ["name, book", V.aaveVaultNameProv(c, book)],
  ["name, enumerator", V.aaveVaultNameProv(c, K.STATA_ENUMERATOR)],
  ...["sgho", "stata", "umbrella-stake"].map((f) => [`total assets ${f}`, V.aaveVaultTotalAssetsProv(c, f)]),
  ["shares issued", V.aaveVaultTotalSupplyProv(c, 6)],
  ["share price", V.aaveVaultSharePriceProv(c, 6)],
  ["target rate", V.aaveVaultTargetRateProv(c, 450)],
  ["supply cap", V.aaveVaultSupplyCapProv(c)],
  ["aToken", V.aaveVaultATokenProv(c)],
  ["cooldown", V.aaveVaultCooldownProv(c, 1_728_000, 172_800)],
  ["slashable", V.aaveVaultSlashableProv(c, "USDC", true)],
  ["not slashable", V.aaveVaultSlashableProv(c, "USDC", false)],
  ["reserve hop", V.aaveVaultReserveHopProv(c, "USDC")],
  ["book", V.aaveVaultBookProv(c, book)],
  ["empty count", V.aaveVaultEmptyCountProv(c, 4, 70)],
  ["sGHO held", V.aaveSghoAssetHeldProv(c)],
  ["capacity", V.aaveSghoCapacityProv(c)],
  ["last update", V.aaveSghoLastUpdateProv(c)],
  ["aToken held", V.aaveStataATokenBalanceProv(c, VAULT)],
  ["backed by", V.aaveVaultBackedByProv(c, "stkwaEthUSDC", HOLDER)],
  ["max slashable", V.aaveUmbrellaMaxSlashableProv(c)],
  ["custody", V.aaveUmbrellaCustodyProv(c)],
  ["owner", V.aaveUmbrellaOwnerProv(c, HOLDER)],
  ["wrapper price", V.aaveUmbrellaWrapperPriceProv(c, "waEthUSDC", 6)],
  ["holder shares", V.aaveVaultHolderSharesProv(c)],
  ["holder fraction", V.aaveVaultHolderFractionProv(c)],
  ["cooldown state", V.aaveVaultCooldownStateProv(c)],
  ["attested, book", V.aaveAttestedNameProv(c, attested("book"))],
  ["attested, roster", V.aaveAttestedNameProv(c, attested("roster"))],
  ["catalogue member", V.aaveVaultCatalogueMemberProv(c, "This address")],
  ["first-party pages", V.aaveFirstPartySourcesProv(12, "2026-11-01")],
  ["census balance", V.aaveVaultCensusBalanceProv(c)],
  ["census balance, Base", V.aaveVaultCensusBalanceProv(base)],
  ["first seen", V.aaveVaultPositionSeenProv(c, "first", 23_000_000)],
  ["last activity, Base", V.aaveVaultPositionSeenProv(base, "last", 23_000_000)],
  ["shape", V.aaveVaultPositionShapeProv(c, "an externally owned account", 0)],
  ["divergence", V.aaveVaultPositionDivergenceProv(c)],
  ["value USD", V.aaveVaultValueUsdProv(c, value(), 6)],
  ["value USD via wrapper", V.aaveVaultValueUsdProv(base, value({ underlyingUnitAssets: "1050000" }), 6)],
  ["unpriced, pending", V.aaveVaultUnpricedProv(c, value({ pricedBlock: null }))],
  ["unpriced, declined", V.aaveVaultUnpricedProv(c, value())],
  ["gate", T.vaultTimelineGateProv(row, reconcile())],
  ["gate, stored half", T.vaultTimelineGateProv(row, reconcile({ cutBalance: "400000" }))],
  ["gate, refetched", T.vaultTimelineGateProv(row, reconcile({ reconciled: false, onChain: "1", refetched: true }))],
  ...["checked", "floor", "unchecked"].map((b) => [
    `withheld ${b}`,
    T.vaultTimelineHorizonProv(row, 15_000, 14_000, b),
  ]),
  ["withheld checked, no store", T.vaultTimelineHorizonProv(row, 6_000, 14_000, "checked")],
  ["building", T.vaultTimelineBuildingProv(row, { keptRows: 4_000, keptCut: 23_900_000, totalRows: 9_000 })],
  ...["deposit", "withdrawal", "transfer-in", "transfer-out", "transfer-self", "cooldown"].map((k) => [
    `shares ${k}`,
    T.vaultTimelineSharesProv(row, k),
  ]),
  ["balance after", T.vaultTimelineBalanceAfterProv(row)],
  ["balance before", T.vaultTimelineBalanceBeforeProv(row)],
  ["deposited", T.vaultTimelineAssetsProv(row, "deposit")],
  ["withdrawn", T.vaultTimelineAssetsProv(row, "withdrawal")],
  ["row share price", T.vaultTimelineSharePriceProv(row, 6)],
  ["cooldown row", T.vaultTimelineCooldownProv(row)],
  ...["target-rate", "cooldown-config", "unstake-window-config"].map((k) => [
    `note ${k}`,
    T.vaultTimelineNoteProv(row, { kind: k, blockNumber: 22_000_000, txHash: row.txHash }),
  ]),
  ...["sgho", "stata", "umbrella-stake"].map((f) => [`accrual ${f}`, T.vaultTimelineAccrualProv(row, f)]),
  [
    "stored rows",
    T.vaultStoredRowsProv(
      row,
      { source: "stored+head", cut: 23_900_000, tailRows: 900, headRows: 12, storedThisRequest: false },
      "",
    ),
  ],
  [
    "rows read now",
    T.vaultStoredRowsProv(row, { source: "chain", cut: null, tailRows: 0, headRows: 0, storedThisRequest: false }, ""),
  ],
  ...["minted", "burned", "transferred-in", "transferred-out", "deposited", "withdrawn"].map((k) => [
    `flow ${k}`,
    T.vaultFlowProv(row, k, "USDC", 3),
  ]),
  ["claim now", T.vaultClaimNowProv(row)],
  ["shares now", T.vaultSharesNowProv(row)],
];

test('Aave vault receipts: summaries in words, check lines open "To check:", lane via lines keep a second segment', () => {
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
      if (/^(live |the daily )/.test(p.via))
        assert.ok(p.via.split(" · ").length >= 2, `${name}: via line keeps a second segment — ${p.via}`);
    }
  }
});

test("Aave census receipts on Base ask a Base node", () => {
  assert.match(V.aaveVaultCensusBalanceProv(base).verify.text, /any Base archive node/);
  assert.match(V.aaveVaultPositionSeenProv(base, "last", 1).verify.text, /any Base archive node/);
});

test("Aave lifetime totals sum the whole history, and the timeline draws the newest of it", () => {
  const s = T.vaultFlowProv(row, "minted", "waEthUSDC", 3).summary;
  assert.match(s, /whole history/);
  assert.doesNotMatch(s, /exactly what is drawn|what is drawn there/);
});

test("The Withdrawn check line counts events, not burns: a burn with no withdraw event has none to add", async () => {
  const E = await import("../../lib/aave-vaults/position-economics.ts");
  const ev = (i, kind, sharesDelta, assets, balanceAfter) => ({
    id: `e${i}`,
    txHash: "0x" + String(i).repeat(64).slice(0, 64),
    blockNumber: 23_000_000 + i,
    timestamp: 1_760_000_000 + i,
    logIndex: 0,
    kind,
    counterparty: null,
    sharesDelta,
    balanceAfter,
    assets,
    sharePriceAtBlock: "1000000",
    shareDecimals: 6,
  });
  // Newest first: a mint, then two burns, one with its Withdraw event and one without (legless).
  const events = [
    ev(3, "withdrawal", "-1000000", null, "1000000"),
    ev(2, "withdrawal", "-1000000", "1000000", "2000000"),
    ev(1, "deposit", "3000000", "3000000", "3000000"),
  ];
  const out = E.computeVaultPositionEconomics({
    timeline: {
      vault: VAULT,
      holder: HOLDER,
      blockNumber: 24_000_000,
      blockTimestamp: 1_770_000_000,
      unread: null,
      reconcile: reconcile({ replayed: "1000000", onChain: "1000000" }),
      events,
      notes: [],
      coverage: { fromDeployment: true, logCount: 3, withheldAbove: null, logCountIsLowerBound: false },
    },
    coords: row,
    sharesRaw: "1000000",
    claimRaw: "1100000",
    shareSymbol: "waEthUSDC",
    shareDecimals: 6,
    assetSymbol: "USDC",
    assetDecimals: 6,
    vaultAddress: VAULT,
  });
  assert.ok(out, "the tower is drawn");
  assert.equal(out.flows.counts.burns, 2);
  assert.equal(out.flows.counts.legless, 1);
  const checks = [];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.verify?.text === "string") checks.push(o.verify.text);
    for (const v of Object.values(o)) walk(v);
  };
  walk(out.data);
  const withdrawn = checks.find((t) => /Withdraw logs/.test(t));
  assert.ok(withdrawn, `a Withdrawn check line is drawn — ${checks.join(" | ")}`);
  assert.match(withdrawn, /up to 2, since a mint or burn the vault emitted no such event for has none/);
});
