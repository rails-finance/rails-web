// The lending families' event-sheet dollar cells (lib/shared/sheet-usd-rows.ts,
// rails-ops ui-jobs 743).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!existsSync(fileURLToPath(url)) || statSync(fileURLToPath(url)).isDirectory()) {
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

// The lending families' event-sheet dollar cells (ui-jobs 743): each figure is
// its rows' cents, each price named with its block; a market with no price
// draws "—" and names it; Market move is the difference of shown sums.
const { amountsUsd, marketMoveUsd, sheetUsd } = await import(ROOT + "lib/shared/sheet-usd-rows.ts");
const { shownUsd, centsOf } = await import(ROOT + "lib/shared/shown-usd.ts");

const num = (t) => Number(String(t).replace(/[^0-9.]/g, ""));
const o = { amountNote: "n", via: "v" };
const wbtc = {
  symbol: "WBTC",
  amount: 1.2345678,
  price: 98_765.43218765,
  block: 23_000_001,
  priceNote: "the oracle at block 23,000,001",
};
const usdc = {
  symbol: "USDC",
  amount: 2500.5,
  price: 0.99984,
  block: 23_000_002,
  priceNote: "the oracle at block 23,000,002",
};

test("a side's total is its markets' shown products summed, a 7-decimal amount at a high price among them", () => {
  const c = amountsUsd("Collateral after this event, in USD", [wbtc, usdc], o);
  const want = centsOf(shownUsd(wbtc.amount, wbtc.price) + shownUsd(usdc.amount, usdc.price));
  assert.equal(c.usd, want);
  assert.equal(c.text, sheetUsd(want));
  // The rows multiply out to the figure.
  const rows = new Map(c.info.inputs.map((r) => [r.label, r]));
  let cents = 0;
  for (const s of ["WBTC", "USDC"])
    cents += Math.round(num(rows.get(`${s} amount`).value) * num(rows.get(`${s} price`).value) * 100);
  assert.equal(cents / 100, want);
  assert.equal(
    rows.get("USDC price").value,
    "$0.99984",
    "a price below $1 to six significant figures, never a float's tail",
  );
  for (const s of ["WBTC", "USDC"]) assert.match(rows.get(`${s} price`).note, /block 23,000,00[12]/);
});

test("a market with no price draws no figure and names it; no partial sum", () => {
  const c = amountsUsd("Collateral after this event, in USD", [wbtc, { ...usdc, price: null }], o);
  assert.equal(c.usd, null);
  assert.equal(c.text, "—");
  assert.match(c.info.summary, /USDC has no price at its block/);
  const move = marketMoveUsd("Market move", c, amountsUsd("Last", [wbtc], o), null);
  assert.equal(move.text, "—");
});

test("Market move is the difference of the shown sums, to the cent", () => {
  const before = amountsUsd("Before", [wbtc], o);
  const last = amountsUsd("Last", [{ ...wbtc, price: 90_000.5 }], o);
  const interest = amountsUsd("Interest", [{ ...wbtc, amount: 0.0000123 }], o);
  const m = marketMoveUsd("Market move", before, last, interest);
  assert.equal(m.usd, centsOf(before.usd - last.usd - interest.usd));
  assert.equal(m.info.inputs.at(-1).label, "difference");
});

test("a group's Market move is after less before, the moves and the interest, each a shown sum; a cell carries its cents", async () => {
  const { groupMoveUsd, cellOf } = await import(ROOT + "lib/shared/sheet-usd-rows.ts");
  const after = amountsUsd("After", [{ ...wbtc, price: 99_000.5 }], o);
  const before = amountsUsd("Before", [{ ...wbtc, amount: 1 }], o);
  const moved = amountsUsd("Moved", [{ ...wbtc, amount: 0.2345678 }], o);
  const interest = amountsUsd("Interest", [{ ...wbtc, amount: 0.0000001 }], o);
  const m = groupMoveUsd(after, before, moved, interest);
  assert.equal(m.usd, centsOf(after.usd - before.usd - moved.usd - interest.usd));
  assert.deepEqual(
    m.info.inputs.map((r) => r.label),
    ["after these events", "before the group", "the moves", "interest", "difference"],
  );
  assert.equal(cellOf(after).cents, after.usd);
  assert.equal(cellOf(amountsUsd("X", [{ ...usdc, price: null }], o)).cents, undefined, "no cents without a figure");
});
