// lib/polaris/against-holding.ts — "Against holding pETH" (rails-ops
// ui-jobs 695): the formula, a liquidation's surplus counted as withdrawn and
// its escrow as lost, a closed position, a missing or loading live read, each
// market's feed, a debt at and below zero, the protocol legs carried by the
// figures now, and agreement with the since-open window; and the ratio
// headline's floor line in defensive mode, on the card and the listing row.
// Run: npm test
//
// The modules import through `@/`, so this file resolves `@/` as
// polaris-export.test.mjs does; .tsx modules load as stubs.
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync, readFileSync } from "node:fs";
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
    if (url.endsWith(".tsx")) {
      const src = readFileSync(fileURLToPath(url), "utf8");
      const names = [...src.matchAll(/^export (?:async )?(?:function|const) (\\w+)/gm)].map((m) => m[1]);
      const body = names.map((n) => "export const " + n + " = () => null;").join("\\n");
      return { url: "data:text/javascript," + encodeURIComponent(body), shortCircuit: true };
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}`;
register("data:text/javascript," + encodeURIComponent(hook));

const { polarisAgainstHolding, isAgainstHoldingNone, againstHoldingText } = await import(
  ROOT + "lib/polaris/against-holding.ts"
);
const { polarisSinceLastTouch } = await import(ROOT + "lib/polaris/since-last-touch.ts");
const { polarisPositionToMarkdown } = await import(ROOT + "lib/polaris/position-to-markdown.ts");
const { polarisEquityAtFeed, polarisDebtOwed } = await import(ROOT + "lib/polaris/economics.ts");

const T0 = 1_760_000_000;
/** A CDPUpdated row; amounts as decimal strings' numbers. */
function row(i, type, o = {}) {
  const s = (n) => String(n ?? 0);
  return {
    id: `ev-${i}`,
    blockNumber: 100 * i,
    timestamp: T0 + i * 3600,
    txHash: `0x${String(i).padStart(64, "0")}`,
    context: {
      protocol: "polaris",
      data: {
        eventType: type,
        market: o.market ?? "usdp",
        cdpId: "8",
        stableSymbol: o.market === "goldp" ? "GOLDp" : "USDp",
        newColl: s(o.newColl),
        newDebt: s(o.newDebt),
        collChange: s(o.collChange),
        debtChange: s(o.debtChange),
        mintRedeemCollGain: s(o.mrColl),
        mintRedeemDebtGain: s(o.mrDebt),
        accruedInterest: s(o.interest),
        stableGain: s(o.stableGain),
        bcTokenGain: s(o.bcGain),
        stablesMintedToEnsureZeroDebt: s(o.settled),
        ...(o.price != null ? { priceAtBlock: { pethInDebt: o.price } } : {}),
        ...(o.collSurplus != null ? { collSurplus: s(o.collSurplus) } : {}),
        ...(o.surplus ? { surplus: o.surplus } : {}),
        ...(o.flatComp != null ? { flatComp: s(o.flatComp) } : {}),
      },
    },
  };
}

/** A head read; the defaults are an open position whose last touch is `last`. */
function head(last, o = {}) {
  const d = last.context.data;
  return {
    blockNumber: 99_999,
    blockTimestamp: T0 + 1_000_000,
    isOpen: true,
    chainStale: false,
    recordedColl: Number(d.newColl),
    recordedDebt: Number(d.newDebt),
    entireColl: Number(d.newColl),
    entireDebt: Number(d.newDebt),
    accruedInterest: 0,
    accruedStables: 0,
    bcTokenGain: 0,
    mintRedeemCollChange: 0,
    mintRedeemDebtChange: 0,
    lastTouchTime: last.timestamp,
    price: { pethInDebt: 2000 },
    ...o,
  };
}

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} ${a} ≠ ${b}`);

test("the formula: collateral side plus the debt side at the feed, and its share of pETH deposited", () => {
  const evs = [
    row(1, "open", { collChange: 10, debtChange: 10000, newColl: 10, newDebt: 10000 }),
    row(2, "adjust", { collChange: -2, debtChange: -3000, newColl: 8, newDebt: 7000 }),
  ];
  const r = polarisAgainstHolding(evs, head(evs[1], { entireColl: 8.1, entireDebt: 7100 }));
  // (8.1 + 2 − 10) + (10000 − 3000 − 7100) ÷ 2000 = 0.1 − 0.05
  close(r.collTerm, 0.1);
  close(r.debtTerm, -100);
  close(r.gain, 0.05);
  close(r.share, 0.005);
  assert.equal(
    againstHoldingText(r, (n) => n.toFixed(4)),
    "+0.0500 pETH (+0.5% of pETH deposited)",
  );
});

test("a liquidation's surplus counts as withdrawn, claimed or still to claim", () => {
  const claim = { block: 900, timestamp: T0 + 9e5, txHash: "0x1", from: "0x2", amount: "0.5", amountRaw: "5" };
  const ctx = (c) => ({
    owner: "0x2",
    credit: "0.5",
    creditRaw: "5",
    creditBlock: 200,
    scannedToBlock: 1000,
    read: true,
    claim: c,
  });
  const evs = (c) => [
    row(1, "open", { collChange: 10, debtChange: 15000, newColl: 10, newDebt: 15000 }),
    row(2, "liquidate", { collChange: -10, debtChange: -15000, collSurplus: 0.5, surplus: ctx(c) }),
  ];
  const chain = head(evs(null)[0], { isOpen: false, entireColl: 0, entireDebt: 0 });
  const claimed = polarisAgainstHolding(evs(claim), chain);
  const owed = polarisAgainstHolding(evs(null), chain);
  close(claimed.surplusClaimed, 0.5);
  close(owed.surplusOwed, 0.5);
  // 0.5 − 0.0375 − 10 + 15000 ÷ 2000: the seizure and the cleared debt are not
  // the holder's; the escrow went to the liquidator (fixedGasComp where the
  // row carries no _flatComp).
  close(claimed.escrowLost, 0.0375);
  close(claimed.gain, -2.0375);
  close(owed.gain, -2.0375);
  assert.equal(claimed.closed, true);
});

test("a closed position needs only the feed: nothing held or owed now", () => {
  const evs = [
    row(1, "open", { collChange: 10, debtChange: 10000, newColl: 10, newDebt: 10000 }),
    row(2, "close", { collChange: -10.2, debtChange: -10100, interest: 100, bcGain: 0.2, newColl: 0, newDebt: 0 }),
  ];
  // A burned CDP's head read: its getters answer zero; the feed is the market's.
  const r = polarisAgainstHolding(evs, head(evs[0], { isOpen: false, entireColl: 5, entireDebt: 5, lastTouchTime: 0 }));
  close(r.collNow, 0);
  close(r.debtNow, 0);
  close(r.gain, 0.2 - 100 / 2000);
});

test("a missing, stale or unpriced live read states no figure; so does an index behind the chain", () => {
  const evs = [row(1, "open", { collChange: 10, debtChange: 10000, newColl: 10, newDebt: 10000 })];
  assert.deepEqual(polarisAgainstHolding(evs, null), { none: "live-read" });
  assert.deepEqual(polarisAgainstHolding(evs, head(evs[0], { chainStale: true })), { none: "live-read" });
  assert.deepEqual(polarisAgainstHolding(evs, head(evs[0], { price: null })), { none: "live-read" });
  assert.deepEqual(polarisAgainstHolding(evs, head(evs[0], { lastTouchTime: T0 + 99 })), { none: "index-behind" });
  assert.deepEqual(polarisAgainstHolding(evs, head(evs[0], { recordedColl: 11 })), { none: "index-behind" });
  assert.ok(isAgainstHoldingNone(polarisAgainstHolding(evs, null)));
  assert.equal(polarisAgainstHolding([], null), null);
  // The export says the same.
  const md = polarisPositionToMarkdown({
    view: {
      market: "usdp",
      cdpId: "8",
      stableSymbol: "USDp",
      status: "open",
      coll: 10,
      debt: 10000,
      collUsd: null,
      icr: null,
    },
    chain: null,
    events: evs,
    generatedAt: new Date(Date.UTC(2026, 10, 17)),
  });
  assert.match(
    md,
    /## Against holding pETH\n\nThe live read was unavailable, so this snapshot carries no figure against holding pETH\./,
  );
});

test("each market's debt side converts at its feed: pETH in USDp, pETH in GOLDp", () => {
  const usdp = [row(1, "open", { collChange: 10, debtChange: 10000, newColl: 10, newDebt: 10000 })];
  const goldp = [row(1, "open", { market: "goldp", collChange: 10, debtChange: 4, newColl: 10, newDebt: 4 })];
  const u = polarisAgainstHolding(usdp, head(usdp[0], { entireDebt: 10200 }));
  const g = polarisAgainstHolding(goldp, head(goldp[0], { entireDebt: 4.08, price: { pethInDebt: 0.8 } }));
  close(u.gain, -200 / 2000);
  close(g.gain, -0.08 / 0.8);
  const md = polarisPositionToMarkdown({
    view: {
      market: "goldp",
      cdpId: "8",
      stableSymbol: "GOLDp",
      status: "open",
      coll: 10,
      debt: 4.08,
      collUsd: null,
      icr: null,
    },
    chain: {
      ...head(goldp[0], { entireDebt: 4.08, price: { pethInDebt: 0.8, curve: 1, ethUsd: 3000, xauUsd: 3750 } }),
      interestRate: 0,
      primaryRate: 0,
      secondaryRate: 0,
      reserveToDebtRatio: 1,
      defensiveMode: false,
    },
    events: goldp,
    generatedAt: new Date(Date.UTC(2026, 10, 17)),
  });
  assert.match(md, /- \*\*Against holding pETH:\*\* −0\.1 pETH \(−1\.0% of pETH deposited\)/);
  assert.match(md, /- \*\*Feed:\*\* 0\.8 GOLDp per pETH \(previewPrice\(\) at block 99999\)/);
});

test("interest, stability gains, reward pETH and PSM shares need no term: they are in the figures now", () => {
  const evs = [
    row(1, "open", { collChange: 10, debtChange: 10000, newColl: 10, newDebt: 10000 }),
    // A touch that only wrote in what built up: interest 50, a PSM redemption
    // share (−1 pETH, −1,800 USDp), reward pETH 0.1, a stability gain of 5.
    row(2, "adjust", {
      interest: 50,
      mrColl: -1,
      mrDebt: -1800,
      bcGain: 0.1,
      stableGain: 5,
      newColl: 9.1,
      newDebt: 8245,
    }),
  ];
  // Pending since: reward 0.02 pETH, interest 10.
  const r = polarisAgainstHolding(evs, head(evs[1], { entireColl: 9.12, entireDebt: 8255 }));
  const collLegs = -1 + 0.1 + 0.02;
  const debtLegs = -(50 - 1800 - 5 + 10);
  close(r.gain, collLegs + debtLegs / 2000, "the legs at the feed");
  close(r.deposited, 10);
  close(r.withdrawn, 0);
  close(r.repaid, 0);
});

test("on a position touched once it agrees with the since-open window at the same feed", () => {
  const evs = [row(1, "open", { collChange: 10, debtChange: 10000, newColl: 10, newDebt: 10000, price: 1800 })];
  const chain = head(evs[0], {
    entireColl: 10.07,
    entireDebt: 10012,
    accruedInterest: 30,
    accruedStables: 10,
    bcTokenGain: 0.02,
    mintRedeemCollChange: 0.05,
    mintRedeemDebtChange: -8,
  });
  const w = polarisSinceLastTouch(chain, evs);
  assert.ok(w && w.sinceOpen);
  const r = polarisAgainstHolding(evs, chain);
  // The window's total less its feed term is its protocol term, which is
  // this figure converted at the feed now.
  close(r.gain * 2000, w.total - w.feed);
  close(r.gain * 2000, w.protocol);
});

test("equity at the feed counts a debt below zero as stables owed to the holder", () => {
  close(polarisEquityAtFeed(10, 15000, 2000), 5000);
  close(polarisEquityAtFeed(10, 0, 2000), 20000);
  // usdp/2736 before its touch: 78.0065 USDp owed adds to the collateral's worth.
  close(polarisEquityAtFeed(10, -78.0065, 2000), 20078.0065);
});

test("the since-open window counts a debt below zero as owed, the same as against holding", () => {
  const evs = [row(1, "open", { collChange: 10, debtChange: 1000, newColl: 10, newDebt: 1000, price: 1800 })];
  const chain = head(evs[0], {
    entireColl: 10.5,
    entireDebt: -40,
    accruedInterest: 5,
    accruedStables: 15,
    bcTokenGain: 0,
    mintRedeemCollChange: 0.5,
    mintRedeemDebtChange: -1030,
  });
  const w = polarisSinceLastTouch(chain, evs);
  assert.ok(w && w.sinceOpen);
  // 10.5 × 2000 + 40 owed, against 10 × 1800 − 1000 at the open.
  close(w.equityNow, 21040);
  close(w.total, 21040 - 17000);
  assert.equal("settle" in w.legs, false);
  const r = polarisAgainstHolding(evs, chain);
  close(r.gain * 2000, w.protocol);
});

test("stables a touch minted to the holder count as received: the window opens after the mint and agrees with against holding", () => {
  // The second touch's PSM share takes the debt to −40; it mints 40 USDp to
  // the holder and writes the debt at zero.
  const evs = [
    row(1, "open", { collChange: 10, debtChange: 1000, newColl: 10, newDebt: 1000, price: 1800 }),
    row(2, "adjust", { mrColl: -0.5, mrDebt: -1040, settled: 40, newColl: 9.5, newDebt: 0, price: 1900 }),
  ];
  const chain = head(evs[1], { entireDebt: 5, accruedInterest: 5 });
  const w = polarisSinceLastTouch(chain, evs);
  assert.ok(w && !w.sinceOpen);
  // The window opens at the touch's written figures: the debt at zero.
  close(w.debtAtTouch, 0);
  close(w.equityAtTouch, 9.5 * 1900);
  close(w.protocol, -5);
  // Against holding counts the 40 minted as received at that touch. Its
  // figure at the touch's written state, at the same feed, differs from the
  // figure now by the window's protocol term.
  const r = polarisAgainstHolding(evs, chain);
  const atTouch = polarisAgainstHolding(evs, head(evs[1]));
  close(r.settled, 40);
  close(atTouch.debtTerm, 1000 + 40 - 0);
  close((r.gain - atTouch.gain) * 2000, w.protocol);
});

/** One `## ` section of an export, from its heading to the next. */
const section = (md, heading) => {
  const start = md.indexOf(`\n## ${heading}`);
  assert.ok(start >= 0, `no section ${heading}`);
  const end = md.indexOf("\n## ", start + 1);
  return md.slice(start, end < 0 ? undefined : end);
};

test("the export's timeline and lifetime state the stables each touch minted to the holder", async () => {
  const evs = [
    row(1, "open", { collChange: 10, debtChange: 1000, newColl: 10, newDebt: 1000 }),
    row(2, "close", { collChange: -9.5, debtChange: 0, mrColl: -0.5, mrDebt: -1040, settled: 40 }),
  ];
  for (const e of evs) e.actionLabel = e.context.data.eventType;
  const md = polarisPositionToMarkdown({
    view: {
      market: "usdp",
      cdpId: "8",
      stableSymbol: "USDp",
      status: "closed",
      coll: 0,
      debt: 0,
      collUsd: null,
      icr: null,
    },
    chain: null,
    events: evs,
    generatedAt: new Date(Date.UTC(2026, 10, 17)),
  });
  const timeline = section(md, "Timeline");
  assert.match(timeline, /\| Minted to the holder \(USDp\) \|/);
  const closeRow = timeline.split("\n").find((l) => l.startsWith("| 2 |"));
  assert.match(closeRow, /\| 40 \|/);
  const lifetime = section(md, "Lifetime");
  assert.match(
    lifetime,
    /^- \*\*Minted to the holder:\*\* 40 USDp, where the debt had gone below zero \(Σ `_stablesMintedToEnsureZeroDebt`\)$/m,
  );
  assert.equal(lifetime.match(/^- \*\*Minted to the holder:\*\*/gm)?.length, 1);
});

test("the export's against-holding section states the stables minted to the holder", () => {
  const evs = [
    row(1, "open", { collChange: 10, debtChange: 1000, newColl: 10, newDebt: 1000 }),
    row(2, "close", { collChange: -9.5, debtChange: 0, mrColl: -0.5, mrDebt: -1040, settled: 40 }),
  ];
  for (const e of evs) e.actionLabel = e.context.data.eventType;
  const md = polarisPositionToMarkdown({
    view: {
      market: "usdp",
      cdpId: "8",
      stableSymbol: "USDp",
      status: "closed",
      coll: 0,
      debt: 0,
      collUsd: null,
      icr: null,
    },
    chain: {
      ...head(evs[1], { isOpen: false, recordedColl: 0, recordedDebt: 0, entireColl: 0, entireDebt: 0 }),
      price: { pethInDebt: 2000, curve: 1, ethUsd: 2000, xauUsd: null },
      interestRate: 0,
      primaryRate: 0,
      secondaryRate: 0,
      reserveToDebtRatio: 1,
      defensiveMode: false,
    },
    events: evs,
    generatedAt: new Date(Date.UTC(2026, 10, 17)),
  });
  const holding = section(md, "Against holding pETH");
  assert.match(holding, /^- \*\*Minted to the holder:\*\* 40 USDp, where a debt went below zero$/m);
  assert.equal(holding.match(/^- \*\*Minted to the holder:\*\*/gm)?.length, 1);
});

test("a debt below zero is owed to the holder: the Debt line says Owed and the amount", () => {
  close(polarisDebtOwed(-0.7109305751935578), 0.7109305751935578);
  assert.equal(polarisDebtOwed(0), 0);
  assert.equal(polarisDebtOwed(27.38), 0);
  const evs = [row(1, "open", { collChange: 0.0025, debtChange: 0.0000867, newColl: 0.0025, newDebt: 0.0000867 })];
  const md = polarisPositionToMarkdown({
    view: {
      market: "usdp",
      cdpId: "34812",
      stableSymbol: "USDp",
      status: "open",
      coll: 0.0024,
      debt: -0.7109,
      recordedDebt: 0.0000867,
      collUsd: null,
      icr: null,
    },
    chain: null,
    events: evs,
    generatedAt: new Date(Date.UTC(2026, 10, 17)),
  });
  assert.match(md, /- \*\*Debt:\*\* Owed 0\.7109 USDp \(below zero: the next touch mints it to the holder\)/);
  assert.doesNotMatch(md, /- \*\*Debt:\*\* none/);
});

test("a liquidation pays the gas compensation escrow to the liquidator: the holder loses it", () => {
  const evs = [
    row(1, "open", { collChange: 1, newColl: 1, newDebt: 0 }),
    row(2, "liquidate", { collChange: -1, collSurplus: 0.1, flatComp: 0.0375 }),
  ];
  const r = polarisAgainstHolding(evs, head(evs[0], { isOpen: false, entireColl: 0, entireDebt: 0 }));
  // 0.1 surplus − 0.0375 escrow − 1 deposited, nothing borrowed.
  close(r.escrowLost, 0.0375);
  close(r.gain, -0.9375);
  // A close returns the escrow: nothing lost.
  const closed = [row(1, "open", { collChange: 1, newColl: 1 }), row(2, "close", { collChange: -1 })];
  const c = polarisAgainstHolding(closed, head(closed[0], { isOpen: false, entireColl: 0, entireDebt: 0 }));
  close(c.escrowLost, 0);
  close(c.gain, 0);
});

test("a debt at zero adds nothing; a debt below zero counts as the stables the next touch pays the holder", () => {
  const evs = [row(1, "open", { collChange: 10, debtChange: 1000, newColl: 10, newDebt: 1000 })];
  const zero = polarisAgainstHolding(evs, head(evs[0], { entireDebt: 0 }));
  close(zero.debtTerm, 1000);
  close(zero.gain, 1000 / 2000);
  const below = polarisAgainstHolding(evs, head(evs[0], { entireDebt: -40 }));
  close(below.debtNow, -40);
  close(below.debtTerm, 1040);
  close(below.gain, 1040 / 2000);
  // Once a touch has settled it, the stables minted to the holder count as received.
  const settled = [
    row(1, "open", { collChange: 10, debtChange: 1000, newColl: 10, newDebt: 1000 }),
    row(2, "adjust", { mrColl: -0.5, mrDebt: -1040, settled: 40, newColl: 9.5, newDebt: 0 }),
  ];
  const s = polarisAgainstHolding(settled, head(settled[1], { entireDebt: 0 }));
  close(s.settled, 40);
  close(s.debtTerm, 1040);
  close(s.gain, -0.5 + 1040 / 2000);
});

test("an export taken while the head read is in flight says it was loading", () => {
  const evs = [row(1, "open", { collChange: 10, debtChange: 10000, newColl: 10, newDebt: 10000 })];
  const md = (livePending) =>
    polarisPositionToMarkdown({
      view: {
        market: "usdp",
        cdpId: "8",
        stableSymbol: "USDp",
        status: "open",
        coll: 10,
        debt: 10000,
        collUsd: null,
        icr: null,
      },
      chain: null,
      livePending,
      events: evs,
      generatedAt: new Date(Date.UTC(2026, 10, 17)),
    });
  assert.match(md(true), /The live read was still loading, so this snapshot carries no figure against holding pETH\./);
  assert.match(md(false), /The live read was unavailable, so this snapshot carries no figure against holding pETH\./);
});

test("the ratio headline's floor line names defensive mode, on the card and on the listing row", async () => {
  const { polarisFloorLine, polarisFloorWords } = await import(ROOT + "lib/polaris/ratio-format.ts");
  // The card draws it from the view's floor in force and mode.
  assert.equal(polarisFloorWords(1.5, true).text, "Minimum ratio 150% · defensive mode");
  assert.equal(polarisFloorWords(1.15, false).text, "Minimum ratio 115%");
  assert.equal(polarisFloorWords(1.15, false).mode, null);
  // The listing row's view takes its floor from the market board through the
  // same line, so a board in defensive mode reads the same there.
  const board = { defensiveMode: true, mcr: 1.15, defensiveMcr: 1.5 };
  const line = polarisFloorLine(board);
  assert.equal(line.mcr, 1.5);
  assert.equal(line.text, "Minimum ratio 150% · defensive mode");
  assert.equal(polarisFloorLine({ ...board, defensiveMode: false }).text, "Minimum ratio 115%");
  assert.equal(polarisFloorLine(null), null);
});
