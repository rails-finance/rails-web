#!/usr/bin/env node
// preflight — is the dev server behind a browser verifier actually healthy, and
// is the route the verifier is about to open already compiled?
// ----------------------------------------------------------------------------
// ⚠️ A SERVING PORT IS NOT A WORKING SERVER, and every caller here used to treat
// the two as the same thing. `isServing()` in run-all resolves on ANY response,
// so a dev server answering 500 on every route passes it, the suite runs, and
// what comes back is a table of red that says nothing about the page. That has
// cost a debugging session four times now (2026-07-15, 07-24, and again
// 2026-09-12, each time rediscovered from scratch), because the failure wears
// the costume of a real one: a stack trace pointing into a real module.
//
// The two states worth catching before a single browser opens:
//
//   1. A CORRUPTED `.next`. The tell is `__webpack_modules__[moduleId] is not a
//      function`, or a "Cannot find module './NNNN.js'" out of the webpack
//      runtime, in a 500 body. It is a build-manifest corruption, NOT a code
//      bug — the module the trace names is usually fine and imported happily by
//      six other routes.
//
//      WHAT CAUSES IT IS NOT KNOWN. This file said until 2026-09-20 that it
//      comes from two `next dev` sharing one checkout, and printed that as the
//      cause whenever the count below read above 1 — but the count was wrong
//      (it matched the `next dev` parent and its `next-server` child, so one
//      healthy server read as 2), and by the listener test there has only ever
//      been one. Every corruption seen so far cleared by itself inside a
//      minute, which fits a transient compile artifact under concurrent load.
//      So the gate reports the state and says what it can rule out; it does not
//      name a cause it does not have (TO-DO-ui-jobs §38).
//
//   2. TWO DEV SERVERS on this checkout — still worth catching, because they do
//      share one `.next`, and it is invisible from the port: the other one is
//      on a different port and looks harmlessly separate. The tell is a second
//      LISTENER whose working directory is this checkout, not a second match on
//      a process name.
//
// And the one state worth removing before timing anything: a COLD ROUTE. Dev
// compiles on demand, so the first open of a heavy page can take a minute, and
// a verifier's fixed post-hydration wait is measured against a warm one. The
// Liquity V2 note verifier failed 8 of 20 that way on 2026-09-12 — every
// failure downstream of one click that landed before the page was live — and
// passed 20/20 on the same commit once the route was warm. A flake that only
// appears on the first run after a cache clear reads exactly like a regression
// in whatever shipped that day.
//
// Usage:
//   node scripts/verify/preflight.mjs
//   node scripts/verify/preflight.mjs --warm /ethereum/liquity-v2/trove/WETH/786…
//   BASE=http://localhost:3100 node scripts/verify/preflight.mjs
//
// Exit 0 = healthy (and every --warm route answered 200). Exit 1 = do not run
// the verifier yet; the remedy is printed.

import { execFileSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";

/** The 500 bodies Next serves for a corrupted build manifest. Matched against
 *  the body, not the status: the status is a plain 500 either way, and a 500
 *  from the page's own data lane is a different problem with a different fix. */
const CORRUPT_CACHE = [/__webpack_modules__\[moduleId\] is not a function/, /Cannot find module '\.\/\d+\.js'/];

const REMEDY = [
  "  WAIT AND RE-PROBE FIRST. Every corrupt `.next` seen so far cleared by",
  "  itself inside a minute, with only one server running the whole time, so",
  "  the cause is a transient compile artifact and not a second server (see",
  "  TO-DO-ui-jobs §38 — no account of the real cause exists yet).",
  "",
  "  Only if it does NOT clear, and only if the count above says a second",
  "  server is really on this checkout, stop that one — never `pkill -f 'next",
  "  dev'` on a shared checkout, which kills the server other agents are using:",
  "    rm -rf .next ; npm run dev",
];

// ⚠️ TAKES ITS BASE. It read the module-level `BASE` once, which made
// `checkDevServer(someOtherBase)` quietly probe localhost:3000 instead — so the
// gate answered "healthy" for a corrupted server, a 500, and a port with
// nothing on it. Caught by break-testing it against a fake server; a gate that
// cannot go red is worse than no gate, because the suite behind it looks
// cleared.
async function get(base, path, timeoutMs = 180_000) {
  try {
    const res = await fetch(`${base}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { status: 0, body: "", error: String(e?.message ?? e) };
  }
}

/** How many dev servers are serving THIS checkout — counted as LISTENERS whose
 *  working directory is this one, not as processes matching a name.
 *
 *  It counted `pgrep -f "next dev|next-server"` until 2026-09-20, and that
 *  pattern matches the `next dev` parent AND the `next-server` child it
 *  spawns, so one healthy server always came back as 2 and the corrupt-cache
 *  branch below then named a second server as the cause of every corruption.
 *  There was never a second server (TO-DO-ui-jobs §38).
 *
 *  A second `next dev` on this checkout binds its own port and shares this
 *  `.next`, which is the thing worth knowing; a listener with a different cwd
 *  is another repo's server and is not this checkout's problem. Best-effort: a
 *  box without `lsof` reports null rather than pretending to know. */
function devServerCount(cwd = process.cwd()) {
  try {
    const listeners = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pc"], { encoding: "utf8" });
    const pids = new Set();
    let pid = null;
    for (const line of listeners.split("\n")) {
      if (line.startsWith("p")) pid = line.slice(1);
      else if (line.startsWith("c") && line.slice(1).startsWith("node") && pid) pids.add(pid);
    }
    let n = 0;
    for (const p of pids) {
      const cwdOut = execFileSync("lsof", ["-a", "-p", p, "-d", "cwd", "-Fn"], { encoding: "utf8" });
      const dir = cwdOut
        .split("\n")
        .find((l) => l.startsWith("n"))
        ?.slice(1);
      if (dir === cwd) n++;
    }
    return n;
  } catch {
    return null;
  }
}

/** The gate itself, exported so run-all can refuse to run a suite against a
 *  wedged server rather than reporting twenty crashes. Returns null when
 *  healthy, or a printable reason. */
export async function checkDevServer(base = BASE) {
  const res = await get(base, "/", 60_000);
  if (res.status === 0) return `${base} is not answering — ${res.error}`;
  if (res.status === 200) return null;
  if (CORRUPT_CACHE.some((re) => re.test(res.body))) {
    const n = devServerCount();
    return [
      `${base} has a CORRUPTED .next — it answers ${res.status} with a webpack`,
      "  module-manifest error. This is not a code bug and not a finding.",
      n == null
        ? "  (could not count this checkout's dev servers — no `lsof` here)"
        : n > 1
          ? `  ${n} dev servers are listening on this checkout, which would explain it.`
          : `  ${n} dev server is listening on this checkout, so a second one is NOT the cause.`,
      ...REMEDY,
    ]
      .filter((line) => line !== null) // a "" in REMEDY is a deliberate blank line
      .join("\n");
  }
  return `${base} answers ${res.status} on / — fix the server before reading any verifier's verdict`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const warm = [];
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--warm") warm.push(...(process.argv[++i] ?? "").split(",").filter(Boolean));
  }

  const bad = await checkDevServer(BASE);
  if (bad) {
    console.error(`✗ ${bad}`);
    process.exit(1);
  }
  console.log(`✓ ${BASE} is healthy`);

  let failed = false;
  for (const path of warm) {
    const started = Date.now();
    const res = await get(BASE, path);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (res.status === 200) {
      console.log(`✓ warmed ${path} (${secs}s)`);
    } else {
      failed = true;
      console.error(`✗ ${path} answered ${res.status || res.error} after ${secs}s`);
    }
  }
  process.exit(failed ? 1 : 0);
}
