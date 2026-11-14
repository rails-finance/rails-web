// The receipts every vault family's row, head, strip and Who holds it share
// (lib/vaults/row-provenance.ts, holders-provenance.ts, strip-provenance.ts)
// are in the receipt grammar's words (ui-jobs 683): no backticked name, no RPC
// method, no "daily store" and no store key in a summary; a check line opens
// "To check:" and names the vault's chain; a via line keeps a second segment.
// The Holders check line leaves out the addresses the census leaves out: the
// zero address everywhere, and the vault's address on Yearn V3.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const R = await import("../../lib/vaults/row-provenance.ts");
const H = await import("../../lib/vaults/holders-provenance.ts");
const S = await import("../../lib/vaults/strip-provenance.ts");

const KEY = "vault_share_price:0xabc";
const summary = (over = {}) => ({
  address: "0x0000000000000000000000000000000000000abc",
  name: "Steakhouse USDC",
  catalogName: "Steakhouse USDC",
  symbol: "steakUSDC",
  chainId: 8453,
  family: "metamorpho",
  asset: { symbol: "USDC", decimals: 6, address: "0x0000000000000000000000000000000000000001" },
  census: { holders: 1_234, live: 456, sumMatches: true, atBlock: 24_000_000 },
  ...over,
});
const yieldOf = (over = {}) => ({
  yearly: 0.042,
  days: 30,
  from: { raw: "1000000", block: 23_000_000, day: 20_000 },
  to: { raw: "1003500", block: 24_000_000, day: 20_030 },
  ...over,
});
const scale = { stated: 6, implied: 18, wraps: { symbol: "USDC" } };
const hc = { vault: "0xabc", vaultName: "Steakhouse USDC", shareSymbol: "steakUSDC", censusBlock: 24_000_000 };
const window = (change) => ({
  days: 30,
  from: { raw: change == null ? "0" : "1000000", block: 23_000_000, day: 20_000 },
  to: { raw: "1003500", block: 24_000_000, day: 20_030 },
  change,
});

const receipts = () => {
  const v = summary();
  const eth = summary({ chainId: 1, family: "yearn-v3" });
  return [
    ["yield", R.vaultYieldProv(v, yieldOf())],
    ["yield, one day jump", R.vaultYieldProv(v, yieldOf({ jump: { day: 20_010, change: 0.003 } }))],
    ["yield, span jump", R.vaultYieldProv(v, yieldOf({ jump: { fromDay: 20_008, day: 20_010, change: 0.003 } }))],
    ["yield, asset scale", R.vaultYieldProv(summary({ assetScale: scale }), yieldOf())],
    ["holders, Base", R.vaultHoldersProv(v, v.census)],
    ["holders, Ethereum, not whole", R.vaultHoldersProv(eth, { ...eth.census, sumMatches: false })],
    ["wrapped asset growth", R.vaultAssetGrowthProv(summary({ family: "umbrella-stake", chainId: 1 }), yieldOf())],
    ["holder share", H.holderShareProv(hc, "0x0000000000000000000000000000000000000def", 120_000)],
    ["holder balance", H.holderBalanceProv(hc, "0x0000000000000000000000000000000000000def", "12.5")],
    ["holders count", H.holdersCountProv(hc, 456)],
    ["other holders", H.otherHoldersCountProv(hc, 456, 446, 10)],
    ["other holders' share", H.otherHoldersShareProv(hc, 446, 200_000, 10)],
    ...["total-assets", "share-price", "holders"].flatMap((tile) => [
      [`strip ${tile}`, S.stripChangeProv(tile, v, KEY, window(0.0035))],
      [`strip ${tile}, from zero`, S.stripChangeProv(tile, v, KEY, window(null))],
      [`strip ${tile}, young`, S.stripYoungProv(tile, v, KEY, 20_020)],
    ]),
  ];
};

test('shared vault receipts: summaries in words, no store or store key, check lines open "To check:", vias keep a second segment', () => {
  for (const [name, p] of receipts()) {
    assert.ok(p.summary, `${name}: has a summary`);
    assert.ok(!p.summary.includes("`"), `${name}: no backtick — ${p.summary}`);
    assert.ok(!/daily (price )?store|Rails's daily store/.test(p.summary), `${name}: no daily store — ${p.summary}`);
    assert.ok(!p.summary.includes(KEY), `${name}: no store key — ${p.summary}`);
    assert.ok(!/no forecast/.test(p.summary), `${name}: no "no forecast" tail`);
    for (const t of [p.summary, p.verify?.text ?? "", p.via ?? ""])
      assert.ok(!/eth_/.test(t), `${name}: no RPC method`);
    if (p.verify?.text) assert.ok(p.verify.text.startsWith("To check:"), `${name}: check line opens "To check:"`);
    if (p.via) {
      assert.ok(p.via.split(" · ").length >= 2, `${name}: via keeps a second segment — ${p.via}`);
      assert.ok(!/store|Rails census/.test(p.via), `${name}: via names no store — ${p.via}`);
    }
  }
});

test("the strip says total assets and the share price in words", () => {
  const v = summary();
  assert.match(S.stripChangeProv("total-assets", v, KEY, window(0.01)).summary, /the vault's total assets went from/);
  assert.match(S.stripChangeProv("share-price", v, KEY, window(0.01)).summary, /the share price went from/);
});

test("Holders: the check line names the chain, leaves out the zero address and says the count matches", () => {
  const base = R.vaultHoldersProv(summary(), summary().census);
  assert.match(base.verify.text, /any Base archive node/);
  assert.match(base.verify.text, /other than the zero address/);
  assert.match(base.verify.text, /the count matches the 1,234 that have held a share/);
  assert.doesNotMatch(base.verify.text, /vault's address/);
  assert.equal(base.via, "vault census · Transfer logs + balanceOf(holder) @ the census block");

  const aave = summary({ chainId: 1, family: "stata" });
  const eth = R.vaultHoldersProv(aave, aave.census);
  assert.match(eth.verify.text, /any Ethereum archive node/);
  assert.doesNotMatch(eth.verify.text, /\bBase\b|vault's address/);
});

test("Holders on Yearn V3 leaves out the vault's address as well", () => {
  const y = summary({ chainId: 1, family: "yearn-v3" });
  const p = R.vaultHoldersProv(y, y.census);
  assert.match(p.verify.text, /other than the zero address and the vault's address/);
  assert.match(p.summary, /other than the zero address and the vault's address/);
});
