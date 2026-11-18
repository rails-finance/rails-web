// lib/liquity-v2/bold-price.ts (rails-ops ui-jobs 746): BOLD in USD is the
// inverse of the Curve BOLD/USDC pool's last_price(0), BOLD per USDC. Figures
// read on chain on 18 Nov 2026 at block 26,444,554, where get_dy(0, 1, 1e18)
// paid 0.997922 USDC for one BOLD after the pool's fee.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  // lib/shared/usd-display.ts reaches lib/aave-v4/asset-class.ts through "@/", a pure module.
  if (specifier.startsWith("@/")) {
    const url = new URL(specifier.slice(2) + ".ts", "${new URL("../../", import.meta.url).href}").href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { boldUsdFromCurve, boldPriceProv, BOLD_USDC_POOL } = await import("../../lib/liquity-v2/bold-price.ts");
const { offPar } = await import("../../lib/shared/usd-display.ts");

const READ = {
  blockNumber: 26444554,
  blockTimestamp: 1795036247,
  lastPriceRaw: "1001670796804945482",
  emaRaw: "1001651897585852478",
  dyRaw: "997922",
};

test("BOLD in USD is the inverse of BOLD per USDC", () => {
  const p = boldUsdFromCurve(READ.lastPriceRaw);
  assert.ok(Math.abs(p - 1 / 1.001670796804945482) < 1e-12);
  assert.equal(p.toFixed(6), "0.998332");
  // Above get_dy's one-BOLD swap by about the pool's fee, never below it.
  const dy = Number(READ.dyRaw) / 1e6;
  assert.ok(p > dy && p - dy < 0.001);
  // A BOLD under par: more than one BOLD per USDC.
  assert.ok(boldUsdFromCurve("2000000000000000000") === 0.5);
});

test("a failed or empty read gives no price", () => {
  for (const raw of [null, undefined, "", "0", "-1", "1.5", "abc"]) assert.equal(boldUsdFromCurve(raw), null);
});

test("the receipt names the pool, the call and the block", () => {
  const prov = boldPriceProv(READ);
  assert.equal(prov.contract.address, BOLD_USDC_POOL);
  assert.equal(prov.source.block, 26444554);
  assert.match(prov.summary, /last_price\(0\) at block 26,444,554/);
  assert.match(prov.summary, /\$0\.998332/);
  assert.match(prov.summary, /price_oracle\(0\), puts BOLD at \$0\.998351/);
  assert.equal(boldPriceProv({ ...READ, lastPriceRaw: "0" }), undefined);
  assert.equal(boldPriceProv({ ...READ, emaRaw: null }).inputs.length, 1);
});

test("a BOLD beyond DEPEG_BAND carries the band in the chip", () => {
  // 1.0526… BOLD per USDC: BOLD at $0.95.
  const low = boldUsdFromCurve("1052631578947368421");
  assert.equal(low.toFixed(3), "0.950");
  assert.deepEqual(offPar(low, "BOLD"), { text: "at $0.950", band: true });
  // At block 26,444,554, $0.998: off par, inside the band.
  const near = offPar(boldUsdFromCurve(READ.lastPriceRaw), "BOLD");
  assert.equal(near.band, false);
  assert.equal(near.text, "at $0.998");
});
