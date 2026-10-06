// Liquity V1: the figures that state what happened to the owner.
//
//   A. An open states the LUSD the owner received. The open row's LUSD flow
//      (the CSV "Token Flows" cell and the T1 figure) is the debt added less
//      the borrowing fee and the 200 LUSD reserve, with the fee carried on the
//      row (mig 375's borrowing_fee). Fixture: 0x6c26…9a0f, opened with a
//      2,009 LUSD debt for 1,800 received.
//   B. A liquidation of several Troves in one transaction states this Trove's
//      share. The receipt read replays each TroveLiquidated in order and keeps
//      the share only when it reconciles with the transaction's logs; a
//      2-Trove Normal Mode batch and a 90-Trove capped Recovery Mode batch.
//   C. A Trove a redemption closed says so on the listing: the positions API
//      marks the life closedByRedemption, and an owner close stays unmarked.
//   D. Liquity V2's Open help says the upfront fee is added to the debt.
//
// A and C need the api deployed with mig 375 and the listing field; before
// that they FAIL naming the missing field.
//
// Usage (requests to BASE carry the Vercel bypass header through lib/host.mjs):
//   BASE=https://dev.rails.finance node --env-file=.env.local scripts/verify/verify-liquity-v1-owner-figures.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { BASE, hostFetch } from "./lib/host.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  console.log(cond ? `    ok: ${msg}` : `    FAIL: ${msg}`);
  if (!cond) failures++;
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

async function json(path) {
  const r = await hostFetch(BASE + path);
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
}

// ── A. the open's LUSD received ────────────────────────────────────────────
console.log("# A. open row states the LUSD received");
{
  const wallet = "0x6c2693f5a936f37ed03cfa8465bf2d8beff19a0f";
  const tl = await json(`/api/liquity-v1/timeline?wallet=${wallet}`);
  const open = (tl.events ?? []).find((e) => e.context?.data?.eventType === "openTrove");
  assert(open != null, "the fixture's open row is served");
  const d = open?.context?.data ?? {};
  if (d.borrowingFee == null) {
    assert(false, "the open row carries borrowingFee (the api has not served mig 375's borrowing_fee yet)");
  } else {
    const debtAdded = Number(d.debtDelta);
    const fee = Number(d.borrowingFee);
    const received = Number(d.lusdReceived);
    const flow = (open.flows ?? []).find((f) => f.tokenSymbol === "LUSD");
    assert(fee > 0, `the fee is positive (${fee})`);
    assert(near(received, debtAdded - fee - 200), `received ${received} = debt added ${debtAdded} − fee ${fee} − 200`);
    assert(near(received, 1800, 1e-9), `received is the 1,800 LUSD the owner was minted (${received})`);
    assert(
      flow != null && flow.direction === "in" && near(flow.amountFormatted, received),
      `the LUSD flow (CSV Token Flows) is the received figure, inbound (${flow?.amountFormatted})`,
    );
  }
}

// ── B. a batch liquidation states this Trove's share ───────────────────────
console.log("# B. batch liquidation states this Trove's share");
for (const fx of [
  {
    name: "2-Trove Normal Mode batch",
    tx: "0x5117603fbb635f6c0733b648bfa87ab440e76b3e822c69bea148a8aa24e5ab64",
    wallet: "0x7cd7d584946cd2fd169b3317eaf1ab676a7170dc",
    troves: 2,
    recovery: false,
  },
  {
    name: "90-Trove capped Recovery Mode batch",
    tx: "0xcd1cbb5ff57a55e8cf0c9a0f3e06fb7430962da53221cc95a8d84b7974655633",
    wallet: "0x06454b31e7a1861765b08d7ed579e603b5b97caa",
    troves: 90,
    recovery: true,
  },
]) {
  const read = await json(`/api/chain/liquity-v1/event?tx=${fx.tx}&wallet=${fx.wallet}`);
  const l = read.liquidation;
  assert(l != null, `${fx.name}: the read carries the liquidation`);
  if (!l) continue;
  assert(l.trovesInTx === fx.troves, `${fx.name}: ${l.trovesInTx} Troves in the transaction`);
  assert(l.share === "trove", `${fx.name}: the figures are this Trove's share (share=${l.share})`);
  assert(l.recoveryMode === fx.recovery, `${fx.name}: recovery mode ${l.recoveryMode}`);
  assert(
    Number(l.liquidatorLusd) === 200,
    `${fx.name}: the liquidator's LUSD is this Trove's 200 (${l.liquidatorLusd})`,
  );
  // This Trove's debt, from its own timeline row: the share cleared all of
  // it (pending redistribution rewards ride on top of the stored debt, so the
  // share is at least the row's debt before).
  const tl = await json(`/api/liquity-v1/timeline?wallet=${fx.wallet}`);
  const row = (tl.events ?? []).find(
    (e) => e.id?.toLowerCase().startsWith(fx.tx) && e.context?.data?.eventType === "liquidation",
  );
  const debt = Number(row?.context?.data?.debtBefore);
  const cleared = Number(l.stabilityPoolDebt) + Number(l.redistributedDebt);
  assert(
    row != null && cleared >= debt - 1e-9 && cleared <= debt * 1.05,
    `${fx.name}: the share clears this Trove's debt (${cleared} against ${debt})`,
  );
}

// ── C. the listing names a redemption close ────────────────────────────────
console.log("# C. listing marks a life closed by redemption");
{
  const redeemed = await json(`/api/liquity-v1/positions?wallet=0x017eff261795b59a61590d6a419ff13d466883aa&limit=5`);
  const ownerClosed = await json(`/api/liquity-v1/positions?wallet=0x6c2693f5a936f37ed03cfa8465bf2d8beff19a0f&limit=5`);
  const rowsOf = (j) => j.rows ?? j.data ?? [];
  const r = rowsOf(redeemed).find((x) => x.epoch === 1);
  const o = rowsOf(ownerClosed)[0];
  assert(r != null && o != null, "both fixture lives are listed");
  if (r && o) {
    assert(
      r.status === "closed" && r.closedByRedemption === true,
      "0x017e…83aa life 1 is closed by redemption (false until the api serves closedByRedemption)",
    );
    assert(o.status === "closed" && o.closedByRedemption === false, "0x6c26…9a0f, closed by its owner, is not");
  }
}

// ── D. Liquity V2's upfront fee copy ───────────────────────────────────────
console.log("# D. Liquity V2 upfront fee is added to the debt");
{
  // The V2 event modals live with the rest of an event's strings.
  const src = readFileSync(join(ROOT, "lib/liquity/event-templates.ts"), "utf8");
  assert(!/deducted from the borrowed amount/.test(src), "no copy says the upfront fee is deducted");
  assert(
    /7 days of average interest, added to the Trove's debt/.test(src),
    "the Open help says it is added to the debt",
  );
}

console.log(`\n${checks - failures}/${checks} passed`);
if (checks === 0) process.exit(2);
process.exit(failures ? 1 : 0);
