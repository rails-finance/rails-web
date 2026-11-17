// lib/polaris/against-holding.ts — "Against holding pETH" (rails-ops
// ui-jobs 695): the formula, a liquidation's surplus counted as withdrawn,
// a closed position, a missing live read, the market's own feed, the protocol
// legs carried by the figures now, and agreement with the since-open window.
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
        stablesMintedToEnsureZeroDebt: "0",
        ...(o.price != null ? { priceAtBlock: { pethInDebt: o.price } } : {}),
        ...(o.collSurplus != null ? { collSurplus: s(o.collSurplus) } : {}),
        ...(o.surplus ? { surplus: o.surplus } : {}),
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
  // 0.5 − 10 + 15000 ÷ 2000: the seizure and the cleared debt are not the holder's.
  close(claimed.gain, -2);
  close(owed.gain, -2);
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

test("each market's debt side converts at its own feed: pETH in USDp, pETH in GOLDp", () => {
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
