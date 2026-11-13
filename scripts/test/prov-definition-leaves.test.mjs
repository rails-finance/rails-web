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
