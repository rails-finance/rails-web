#!/usr/bin/env node
// run-all — every frontend verifier in scripts/verify/, against ONE dev server.
// ----------------------------------------------------------------------------
// The verifiers were each written beside the change they guard, so they each
// default to whatever port that session happened to be running on (:3011,
// :3457, :3007, :3789, :3021, :3000). Every one of them reads BASE, so the only
// thing standing between them and a suite was somebody passing it. That is what
// this does: one BASE, passed explicitly to all of them.
//
// ⇒ THREE OUTCOMES, NOT TWO. A verifier that throws before it reaches its own
// summary has not said anything about the page — it is not a failure, it is an
// absence of evidence, and the two must not be reported with the same word.
//
//   PASS   — reached its verdict, and the verdict is green.
//   FAIL   — reached its verdict, and the verdict is red. This is a finding.
//   CRASH  — never reached a verdict: an uncaught throw (a stack trace, or the
//            "Node.js v…" line node prints as it dies), a timeout, a kill
//            signal, or the case this repo has actually been bitten by — a
//            script that exits 0 having printed nothing at all. Exiting green
//            having checked nothing is the worst of the three, so it is never
//            allowed to read as a pass.
//   SKIP   — declared not runnable here, with a reason, in SKIPS below.
//
// The server: if BASE is already serving, it is reused and left running. If it
// is not, this starts `next dev` itself and kills it on every exit path — two
// `next dev` on one checkout corrupt .next, so it never starts a second one.
//
// Usage:
//   node scripts/verify/run-all.mjs
//   BASE=http://localhost:3100 node scripts/verify/run-all.mjs
//   TIMEOUT_MS=600000 node scripts/verify/run-all.mjs
//   ONLY=llamalend,prov node scripts/verify/run-all.mjs   (substring filter)
//   JOBS=1 node scripts/verify/run-all.mjs                (default 2 — see below)
//
// The scripts run two at a time by default. They are independent of each other
// and share everything behind the page, which is what sets the ceiling; the
// reasoning is at the JOBS constant, and JOBS=1 is the way back to serial when
// a run's failures start moving around between runs.

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkDevServer } from "./preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = "run-all.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";

// ⚠️ MEASURED, NOT GUESSED — a cap set too low does not report a slow script,
// it manufactures a CRASH that looks exactly like a real one. Several verifiers
// set their own 180s per-navigation timeouts and a cold dev server compiles
// each route on first hit, so the honest floor is high: verify-wallet-links
// legitimately takes ~300s and verify-flank-echoes ~257s. A 300s cap killed
// wallet-links at the line and reported a hang that was not there.
//
// The same script also varies enormously run to run — wallet-links measured
// 300.0s and then 495.4s on consecutive runs of the same commit — so the cap
// has to clear the SLOW run, not the median. 900s does, and it caught the one
// script that genuinely never finished (verify-prov-receipts before 7edf6d1:
// eleven pages each waiting 120s for a retired selector). No current verifier
// needs the full window; the cap is the backstop for the next rot, not a
// budget any script is expected to spend.
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 900_000);

// Not runnable against a plain dev server on this checkout. A reason, not a
// shrug — anything listed here is evidence nobody is collecting.
//
// ⚠️ A file in this directory is not automatically a verifier. `rpc-counting-proxy.mjs`
// is the measurement rig for the caching work; it exits 1 without `UPSTREAM`, so
// collecting every `.mjs` reported it as a FAIL with a finding nobody can act on —
// and a false FAIL in the table costs the same attention as a real one. Anything
// not named `verify-*` is stated as a skip rather than silently dropped, so a
// verifier that lands here under the wrong name is still visible.
const NOT_A_VERIFIER =
  "not a verifier — a rig or helper kept beside them. run-all runs verify-*.mjs; " +
  "rename it if it is meant to be collected.";
const SKIPS = {
  "preflight.mjs":
    "not a verifier — the dev-server health gate this runner calls before the " +
    "suite, and a CLI for a single verifier: `npm run verify:preflight -- --warm <path>`.",
  "verify-dolomite-frontend.mjs":
    "needs its own backend: api/src/routes/dolomite.ts run locally over the seeded " +
    "dolomite_scratch DB pinned at block 25543616 (rails-server-onboarding). Its " +
    "listing/detail assertions read that pinned index, so a plain dev server " +
    "cannot answer them.",
  "verify-queued-export.mjs":
    "live only: requests queued exports from a deployed preview and the onboarding box " +
    "(BASE=https://preview.rails.finance), spends test readers' daily quota, and with " +
    "RESTART_CMD redeploys the api. Run it by hand.",
};

// A verifier "reached a verdict" if it printed one of its own summary lines.
// The vocabulary is inconsistent across the suite (ALL CHECKS GREEN / ALL
// CHECKS: PASS / N CHECK(S) FAILED / === SUMMARY === / ✅ all render checks
// passed …), so this matches the forms actually in the tree rather than
// imposing one.
//
// ⚠️ THIS IS FOR PICKING THE DETAIL LINE ONLY — IT IS NOT THE CLASSIFIER, AND
// IT USED TO BE. Classifying on "did it print a phrase I recognise" made every
// summary form I had not enumerated look like a crash, and it produced three
// false alarms in two runs: verify-unscoped-prov ("0 distinct unscoped receipt
// label(s):"), verify-fork-header-scan ("validated 1686 actionLabels across
// both forks") and, in the chain runner, "ALL CHAIN CHECKS PASS". All three had
// run clean and exited 0. A false CRASH is indistinguishable from a real one in
// the table, so the classifier now looks for evidence a crash HAPPENED rather
// than for the absence of a phrase. If nothing here matches, the run is still
// classified correctly — the table just quotes the last line instead.
const VERDICT_RE =
  /(ALL(\s+\w+)*\s+CHECKS?\b|ALL ASSERTIONS|ALL PASS\b|All assertions passed|=== SUMMARY ===|\d+\s+(CHECK\(S\)|ASSERTION\(S\))\s+FAILED|\d+\s+FAILURES?\b|\d+\s+FAILED\b|check\(s\) failed|checks passed|validated \d+ actionLabels|distinct unscoped receipt label|ABORT — \d+ page)/i;

// A verdict over zero checks. "0/0 checks passed" exits 0 and reads green in
// every column, and it is what a verifier prints when its fixture filter, its
// roster read or its discovery step came back empty — the run said nothing
// about the page and said it in the vocabulary of success. Treated as CRASH:
// absence of evidence, not evidence of absence.
const VACUOUS_RE = /\b0\s*\/\s*0\b|\b0\s+(checks?|assertions?)\s+(passed|ran|checked)\b/i;

// Node prints "Node.js v<version>" as the last line when an uncaught throw
// terminates the process, and a stack frame line is the other reliable tell.
// Either means the script stopped where it stood — it did not reach a verdict,
// whatever it had printed up to that point.
const crashed = (out) => /^Node\.js v\d/m.test(out) || (/^\s{4}at\s+\S/m.test(out) && /\b\w*Error\b/.test(out));
const errorLine = (lines) =>
  lines
    .find((l) => /\b\w*Error\b/.test(l) && !/^\s{4}at\s/.test(l))
    ?.trim()
    .slice(0, 120);

const scripts = readdirSync(HERE)
  .filter((f) => f.endsWith(".mjs") && f !== SELF)
  .map((f) => {
    if (!f.startsWith("verify-") && !SKIPS[f]) SKIPS[f] = NOT_A_VERIFIER;
    return f;
  })
  .filter((f) => !process.env.ONLY || process.env.ONLY.split(",").some((s) => f.includes(s.trim())))
  .sort();

// ── the dev server ──────────────────────────────────────────────────────────

async function isServing(url, timeoutMs = 3000) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

// ⚠️⚠️ ASK PATIENTLY BEFORE CONCLUDING THE PORT IS FREE. A single 3s probe is a
// liveness test, not an occupancy test: a dev server that is up but busy — a
// verifier already driving it, a cold route compiling — fails it, and the
// caller then starts a SECOND `next dev` on the same port and the same
// checkout, which is precisely the state this file's header says corrupts
// `.next`. Observed 2026-08-30 while a long verifier was mid-run. Three tries
// with a real timeout, and the answer only counts as "free" if all three agree.
async function portIsFree(url) {
  for (let i = 0; i < 3; i++) {
    if (await isServing(url, 15000)) return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return true;
}

let server = null;

// `next dev` runs its actual server in a CHILD of the process we spawn, so
// signalling the pid alone leaves that child holding the port — a stray server
// is exactly the state that corrupts .next when the next run starts a second
// one. Spawned detached, the negative pid signals the whole process group.
function signalGroup(pid, sig) {
  try {
    process.kill(-pid, sig);
  } catch {
    /* already gone */
  }
}

// Synchronous, for the exit/signal handlers: no time to be polite there, and a
// SIGKILL to the group is the one signal nothing can decline.
function stopServer() {
  if (!server) return;
  const pid = server.pid;
  server = null;
  signalGroup(pid, "SIGKILL");
}

// The normal path: ask first, then insist, then prove the port actually let go.
async function stopServerGracefully() {
  if (!server) return;
  const pid = server.pid;
  server = null;
  signalGroup(pid, "SIGTERM");
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (!(await isServing(BASE))) {
      console.log("· dev server stopped");
      return;
    }
  }
  signalGroup(pid, "SIGKILL");
  await new Promise((r) => setTimeout(r, 1000));
  console.log(
    (await isServing(BASE))
      ? "⚠ dev server STILL serving after SIGKILL — kill it by hand"
      : "· dev server stopped (forced)",
  );
}

async function startServer() {
  const port = new URL(BASE).port || "3000";
  console.log(`· ${BASE} is not serving — starting next dev on :${port}`);
  server = spawn("npx", ["next", "dev", "--port", port], {
    cwd: join(HERE, "..", ".."),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});

  for (let i = 0; i < 120; i++) {
    if (server === null) throw new Error("server was stopped before it came up");
    if (server.exitCode !== null) throw new Error(`next dev exited early (code ${server.exitCode})`);
    if (await isServing(BASE)) {
      console.log(`· dev server ready after ~${i}s\n`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("next dev did not become ready within 120s");
}

for (const sig of ["exit", "SIGINT", "SIGTERM", "uncaughtException"]) {
  process.on(sig, () => {
    stopServer();
    if (sig !== "exit") process.exit(1);
  });
}

// ── running one verifier ────────────────────────────────────────────────────

function runOne(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    // ⚠️ `ONLY` IS THIS RUNNER'S OWN SELECTOR AND MUST NOT REACH A CHILD.
    // Two verifiers (timeline-navigator, timeline-boundary-card) read `ONLY`
    // themselves to pick FIXTURES, so `ONLY=timeline-navigator run-all` used to
    // hand the navigator a fixture filter matching none of its fixtures: it ran
    // nothing, printed "0/0 checks passed", exited 0 and was reported as a PASS
    // in 0.3s. 147 real checks, silently replaced by a green row — the worst of
    // the three outcomes, wearing the best one's colour. A verifier's own
    // fixture filter now travels as `FIXTURES=`, which is handed on as its
    // `ONLY`; this runner's selector stops here.
    //
    // 🔑 `FIXTURES=` IS ALSO THE CHEAPEST THING IN THIS FILE, AND IT IS UNDER-USED.
    // A change to THIS RUNNER — the pool, the quarantine, the report — needs a
    // script that exercises the plumbing, not one that exercises the product.
    // Reach for `FIXTURES=control` and the seven-minute navigator becomes a
    // thirty-second one: measured 2026-09-12, 32.9s / 26 checks against 437.3s /
    // 147 for the full five-fixture sweep. Same code path through this file.
    //
    // ⚠️ AND DO NOT PICK THE CHEAP SCRIPT BY ITS LINE COUNT. Measured the same
    // day: `verify-stage-rail-dots.mjs` (66 lines) runs in 2.4s, and
    // `verify-unscoped-prov.mjs` — FOUR LINES SHORTER — takes 125.7s, because a
    // short file can hold a loop over twenty routes. What a verifier costs is
    // how many pages it opens, and the only way to know is the seconds column
    // this runner already prints. Read it before choosing.
    const { ONLY: _runnerSelector, FIXTURES, ...inherited } = process.env;
    const child = spawn(process.execPath, [join(HERE, file)], {
      cwd: join(HERE, "..", ".."),
      env: { ...inherited, BASE, ...(FIXTURES ? { ONLY: FIXTURES } : {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ file, outcome: "CRASH", secs: (Date.now() - started) / 1000, detail: err.message, out });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const secs = (Date.now() - started) / 1000;
      const lines = out
        .split("\n")
        .map((l) => l.trimEnd())
        .filter(Boolean);
      const last = lines.at(-1) ?? "(no output)";
      const summary = [...lines].reverse().find((l) => VERDICT_RE.test(l)) ?? last;

      let outcome, detail;
      if (timedOut) {
        outcome = "CRASH";
        detail = `timed out after ${TIMEOUT_MS / 1000}s — no verdict reached`;
      } else if (signal) {
        outcome = "CRASH";
        detail = `killed by ${signal} — no verdict reached`;
      } else if (crashed(out)) {
        outcome = "CRASH";
        detail = `died on an uncaught throw (exit ${code}) — ${errorLine(lines) ?? last}`;
      } else if (!lines.length) {
        // Ran, said nothing, exited. Whatever it checked, it did not report it.
        outcome = "CRASH";
        detail = `printed nothing at all (exit ${code})`;
      } else if (code === 0 && VACUOUS_RE.test(summary)) {
        // Ran, reached a verdict, and the verdict is over nothing. Green on
        // zero checks is not evidence, and it is the state a fixture filter
        // that matches nothing produces — see the env note in runOne.
        outcome = "CRASH";
        detail = `reached a verdict over ZERO checks — "${summary.trim().slice(0, 60)}"`;
      } else if (code === 0) {
        outcome = "PASS";
        detail = summary;
      } else {
        outcome = "FAIL";
        detail = summary;
      }
      resolve({ file, outcome, secs, detail, out });
    });
  });
}

// ── the run ─────────────────────────────────────────────────────────────────

console.log(`verify/run-all — ${scripts.length} script(s) against BASE=${BASE}\n`);

const reusing = !(await portIsFree(BASE));
if (reusing) console.log(`· ${BASE} already serving — reusing it, and leaving it running\n`);
else await startServer();

// ⚠️ A SERVING PORT IS NOT A WORKING SERVER. `isServing` above resolves on any
// response, 500 included, so a dev server with a corrupted `.next` passes it and
// the whole suite then runs against a box that answers nothing but errors. The
// result is a table of CRASHes with real-looking stack traces and not one fact
// about the page. That is an absence of evidence, so it is refused here rather
// than reported — see preflight.mjs for the two states and the remedy.
const unhealthy = await checkDevServer(BASE);
if (unhealthy) {
  console.error(`\n✗ NOT RUNNING THE SUITE.\n${unhealthy}\n`);
  await stopServerGracefully();
  process.exit(1);
}

/** One finished verifier's line, plus the evidence when it is not a PASS.
 *  Printed on completion rather than on start: under concurrency a "file … "
 *  written before the run would be separated from its outcome by whatever
 *  else finished in between, and the two halves would pair up wrongly. */
function report(r) {
  console.log(`${r.outcome.padEnd(6)} ${r.file} (${r.secs.toFixed(1)}s)`);
  if (r.outcome === "PASS" || r.outcome === "SKIP") return;
  // A table row alone cannot be acted on, so print the evidence — but print
  // the RIGHT evidence. A verifier with sixteen failures prints them as it
  // goes and its summary last, so a blind tail shows twenty-five passing
  // lines and the count, and none of what actually broke. For a FAIL the
  // evidence is the failing lines; for a CRASH it is the end of the output,
  // where the stack trace is.
  const lines = r.out.split("\n").map((l) => l.trimEnd());
  const failing = r.outcome === "FAIL" ? lines.filter((l) => /\bFAIL(ED|URE|:)?\b/i.test(l)) : [];
  const shown = failing.length ? failing.slice(0, 20) : lines.filter(Boolean).slice(-25);
  console.log(shown.join("\n").replace(/^/gm, "       │ "));
  if (failing.length > 20) console.log(`       │ … and ${failing.length - 20} more failing line(s)`);
}

// ⚠️ THE POOL IS BUILT AND THE DEFAULT IS ONE, BECAUSE THE SUITE WAS MEASURED
// AND IT IS NOT READY FOR IT. The scripts are independent of each other — each
// drives its own browser — so the wall clock is waiting and a pool should halve
// it. What they are not independent of is everything behind the page: one dev
// server compiling cold routes, one backend, one Alchemy key whose 429s arrive
// as a page that renders short rather than as an error.
//
// Measured on one commit, 2026-09-12, with three of the timeline verifiers:
//
//   JOBS=1, idle machine   verify-timeline-navigator 147/147, view-link ALL
//                          PASS, market-note-row-liquity-v2 20/20.
//   JOBS=1, machine busy   navigator 145/147 — checks 7 and 8 on `dense-short`,
//     (tsc + knip beside)  both reading an EMPTY toolbar on a page that answers
//                          200 with rows every time it is fetched.
//   JOBS=2                 navigator one red, a DIFFERENT one; and view-link
//                          CRASHED — its copy-link control "resolved to hidden"
//                          242 times in 120s and the run died on the timeout.
//
// None of that is the page being wrong. It is the scripts' waits being tight:
// fixed post-hydration sleeps, and waits on an element being VISIBLE while the
// shell is still animating it in. Under contention those windows close. A red
// that moves between runs costs more than the concurrency saves, and it teaches
// a reader to re-run a failure instead of believing it.
//
// ⚠️ ONE OF THOSE THREE ROWS HAS SINCE BEEN EXPLAINED AWAY, AND IT MATTERS
// WHICH. The view-link CRASH was never contention — it was a selector left
// pointing at a control that `8cd7330c` had moved, so the wait could not
// resolve at any JOBS. Fixed the same day, and the fix cost that script's whole
// readiness wait: it now waits on the count line, which the page shows whatever
// the filter, and reaches the control through the pane. Re-measured that
// evening, MEASURE=1 JOBS=2: view-link ALL PASS in 43.5s, navigator 147/147.
// So the honest state of the evidence is that ONE run of the pair is clean and
// the only unexplained red left is navigator's, twice, under two different
// loads. That is not enough to move a default on.
//
// So: `JOBS=2` (or more) is here, one env var away, for a selection of light
// scripts or a machine with room. The bar for moving the default has not
// changed — the waits get fixed, meaning a wait on a control RESPONDING rather
// than on a timer — and view-link is now the worked example of what that looks
// like and what it is worth (145.4s crash → 36.0s green).
//
// ⚠️ NAVIGATOR'S SLEEPS ARE NOW FIXED TOO, AND THE DEFAULT STILL HAS NOT MOVED.
// 13 of its 14 flat sleeps became conditional waits on 2026-09-12; it then went
// 147/147 alone (405.2s) and 147/147 under MEASURE=1 JOBS=2 with tsc beside it
// (408.0s) — the condition both of its old reds came from. That is two runs.
// The bar written above is SEVERAL, and it is not a formality: the rework broke
// the script twice before it worked, once into a 900s CRASH and once into a red
// that only appeared in the sweep, so this script's history of moving failures
// is exactly why two greens do not close it. Take the next few runs, then empty
// RUN_ALONE and set this default to 2 in the same change.
const JOBS = Math.max(1, Number(process.env.JOBS ?? 1));

// Scripts that must never share a machine, whatever JOBS says — the ones whose
// reds have actually been watched moving. Membership is a MEASURED claim and
// each entry says what was seen, so raising JOBS on a selection stays safe for
// whatever is in here. They run after the pool drains, one at a time.
//
// ⚠️ AN ENTRY IS ONLY AS GOOD AS ITS MEASUREMENT, AND A FIX CAN RETIRE ONE.
// `verify-timeline-view-link.mjs` was in this map for an afternoon on the
// strength of a JOBS=2 run in which its copy-link control "resolved to hidden"
// 242 times in 120s. That was not contention: it was the stale toolbar selector
// this repo moved in `8cd7330c`, and it is fixed. Re-measured the same day with
// MEASURE=1 JOBS=2 — ALL PASS in 43.5s, beside a navigator that went 147/147.
// So it is NOT quarantined, and the way back in is another measurement.
//
// `MEASURE=1` EMPTIES THIS MAP. That is the only way to take a measurement of a
// membership claim, because a quarantined script never shares a machine and so
// can never produce the evidence that would release it. It is not a speed knob:
// setting it puts every script here back into the pool and hands you the flaky
// configuration each entry below was written to avoid, with no warning at the
// point of use — the run just starts moving around. Reach for it to re-test an
// entry, read the entry first, and write down what came back.
const RUN_ALONE = process.env.MEASURE
  ? {}
  : {
      "verify-timeline-navigator.mjs":
        "measured 2026-09-12: 147/147 alone, 145/147 with tsc and knip beside " +
        "it (checks 7 and 8 on `dense-short`, both reading an empty toolbar), " +
        "a different single red under JOBS=2. The page answered 200 with rows " +
        "every time — the diagnosis was its own waits, 14 flat sleeps. THOSE " +
        "ARE NOW FIXED (13 replaced by conditional waits, one negative-claim " +
        "sleep kept on purpose), and it has since gone 147/147 twice: alone " +
        "at 405.2s, and under MEASURE=1 JOBS=2 beside view-link with tsc " +
        "running, at 408.0s — the second being the exact condition both old " +
        "reds were seen under. IT STAYS HERE ANYWAY, for now: the cause is " +
        "removed and the evidence is two runs, and this file's own bar for " +
        "moving on concurrency is several. Release it — and the JOBS default " +
        "with it — on the next few clean runs, not on this note.",
    };

const results = [];
const queue = scripts.filter((f) => !RUN_ALONE[f]);
const alone = scripts.filter((f) => RUN_ALONE[f]);
async function worker() {
  for (;;) {
    const file = queue.shift();
    if (!file) return;
    if (SKIPS[file]) {
      const r = { file, outcome: "SKIP", secs: 0, detail: SKIPS[file] };
      results.push(r);
      report(r);
      console.log(`       ${SKIPS[file]}`);
      continue;
    }
    const r = await runOne(file);
    results.push(r);
    report(r);
  }
}
console.log(`· ${JOBS} at a time${alone.length ? `, then ${alone.length} on their own` : ""}\n`);
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, worker));
// The pool has drained; these get the machine to themselves.
for (const file of alone) {
  console.log(`·      ${file} — alone: ${RUN_ALONE[file]}`);
  if (SKIPS[file]) {
    const r = { file, outcome: "SKIP", secs: 0, detail: SKIPS[file] };
    results.push(r);
    report(r);
    continue;
  }
  const r = await runOne(file);
  results.push(r);
  report(r);
}
// Completion order is whatever finished first; the table below is the record,
// so it reads in the order the suite is listed in rather than the order the
// machine happened to get through it.
results.sort((a, b) => a.file.localeCompare(b.file));

if (!reusing) await stopServerGracefully();

// ── the table ───────────────────────────────────────────────────────────────

const w = Math.max(...results.map((r) => r.file.length), 6);
console.log(`\n${"─".repeat(w + 26)}`);
console.log(`${"script".padEnd(w)}  ${"outcome".padEnd(6)}  ${"secs".padStart(6)}  detail`);
console.log("─".repeat(w + 26));
for (const r of results) {
  const detail = r.detail.replace(/\s+/g, " ").slice(0, 90);
  console.log(`${r.file.padEnd(w)}  ${r.outcome.padEnd(6)}  ${r.secs.toFixed(1).padStart(6)}  ${detail}`);
}
console.log("─".repeat(w + 26));

const tally = (o) => results.filter((r) => r.outcome === o).length;
console.log(`\nPASS ${tally("PASS")}   FAIL ${tally("FAIL")}   CRASH ${tally("CRASH")}   SKIP ${tally("SKIP")}`);

const red = tally("FAIL") + tally("CRASH");
process.exit(red ? 1 : 0);
