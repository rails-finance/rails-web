// lib/wallet/wallet-sections.ts: the wallet page's protocol sections and the
// totals over them (rails-ops ui-jobs 738). Each total is the sum of the
// section figures as shown, to the cent; a section whose open positions state
// no dollars at the protocol's own oracle is left out and named; sections run
// in the order of their riskiest open position. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  // The modules behind the Liquity V2 band import without an extension.
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = new URL(specifier + ext, context.parentURL).href;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { walletSections, walletTotal, walletNet } = await import("../../lib/wallet/wallet-sections.ts");

let n = 0;
const pos = (family, extra = {}) => ({
  chain: 1,
  family,
  familyName: family,
  positionId: `p${++n}`,
  href: "/x",
  status: "open",
  card: { kind: family },
  headRead: "read",
  usdOwnOracle: true,
  ...extra,
});

test("sections run by their riskiest open position, closed-only last", () => {
  const s = walletSections(
    [
      pos("aave-v3", { buffer: 0.5, collateralUsd: 100, debtUsd: 10 }),
      pos("spark", { buffer: 0.1, collateralUsd: 50, debtUsd: 10 }),
      pos("fluid", { status: "closed", history: { closedAt: 5 } }),
      pos("aave-v3", { buffer: 0.3, collateralUsd: 20, debtUsd: 1 }),
    ],
    { bands: true },
  );
  assert.deepEqual(
    s.map((x) => x.slug),
    ["spark", "aave-v3", "fluid"],
  );
  // Within a section: open by buffer.
  assert.deepEqual(
    s[1].open.map((p) => p.buffer),
    [0.3, 0.5],
  );
});

test("a total sums the section figures to the cent and names the sections left out", () => {
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 100.004, debtUsd: 10.006 }),
      pos("aave-v3", { collateralUsd: 0.333, debtUsd: 0 }),
      pos("spark", { collateralUsd: 50.5, debtUsd: 20 }),
      pos("morpho", { usdOwnOracle: false, collateralUsd: 7, debtUsd: 1 }),
    ],
    { bands: true },
  );
  const coll = walletTotal(s, "collateral");
  assert.equal(coll.usd, 150.83);
  assert.equal(coll.counted, 2);
  assert.equal(coll.of, 3);
  assert.deepEqual(coll.left, ["Morpho Blue"]);
  // The receipt's rows are the section figures, and their sum is the figure.
  const rows = coll.prov.inputs.filter((i) => i.label !== "sum").map((i) => Number(i.value.replace(/[$,]/g, "")));
  assert.equal(Math.round(rows.reduce((a, b) => a + b, 0) * 100) / 100, coll.usd);
  const debt = walletTotal(s, "debt");
  assert.equal(debt.usd, 30.01);
  assert.equal(walletNet(coll, debt).usd, 120.82);
});

test("no net where collateral and debt cover different protocols", () => {
  const s = walletSections([pos("aave-v3", { collateralUsd: 10, debtUsd: 1 }), pos("spark", { collateralUsd: 5 })], {
    bands: true,
  });
  assert.equal(walletNet(walletTotal(s, "collateral"), walletTotal(s, "debt")), null);
});
