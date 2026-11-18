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

test("a total sums the section figures to the cent", () => {
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 100.004, debtUsd: 10.006 }),
      pos("aave-v3", { collateralUsd: 0.333, debtUsd: 0 }),
      pos("spark", { collateralUsd: 50.5, debtUsd: 20 }),
    ],
    { bands: true },
  );
  const coll = walletTotal(s, "collateral");
  assert.equal(coll.figure.usd, 150.83);
  assert.equal(coll.of, 2);
  assert.equal(coll.gap, undefined);
  // The receipt's rows are the section figures, and their sum is the figure.
  const rows = coll.figure.prov.inputs
    .filter((i) => i.label !== "sum")
    .map((i) => Number(i.value.replace(/[$,]/g, "")));
  assert.equal(Math.round(rows.reduce((a, b) => a + b, 0) * 100) / 100, coll.figure.usd);
  const debt = walletTotal(s, "debt");
  assert.equal(debt.figure.usd, 30.01);
  assert.equal(walletNet(coll, debt).usd, 120.82);
});

test("no wallet total while a held protocol states no dollars; its section keeps its own", () => {
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 100, debtUsd: 10 }),
      pos("morpho", { usdOwnOracle: false, collateralUsd: 7, debtUsd: 1 }),
      pos("fluid", { usdOwnOracle: false }),
    ],
    { bands: true },
  );
  const coll = walletTotal(s, "collateral");
  const debt = walletTotal(s, "debt");
  assert.equal(coll.figure, undefined);
  assert.equal(coll.gap, "No wallet total: Morpho Blue and Fluid state no dollars");
  assert.equal(debt.figure, undefined);
  assert.equal(walletNet(coll, debt), null);
  assert.equal(s.find((x) => x.slug === "aave-v3").collateral.usd, 100);
});

test("a section with an open position not read at head states no figure, and the wallet none", () => {
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 3000, debtUsd: 100 }),
      pos("aave-v3", { collateralUsd: 5000, debtUsd: 200, headRead: "failed" }),
      pos("spark", { collateralUsd: 50, debtUsd: 20 }),
    ],
    { bands: true },
  );
  const aave = s.find((x) => x.slug === "aave-v3");
  assert.equal(aave.collateral, undefined);
  assert.equal(aave.band.legs.length, 0);
  assert.match(aave.band.note, /1 of the 2 open positions was not read at the chain head/);
  const coll = walletTotal(s, "collateral");
  assert.equal(coll.of, 2);
  assert.equal(coll.gap, "No wallet total: Aave V3 was not read at the chain head");
});

test("a deposit with no debt figure owes nothing", () => {
  const s = walletSections(
    [pos("aave-v3", { collateralUsd: 10, debtUsd: 4 }), pos("aave-v3", { collateralUsd: 5, kind: "deposits" })],
    { bands: true },
  );
  assert.equal(walletTotal(s, "debt").figure.usd, 4);
});
