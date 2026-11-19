// lib/ipor-fusion/vault-catalog.ts — the generated roster keeps the shape the
// census proved (scripts/census-ipor-fusion-vaults.mjs).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { IPOR_FUSION_CENSUS } from "../../lib/ipor-fusion/vault-catalog.ts";

const ADDRESS = /^0x[0-9a-f]{40}$/;

test("each chain carries the vaults its factory index counts, indexed 1..n", () => {
  assert.deepEqual(Object.keys(IPOR_FUSION_CENSUS).sort(), ["arbitrum", "base", "ethereum"]);
  for (const [chain, c] of Object.entries(IPOR_FUSION_CENSUS)) {
    assert.equal(c.vaults.length, c.factoryIndex, chain);
    assert.deepEqual(
      c.vaults.map((v) => v.index),
      c.vaults.map((_, i) => i + 1),
      chain,
    );
    assert.ok(c.firstBlock < c.censusBlock, chain);
    assert.match(c.factory, ADDRESS, chain);
  }
});

test("every row is lowercased, created inside the sweep, and asset-resolved", () => {
  for (const [chain, c] of Object.entries(IPOR_FUSION_CENSUS)) {
    assert.equal(new Set(c.vaults.map((v) => v.address)).size, c.vaults.length, chain);
    for (const v of c.vaults) {
      for (const a of [v.address, v.asset.address, v.initialOwner, v.plasmaVaultBase, v.feeManager])
        assert.match(a, ADDRESS, `${chain} ${v.address}`);
      assert.ok(v.createdBlock >= c.firstBlock && v.createdBlock <= c.censusBlock, `${chain} ${v.address}`);
      assert.ok(v.totalAssets === null || /^\d+$/.test(v.totalAssets), `${chain} ${v.address}`);
      assert.equal(typeof v.isFusionVault, "boolean");
    }
  }
});

test("the Liquity rETH carry vault is on the Ethereum roster without the registry badge", () => {
  const v = IPOR_FUSION_CENSUS.ethereum.vaults.find((x) => x.address === "0xb9e806e8f2d94c015ffefa90cd24ecce18f1663c");
  assert.ok(v);
  assert.equal(v.isFusionVault, false);
});
