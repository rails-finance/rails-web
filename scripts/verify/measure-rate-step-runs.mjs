// Runs of same-direction rate steps on MakerDAO and on Aave V3 + SparkLend.
// ---------------------------------------------------------------------------
// A COUNT, NOT A CHANGE. rails-ops TO-DO-ui-jobs §31 asks how often one of
// these positions holds three or more consecutive rate-step notes that all
// move the same way, before anyone decides whether those two homes adopt
// `collapseSameDirectionRateSteps` (lib/shared/market-note.ts), which Polaris
// alone calls today. Nothing here touches a page, a selector or a note: it
// reads the same routes the pages read and counts what a merge WOULD do.
//
// THE RUN RULE, RESTATED (lib/shared/market-note.ts, not imported — this is a
// plain .mjs script and that file is TypeScript, and a measurement whose rule
// came from the code it is measuring could not disagree with it):
//
//   * Consecutive notes whose `deltaPp` have the same `Math.sign` are one run.
//   * A step the other way ends the run.
//   * A touch BETWEEN two same-direction steps does not end the run — a
//     sub-threshold wobble was never a note, so it cannot break one. This is
//     why a run's members can have a gap between them, and why each gap is
//     reported below rather than assumed away.
//   * A LIVE note is never taken into a run. Live notes are therefore left out
//     here entirely: a live note is always the last note in its series, and a
//     run already ends at the end of a series, so leaving it out cannot change
//     any count on this page.
//
// THE SERIES IS THE UNIT, AND THAT IS THE FINDING TO READ FIRST FOR AAVE.
// `collapseSameDirectionRateSteps` scans ONE flat array in order. MakerDAO has
// one rate per vault (the ilk's stability fee), so its notes are one series and
// a flat scan is right. An Aave-family position is one cross-collateralised
// account holding several reserves, each with a supply and a borrow rate that
// move independently, and `aaveFamilyRateStepNotesFor` emits them interleaved —
// one stretch per (reserve, side) per touch pair. A flat scan over THAT array
// merges a USDC borrow step into a WETH supply step. So runs are counted inside
// each (reserve, side) series, and the flat-scan number is printed beside it as
// what an unguarded adoption would produce. The two differ a lot.
//
// WHERE THE NOTES COME FROM (the same routes the pages read, fetched here):
//   MakerDAO  /api/makerdao/vault/<id>/timeline  +  /api/makerdao/ilks/<ilk>/rate-log
//             The fee is not on the vault's rows: it is the ilk's last rate set
//             at or before each row. Restated from lib/makerdao/market-notes.ts,
//             including the 1e-6 pp truncation slack on the threshold — without
//             it two genuine whole-point moves on ETH-A read as 0.99999987.
//   Aave V3 + SparkLend
//             /api/<proto>/timeline  +  POST /api/<proto>/reserve-rates, the
//             pair verify-aave-family-rate-step.mjs replays, and its pinned
//             fixture (scripts/verify/fixtures/aave-family-rate-step.json,
//             psql over `aave_family_reserve_data`, 2026-09-06) counted beside
//             the live replay. The pin is a past and these wallets keep
//             trading, so the two counts are reported separately and a
//             difference between them is expected, not a failure.
//
// NOTHING HERE MAY BE VACUOUSLY GREEN. verify-event-share's `pickWorkingSubject`
// read as a search and was a first-row pick, because its predicate could not
// return false. Every selection and filter in this file therefore keeps a
// rejection counter, all of them are printed, and the run ends VACUOUS and
// non-zero if one of the three that decide the answer rejected nothing:
//   * the direction test must have BROKEN at least one run and JOINED at least
//     one pair (a test that only ever joins would report the whole corpus as
//     one long run and look like a spectacular result),
//   * the 1 pp threshold must have rejected at least one stretch,
//   * vault discovery must have rejected at least one candidate.
// Three CONTROL lines assert the run counter against hand-written series before
// any network call, so a broken counter fails on a machine with no server.
//
//   BASE=http://localhost:3000 node scripts/verify/measure-rate-step-runs.mjs
//   BASE=… node scripts/verify/measure-rate-step-runs.mjs --only maker
//   BASE=… node scripts/verify/measure-rate-step-runs.mjs --only spark --pool 0
//
// --only <text>   measure the subjects whose key contains <text> (maker, aave,
//                 spark, a vault id, a wallet, or `live` / `pinned` to take one
//                 side of the Aave family's two).
// --pool <n>      how many listed vaults to consider for MakerDAO's discovered
//                 subjects (default 60, two listings of n/2; 0 measures the
//                 three the rate-step verifier pins and nothing else).
// --keep <n>      how many discovered vaults to measure (default 5).
// --min-events <n>  the depth a discovered vault must have (default 60).
// --no-live       count the Aave family from the pinned fixture only, issuing
//                 no reserve-rates POST. The POST is a 400KB question on the
//                 deepest wallet.

import { readFileSync } from "node:fs";
import { RECENT_QS } from "./_timeline-window.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] != null ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);
const ONLY = flag("--only");
const POOL = Number(flag("--pool", "60"));
const KEEP = Number(flag("--keep", "5"));
const MIN_EVENTS = Number(flag("--min-events", "60"));
const NO_LIVE = has("--no-live");

/** The shared threshold in percentage points — lib/shared/market-note.ts's
 *  RATE_STEP_MIN_PP, restated. */
const RATE_STEP_MIN_PP = 1;
/** MakerDAO only: `duty` is a truncated per-second ray, so a whole-point move
 *  compounds back to within ~5e-7 pp of the figure governance filed, either
 *  side of it. lib/makerdao/market-notes.ts's RATE_TRUNCATION_SLACK_PP. */
const RATE_TRUNCATION_SLACK_PP = 1e-6;

/** `--only` matches a subject's own key. `--only 16745` is a vault id, so a
 *  digits-only filter reaches MakerDAO too. */
const wanted = (key) => !ONLY || key.toLowerCase().includes(ONLY.toLowerCase());
const makerWanted = () => !ONLY || /^\d+$/.test(ONLY) || "makerdao vault".includes(ONLY.toLowerCase());

const num = (n) => n.toLocaleString("en-US");
const pp = (n) =>
  `${n >= 0 ? "+" : "-"}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pp`;
const pct = (n) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

// ── What every filter threw away, so no count here can be read as a search
// that never rejected anything ────────────────────────────────────────────
const rejected = {
  evaluated: 0, // stretches put to the threshold at all (0 on a fixture-only run)
  belowThreshold: 0, // stretches under 1 pp
  sameBlock: 0, // touch pairs in one block — one moment, not a stretch
  unresolvedEnd: 0, // Aave: an end with no ReserveDataUpdated to read
  stableSide: 0, // Aave: a stable-rate borrow, whose log carries no rate
  beforeFirstSet: 0, // Maker: a row before the ilk's first observed set
  poolCandidate: 0, // discovery: a listed vault not measured
  runBroken: 0, // the direction test ended a run
  runJoined: 0, // the direction test extended one
};

// ── The run counter ───────────────────────────────────────────────────────

/**
 * One series of notes, in block order, reduced to its runs. A run is the
 * collapse's own unit: what would become one note.
 *
 * `gap` is how many blocks sit between a member's later end and the next
 * member's earlier end. A run with a gap is one the collapse would state as a
 * single stretch across ground the notes never covered — on Aave that can be a
 * reserve the position did not hold in between, which is why it is counted.
 */
function runsOf(notes, { count = true } = {}) {
  const sorted = [...notes].sort((a, b) => a.from - b.from || a.to - b.to);
  const runs = [];
  for (const note of sorted) {
    const run = runs[runs.length - 1];
    const last = run?.members[run.members.length - 1];
    if (last && Math.sign(last.deltaPp) === Math.sign(note.deltaPp)) {
      run.members.push(note);
      if (count) rejected.runJoined += 1;
    } else {
      if (last && count) rejected.runBroken += 1;
      runs.push({ members: [note] });
    }
  }
  for (const run of runs) {
    run.length = run.members.length;
    run.direction = Math.sign(run.members[0].deltaPp) >= 0 ? "up" : "down";
    run.fromBlock = run.members[0].from;
    run.toBlock = run.members[run.length - 1].to;
    run.fromRate = run.members[0].fromRate;
    run.toRate = run.members[run.length - 1].toRate;
    run.deltaPp = run.toRate - run.fromRate;
    run.gaps = run.members.slice(1).reduce((n, m, i) => n + (m.from === run.members[i].to ? 0 : 1), 0);
    run.days = spanDays(run.members[0], run.members[run.length - 1]);
    // What the merged note would SAY against what its members said. The
    // collapse states end-to-end (`last.to − first.from`), and the rate is free
    // to wander back inside a gap, so a run of three genuine rises can merge
    // into a headline smaller than any one of them — and sometimes into one
    // under the very threshold that made each member a note. The reader of that
    // single row would be told less than the three rows told them, which is the
    // opposite of what the collapse is for.
    run.largestMember = Math.max(...run.members.map((m) => Math.abs(m.deltaPp)));
    run.understates = Math.abs(run.deltaPp) < run.largestMember;
    run.underThreshold = Math.abs(run.deltaPp) < RATE_STEP_MIN_PP;
  }
  return runs;
}

/** Days between a run's two ends, when both timestamps are known. The pinned
 *  fixture keeps blocks only, so this is null on that half and the line says so
 *  rather than printing a block count converted at a guessed block time. */
function spanDays(first, last) {
  if (first.fromTs == null || last.toTs == null) return null;
  return Math.round((last.toTs - first.fromTs) / 86400);
}

/** Every measurement this script makes about one position. */
function measure(subject, notes) {
  const series = new Map();
  for (const n of notes) {
    const key = n.series;
    if (!series.has(key)) series.set(key, []);
    series.get(key).push(n);
  }
  const perSeries = [...series.entries()].map(([key, members]) => ({
    key,
    runs: runsOf(members),
    notes: members.length,
  }));
  const allRuns = perSeries.flatMap((s) => s.runs);
  const long = allRuns.filter((r) => r.length >= 3).sort((a, b) => b.length - a.length);
  // What an unguarded adoption would do: one flat scan over the page's own
  // note order, reserves and sides interleaved. Counted, never recommended.
  const flat = runsOf(
    notes.map((n, i) => ({ ...n, from: n.pageOrder ?? i, to: n.pageOrder ?? i })),
    { count: false },
  );
  return {
    subject,
    notes: notes.length,
    series: perSeries,
    runs: allRuns,
    long,
    longest: allRuns.reduce((m, r) => Math.max(m, r.length), 0),
    afterMerge: allRuns.length,
    flatAfterMerge: flat.length,
  };
}

// ── The controls: the counter, asserted before any network call ───────────

let controlFailures = 0;
function control(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) controlFailures += 1;
  console.log(`${ok ? "CONTROL PASS" : "CONTROL FAIL"}  ${name} — ${JSON.stringify(got)}`);
}
{
  const series = (deltas) =>
    deltas.map((d, i) => ({ from: i * 10, to: i * 10 + 5, deltaPp: d, fromRate: 0, toRate: d, series: "control" }));
  // `count: false` — the corpus counters below must report the corpus, not
  // these three hand-written series.
  const lengths = (deltas) => runsOf(series(deltas), { count: false }).map((r) => r.length);
  // It rejects: four alternating steps are four runs of one, never one run.
  control("alternating +,−,+,− is four runs of one", lengths([2, -2, 3, -3]), [1, 1, 1, 1]);
  // It joins: four steps the same way are one run of four.
  control("four steps up is one run of four", lengths([2, 1, 4, 1]), [4]);
  // And it does both in one series, at the right boundary.
  control("+,+,−,−,−,+ is 2, 3, 1", lengths([1, 2, -1, -2, -3, 4]), [2, 3, 1]);
}
if (controlFailures > 0) {
  console.log("\nCONTROL FAILED — the run counter is wrong, so nothing below would mean anything.");
  process.exit(1);
}

// ── Fetching ──────────────────────────────────────────────────────────────

async function api(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // The rates route passes the index's own validation error through, field and
  // all, so the body goes into the message: a bare "400" would send the next
  // reader looking at the wrong half of the question.
  if (!res.ok) throw new Error(`${res.status} ${path} — ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// ── MakerDAO ──────────────────────────────────────────────────────────────

/** A Maker event id's tail `:N` segment — the log index. */
const makerLogIndex = (id) => {
  const cut = id.lastIndexOf(":");
  return cut < 0 ? -1 : Number(id.slice(cut + 1));
};

/** The fee in force at (block, logIndex): the ilk's last set at or before it. */
function feeAt(sets, block, logIndex) {
  let cur = null;
  for (const s of sets) {
    if (s.block < block || (s.block === block && s.logIndex <= logIndex)) cur = s;
    else break;
  }
  return cur;
}

const rateLogs = new Map();
const rateLog = async (ilk) => {
  if (!rateLogs.has(ilk)) rateLogs.set(ilk, await api(`/api/makerdao/ilks/${encodeURIComponent(ilk)}/rate-log`));
  return rateLogs.get(ilk);
};

/**
 * One vault's rate-step notes, replayed from the two routes.
 *
 * Ends are the vault's own `frob` and `grab` rows; several rows in one block
 * are ONE moment (the fee cannot move between them), so only the last of a
 * block survives; a row before the ilk's first observed set has no fee to
 * state and is not an end.
 */
function makerNotes(events, sets, ilk) {
  const rows = events
    .filter((e) => {
      const t = e.context?.data?.eventType;
      return e.context?.protocol === "makerdao" && (t === "frob" || t === "grab");
    })
    .map((e) => ({ block: e.blockNumber, logIndex: makerLogIndex(e.id), ts: e.timestamp }))
    .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);

  const moments = [];
  for (const r of rows) {
    if (moments.length && moments[moments.length - 1].block === r.block) moments[moments.length - 1] = r;
    else moments.push(r);
  }
  const rated = [];
  for (const m of moments) {
    const set = feeAt(sets, m.block, m.logIndex);
    if (!set) {
      rejected.beforeFirstSet += 1;
      continue;
    }
    rated.push({ ...m, set });
  }

  const floor = RATE_STEP_MIN_PP - RATE_TRUNCATION_SLACK_PP;
  const out = [];
  for (let i = 1; i < rated.length; i += 1) {
    const a = rated[i - 1];
    const b = rated[i];
    if (b.block <= a.block) {
      rejected.sameBlock += 1;
      continue;
    }
    const deltaPp = b.set.aprPct - a.set.aprPct;
    rejected.evaluated += 1;
    if (Math.abs(deltaPp) < floor) {
      rejected.belowThreshold += 1;
      continue;
    }
    out.push({
      series: ilk,
      from: a.block,
      to: b.block,
      fromTs: a.ts,
      toTs: b.ts,
      fromRate: a.set.aprPct,
      toRate: b.set.aprPct,
      deltaPp,
      pageOrder: out.length,
    });
  }
  return { notes: out, moments: moments.length, rated: rated.length };
}

/** The three vaults verify-makerdao-rate-step.mjs pins — this home's fixtures.
 *  Their ilks are read off each timeline's own `ilk`, never mapped here. */
const MAKER_PINNED = ["28699", "16745", "31168"];

/** Whether the roster was ranked at all — the vacuity guard below asks about
 *  discovery's rejections only when discovery ran. */
let discoveryRan = false;

/**
 * A handful of deep real vaults, chosen by measurement rather than by hand.
 *
 * The listing already carries `activity.eventCount`, so one call per sort ranks
 * a pool without opening a single timeline. Two sorts, because one would pick
 * one kind of vault: the largest debts, and the most recently touched.
 *
 * The predicate rejects — a vault under `--min-events` rows, and an urn with no
 * cdpId (the LockStake engine's vaults, which `/vault/<id>/timeline` cannot be
 * asked for). The count of rejections is printed and the run ends VACUOUS if it
 * is ever zero.
 */
async function discoverMakerVaults() {
  // A named subject (`--only 16745`) is not a reason to rank the roster.
  if (POOL <= 0 || (ONLY && !"makerdao vault".includes(ONLY.toLowerCase()))) return [];
  discoveryRan = true;
  const half = Math.max(1, Math.round(POOL / 2));
  const pages = await Promise.all(
    ["debtDai", "lastActivity"].map((sortBy) =>
      api(`/api/makerdao/vaults?sortBy=${sortBy}&sortOrder=desc&limit=${half}`).catch(() => ({ data: [] })),
    ),
  );
  const seen = new Map();
  for (const page of pages) {
    for (const row of page.data ?? []) {
      const key = row.cdpId ?? `urn:${row.urn}`;
      if (!seen.has(key)) seen.set(key, row);
    }
  }

  const passed = [];
  const why = { shallow: 0, noCdpId: 0, pinned: 0 };
  for (const row of [...seen.values()].sort((a, b) => (b.activity?.eventCount ?? 0) - (a.activity?.eventCount ?? 0))) {
    const events = row.activity?.eventCount ?? 0;
    if (row.cdpId == null) why.noCdpId += 1;
    else if (MAKER_PINNED.includes(row.cdpId)) why.pinned += 1;
    else if (events < MIN_EVENTS) why.shallow += 1;
    else {
      passed.push({ id: row.cdpId, events, ilk: row.ilk });
      continue;
    }
    rejected.poolCandidate += 1;
  }
  const kept = passed.slice(0, KEEP);
  console.log(
    `  discovery  ${seen.size} listed vaults → ${passed.length} deep enough, ${kept.length} measured` +
      `  (rejected ${rejected.poolCandidate}: ${why.shallow} under ${MIN_EVENTS} rows, ${why.noCdpId} with no cdpId, ${why.pinned} already pinned; ${passed.length - kept.length} past --keep ${KEEP})`,
  );
  console.log(`             kept ${kept.map((k) => `${k.id} (${k.ilk}, ${num(k.events)} rows)`).join(", ") || "none"}`);
  return kept.map((k) => k.id);
}

async function makerSubjects() {
  const discovered = await discoverMakerVaults();
  return [...MAKER_PINNED, ...discovered].map((id) => ({
    key: `makerdao vault ${id}`,
    load: async () => {
      const tl = await api(`/api/makerdao/vault/${id}/timeline?${RECENT_QS}`);
      const ilk = tl.ilk;
      if (!ilk) throw new Error(`vault ${id}: the timeline names no ilk, so no fee can be read`);
      const log = await rateLog(ilk);
      const r = makerNotes(tl.events ?? [], log.sets ?? [], ilk);
      return {
        notes: r.notes,
        note: `${num(tl.events?.length ?? 0)} rows → ${num(r.rated)} rated moments, ilk ${ilk}`,
      };
    },
  }));
}

// ── Aave V3 + SparkLend ───────────────────────────────────────────────────

const FIXTURES = JSON.parse(readFileSync(new URL("./fixtures/aave-family-rate-step.json", import.meta.url), "utf8"));

/** A V3-family event id's tail `:N` segment. */
const aaveLogIndex = (id) => {
  const cut = id.lastIndexOf(":");
  return cut < 0 ? -1 : Number(id.slice(cut + 1));
};
/** The 64-hex segment of the id IS the transaction hash — Aave V3 keys
 *  `action:pool:tx:log` and Spark `action:tx:log`, so a positional split would
 *  differ between them. The rates route requires it on every `before` point:
 *  the rate at B is read from the last log STRICTLY BEFORE B and NOT in B's own
 *  transaction, so without the hash it could not apply its own rule (it answers
 *  a request that omits it with `INVALID_TX`, not with a wrong number). */
const aaveTxOf = (id) => (id.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? "").toLowerCase();
const TOUCH = new Set(["supply", "withdraw", "borrow", "repay", "liquidation"]);

/** The position's own touches, each with what it held once the row landed. */
function aaveTouches(events) {
  const rows = [...events].sort((a, b) => a.blockNumber - b.blockNumber || aaveLogIndex(a.id) - aaveLogIndex(b.id));
  const held = new Map();
  const at = (r) => {
    const cur = held.get(r) ?? { supply: 0, debt: 0 };
    held.set(r, cur);
    return cur;
  };
  const touches = [];
  for (const e of rows) {
    const d = e.context?.data ?? {};
    if (d.eventType === "liquidation") {
      const coll = (d.collateralAsset ?? "").toLowerCase();
      const debtToken = (e.flows?.[1]?.token ?? "").toLowerCase();
      if (coll && d.supplyAfter != null) at(coll).supply = Number(d.supplyAfter);
      if (debtToken && d.debtAfter != null) at(debtToken).debt = Number(d.debtAfter);
    } else {
      const own = (e.flows?.[0]?.token ?? "").toLowerCase();
      if (own) {
        if (d.supplyAfter != null) at(own).supply = Number(d.supplyAfter);
        if (d.debtAfter != null) at(own).debt = Number(d.debtAfter);
      }
    }
    if (!TOUCH.has(d.eventType)) continue;
    const snapshot = [];
    for (const [reserve, v] of held) {
      if (v.supply > 0) snapshot.push({ reserve, side: "supply" });
      if (v.debt > 0) snapshot.push({ reserve, side: "borrow" });
    }
    touches.push({
      block: e.blockNumber,
      log: aaveLogIndex(e.id),
      tx: aaveTxOf(e.id),
      ts: e.timestamp,
      held: snapshot,
    });
  }
  return touches;
}

/** Reserves borrowed at a STABLE rate — the reserve's log carries the variable
 *  rate only, so that side is never noted. */
function stableReserves(events) {
  const out = new Set();
  for (const e of events) {
    const d = e.context?.data ?? {};
    if (d.eventType === "borrow" && d.interestRateMode === 1) {
      const t = (e.flows?.[0]?.token ?? "").toLowerCase();
      if (t) out.add(t);
    }
  }
  return out;
}

/** The coordinates the page asks the rates at: `after` every touch holding the
 *  reserve, `before` every touch that follows one in a later block. */
function aaveRequests(touches, stable) {
  const byReserve = new Map();
  touches.forEach((t, i) => {
    const next = touches[i + 1];
    for (const h of t.held) {
      if (h.side === "borrow" && stable.has(h.reserve)) continue;
      let e = byReserve.get(h.reserve);
      if (!e) {
        e = { after: new Map(), before: new Map() };
        byReserve.set(h.reserve, e);
      }
      e.after.set(`${t.block}:${t.log}`, [t.block, t.log]);
      if (next && next.block > t.block) e.before.set(`${next.block}:${next.log}`, [next.block, next.log, next.tx]);
    }
  });
  return [...byReserve.entries()].map(([reserve, e]) => ({
    reserve,
    after: [...e.after.values()],
    before: [...e.before.values()],
  }));
}

/** Key the rates answer back onto the coordinates that asked for it. */
function indexRates(requests, answer) {
  const byReserve = new Map((answer.reserves ?? []).map((r) => [r.reserve.toLowerCase(), r]));
  const out = new Map();
  for (const req of requests) {
    const a = byReserve.get(req.reserve.toLowerCase());
    if (!a) continue;
    const after = new Map();
    const before = new Map();
    req.after.forEach((p, i) => a.after[i] && after.set(`${p[0]}:${p[1]}`, a.after[i]));
    req.before.forEach((p, i) => a.before[i] && before.set(`${p[0]}:${p[1]}`, a.before[i]));
    out.set(req.reserve.toLowerCase(), { symbol: a.symbol, after, before });
  }
  return out;
}

const rateOf = (side, p) => (side === "supply" ? p.liquidityRate : p.variableBorrowRate);

/** The historical notes, one per (reserve, side) per touch pair that clears the
 *  threshold — the rule verify-aave-family-rate-step.mjs replays. */
function aaveNotes(events, rates) {
  const touches = aaveTouches(events);
  const stable = stableReserves(events);
  const out = [];
  for (let i = 0; i < touches.length - 1; i += 1) {
    const a = touches[i];
    const b = touches[i + 1];
    if (b.block <= a.block) {
      rejected.sameBlock += 1;
      continue;
    }
    for (const h of a.held) {
      if (h.side === "borrow" && stable.has(h.reserve)) {
        rejected.stableSide += 1;
        continue;
      }
      const lookup = rates.get(h.reserve);
      const pa = lookup?.after.get(`${a.block}:${a.log}`);
      const pb = lookup?.before.get(`${b.block}:${b.log}`);
      if (!pa || !pb) {
        rejected.unresolvedEnd += 1;
        continue;
      }
      const rateA = rateOf(h.side, pa) * 100;
      const rateB = rateOf(h.side, pb) * 100;
      if (!Number.isFinite(rateA) || !Number.isFinite(rateB)) {
        rejected.unresolvedEnd += 1;
        continue;
      }
      const deltaPp = rateB - rateA;
      rejected.evaluated += 1;
      if (Math.abs(deltaPp) < RATE_STEP_MIN_PP) {
        rejected.belowThreshold += 1;
        continue;
      }
      out.push({
        series: `${lookup.symbol} ${h.side}`,
        from: a.block,
        to: b.block,
        fromTs: a.ts,
        toTs: b.ts,
        fromRate: rateA,
        toRate: rateB,
        deltaPp,
        pageOrder: out.length,
      });
    }
  }
  return out;
}

/** The fixture's own notes for one position, in this file's shape. The pin
 *  keeps blocks and rates, not timestamps, so a run measured from it states no
 *  day count. */
const fixtureNotes = (key) =>
  (FIXTURES[key]?.historical ?? []).map((n, i) => ({
    series: `${n.reserve} ${n.side}`,
    from: n.from,
    to: n.to,
    fromTs: null,
    toTs: null,
    fromRate: n.fromRate,
    toRate: n.toRate,
    deltaPp: n.deltaPp,
    pageOrder: i,
  }));

/**
 * The live replay against the pin, for the blocks the pin covers.
 *
 * The pin is a past and these wallets keep trading, so a note NEWER than the
 * pin's own newest block is expected and says nothing. A pinned note the replay
 * does NOT produce is different: the same rule over the same routes used to
 * yield it and now does not, which means the index's rows for that position have
 * moved under it. Measured 2026-09-20 on the deepest wallet: 32 of the 95 pinned
 * notes, every one of them borrow-side, because the position's replayed debt in
 * that reserve is zero at the note's earlier end under today's rows (PYUSD's
 * `debtAfter` reaches 0 at block 24,914,397, before the pinned note that starts
 * at 24,914,653). Saying which number the reader should take is this script's
 * job; deciding which of the two is right is verify-aave-family-rate-step.mjs's.
 */
function reconcile(live, pinned) {
  if (pinned.length === 0) return null;
  const pinnedThrough = Math.max(...pinned.map((n) => n.to));
  const liveKeys = new Set(live.map((n) => `${n.series}|${n.from}|${n.to}`));
  const missing = pinned.filter((n) => n.to <= pinnedThrough && !liveKeys.has(`${n.series}|${n.from}|${n.to}`));
  const fresh = live.filter((n) => n.to > pinnedThrough).length;
  pinDrift += missing.length;
  return `reconciled against the pin: ${pinned.length - missing.length} of ${pinned.length} pinned notes reproduced, ${missing.length} NOT, ${fresh} newer than the pin`;
}
/** Pinned notes today's replay did not produce, over every subject. */
let pinDrift = 0;

/** The five positions the fixture pins, with the routes' own coordinates. */
const AAVE_PAGES = [
  { key: "aave-v3-core:0xcaab6ff98989fdd4f47e7db6152e6fb47994ec1e", proto: "aave-v3", market: "core" },
  { key: "aave-v3-core:0x763c12108c37e19d3c23d7348daff7af802893fd", proto: "aave-v3", market: "core" },
  { key: "spark:0x4127143a866bf5d8ad2afb6de8e63164b8ad5bf6", proto: "spark" },
  { key: "spark:0x070b8d1f8b63eba95db31c8e85ba536b3474b113", proto: "spark" },
  { key: "spark:0xbdfa66802a80ddaf9e8f9579c3befcbee0c5e1b0", proto: "spark" },
];

function aaveSubjects() {
  const subjects = [];
  for (const p of AAVE_PAGES) {
    const wallet = p.key.slice(p.key.indexOf(":") + 1);
    const name = `${p.proto}${p.market ? ` ${p.market}` : ""} ${wallet.slice(0, 10)}…`;
    subjects.push({
      key: `${name} [pinned 2026-09-06]`,
      tag: "pinned 2026-09-06",
      load: async () => {
        const notes = fixtureNotes(p.key);
        const live = FIXTURES[p.key]?.live?.length ?? 0;
        return { notes, note: `fixture: ${notes.length} historical notes, ${live} live (live never joins a run)` };
      },
    });
    if (NO_LIVE) continue;
    subjects.push({
      key: `${name} [live]`,
      tag: "live",
      load: async () => {
        const qs =
          p.proto === "aave-v3" ? `wallet=${wallet}&market=${p.market}&${RECENT_QS}` : `wallet=${wallet}&${RECENT_QS}`;
        const timeline = await api(`/api/${p.proto}/timeline?${qs}`);
        const events = timeline.events ?? [];
        const touches = aaveTouches(events);
        const requests = aaveRequests(touches, stableReserves(events));
        const body = p.proto === "aave-v3" ? { market: p.market, requests } : { requests };
        const answer = await post(`/api/${p.proto}/reserve-rates`, body);
        const notes = aaveNotes(events, indexRates(requests, answer));
        const against = reconcile(notes, fixtureNotes(p.key));
        return {
          notes,
          note: `${num(events.length)} rows → ${num(touches.length)} touches, ${requests.length} reserves${against ? `\n        ${against}` : ""}`,
        };
      },
    });
  }
  return subjects;
}

// ── Reporting ─────────────────────────────────────────────────────────────

function report(m, note) {
  const runs3 = m.long.length;
  console.log(
    `  ${pad(m.subject, 46)} ${rpad(m.notes, 4)} notes → ${rpad(m.afterMerge, 4)} merged   runs≥3: ${rpad(runs3, 2)}   longest ${rpad(m.longest, 2)}   series ${rpad(m.series.length, 2)}`,
  );
  if (note) console.log(`        ${note}`);
  if (m.series.length > 1) {
    console.log(
      `        flat scan over the page's own order would merge to ${m.flatAfterMerge} notes — across reserves and sides, which is NOT what the page means`,
    );
  }
  for (const run of m.long.slice(0, 6)) {
    const span = run.days == null ? `${num(run.toBlock - run.fromBlock)} blocks` : `${num(run.days)} days`;
    const gaps = run.gaps > 0 ? `  ${run.gaps} gap${run.gaps > 1 ? "s" : ""}` : "";
    const understates = run.understates
      ? `  ⚠ the merged row would state ${pp(run.deltaPp)} where its largest member alone moved ${pp(run.largestMember)}${run.underThreshold ? ", under the 1 pp threshold that made each member a note" : ""}`
      : "";
    console.log(
      `        run ×${run.length} ${run.direction === "up" ? "up  " : "down"}  ${run.members[0].series}  ${pct(run.fromRate)} → ${pct(run.toRate)}  ${pp(run.deltaPp)}  over ${span}${gaps}${understates}`,
    );
  }
}

// ── The run ───────────────────────────────────────────────────────────────

console.log("\nRuns of same-direction rate steps — MakerDAO, Aave V3 + SparkLend");
console.log(`BASE ${BASE}\n`);

const homes = [
  // MakerDAO's subject list costs two listing calls to build, so it is not
  // built at all when nothing under this home can match: `--only spark`
  // issues no MakerDAO request. A bare vault id still reaches it.
  { name: "MakerDAO", build: async () => (makerWanted() ? makerSubjects() : []) },
  { name: "Aave V3 + SparkLend", build: async () => aaveSubjects() },
];

let failures = 0;
let measured = 0;
const summaries = [];

for (const home of homes) {
  console.log(`\n${home.name}`);
  const subjects = (await home.build()).filter((s) => wanted(s.key));
  if (subjects.length === 0) {
    console.log("  (no subject matches --only)");
    continue;
  }
  const results = [];
  for (const s of subjects) {
    let loaded;
    try {
      loaded = await s.load();
    } catch (e) {
      console.log(`  ${pad(s.key, 46)} ERROR  ${String(e).slice(0, 120)}`);
      failures += 1;
      continue;
    }
    const m = measure(s.key, loaded.notes);
    m.tag = s.tag ?? null;
    results.push(m);
    measured += 1;
    report(m, loaded.note);
  }
  if (results.length === 0) continue;
  // The Aave family is measured twice over the same five positions — from the
  // pin and from today's routes — so the two are totalled apart. Adding them
  // would report ten positions where there are five.
  const tags = [...new Set(results.map((r) => r.tag))];
  for (const tag of tags) {
    const rows = results.filter((r) => r.tag === tag);
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
    const withRun = rows.filter((r) => r.long.length > 0).length;
    const longest = rows.reduce((n, r) => Math.max(n, r.longest), 0);
    const inRuns = sum((r) => r.long.reduce((n, run) => n + run.length, 0));
    const understating = sum((r) => r.long.filter((run) => run.understates).length);
    const underThreshold = sum((r) => r.long.filter((run) => run.underThreshold).length);
    const gapped = sum((r) => r.long.filter((run) => run.gaps > 0).length);
    summaries.push(
      `${pad(tag ? `${home.name} [${tag}]` : home.name, 34)} ${rows.length} positions, ${withRun} with a run of 3+  |  ${num(sum((r) => r.notes))} notes → ${num(sum((r) => r.afterMerge))} merged  |  ${sum((r) => r.long.length)} runs of 3+ holding ${num(inRuns)} notes  |  longest ${longest}\n` +
        `${pad("", 34)} of those runs of 3+: ${gapped} span a gap, ${understating} would state less than their largest member, ${underThreshold} would state under 1 pp`,
    );
  }
}

console.log("\nTOTALS");
for (const line of summaries) console.log(`  ${line}`);

console.log("\nWHAT THE FILTERS REJECTED (a count nobody can read as a search that never looked)");
console.log(
  `  threshold ${num(rejected.belowThreshold)} of ${num(rejected.evaluated)} stretches tested · direction test broke ${num(rejected.runBroken)} runs, joined ${num(rejected.runJoined)} pairs`,
);
console.log(
  `  same-block pairs ${num(rejected.sameBlock)} · rows before the ilk's first set ${num(rejected.beforeFirstSet)} · unresolved Aave ends ${num(rejected.unresolvedEnd)} · stable-rate borrow sides ${num(rejected.stableSide)} · listed vaults not measured ${num(rejected.poolCandidate)}`,
);

// A filter that rejected nothing has not been shown to be a filter. Naming the
// one that stayed silent is the whole point — a total printed without it would
// read exactly like a measurement.
const vacuous = [];
if (rejected.runBroken === 0)
  vacuous.push("the direction test never ended a run — every note in the corpus moved one way");
if (rejected.runJoined === 0)
  vacuous.push("the direction test never joined a pair — no run of 2 exists, so no run of 3 could");
// A pinned fixture stores notes that were already selected, so a fixture-only
// run never puts a stretch to the threshold. That is not the threshold failing
// to reject — it is the threshold not being in the pipeline, and the two are
// only the same mistake if nobody separates them.
if (rejected.evaluated === 0)
  console.log(
    "\nNOTE  no stretch was tested against the 1 pp threshold in this run: every subject came from a pin, which stores notes already selected.",
  );
else if (rejected.belowThreshold === 0) vacuous.push("the 1 pp threshold rejected no stretch of the ones it tested");
if (discoveryRan && rejected.poolCandidate === 0) vacuous.push("vault discovery rejected no candidate");
if (measured === 0) vacuous.push("no position was measured at all");

if (vacuous.length > 0) {
  console.log("\nVACUOUS");
  for (const v of vacuous) console.log(`  ${v}`);
  console.log("  The counts above are not a measurement until this is explained.");
}
if (pinDrift > 0) {
  console.log(
    `\nPIN DRIFT  ${num(pinDrift)} pinned note(s) today's replay did not reproduce. Take the [pinned] rows as the Aave family's` +
      `\n           counts as of 2026-09-06 and the [live] rows as today's, and read no difference between them as a run count` +
      `\n           until verify-aave-family-rate-step.mjs has said which side moved.`,
  );
}
if (failures > 0) console.log(`\n${failures} subject(s) could not be loaded.`);

process.exit(vacuous.length > 0 || failures > 0 ? 1 : 0);
