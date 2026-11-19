// The Polaris and Liquity V2 holder strips with Troves/CDPs the wallet passed
// on (ui-jobs 705, 715): truncation reads the answer's total, moved ones in;
// the counts and the held count leave them out. The adapters import through
// `@/`, resolved here as compound-arbitrum-holder-strip.test.mjs does.
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

const { polarisHolderStrip } = await import(ROOT + "lib/polaris/holder-strip.ts");
const { liquityV2HolderStrip } = await import(ROOT + "lib/liquity-v2/holder-strip.ts");

const row = (cdpId, status, moved = false) => ({
  market: "usdp",
  cdpId,
  status,
  coll: 1,
  debt: 1000,
  stableSymbol: "USDp",
  collRaw: null,
  debtRaw: null,
  peakColl: 1,
  peakDebt: 1000,
  owner: "0x1",
  liquidated: status === "liquidated",
  eventCount: 1,
  liqCount: 0,
  transferCount: 0,
  lastTs: 0,
  lastBlock: 0,
  ...(moved ? { formerHold: { movedTo: "0x2", movedAt: 1 } } : {}),
});
const board = {
  blockNumber: 1,
  chainStale: false,
  markets: [
    {
      market: "usdp",
      mcr: 1.15,
      defensiveMcr: 1.5,
      defensiveMode: false,
      interestRate: 0.03,
      price: { pethInDebt: 6000, pethUsd: 6000, curve: 2, ethUsd: 3000, xauUsd: null },
    },
  ],
};
const trove = (id, moved = false) => ({
  id,
  collateralType: "WETH",
  status: "open",
  isZombie: false,
  collateral: { amount: 1, amountRaw: "0", valueUsd: 0, symbol: "WETH", peakAmount: 1, peakAmountRaw: "0" },
  debt: { current: 1000, currentRaw: "0", peak: 1000, peakRaw: "0" },
  metrics: { collateralRatio: 0, interestRate: 5 },
  activity: { createdAt: 0, lastActivityAt: 0, lifetimeDays: 0, transactionCount: 1, redemptionCount: 0 },
  batch: { isMember: false, manager: null, managementFee: 0 },
  owner: "0x1",
  lastOwner: null,
  ownerEns: null,
  ...(moved ? { formerHold: { holder: "0x1", movedTo: "0x2", movedAt: 1, movedBlock: 1, movedTx: "0x" } } : {}),
});
const prices = { weth: 2000, wsteth: 2400, reth: 2200 };

test("Polaris: 15 held and 10 moved over a page of 20 is a slice, stated as 15 held (ui-jobs 715)", () => {
  const page = [
    ...Array.from({ length: 12 }, (_, i) => row(String(i), "open")),
    ...Array.from({ length: 8 }, (_, i) => row(`m${i}`, "open", true)),
  ];
  const s = polarisHolderStrip(page, 25, board, 20, 10);
  assert.equal(s.truncated, true);
  assert.equal(s.countsLine, "This wallet holds 15 positions.");
  assert.match(s.note, /this one holds 15\./);
});

test("Polaris: a whole answer leaves the moved CDPs out of the counts", () => {
  const s = polarisHolderStrip([row("1", "open"), row("2", "closed"), row("3", "open", true)], 3, board, 20, 1);
  assert.equal(s.truncated, false);
  assert.deepEqual(s.counts, { open: 1, closed: 1, liquidated: 0 });
});

test("Liquity V2: the same truncation on the answer's total", () => {
  const page = [
    ...Array.from({ length: 12 }, (_, i) => trove(String(i))),
    ...Array.from({ length: 8 }, (_, i) => trove(`m${i}`, true)),
  ];
  const s = liquityV2HolderStrip(page, 25, prices, 20, 10);
  assert.equal(s.truncated, true);
  assert.equal(s.countsLine, "This wallet holds 15 troves.");
  const whole = liquityV2HolderStrip([trove("1"), trove("2", true)], 2, prices, 20, 1);
  assert.equal(whole.truncated, false);
  assert.equal(whole.counts.open, 1);
});

// ── ui-jobs 737: the band's receipts and its link ─────────────────────────
test("Polaris's dollar receipts say they are a testnet figure, at the board's block", () => {
  const s = polarisHolderStrip([row("1", "open"), row("2", "open")], 2, board, 20, 0, "0xabc");
  const coll = s.legs.find((l) => l.id === "collateral");
  assert.match(coll.figure.usdProv.summary, /A Sepolia testnet figure: a test dollar\./);
  assert.match(coll.figure.usdProv.summary, /at block 1/);
  // USDp's debt is a face alone: no read named, no block.
  const debt = s.legs.find((l) => l.id === "debt");
  assert.doesNotMatch(debt.figure.usdProv.summary, /read|block/);
  assert.match(debt.figure.usdProv.summary, /1 USDp is counted as \$1/);
  // The link takes the searched wallet, not a row's owner.
  assert.equal(s.wallet, "0xabc");
});

test("the link stands where every row on the page was passed on", () => {
  const s = liquityV2HolderStrip(
    [trove("a", true), trove("b", true)],
    4,
    { weth: 2000, wsteth: 2400, reth: 2200 },
    20,
    2,
    "name.eth",
  );
  assert.equal(s.wallet, "name.eth");
});
