// The Liquity V1 holder strip across Troves and the Stability Pool deposit
// (rails-ops TO-DO-stability-pool-deposits §1b), and the share card's status
// word counting the deposit. The adapter imports through `@/`, resolved here
// as compound-arbitrum-holder-strip.test.mjs does.
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

const { liquityV1HolderStrip } = await import(ROOT + "lib/liquity-v1/holder-strip.ts");
const { holderCardModel } = await import(ROOT + "lib/share/holder-card.ts");

const E18 = "000000000000000000";
const trove = (epoch, status, collateral, debt) => ({ wallet: "0xw", epoch, status, collateral, debt });
const deposit = (status, lusd) => ({
  depositor: "0xw",
  status,
  deposit_raw: status === "open" ? `${lusd}${E18}` : "0",
});

test("one open Trove, one liquidated and an open deposit: counts across kinds, three legs", () => {
  const s = liquityV1HolderStrip(
    { rows: [trove(2, "open", 4, 2000), trove(1, "liquidated", 0, 0)], total: 2 },
    { rows: [deposit("open", 5000)], total: 1 },
    "0xw",
  );
  assert.equal(s.countsLine, "This wallet holds 1 open Trove and a Stability Pool deposit; 1 Trove was liquidated.");
  assert.deepEqual(s.counts, { open: 1, closed: 0, liquidated: 1 });
  assert.deepEqual(s.kinds, [{ id: "deposit", noun: ["deposit", "deposits"], open: 1, closed: 0 }]);
  assert.equal(s.positions, 3);
  assert.deepEqual(
    s.legs.map((l) => l.id),
    ["collateral", "debt", "deposit"],
  );
  // The deposit is its own leg in LUSD; the debt is not added to it.
  assert.equal(s.legs[1].figure.amount, 2000);
  assert.equal(s.legs[2].figure.amount, 5000);
  assert.equal(s.legs[2].approx, true);
});

test("a closed deposit and closed Troves are said as closed", () => {
  const s = liquityV1HolderStrip(
    { rows: [trove(1, "closed", 0, 0), trove(2, "closed", 0, 0)], total: 2 },
    { rows: [deposit("closed")], total: 1 },
  );
  assert.equal(
    s.countsLine,
    "This wallet holds no open Troves or deposit and has closed 2 Troves and its Stability Pool deposit.",
  );
  assert.equal(s.legs.length, 0);
});

test("Troves past one page: the count, no totals", () => {
  const s = liquityV1HolderStrip({ rows: [trove(1, "open", 1, 1)], total: 25 }, { rows: [], total: 0 });
  assert.equal(s.truncated, true);
  assert.equal(s.legs.length, 0);
  assert.equal(s.countsLine, "This wallet holds 25 Troves.");
});

test("the share card's status word names the deposit and keeps three stats", () => {
  const s = liquityV1HolderStrip(
    { rows: [trove(2, "open", 4, 2000), trove(1, "liquidated", 0, 0)], total: 2 },
    { rows: [deposit("open", 5000)], total: 1 },
  );
  const card = holderCardModel(s, { session: "liquity-v1", subject: "0xw", total: 3, plural: "Troves" });
  assert.equal(card.status, "1 open · 1 liquidated · 1 deposit");
  assert.deepEqual(
    card.stats.map((x) => x.label),
    ["Total collateral", "Total debt", "Stability Pool deposit"],
  );
});
