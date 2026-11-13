// The year a rate formula compounds over is the protocol's definition, not a
// read (rails-ops ui-jobs 671): its leaf carries `definition: true`, so the
// inspector's head counts the read leaves alone. Each case builds the receipt
// and compares the head with the marker stripped (what it read before) against
// the head as built. The head is the rule in lib/shared/prov-class.ts over the
// leaves less "block" and "tx", as components/shared/prov-inspector.tsx runs it.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const C = await import("../../lib/shared/prov-class.ts");

const leaves = (p) => (p.inputs ?? []).filter((i) => !["block", "tx"].includes(i.label.toLowerCase()));
const head = (p) => C.involvedClasses(leaves(p));
const unmarked = (p) => ({ ...p, inputs: (p.inputs ?? []).map(({ definition: _d, ...i }) => i) });

/** Asserts the head before the marker and after it, and that the constant leaf is kept. */
function heads(p, label, before, after, msg) {
  assert.deepEqual(head(unmarked(p)), before, `${msg}: before`);
  assert.deepEqual(head(p), after, `${msg}: after`);
  assert.ok(
    p.inputs.some((i) => i.label === label && i.definition),
    `${msg}: "${label}" kept, marked`,
  );
}

test("Aave V4: each borrow APY receipt's head drops Oracle, the year being the hub's", async () => {
  const P = await import("../../lib/aave-v4/position-provenance.ts");
  const M = await import("../../lib/aave-v4/market-provenance.ts");
  const Y = "seconds a year";
  heads(P.BORROW_RATE_PROV, Y, ["emitted", "oracle"], ["emitted"], "card Borrow APY");
  heads(
    P.heldDebtRateProv({ asset: "WETH", blockNumber: 24_000_000 }, 0.0215),
    Y,
    ["emitted", "oracle"],
    ["emitted"],
    "event held-debt Borrow APY",
  );
  heads(
    M.storedRateProv("borrow APY", "WETH on Core", { chainId: 1, block: 24_000_000 }, 0.0215),
    Y,
    ["oracle", "indexed"],
    ["indexed"],
    "stored Borrow APY, Ethereum",
  );
  heads(
    M.storedRateProv("borrow APY", "USDC on Arc", { chainId: 5042, block: 1_000 }, 0.04),
    Y,
    ["state", "oracle"],
    ["state"],
    "Borrow APY read on visit, Arc",
  );
  heads(
    M.historyRateProv("WETH", "Core", {
      date: "2026-11-12",
      closeBlock: 24_000_000,
      update: { block: 23_999_990 },
      drawnApr: 0.0215,
    }),
    Y,
    ["oracle", "indexed"],
    ["indexed"],
    "rate history",
  );
  const f = {
    chainId: 1,
    block: 24_000_000,
    hubAddress: "0x0000000000000000000000000000000000000001",
    drawnApr: 0.0215,
    raw: { hub: { drawnRateRay: "21536617015515426407969040" } },
  };
  heads(
    M.drawnRateProv(f, { symbol: "WETH", hub: "Core" }),
    Y,
    ["state", "oracle"],
    ["state"],
    "reserve page Borrow APY",
  );
});

test("SparkLend: the Borrow and Supply APY receipts' heads drop Oracle, the year being the Pool's", async () => {
  const S = await import("../../lib/spark/position-provenance.ts");
  const V = await import("../../lib/shared/aave-market-provenance.ts");
  const Y = "seconds a year";
  heads(S.borrowApyProv("USDS", 0.05), Y, ["state", "oracle"], ["state"], "position Borrow APY");
  heads(S.borrowApyProv(undefined, null), Y, ["state", "oracle"], ["state"], "position Borrow APY, rate unread");
  const spark = V.aaveMarketVocab("spark", { blockNumber: 24_000_000 });
  for (const side of ["borrow", "supply"])
    heads(spark.reserveRateProv(side, "USDS", 0.05), Y, ["state", "oracle"], ["state"], `market ${side} APY`);
  // Aave V3 and Seamless state the stored rate as an APR: no year leaf, unchanged.
  for (const fam of ["aave-v3", "seamless"]) {
    const p = V.aaveMarketVocab(fam, { blockNumber: 24_000_000 }).reserveRateProv("borrow", "USDC", 0.05);
    assert.equal(p.inputs, undefined, `${fam}: APR receipt has no leaves`);
  }
  // lib/shared/aave-reserve-reads-provenance.ts imports a value from a .tsx, which
  // the runner cannot load: its APY history receipt's two leaves, copied by hand.
  heads(
    {
      inputs: [
        { label: "variableBorrowRate", kind: "chain", pclass: "emitted" },
        { label: Y, value: "31,536,000", kind: "chain-derived", definition: true },
      ],
    },
    Y,
    ["emitted", "oracle"],
    ["emitted"],
    "reserve history APY (hand-built copy)",
  );
});

test("Morpho: the market Borrow APY's year loses its dot; the head stays State", async () => {
  const M = await import("../../lib/morpho/markets-provenance.ts");
  const c = { chainId: 1, blockNumber: 24_000_000, marketId: "0x64d6", loanSymbol: "USDC" };
  // The leaf was classed State like the rate it compounds, so the head does not move.
  heads(M.morphoBorrowRateProv(c, 0.0498), "seconds per year", ["state"], ["state"], "market Borrow APY");
  heads(M.morphoBorrowRateProv(c, null), "seconds per year", ["state"], ["state"], "market Borrow APY, unread");
});

test("Euler: the Borrow APY's head drops Indexed, the year being the docs'", async () => {
  const E = await import("../../lib/euler/provenance.ts");
  const c = {
    p: { borrowApyNow: 1.0995 },
    r: {
      head: { block: 56_710_281, time: 1_763_000_000 },
      vault: {
        symbol: "eUSDC-102",
        address: "0xeef57677c2fc1a930eed234e3545e750c88f6743",
        interestRate: "23503239886949630103",
      },
    },
  };
  heads(
    E.vaultProv("borrowApy", c),
    "Seconds in a year: 365.2425 × 86,400, an average Gregorian year in Euler's docs",
    ["state", "indexed"],
    ["state"],
    "vault Borrow APY",
  );
});

test("Compound V2: the APY receipts' heads drop Off-chain, the docs' formula constants being definitions", async () => {
  const E = await import("../../lib/compound-v2/event-provenance.ts");
  const M = await import("../../lib/comptroller/markets-provenance.ts");
  const F = await import("../../lib/comptroller/families.ts");
  const read = { perBlockRaw: "91459164853", modelBlocksPerYear: 2_102_400 };
  heads(
    E.borrowRateProv("DAI", read),
    "blocks a day, days a year",
    ["state", "offchain"],
    ["state"],
    "position Borrow APY",
  );
  const c = { blockNumber: 24_000_000, symbol: "DAI", market: "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643" };
  const v2 = F.vocabFamily(F.COMPTROLLER_FAMILIES["compound-v2"]);
  for (const side of ["borrow", "supply"])
    heads(
      M.cmRateProv(v2, c, side, { perPeriodRaw: "91459164853" }),
      "compounding steps a year",
      ["state", "offchain"],
      ["state"],
      `market ${side} APY`,
    );
  // Moonwell's every-second compounding is Rails's form: still counted.
  for (const key of ["moonwell", "moonwell-base"]) {
    const p = M.cmRateProv(F.vocabFamily(F.COMPTROLLER_FAMILIES[key]), c, "borrow", { perPeriodRaw: "1000000000" });
    assert.deepEqual(head(p), ["state", "offchain"], `${key}: unchanged`);
    assert.ok(!p.inputs.some((i) => i.definition), `${key}: no definition leaf`);
  }
});
