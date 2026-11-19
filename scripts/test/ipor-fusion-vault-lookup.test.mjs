// The IPOR Fusion holder-label lookup (lib/ipor-fusion/vault-lookup.ts;
// rails-ops TO-DO-ipor-scoping.md §6.2): a census vault matches on its own
// chain only, whatever the address's case, and the route's answer carries hits
// only. The modules import extensionless paths, so this file resolves them as
// chain-launch.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[a-z]+$/.test(spec)) {
    const url = new URL(spec, ctx.parentURL).href;
    if (existsSync(fileURLToPath(url + ".ts"))) return next(url + ".ts", ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { iporFusionVaultAt, iporFusionVaultHits } = await import("../../lib/ipor-fusion/vault-lookup.ts");
const { IPOR_FUSION_CENSUS } = await import("../../lib/ipor-fusion/vault-catalog.ts");

// Fusion stETH looping Ethereum, the §6.2 test case on /ethereum/spark.
const STETH_LOOP = "0xb8a451107a9f87fde481d4d686247d6e43ed715e";
const NOBODY = "0x000000000000000000000000000000000000dead";

test("a census vault matches on its chain, with the name and census block", () => {
  const hit = iporFusionVaultAt(1, STETH_LOOP);
  assert.equal(hit?.name, "Fusion stETH looping Ethereum");
  assert.equal(hit?.censusBlock, IPOR_FUSION_CENSUS.ethereum.censusBlock);
  assert.equal(hit?.censusBlockIso, IPOR_FUSION_CENSUS.ethereum.censusBlockIso);
});

test("an address outside the census misses", () => {
  assert.equal(iporFusionVaultAt(1, NOBODY), null);
});

test("a vault matches on no other chain", () => {
  assert.equal(iporFusionVaultAt(8453, STETH_LOOP), null);
  assert.equal(iporFusionVaultAt(42161, STETH_LOOP), null);
  assert.equal(iporFusionVaultAt(10, STETH_LOOP), null);
});

test("the address's case does not matter", () => {
  const mixed = "0xB8A451107A9F87FDE481D4D686247D6E43ED715E";
  assert.deepEqual(iporFusionVaultAt(1, mixed), iporFusionVaultAt(1, STETH_LOOP));
});

test("every chain's roster is reachable by its chain id", () => {
  for (const [chainId, key] of [
    [1, "ethereum"],
    [42161, "arbitrum"],
    [8453, "base"],
  ]) {
    const v = IPOR_FUSION_CENSUS[key].vaults[0];
    assert.ok(iporFusionVaultAt(chainId, v.address), `${key} ${v.address}`);
  }
});

test("the route's answer carries hits only, keyed lowercase", () => {
  const hits = iporFusionVaultHits(1, [STETH_LOOP.toUpperCase().replace("0X", "0x"), NOBODY]);
  assert.deepEqual(Object.keys(hits), [STETH_LOOP]);
  assert.deepEqual(Object.keys(hits[STETH_LOOP]).sort(), ["censusBlock", "censusBlockIso", "name", "symbol"]);
  assert.deepEqual(iporFusionVaultHits(8453, [STETH_LOOP, NOBODY]), {});
});
