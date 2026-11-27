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

const { walletSections, walletTotal, walletNet, unreadNote } = await import("../../lib/wallet/wallet-sections.ts");

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

test("the wallet total sums what states dollars and names what it leaves out (wallet total b)", () => {
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
  assert.equal(coll.figure.usd, 100);
  assert.equal(coll.of, 1);
  assert.equal(coll.gap, undefined);
  assert.equal(coll.leaves, "Leaves out Morpho Blue and Fluid (no dollars).");
  assert.equal(debt.figure.usd, 10);
  assert.equal(debt.leaves, coll.leaves);
  assert.equal(walletNet(coll, debt).usd, 90);
  // With nothing summed, there is no wallet total and the gap names why.
  const none = walletSections([pos("morpho", { usdOwnOracle: false, collateralUsd: 7, debtUsd: 1 })], { bands: true });
  assert.equal(walletTotal(none, "collateral").figure, undefined);
  assert.equal(walletTotal(none, "collateral").gap, "No wallet total: Morpho Blue states no dollars");
});

test("dollars at another protocol's oracle or a feed, named on the row, count in the totals (844 A)", () => {
  const src = "Aave V3 Optimism's oracle for the loan asset";
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 142500, debtUsd: 133900 }),
      pos("morpho", { chain: 10, usdOwnOracle: false, usdSource: src, collateralUsd: 88000, debtUsd: 82000 }),
      pos("morpho", { chain: 8453, status: "closed", history: { closedAt: 5 } }),
    ],
    { bands: true },
  );
  const coll = walletTotal(s, "collateral");
  const debt = walletTotal(s, "debt");
  assert.equal(coll.figure.usd, 230500);
  assert.equal(coll.of, 2);
  assert.equal(coll.leaves, undefined);
  assert.equal(debt.figure.usd, 215900);
  // The section's receipt names the feed on the position's row.
  const morpho = s.find((x) => x.slug === "morpho");
  assert.ok(
    morpho.collateral.prov.inputs.some((i) => i.note.includes(src)),
    JSON.stringify(morpho.collateral.prov),
  );
  // An open position stating no dollars still keeps its section out, whatever its siblings state.
  const mixed = walletSections(
    [
      pos("morpho", { usdOwnOracle: false, usdSource: src, collateralUsd: 88000, debtUsd: 82000 }),
      pos("morpho", { usdOwnOracle: false, chain: 8453 }),
    ],
    { bands: true },
  );
  assert.equal(walletTotal(mixed, "collateral").gap, "No wallet total: Morpho Blue states no dollars");
});

test("Morpho Arbitrum's stored rows, at Aave's oracle, stay out as not read at the chain head, with dated subtotals", () => {
  const at = Date.UTC(2026, 10, 20) / 1000;
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 1000, debtUsd: 100 }),
      pos("morpho", {
        chain: 42161,
        usdOwnOracle: false,
        usdSource: "Aave V3 Arbitrum oracle at the visit's read",
        headRead: "stored",
        readAt: at,
        collateralUsd: 50,
        debtUsd: 20,
      }),
    ],
    { bands: true },
  );
  const coll = walletTotal(s, "collateral");
  assert.equal(coll.figure.usd, 1000);
  assert.equal(coll.leaves, "Leaves out Morpho Blue (not read at the chain head).");
  const morpho = s.find((x) => x.slug === "morpho");
  assert.equal(morpho.collateral, undefined);
  // The band states the stored figures as dated subtotals, as Aave V3 Arbitrum's does.
  assert.deepEqual(
    morpho.band.legs.map((l) => [l.label, l.figure.usd, l.footnote?.text]),
    [
      ["Collateral subtotal", 50, "as read on 20 Nov 2026"],
      ["Debt subtotal", 20, "as read on 20 Nov 2026"],
    ],
  );
});

test("a section with an open position not read at head states no figure, and the wallet total leaves it out", () => {
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
  assert.match(
    aave.band.note,
    /^1 of the 2 open positions could not be read at the chain head, so the section states no total\.$/,
  );
  const coll = walletTotal(s, "collateral");
  assert.equal(coll.of, 1);
  assert.equal(coll.figure.usd, 50);
  assert.equal(coll.leaves, "Leaves out Aave V3 (not read at the chain head).");
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
  assert.equal(s[0].band.legs.length, 0, "stored and head figures are never summed together");
  assert.equal(walletTotal(s, "collateral").gap, "No wallet total: Aave V3 was not read at the chain head");
});

test("a section missing either figure is left out of both totals and Net", () => {
  const s = walletSections([pos("aave-v3", { collateralUsd: 100, debtUsd: 10 }), pos("spark", { collateralUsd: 50 })], {
    bands: true,
  });
  const coll = walletTotal(s, "collateral");
  const debt = walletTotal(s, "debt");
  assert.equal(coll.figure.usd, 100);
  assert.equal(debt.figure.usd, 10);
  assert.equal(coll.leaves, "Leaves out SparkLend (no dollars).");
  assert.equal(coll.leaves, debt.leaves);
  assert.equal(walletNet(coll, debt).usd, 90);
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
const { shutDownTrove, recordedCollateralLeg, walletBranchState } = await import("../../lib/wallet/trove-shutdown.ts");
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
const liveAnswer = (shutDown) => ({
  shutDown,
  at: shutDown ? 1_790_000_000 : null,
  raw: shutDown ? "1790000000" : "0",
  source: { contract: "ActivePool", address: "0x0", call: "ActivePool.shutdownTime()", block: 26_400_000 },
});

test("a Trove on an emptied branch: no ratio, buffer, rate or collateral dollars; the band's Recorded collateral", () => {
  const t = shutDownTrove(forkTrove("ebisu", "stcUSD", 14404.93), ebisuState("stcUSD"));
  assert.equal(t.buffer, undefined);
  assert.equal(t.riskFigure, undefined);
  assert.equal(t.liquidatable, undefined);
  assert.equal(t.debtRate, undefined);
  assert.equal(t.collateralUsd, undefined);
  assert.equal(t.debtUsd, 100);
  // The deposits carry their branch's state too, for their cards; they are no Troves.
  const dep = (m) =>
    pos("ebisu", {
      kind: "deposits",
      market: m,
      headRead: "none",
      usdOwnOracle: false,
      card: { kind: "fork-deposit", fork: "ebisu", row: { collateral_type: m.split(" ")[0] } },
      shutdown: ebisuState(m.split(" ")[0]),
    });
  const [s] = walletSections([t, dep("sUSDe Stability Pool"), dep("stcUSD Stability Pool")], { bands: true });
  assert.equal(s.collateral, undefined);
  assert.equal(s.debt.usd, 100);
  const coll = s.band.legs.find((l) => l.id === "recorded-collateral");
  assert.equal(coll.label, "Recorded collateral");
  assert.equal(coll.value, "14,404.93 stcUSD");
  assert.equal(coll.footnote.text, "Shut down 20 Aug 2026 · pool holds 0 stcUSD");
  assert.match(coll.footnote.prov.summary, /Collateral withdrawal/);
  assert.match(coll.prov.summary, /withdrew its pool's collateral on 21 Oct 2026; the Troves still record it\./);
  assert.match(coll.tip, /has held 0 of this collateral since the admin withdrew it/);
  assert.match(coll.tip, /The branch is shut down/);
  assert.equal(
    s.band.note,
    "No collateral total: the stcUSD Trove's recorded collateral, the sUSDe Stability Pool deposit and the stcUSD Stability Pool deposit state no dollars.",
  );
  assert.equal(walletTotal([s], "collateral").gap, "No wallet total: Ebisu states no dollars");
});

test("one live and one emptied branch: no collateral total, the emptied branch named once", () => {
  const shut = (c) => shutDownTrove(forkTrove("ebisu", "stcUSD", c), ebisuState("stcUSD"));
  const live = shutDownTrove(forkTrove("ebisu", "WBTC", 5000), null);
  const [s] = walletSections([shut(10), shut(20), live], { bands: true });
  // A section total covers every open position or none.
  assert.equal(s.collateral, undefined);
  assert.equal(s.debt.usd, 300);
  assert.deepEqual(
    s.band.legs.map((l) => [l.id, l.label]),
    [
      ["recorded-collateral", "Recorded collateral"],
      ["debt", "Total debt"],
    ],
  );
  assert.equal(s.band.legs[0].value, "30 stcUSD");
  assert.equal(s.band.note, "No collateral total: the stcUSD Troves' recorded collateral states no dollars.");
  assert.equal(walletTotal([s], "collateral").gap, "No wallet total: Ebisu states no dollars");
});

test("several emptied branches: each takes its own record's dates and receipt, the tip in the plural", () => {
  const a = shutDownTrove(forkTrove("ebisu", "stcUSD", 10), ebisuState("stcUSD"));
  const b = shutDownTrove(forkTrove("ebisu", "sUSDe", 20), ebisuState("sUSDe"));
  const leg = recordedCollateralLeg("ebisu", [a, b]);
  assert.match(leg.tip, /The branches are shut down and their pools have held 0/);
  assert.match(leg.footnote.text, /Shut down 20 Aug 2026 · pool holds 0 stcUSD · pool holds 0 sUSDe$/);
  // One receipt row per branch's withdrawal.
  assert.equal(leg.footnote.prov.inputs.length, 2);
  assert.match(leg.footnote.prov.summary, /sUSDe ActivePool/);
  assert.match(leg.footnote.prov.summary, /stcUSD ActivePool/);
});

test("a live read answering live against the record is stated as the Trove page states it", () => {
  const state = branchShutdownState(recordedShutdown("ebisu", "stcUSD"), liveAnswer(false));
  assert.equal(state.disagree, true);
  const leg = recordedCollateralLeg("ebisu", [shutDownTrove(forkTrove("ebisu", "stcUSD", 10), state)]);
  assert.match(leg.prov.summary, /the record and the chain disagree/);
});

test("Closest to liquidation leaves out a Trove on a shut-down branch, and is absent where every Trove is", () => {
  const shut = shutDownTrove(forkTrove("ebisu", "stcUSD", 14404.93), ebisuState("stcUSD"));
  assert.equal(closestToLiquidation(walletSections([shut], { bands: true })), undefined);
  const live = forkTrove("basedollar", "WETH", 5000, { buffer: 0.4, riskFigure: { value: "200.0% CR", label: "x" } });
  const s = walletSections([shut, live], { bands: true });
  assert.equal(closestToLiquidation(s).positionId, live.positionId);
});

test("a head that failed or timed out hands no state: the card takes the record, and hides the ratio", () => {
  // The head read threw: the position carries no `shutdown`.
  const timedOut = forkTrove("ebisu", "stcUSD", 14404.93, { headRead: "failed" });
  assert.equal(timedOut.shutdown, undefined);
  const state = walletBranchState("ebisu", "stcUSD", "open", timedOut.shutdown);
  assert.equal(state.record.withdrawal.block, 26_238_016);
  // A live branch's head read hands null, and the card draws none.
  assert.equal(walletBranchState("ebisu", "stcUSD", "open", null), null);
  assert.equal(walletBranchState("basedollar", "WETH", "open", undefined), null);
  assert.equal(walletBranchState("ebisu", "stcUSD", "closed", undefined), null);
});

test("a live branch's Trove is unchanged but for shutdown: null", () => {
  const live = forkTrove("basedollar", "WETH", 5000);
  const state = branchShutdownState(recordedShutdown("basedollar", "WETH"), null);
  assert.equal(state, null);
  assert.deepEqual(shutDownTrove(live, state), { ...live, shutdown: null });
  assert.equal(shutDownTrove(live, undefined), live);
  const v2 = forkTrove("liquity-v2", "WETH", 5000, {
    card: { kind: "liquity-v2", row: { collateralType: "WETH", collateral: { amount: 2 } } },
  });
  assert.deepEqual(shutDownTrove(v2, branchShutdownState(recordedShutdown("liquity-v2", "WETH"), null)), {
    ...v2,
    shutdown: null,
  });
  const [s] = walletSections([shutDownTrove(live, null), shutDownTrove(forkTrove("basedollar", "cbBTC", 300), null)], {
    bands: true,
  });
  assert.deepEqual(
    s.band.legs.map((l) => [l.id, l.label]),
    [
      ["collateral", "Total collateral"],
      ["debt", "Total debt"],
    ],
  );
  assert.equal(s.collateral.usd, 5300);
  assert.equal(s.band.note, undefined);
  assert.equal(recordedCollateralLeg("basedollar", s.open), null);
});

test("a live read alone shuts a branch with no record; its collateral dollars stand", () => {
  const t = shutDownTrove(forkTrove("liquity-v2", "WETH", 5000), branchShutdownState(null, liveAnswer(true)));
  assert.equal(t.buffer, undefined);
  assert.equal(t.collateralUsd, 5000);
  const [s] = walletSections([t, forkTrove("liquity-v2", "WETH", 10)], { bands: false });
  assert.equal(
    s.band.legs.find((l) => l.label === "Recorded collateral"),
    undefined,
  );
});

test("the unread note reads for all, some and none of a section's open positions", () => {
  const tail = " could not be read at the chain head, so the section states no total.";
  assert.equal(
    unreadNote(5, 5),
    "None of the 5 open positions could be read at the chain head, so the section states no total.",
  );
  assert.equal(unreadNote(1, 1), `The open position${tail}`);
  assert.equal(unreadNote(2, 5), `2 of the 5 open positions${tail}`);
  assert.equal(unreadNote(1, 2), `1 of the 2 open positions${tail}`);
  assert.equal(unreadNote(0, 5), undefined);
  assert.equal(
    unreadNote(1, 1, true),
    "The open position could not be read at the chain head, so the wallet total leaves it out.",
  );
});

test("a section of stored reads alone states a dated subtotal outside the wallet total", () => {
  const day = 1_795_000_000; // 18 Nov 2026
  const s = walletSections(
    [pos("aave-v3", { chain: 42161, collateralUsd: 50, debtUsd: 5, headRead: "stored", readAt: day })],
    { bands: true },
  );
  assert.equal(s[0].collateral, undefined);
  assert.deepEqual(
    s[0].band.legs.map((l) => [l.label, l.value, l.footnote.text]),
    [
      ["Collateral subtotal", "$50.00", "as read on 18 Nov 2026"],
      ["Debt subtotal", "$5.00", "as read on 18 Nov 2026"],
    ],
  );
  // No read time, no subtotal.
  const [undated] = walletSections([pos("aave-v3", { collateralUsd: 50, debtUsd: 5, headRead: "stored" })], {
    bands: true,
  });
  assert.deepEqual(undated.band.legs, []);
  assert.equal(undated.band.note, unreadNote(1, 1));
  // A head read that failed keeps the store's figures and its read stamp:
  // dated as stored.
  const [failed] = walletSections(
    [pos("aave-v3", { collateralUsd: 80, debtUsd: 8, headRead: "failed", readAt: day })],
    { bands: true },
  );
  assert.deepEqual(
    failed.band.legs.map((l) => [l.label, l.value]),
    [
      ["Collateral subtotal", "$80.00"],
      ["Debt subtotal", "$8.00"],
    ],
  );
  assert.equal(failed.band.note, unreadNote(1, 1, true));
  // Owing nothing: the collateral subtotal alone.
  const [owing0] = walletSections(
    [pos("aave-v3", { collateralUsd: 40, debtUsd: 0, headRead: "stored", readAt: day })],
    { bands: true },
  );
  assert.deepEqual(
    owing0.band.legs.map((l) => l.label),
    ["Collateral subtotal"],
  );
});

test("the leaves line names each reason once, its sections together", () => {
  const s = walletSections(
    [
      pos("aave-v3", { collateralUsd: 100, debtUsd: 10 }),
      pos("morpho", { usdOwnOracle: false, collateralUsd: 7, debtUsd: 1 }),
      pos("fluid", { usdOwnOracle: false }),
      pos("spark", { collateralUsd: 5, debtUsd: 1, headRead: "failed" }),
    ],
    { bands: true },
  );
  const coll = walletTotal(s, "collateral", ["Liquity V1 Troves"]);
  assert.equal(coll.figure.usd, 100);
  assert.equal(
    coll.leaves,
    "Leaves out Liquity V1 Troves (could not be read), Morpho Blue and Fluid (no dollars) and SparkLend (not read at the chain head).",
  );
});

test("a testnet's section stands outside the wallet totals and the risk tile, after every mainnet one", async () => {
  const { closestToLiquidation, onTestnet } = await import("../../lib/wallet/wallet-sections.ts");
  const s = walletSections(
    [
      pos("polaris", { chain: 11155111, buffer: 0.01, riskFigure: { value: "101%" } }),
      pos("aave-v3", { buffer: 0.5, collateralUsd: 100, debtUsd: 10, riskFigure: { value: "2.0" } }),
    ],
    { bands: true },
  );
  assert.deepEqual(
    s.map((x) => [x.slug, x.testnet]),
    [
      ["aave-v3", false],
      ["polaris", true],
    ],
  );
  // Polaris states no dollars, yet the wallet total stands over Aave V3 alone.
  const coll = walletTotal(s, "collateral");
  assert.equal(coll.figure.usd, 100);
  assert.equal(coll.of, 1);
  assert.equal(closestToLiquidation(s).family, "aave-v3");
  assert.equal(onTestnet({ chain: 11155111 }), true);
  assert.equal(onTestnet({ chain: 1 }), false);
  // A wallet holding Polaris alone has no wallet total.
  assert.equal(walletTotal(walletSections([pos("polaris", { chain: 11155111 })], { bands: true }), "debt"), null);
});

test("a vault-share section states a dated subtotal outside the wallet total (ui-jobs 783)", async () => {
  const { CENSUS_NOTE, CENSUS_NO_TOTAL } = await import("../../lib/wallet/wallet-sections.ts");
  const vault = (extra = {}) =>
    pos("vaults", { card: { kind: "vault" }, headRead: "stored", usdOwnOracle: false, debtUsd: undefined, ...extra });
  const s = walletSections(
    [
      vault({ collateralUsd: 500, readAt: 1_795_000_000 }),
      vault({ collateralUsd: 20, readAt: 1_794_900_000 }),
      pos("aave-v3", { collateralUsd: 100, debtUsd: 10 }),
    ],
    { bands: true },
  );
  const v = s.find((x) => x.slug === "vaults");
  assert.equal(v.census, true);
  assert.equal(v.collateral, undefined);
  assert.equal(v.band.note, CENSUS_NOTE);
  // The biggest census value first.
  assert.deepEqual(
    v.open.map((p) => p.collateralUsd),
    [500, 20],
  );
  assert.deepEqual(
    v.band.legs.map((l) => [l.label, l.value, l.footnote.text]),
    [["Subtotal", "$520.00", "as read from 17 Nov 2026 to 18 Nov 2026"]],
  );
  const t = walletTotal(s, "collateral");
  assert.equal(t.figure.usd, 100);
  assert.equal(t.leaves, "Leaves out Vault shares (valued at the census blocks).");
  // Vault shares alone: no wallet total.
  const alone = walletSections([vault({ collateralUsd: 5, readAt: 1_795_000_000 })], { bands: true });
  assert.equal(walletTotal(alone, "collateral").gap, "No wallet total: vault shares are valued at their census blocks");
  // A share with no dollars: no subtotal.
  const unpriced = walletSections([vault({ readAt: 1_795_000_000 })], { bands: true });
  assert.deepEqual(unpriced[0].band.legs, []);
  assert.equal(unpriced[0].band.note, CENSUS_NO_TOTAL);
  // A head read that failed is said as one.
  const failed = walletSections([vault({ headRead: "failed" })], { bands: true });
  assert.equal(failed[0].census, false);
  assert.equal(failed[0].band.note, unreadNote(1, 1));
});

test("vault shares take one section per vault protocol, each with its subtotal (ui-jobs 863)", async () => {
  const { CENSUS_NOTE, CENSUS_NO_TOTAL } = await import("../../lib/wallet/wallet-sections.ts");
  const share = (root, extra = {}) =>
    pos("vaults", {
      vault: root,
      href: `/ethereum/${root}/vaults/0xv/0xh`,
      card: { kind: "vault" },
      headRead: "stored",
      usdOwnOracle: false,
      debtUsd: undefined,
      readAt: 1_795_000_000,
      ...extra,
    });
  const s = walletSections(
    [
      share("morpho", { collateralUsd: 500 }),
      share("yearn", { collateralUsd: 40 }),
      share("morpho", { collateralUsd: 20, readAt: 1_794_900_000 }),
      share("aave-v3"),
      share("yearn", { status: "closed", history: { closedAt: 5 } }),
      pos("aave-v3", { collateralUsd: 100, debtUsd: 10 }),
    ],
    { bands: true },
  );
  const by = Object.fromEntries(s.map((x) => [x.slug, x]));
  assert.deepEqual(Object.keys(by).sort(), ["aave-v3", "vaults-aave-v3", "vaults-morpho", "vaults-yearn"]);
  assert.equal(by["vaults-morpho"].name, "MetaMorpho vaults");
  assert.equal(by["vaults-yearn"].name, "Yearn V3");
  assert.equal(by["vaults-aave-v3"].name, "Aave vaults");
  // Aave V3's lending section stands apart from Aave's vaults.
  assert.equal(by["aave-v3"].name, "Aave V3");
  assert.equal(by["vaults-morpho"].positions.length, 2);
  assert.equal(by["vaults-yearn"].positions.length, 2);
  // Each section its own census subtotal, footnote and note.
  assert.deepEqual(
    by["vaults-morpho"].band.legs.map((l) => [l.label, l.value, l.footnote.text]),
    [["Subtotal", "$520.00", "as read from 17 Nov 2026 to 18 Nov 2026"]],
  );
  assert.equal(by["vaults-morpho"].band.note, CENSUS_NOTE);
  assert.deepEqual(
    by["vaults-yearn"].band.legs.map((l) => [l.label, l.value, l.footnote.text]),
    [["Subtotal", "$40.00", "as read on 18 Nov 2026"]],
  );
  // A share with no dollars stops its own section's subtotal alone.
  assert.deepEqual(by["vaults-aave-v3"].band.legs, []);
  assert.equal(by["vaults-aave-v3"].band.note, CENSUS_NO_TOTAL);
  // The wallet total leaves each vault section out, named.
  const t = walletTotal(s, "collateral");
  assert.equal(t.figure.usd, 100);
  assert.match(t.leaves, /^Leaves out /);
  for (const name of ["MetaMorpho vaults", "Yearn V3", "Aave vaults"]) assert.ok(t.leaves.includes(name), name);
  assert.ok(t.leaves.endsWith("(valued at the census blocks)."));
});

test("a stored section holding a Trove on an emptied branch states no subtotal", () => {
  const stored = { headRead: "stored", readAt: 1_795_000_000 };
  const shut = { ...shutDownTrove(forkTrove("ebisu", "stcUSD", 10), ebisuState("stcUSD")), ...stored };
  const live = { ...shutDownTrove(forkTrove("ebisu", "WBTC", 5000), null), ...stored };
  const [s] = walletSections([shut, live], { bands: true });
  assert.equal(s.collateral, undefined);
  assert.deepEqual(s.band.legs, []);
  assert.equal(s.band.note, unreadNote(2, 2));
});

test("the undrawn line follows the Status pill, as the heading's count", async () => {
  const { undrawnCount, undrawnLine } = await import("../../lib/wallet/wallet-sections.ts");
  const u = { open: 80, closed: 1100 };
  assert.equal(undrawnCount(u), 1180);
  assert.equal(
    undrawnLine(u, "Base"),
    "1,180 more holdings on Base are not drawn (80 open); the open ones with the largest census value come first.",
  );
  assert.equal(
    undrawnLine(u, "Base", "open"),
    "80 more open holdings on Base are not drawn; the ones with the largest census value come first.",
  );
  assert.equal(undrawnLine(u, "Base", "closed"), "1,100 more closed holdings on Base are not drawn.");
  assert.equal(
    undrawnLine({ open: 1, closed: 0 }, "Ethereum", "open").startsWith("1 more open holding on Ethereum is"),
    true,
  );
  assert.equal(undrawnCount({ open: 0, closed: 3 }, "open"), 0);
});
