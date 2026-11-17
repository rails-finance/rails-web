// "Rows withheld" says what stands behind its count (ui-jobs 683). Three
// states, carried from the loader as `coverage.withheldBasis`
// (lib/shared/vault-holder-timeline.ts): the check ran and agreed; the count is
// a floor because a query was refused on size; the query failed and the
// recount was whole, so the check never ran. Each gives its own sentence on
// the Yearn V3 and the Aave vault receipts.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const H = await import("../../lib/shared/vault-holder-timeline.ts");
const Y = await import("../../lib/yearn/vault-timeline-provenance.ts");
const A = await import("../../lib/aave-vaults/vault-timeline-provenance.ts");
const M = await import("../../lib/morpho-base/vault-timeline-provenance.ts");

const c = { blockNumber: 24_000_000, vault: "0x0000000000000000000000000000000000000abc", vaultName: "v" };
const builders = [
  ["Yearn V3", (count, basis) => Y.yearnVaultTimelineHorizonProv(c, count, 5_000, basis)],
  ["Aave", (count, basis) => A.vaultTimelineHorizonProv(c, count, 14_000, basis)],
  [
    "MetaMorpho, Base",
    (count, basis) => M.morphoVaultTimelineHorizonProv({ ...c, chainId: 8453 }, count, 11_000, basis),
  ],
  [
    "MetaMorpho, Ethereum",
    (count, basis) => M.morphoVaultTimelineHorizonProv({ ...c, chainId: 1 }, count, 14_000, basis),
  ],
];

/** The builders whose ceiling is above the 5,000 a page draws without a store. */
const stored = [
  ["Aave", 14_000, (count, basis) => A.vaultTimelineHorizonProv(c, count, 14_000, basis)],
  [
    "MetaMorpho, Base",
    11_000,
    (count, basis) => M.morphoVaultTimelineHorizonProv({ ...c, chainId: 8453 }, count, 11_000, basis),
  ],
  [
    "MetaMorpho, Ethereum",
    14_000,
    (count, basis) => M.morphoVaultTimelineHorizonProv({ ...c, chainId: 1 }, count, 14_000, basis),
  ],
];

for (const [family, ceiling, horizon] of stored) {
  test(`${family}: checked at or below the ceiling — none could be kept, and the ceiling is not claimed`, () => {
    const s = horizon(6_000, "checked").summary;
    assert.match(
      s,
      /above the 5,000 rows a page can draw without a stored history, and none could be kept on this request/,
    );
    assert.doesNotMatch(s, new RegExp(ceiling.toLocaleString("en-US")));
  });

  test(`${family}: the floor names 5,000 and not the ceiling`, () => {
    const s = horizon(5_970, "floor").summary;
    assert.match(s, /passed 5,000/);
    assert.doesNotMatch(s, new RegExp(ceiling.toLocaleString("en-US")));
  });
}

test("withheldBasisOf reads the loader's state, else the older flag", () => {
  assert.equal(H.withheldBasisOf({ logCountIsLowerBound: false, withheldBasis: "unchecked" }), "unchecked");
  assert.equal(H.withheldBasisOf({ logCountIsLowerBound: true }), "floor");
  assert.equal(H.withheldBasisOf({ logCountIsLowerBound: false }), "checked");
});

for (const [family, horizon] of builders) {
  test(`${family}: checked — the count is exact and the check ran and agreed`, () => {
    const s = horizon(15_000, "checked").summary;
    assert.match(s, /balance check ran and agreed/);
    assert.doesNotMatch(s, /at least|did not run/);
  });

  test(`${family}: floor — at least N, and the check could not run`, () => {
    const s = horizon(5_970, "floor").summary;
    assert.match(s, /at least 5,970/);
    assert.doesNotMatch(s, /ran and agreed|count (itself )?is exact/);
  });

  test(`${family}: unchecked — the check did not run, and the count is not called exact`, () => {
    const s = horizon(1_200, "unchecked").summary;
    assert.match(s, /balance check did not run/);
    assert.match(s, /query for this address's transfers failed/);
    assert.doesNotMatch(s, /ran and agreed|count (itself )?is exact|at least|above the/);
  });
}
