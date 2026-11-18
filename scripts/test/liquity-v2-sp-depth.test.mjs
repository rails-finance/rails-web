// lib/liquity-v2/sp-depth.ts (rails-ops ui-jobs 748): each branch pool's
// getTotalBoldDeposits() beside the branch's getEntireBranchDebt(), and their
// ratio. Raws read on chain on 18 Nov 2026 at block 26,444,696 (rounded to
// whole BOLD here).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { boldUnits, poolShare, spDepthTotal, spDepositsProv } = await import("../../lib/liquity-v2/sp-depth.ts");

const E18 = "000000000000000000";
const branch = (symbol, deposits, debt) => ({
  symbol,
  pool: "0x0",
  troveManager: "0x0",
  depositsRaw: deposits == null ? null : deposits + E18,
  debtRaw: debt == null ? null : debt + E18,
});
const DEPTH = {
  blockNumber: 26444696,
  blockTimestamp: 0,
  branches: [branch("WETH", 5765000, 11173000), branch("wstETH", 6481000, 13852000), branch("rETH", 2738000, 4005000)],
};

test("the pool's share of the branch debt", () => {
  assert.equal(boldUnits("5765000" + E18), 5765000);
  assert.ok(Math.abs(poolShare("5765000" + E18, "11173000" + E18) - 0.51598) < 1e-4);
  assert.equal(poolShare("1" + E18, "0"), null);
  assert.equal(poolShare(null, "1" + E18), null);
});

test("totals sum the three branches, and withhold where one is missing", () => {
  assert.equal(
    spDepthTotal(DEPTH, (b) => b.depositsRaw),
    14984000,
  );
  assert.equal(
    spDepthTotal(DEPTH, (b) => b.debtRaw),
    29030000,
  );
  const gap = { ...DEPTH, branches: [...DEPTH.branches.slice(0, 2), branch("rETH", null, 4005000)] };
  assert.equal(
    spDepthTotal(gap, (b) => b.depositsRaw),
    null,
  );
});

test("a pool's receipt states the call and the block", () => {
  const p = spDepositsProv(DEPTH.branches[0], DEPTH.blockNumber);
  assert.match(p.summary, /getTotalBoldDeposits\(\) at block 26,444,696/);
  assert.equal(p.source.block, 26444696);
  assert.equal(p.scaling.places, 18);
});
