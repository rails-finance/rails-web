// The Liquity V2 forks: a deposit answer scaled to 1e18 where a branch is 8
// decimals (lib/liquity-v2/sp-decimals.ts; rails-ops
// TO-DO-stability-pool-deposits §3). Imports through `@/` resolve as in
// liquity-v1-holder-strip.test.mjs.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { toE18, priceToE18, scaleSpAnswer } = await import(ROOT + "lib/liquity-v2/sp-decimals.ts");
const { depositNow, depositLifetime } = await import(ROOT + "lib/liquity-v2/sp-math.ts");

const E18 = "000000000000000000";

test("toE18 scales an 8-decimal amount and leaves 18 and zero alone", () => {
  assert.equal(toE18("123456789", 8), "1234567890000000000");
  assert.equal(toE18("-5", 8), "-50000000000");
  assert.equal(toE18("0", 8), "0");
  assert.equal(toE18("42", 18), "42");
  assert.equal(toE18(null, 8), null);
});

test("priceToE18 turns a 1e(36 − 8) price into 1e18", () => {
  // $100,000 per WBTC at the PriceFeed's 1e28 scale.
  assert.equal(priceToE18("100000" + "0".repeat(28), 8), "100000" + E18);
  assert.equal(priceToE18("3000" + E18, 18), "3000" + E18);
});

test("a listing scales each row by its branch; a timeline by its top-level decimals", () => {
  const list = scaleSpAnswer({
    branches: { WBTC: { open: 1, closed: 0, coll_decimals: 8 }, weETH: { open: 1, closed: 0, coll_decimals: 18 } },
    rows: [
      { collateral_type: "WBTC", stash_raw: "5", coll_gain_raw: "7", coll_claimed_raw: "2", deposit_raw: "9" },
      { collateral_type: "weETH", stash_raw: "5", coll_gain_raw: "7", coll_claimed_raw: "2", deposit_raw: "9" },
    ],
  });
  assert.equal(list.rows[0].stash_raw, "50000000000");
  assert.equal(list.rows[0].deposit_raw, "9");
  assert.equal(list.rows[1].stash_raw, "5");
  const tl = scaleSpAnswer({
    coll_decimals: 8,
    rows: [{ coll_gain_since: "3", stash_after: "0", deposit_after: "4" }],
    position: { stash_raw: "1", coll_gain_raw: "1", coll_claimed_raw: "0", deposit_raw: "4" },
  });
  assert.equal(tl.rows[0].coll_gain_since, "30000000000");
  assert.equal(tl.rows[0].deposit_after, "4");
  assert.equal(tl.position.stash_raw, "10000000000");
  const days = scaleSpAnswer({ coll_decimals: 8, days: [{ coll_in: "2", stash: "1", deposit: "3" }] });
  assert.deepEqual(days.days[0], { coll_in: "20000000000", stash: "10000000000", deposit: "3" });
  // Liquity V2's answers carry no decimals and pass untouched.
  const v2 = scaleSpAnswer({ rows: [{ collateral_type: "WETH", stash_raw: "5" }], branches: { WETH: {} } });
  assert.equal(v2.rows[0].stash_raw, "5");
});

test("a second pass leaves a scaled answer as it is", () => {
  const once = scaleSpAnswer({
    coll_decimals: 8,
    rows: [{ coll_gain_since: "3" }],
    position: { stash_raw: "1" },
    branches: { WBTC: { open: 1, closed: 0, coll_decimals: 8 } },
  });
  const twice = scaleSpAnswer(structuredClone(once));
  assert.deepEqual(twice, once);
  assert.equal(twice.rows[0].coll_gain_since, "30000000000");
  assert.equal(twice.position.stash_raw, "10000000000");
  assert.equal("coll_decimals" in twice, false);
  assert.equal("coll_decimals" in twice.branches.WBTC, false);
  const list = scaleSpAnswer({
    branches: { WBTC: { open: 1, closed: 0, coll_decimals: 8 } },
    rows: [{ collateral_type: "WBTC", stash_raw: "5" }],
  });
  assert.equal(scaleSpAnswer(list).rows[0].stash_raw, "50000000000");
});

test("the index and the chain, both scaled, agree: the index-lag line stays away", () => {
  const position = {
    deposited_raw: "100",
    withdrawn_raw: "0",
    burned_raw: "0",
    yield_gain_raw: "0",
    yield_claimed_raw: "0",
    coll_gain_raw: "3",
    coll_claimed_raw: "0",
    deposit_raw: "100",
    stash_raw: toE18("3", 8),
  };
  const chain = {
    compoundedRaw: "100",
    recordedRaw: "100",
    collGainRaw: "0",
    stashRaw: toE18("3", 8),
    yieldGainRaw: "0",
  };
  assert.notEqual(depositNow(depositLifetime(position), chain), null);
});
