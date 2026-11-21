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

test("a deposit no head read contradicts owes nothing", () => {
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 10, debtUsd: 4 }),
      pos("aave-v3", { collateralUsd: 5, kind: "deposits", headRead: "none" }),
    ],
    { bands: true },
  );
  assert.equal(walletTotal(s, "debt").figure.usd, 4);
});

test("a deposit read at head with no debt figure is unpriced, not owing nothing", () => {
  const s = walletSections(
    [
      pos("compound-v3", { collateralUsd: 10, debtUsd: 4 }),
      pos("compound-v3", { collateralUsd: 5, kind: "deposits", headRead: "read" }),
    ],
    { bands: true },
  );
  assert.equal(s[0].debt, undefined);
  assert.equal(walletTotal(s, "debt").figure, undefined);
});

test("a last-visit stored read stops its section's total", () => {
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 100, debtUsd: 10 }),
      pos("aave-v3", { chain: 42161, collateralUsd: 50, debtUsd: 5, headRead: "stored" }),
    ],
    { bands: true },
  );
  assert.equal(s[0].collateral, undefined);
  assert.equal(walletTotal(s, "collateral").gap, "No wallet total: Aave V3 was not read at the chain head");
});

test("a section missing either figure leaves both totals and Net without a figure", () => {
  const s = walletSections([pos("aave-v3", { collateralUsd: 100, debtUsd: 10 }), pos("spark", { collateralUsd: 50 })], {
    bands: true,
  });
  const coll = walletTotal(s, "collateral");
  const debt = walletTotal(s, "debt");
  assert.equal(coll.figure, undefined);
  assert.equal(debt.figure, undefined);
  assert.equal(coll.gap, "No wallet total: SparkLend states no dollars");
  assert.equal(coll.gap, debt.gap);
  assert.equal(walletNet(coll, debt), null);
});

test("a section with collateral and no debt figure says so in its band", () => {
  const s = walletSections([pos("spark", { collateralUsd: 50, debtUsd: 5 }), pos("spark", { collateralUsd: 20 })], {
    bands: true,
  });
  assert.equal(s[0].band.legs.map((l) => l.id).join(), "collateral");
  assert.equal(s[0].band.note, "No debt total: an open position's debt states no dollars.");
});

test("a fork's unpriced deposit leaves the collateral total, keeps the debt total, and is named", () => {
  const deposit = {
    kind: "deposits",
    market: "WBTC Stability Pool",
    headRead: "none",
    usdOwnOracle: undefined,
    card: { kind: "fork-deposit" },
  };
  const s = walletSections([pos("ebisu", { collateralUsd: 300, debtUsd: 100 }), pos("ebisu", deposit)], {
    bands: true,
  });
  assert.equal(s[0].collateral, undefined);
  assert.equal(s[0].debt.usd, 100);
  assert.equal(s[0].band.legs.map((l) => l.id).join(), "debt");
  assert.equal(s[0].band.note, "No collateral total: the WBTC Stability Pool deposit states no dollars.");
  // Deposits alone owe nothing.
  const only = walletSections([pos("ebisu", deposit)], { bands: true });
  assert.equal(only[0].debt.usd, 0);
  assert.equal(only[0].band.note, "No collateral total: the WBTC Stability Pool deposit states no dollars.");
});

test("an ETH-quoted Comet's head dollars convert through the read's WETH price", async () => {
  const { cometHeadUsd } = await import("../../lib/wallet/comet-head-usd.ts");
  const live = {
    quoteUnit: "ETH",
    baseDecimals: 18,
    basePrice: 1,
    borrowBalanceRaw: "2000000000000000000",
    collateral: [{ balanceRaw: "10000000000000000000", decimals: 18, price: 1.2 }],
  };
  const got = cometHeadUsd(live, 3000);
  assert.equal(got.collateralUsd, 36000);
  assert.equal(got.debtUsd, 6000);
  const none = cometHeadUsd(live, null);
  assert.equal(none.collateralUsd, undefined);
  assert.equal(none.debtUsd, undefined);
  assert.deepEqual(cometHeadUsd({ ...live, quoteUnit: "USD", borrowBalanceRaw: "0" }, null), {
    collateralUsd: 12,
    debtUsd: 0,
    borrowed: 0,
  });
});

// ── a Trove on a shut-down branch (ui-jobs 802) ─────────────────────────────
const { shutDownTrove, recordedCollateralLeg } = await import("../../lib/wallet/trove-shutdown.ts");
const { closestToLiquidation } = await import("../../lib/wallet/wallet-sections.ts");
const { branchShutdownState } = await import("../../lib/liquity-fork/shutdown.ts");
const { recordedShutdown } = await import("../../lib/shared/liquity-family-shutdown.ts");

const forkTrove = (family, collateralType, collateral, extra = {}) =>
  pos(family, {
    market: `${collateralType} Trove`,
    card: { kind: family, row: { collateralType, collateral } },
    collateralUsd: collateral,
    debtUsd: 100,
    buffer: 0.2,
    riskFigure: { value: "146.1% CR", label: "liquidates below 120%" },
    liquidatable: false,
    debtRate: 0.048,
    ...extra,
  });
const ebisuState = (c) => branchShutdownState(recordedShutdown("ebisu", c), null);

test("a Trove on an emptied branch: no ratio, buffer, rate or collateral dollars; the band's Recorded collateral", () => {
  const t = shutDownTrove(forkTrove("ebisu", "stcUSD", 14404.93), ebisuState("stcUSD"));
  assert.equal(t.buffer, undefined);
  assert.equal(t.riskFigure, undefined);
  assert.equal(t.liquidatable, undefined);
  assert.equal(t.debtRate, undefined);
  assert.equal(t.collateralUsd, undefined);
  assert.equal(t.debtUsd, 100);
  const dep = pos("ebisu", { kind: "deposits", market: "sUSDe Stability Pool", headRead: "none", usdOwnOracle: false });
  const [s] = walletSections([t, dep], { bands: true });
  assert.equal(s.collateral, undefined);
  assert.equal(s.debt.usd, 100);
  const coll = s.band.legs.find((l) => l.id === "collateral");
  assert.equal(coll.label, "Recorded collateral");
  assert.equal(coll.value, "14,404.93 stcUSD");
  assert.equal(coll.footnote.text, "Shut down 20 Aug 2026 · pool holds 0 stcUSD");
  assert.match(coll.footnote.prov.summary, /Collateral withdrawal/);
  assert.match(coll.prov.summary, /held 0 stcUSD since/);
  assert.equal(
    s.band.note,
    "No collateral total: the stcUSD Trove's recorded collateral and the sUSDe Stability Pool deposit state no dollars.",
  );
  assert.equal(walletTotal([s], "collateral").gap, "No wallet total: Ebisu states no dollars");
});

test("Closest to liquidation leaves out a Trove on a shut-down branch, and is absent where every Trove is", () => {
  const shut = shutDownTrove(forkTrove("ebisu", "stcUSD", 14404.93), ebisuState("stcUSD"));
  assert.equal(closestToLiquidation(walletSections([shut], { bands: true })), undefined);
  const live = forkTrove("basedollar", "WETH", 5000, { buffer: 0.4, riskFigure: { value: "200.0% CR", label: "x" } });
  const s = walletSections([shut, live], { bands: true });
  assert.equal(closestToLiquidation(s).positionId, live.positionId);
});

test("a live branch's Trove is unchanged", () => {
  const live = forkTrove("basedollar", "WETH", 5000);
  const state = branchShutdownState(recordedShutdown("basedollar", "WETH"), null);
  assert.equal(state, null);
  assert.equal(shutDownTrove(live, state), live);
  const v2 = forkTrove("liquity-v2", "WETH", 5000, {
    card: { kind: "liquity-v2", row: { collateralType: "WETH", collateral: { amount: 2 } } },
  });
  assert.equal(shutDownTrove(v2, branchShutdownState(recordedShutdown("liquity-v2", "WETH"), null)), v2);
  const [s] = walletSections([live, forkTrove("basedollar", "cbBTC", 300)], { bands: true });
  assert.deepEqual(
    s.band.legs.map((l) => [l.id, l.label]),
    [
      ["collateral", "Total collateral"],
      ["debt", "Total debt"],
    ],
  );
  assert.equal(s.collateral.usd, 5300);
  assert.equal(recordedCollateralLeg("basedollar", s.open), null);
});

test("a live read alone shuts a branch with no record; its collateral dollars stand", () => {
  const live = {
    shutDown: true,
    at: 1_790_000_000,
    raw: "1790000000",
    source: { contract: "TroveManager", address: "0x0", call: "TroveManager.shutdownTime()", block: 1 },
  };
  const t = shutDownTrove(forkTrove("liquity-v2", "WETH", 5000), branchShutdownState(null, live));
  assert.equal(t.buffer, undefined);
  assert.equal(t.collateralUsd, 5000);
  const [s] = walletSections([t, forkTrove("liquity-v2", "WETH", 10)], { bands: false });
  assert.equal(
    s.band.legs.find((l) => l.label === "Recorded collateral"),
    undefined,
  );
});
