// Scan fork troves for the specimens the header-richness change targets, and
// validate the SERVER-DERIVED actionLabel (which is also the CSV Action column)
// against each event's own deltas. Run against the dev server.
//
// This script reads the timeline ROUTE, which is the wire side of
// `lib/shared/timeline-wire.ts`: `actionLabel` no longer rides the row, it is
// dictionary-encoded — the distinct labels sit in the envelope's `al` table and
// each row carries an index in its own `al`. Reading `e.actionLabel` off a wire
// body therefore yields `undefined` for every row, and before this was fixed
// every comparison below was `undefined` against a real verb: 1,785 "mismatches"
// that said nothing about the labels and everything about the reader.
//
// The decode below is the same rule `fromWireEvents` applies at the fetch
// boundary — index into the envelope's own table, no label re-derived here —
// and `decodedViaDictionary` counts the rows it actually resolved that way. A
// future wire change that drops the table would otherwise leave this file
// silently comparing one absence to another again, so a run that decoded
// nothing through the dictionary is a failure, not a pass.
const BASE = process.env.BASE ?? "http://localhost:3000";

async function j(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const body = await r.json();
        // The troves endpoint is intermittently flaky (success:false); retry.
        if (body && body.success === false) {
          last = new Error("success:false");
        } else {
          return body;
        }
      } else {
        last = new Error(`${r.status}`);
      }
    } catch (e) {
      last = e;
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw last ?? new Error("failed " + url);
}

const DUST = 0.01; // display epsilon (matches FORK_DEBT_DUST at 18-dec)

// Expected verb from the deltas — the independent oracle the actionLabel must match.
function expectAdjustLabel(collDelta, debtDelta) {
  const parts = [];
  if (collDelta > 0) parts.push("Add");
  else if (collDelta < 0) parts.push("Withdraw");
  if (Math.abs(debtDelta) >= DUST) parts.push(debtDelta > 0 ? "Borrow" : "Repay");
  return parts.length ? parts.join(" + ") : null;
}

// Rows whose label came back through the envelope's dictionary. It is the
// positive control: every assertion below reads a label, so a run where this
// stays 0 compared nothing.
let decodedViaDictionary = 0;

/** The label for one wire row, by the rule `fromWireEvents` uses: the row's
 *  `al` is an index into the envelope's `al` table. A row that carried no
 *  index carried no label — the transform never emitted one — so that reads
 *  back as `undefined`, exactly as it does on a page. A body that predates the
 *  wire format has no envelope and still carries its own `actionLabel`; it is
 *  read verbatim and does NOT count towards the control. */
function actionLabelOf(event, envelope) {
  if (envelope && Array.isArray(envelope.al) && typeof event.al === "number") {
    decodedViaDictionary++;
    return envelope.al[event.al];
  }
  return event.actionLabel;
}

const RATE_PILL_EVENTS = new Set([
  "openTrove",
  "openTroveAndJoinBatch",
  "adjustTroveInterestRate",
  "setInterestBatchManager",
  "removeFromBatch",
]);

async function scan(proto) {
  const troves = await j(`${BASE}/api/${proto}/troves?limit=250`);
  const rows = troves.data ?? [];
  const found = {
    adjustBothAxes: null,
    adjustRateUnbatched: null,
    adjustRateBatched: null,
    delegatePill: null, // any batched rate-pill event → the pink delegate pill specimen
    redemptionRun: null,
  };
  const mismatches = [];
  let scanned = 0;
  let validated = 0; // actionLabels actually compared — the count that must be > 0
  for (const t of rows) {
    if (Object.values(found).every(Boolean)) break;
    const ct = t.collateralType;
    const id = t.id ?? t.troveId;
    let tl;
    try {
      tl = await j(`${BASE}/api/${proto}/${encodeURIComponent(ct)}/${encodeURIComponent(id)}/timeline`);
    } catch {
      continue;
    }
    scanned++;
    const evs = tl.events ?? [];
    const env = tl.wire;
    let redRun = 0;
    for (const e of evs) {
      const actionLabel = actionLabelOf(e, env);
      const d = e.context?.data ?? {};
      const cd = Number(d.collDelta) || 0;
      const dd = Number(d.debtDelta) || 0;
      // Validate adjustTrove verb ↔ deltas (skip no-change bucket).
      if (d.eventType === "adjustTrove" && e.actionType !== "adjustTrove_noChange") {
        const exp = expectAdjustLabel(cd, dd);
        if (exp) validated++;
        if (exp && actionLabel !== exp)
          mismatches.push(
            `${proto} ${ct}/${String(id).slice(0, 10)} adjustTrove: label="${actionLabel}" expected="${exp}" (cd=${cd}, dd=${dd})`,
          );
        if (exp && exp.includes(" + ") && !found.adjustBothAxes)
          found.adjustBothAxes = { ct, id, label: actionLabel, cd, dd };
      }
      if (d.eventType === "adjustTroveInterestRate") {
        validated++;
        if (d.isBatched) {
          if (actionLabel !== "Delegate rate change")
            mismatches.push(
              `${proto} ${ct}/${String(id).slice(0, 10)} batched rate: label="${actionLabel}" expected="Delegate rate change"`,
            );
          if (!found.adjustRateBatched) found.adjustRateBatched = { ct, id, label: actionLabel, rate: d.interestRate };
        } else {
          if (!/^(Increase|Decrease|Adjust) interest rate$/.test(actionLabel))
            mismatches.push(`${proto} ${ct}/${String(id).slice(0, 10)} unbatched rate: label="${actionLabel}"`);
          if (!found.adjustRateUnbatched && /^(Increase|Decrease) interest rate$/.test(actionLabel))
            found.adjustRateUnbatched = { ct, id, label: actionLabel, rate: d.interestRate, before: d.rateBefore };
        }
      }
      // The pink delegate pill: any rate-pill event on a batched trove.
      if (d.isBatched && RATE_PILL_EVENTS.has(d.eventType) && d.interestRate != null && !found.delegatePill)
        found.delegatePill = { ct, id, eventType: d.eventType, label: actionLabel, rate: d.interestRate };

      if (d.eventType === "redeemCollateral") redRun++;
      else redRun = 0;
      if (redRun >= 4 && !found.redemptionRun) found.redemptionRun = { ct, id, count: redRun };
    }
  }
  return { found, mismatches, scanned, validated };
}

let totalValidated = 0;
for (const proto of ["ebisu", "asymmetry"]) {
  const { found, mismatches, scanned, validated } = await scan(proto);
  totalValidated += validated;
  console.log(`\n=== ${proto} (scanned ${scanned} troves · ${validated} actionLabels validated) ===`);
  for (const [k, v] of Object.entries(found)) console.log(`  ${k}: ${v ? JSON.stringify(v) : "NOT FOUND in sample"}`);
  if (mismatches.length) {
    console.log(`  ❌ ${mismatches.length} LABEL MISMATCHES:`);
    mismatches.slice(0, 8).forEach((m) => console.log("    " + m));
    process.exitCode = 1;
  } else {
    console.log("  ✅ every derived actionLabel matched its deltas");
  }
}

// A scan that validated nothing (empty/failed troves+timeline API) proved
// nothing — "no mismatches" would otherwise report green vacuously. Require
// that at least one actionLabel was actually compared against its deltas.
if (totalValidated === 0) {
  console.log("\n❌ scan validated ZERO actionLabels — nothing was checked (empty or failed API?)");
  process.exitCode = 1;
} else {
  console.log(`\nvalidated ${totalValidated} actionLabels across both forks`);
}

// The dictionary control. Every comparison above reads a label through the
// envelope's table; if the table were gone, each one would compare `undefined`
// against `undefined` on the rate branches and read as a pass. Both forks are
// deep enough to put thousands of rows through the decode, so a run that
// resolved none of them has lost the wire format, not found a clean tree.
if (decodedViaDictionary === 0) {
  console.log(
    "\n❌ NO EVIDENCE — not one actionLabel came back through the wire envelope's label table." +
      " The timeline route either stopped emitting `wire.al` or stopped indexing rows into it;" +
      " re-read lib/shared/timeline-wire.ts before trusting anything above.",
  );
  process.exitCode = 1;
} else {
  console.log(`decoded ${decodedViaDictionary} labels through the wire envelope's dictionary (the control)`);
}
