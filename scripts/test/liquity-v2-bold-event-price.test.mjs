// lib/liquity-v2/bold-event-price.ts (rails-ops ui-jobs 757): the line a Liquity
// V2 event's receipt, a redemption's price row and its Markdown L2 state for
// BOLD's market price at the event, from the timeline row's boldPrice.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const { boldEventLine, boldEventProv, boldPriceFigure } = await import("../../lib/liquity-v2/bold-event-price.ts");
const { faceUsdProv } = await import("../../lib/shared/flows-timeline-provenance.ts");
const { liquityEventProse } = await import("../../lib/liquity/event-prose.ts");

// last_price(0) = 1e36 / 0.998842e18 puts BOLD at $0.998842.
const BP = {
  usd: 0.998842,
  emaUsd: 0.99881,
  block: 26441929,
  source: "curve-usdc-bold",
  pool: "0xefc6516323fbd28e80b85a497b65a86243a54b3e",
  tokenIndex: 0,
  quoteSymbol: "USDC",
  lastPriceRaw: "1001159343279197631",
  emaRaw: "1001191418225163262",
};
const SAME = "BOLD at $0.998842 at this block";
const OLDER = "BOLD at $0.998842 at block 26,441,929";

test("the line at the event's block", () => {
  const l = boldEventLine(BP, 26441929);
  assert.equal(l.text, SAME);
  assert.equal(`${l.lead} ${l.price} ${l.rest}`, l.text);
});

test("a read older than the event names its block", () => {
  assert.equal(boldEventLine(BP, 26442100).text, OLDER);
});

test("a row with no boldPrice states no line", () => {
  assert.equal(boldEventLine(undefined, 26441929), null);
  assert.equal(boldEventLine(null), null);
  assert.equal(boldEventLine({ ...BP, usd: 0 }, 26441929), null);
  assert.equal(boldEventProv({ ...BP, usd: Number.NaN }), undefined);
  assert.equal(boldPriceFigure(undefined, 26441929, { redemption: true, debtCell: true }), null);
  const face = faceUsdProv("BOLD", "1,000.00", "after", null);
  assert.ok(!face.summary.includes("BOLD at"));
  assert.ok(!face.summary.includes("Debt stays"));
});

test("the debt's $1-face receipt states the face once, then the line", () => {
  const face = faceUsdProv("BOLD", "1,000.00", "after", SAME);
  assert.ok(face.summary.endsWith(` Debt stays at its $1 face. ${SAME}.`), face.summary);
  assert.equal(face.summary.match(/Debt stays/g).length, 1);
  assert.equal(face.formula, "debt × $1");
});

test("the line's receipt names the pool, the call and the block", () => {
  const p = boldEventProv(BP, 26441929);
  assert.equal(
    p.summary,
    "BOLD at $0.998842 at this block, from the Curve BOLD/USDC pool's last_price(0), with USDC at $1. The pool's EMA, price_oracle(0), put BOLD at $0.99881. Debt stays at its $1 face.",
  );
  assert.equal(p.contract.address, BP.pool);
  assert.equal(p.source.block, BP.block);
  assert.equal(p.inputs[0].value, BP.lastPriceRaw);
  assert.equal(p.inputs[0].note, "read at block 26,441,929");
  assert.match(p.via, /^GET \/api\/trove\/:collateralType\/:troveId\/timeline · boldPrice/);
  assert.ok(boldEventProv(BP, 26442100).summary.startsWith(`${OLDER}, from`));
});

test("the price row's figure: on a redemption and on a row with no Debt cell", () => {
  const f = boldPriceFigure(BP, 26442100, { redemption: true, debtCell: true });
  assert.equal(f.key, "bold-price");
  assert.equal(`${f.label} ${f.text} ${f.unit}`, OLDER);
  assert.ok(f.info.summary.startsWith(OLDER));
  assert.equal(boldPriceFigure(BP, 26441929, { redemption: false, debtCell: true }), null);
  const g = boldPriceFigure(BP, 26441929, { redemption: false, debtCell: false });
  assert.equal(`${g.label} ${g.text} ${g.unit}`, SAME);
});

// A redemption as the timeline serves it, trimmed to what the L2 reads.
const state = (debt, coll) => ({
  debt,
  coll,
  stake: coll,
  annualInterestRate: 1,
  collateralRatio: 200,
  collateralInUsd: coll * 2756,
});
const ctxOf = (operation, boldPrice) => ({
  eventType: operation === "redeemCollateral" ? "redemption" : "trove",
  operation,
  troveId: "1",
  collateralType: "rETH",
  collateralPrice: 2756.27,
  protocolName: "liquity-v2",
  assetType: "BOLD",
  stateBefore: state(14279.65, 10.4132),
  stateAfter: state(13734.75, 10.2176),
  isInBatch: false,
  isZombieTrove: false,
  blockGrouping: { isGrouped: false, sameBlockCount: 1, sameBlockIndex: 1 },
  troveOperation: {
    annualInterestRate: 1,
    debtIncreaseFromRedist: 0,
    debtIncreaseFromUpfrontFee: 0,
    debtChangeFromOperation: -544.9,
    collIncreaseFromRedist: 0,
    collChangeFromOperation: -0.1956,
  },
  ...(operation === "redeemCollateral"
    ? { redemption: { attemptedBoldAmount: 544.9, actualBoldAmount: 544.9, ETHSent: 0.1956, price: 2756.27 } }
    : {}),
  ...(boldPrice ? { boldPrice } : {}),
});
const l2Lines = (operation, boldPrice, blockNumber) => {
  const ctx = ctxOf(operation, boldPrice);
  const event = {
    id: "0xabc_1",
    txHash: "0xabc",
    blockNumber,
    timestamp: 1777861235,
    wallet: "0xaf87a69642e9c66cae994e2a85f26498a76aa30e",
    protocol: "liquity-v2-troves",
    actionType: operation,
    flows: [],
    context: { protocol: "liquity-v2-troves", data: ctx },
  };
  return liquityEventProse({ ctx, event, currentEvent: event }).L2.lines;
};

test("a redemption's L2 states the line at its block, or names the read's block", () => {
  assert.ok(l2Lines("redeemCollateral", BP, 26441929).includes(SAME));
  const older = l2Lines("redeemCollateral", BP, 26442100);
  assert.ok(older.includes(OLDER), JSON.stringify(older));
  assert.ok(!l2Lines("redeemCollateral", undefined, 26441929).some((l) => l.startsWith("BOLD at")));
});

test("an adjustment's L2 states no line", () => {
  assert.ok(!l2Lines("adjustTrove", BP, 26441929).some((l) => l.startsWith("BOLD at")));
});
