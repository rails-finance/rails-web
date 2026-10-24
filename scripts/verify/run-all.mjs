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
// The RPC proxy: the run starts `rpc-counting-proxy.mjs` (record-and-replay,
// one block pinned per chain for the run) and points the server it starts, and
// every verifier, at it — ALCHEMY_URL, BASE_RPC_URL, ENS_RPC_URL, SEPOLIA_RPC_URL,
// ETHEREUM_LOGS_RPC_URL and BASE_BACKFILL_RPC_URL — so a pass
// replays yesterday's chain reads from disk and the Alchemy key pays only for
// what the cache lacks. The count is printed at the end of the run and goes
// into the known-faults file's pass line (ui-jobs 432). A server this runner
// did not start reads the chain on whatever URLs it was started with; the
// count then covers nothing, and the table says so. RPC_PROXY=0 runs without
// it; RPC_PIN=keep reuses the last run's pins so a rerun costs nothing upstream.
//
// The `.ts` verifiers run through `tsx` (`tsx --test` for the node:test ones).
// A script longer than the cap is run in parts (SPLIT below), each under it.
//
// Usage:
//   node scripts/verify/run-all.mjs
//   BASE=http://localhost:3100 node scripts/verify/run-all.mjs
//   TIMEOUT_MS=600000 node scripts/verify/run-all.mjs
//   ONLY=llamalend,prov node scripts/verify/run-all.mjs   (substring filter)
//   JOBS=1 node scripts/verify/run-all.mjs                (default 2 — see below)
//   RPC_PROXY=0 node scripts/verify/run-all.mjs           (no proxy, the key pays whole)
//   RPC_PIN=keep node scripts/verify/run-all.mjs          (yesterday's pins, nothing upstream)
//
// The scripts run two at a time by default. They are independent of each other
// and share everything behind the page, which is what sets the ceiling; the
// reasoning is at the JOBS constant, and JOBS=1 is the way back to serial when
// a run's failures start moving around between runs.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkDevServer } from "./preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SELF = "run-all.mjs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const RPC_PROXY = process.env.RPC_PROXY !== "0";
const RPC_PROXY_PORT = Number(process.env.RPC_PROXY_PORT ?? 8899);
const RPC_PROXY_URL = `http://127.0.0.1:${RPC_PROXY_PORT}`;

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

// A verifier that walks every family is longer than the cap by design, so it
// runs in PARTS, each a separate row under the cap, through the script's own
// family or fixture filter (ui-jobs 432). The parts are sized from
// measurements: verify-event-share takes about 55 min whole (33 families, so
// five a part is under ten minutes); verify-anatomy-codes opens one position
// per family at two widths and took about 70 min on 9 Oct 2026 under load
// (29 families, four a part); verify-timeline-boundary-card's Maple fixture
// alone can wait out a page load. A part's label carries its filter so the
// table reads which families a red belongs to. `FIXTURES=` from the caller
// overrides the split: the caller chose the part.
const SPLIT = {
  "verify-event-share.mjs": {
    env: "FAMILIES",
    parts: [
      ["spark-folders", "aave-v3-folders", "aave-v3", "spark", "liquity-v2"],
      ["compound-v3", "compound-v2", "moonwell", "maple", "makerdao"],
      ["fluid", "frankencoin", "fx", "dolomite", "llamalend"],
      ["dolomite-closed", "llamalend-closed", "pwn", "liquity-v1", "morpho"],
      ["aave-v4", "ebisu", "asymmetry", "basedollar", "aave-v3-base"],
      ["seamless", "compound-v3-base", "moonwell-base", "morpho-base", "polaris"],
      ["aave-vaults", "morpho-base-vaults", "yearn-vaults"],
    ],
  },
  "verify-timeline-boundary-card.mjs": {
    env: "ONLY",
    parts: [
      // Split in three on 23 Oct 2026: the seven together ran past the cap,
      // and each flat window fixture pages 2,500 rows (3 to 5 min apiece).
      ["aave-v3", "aave-v3-grouped", "spark"],
      ["maple", "compound-v3"],
      ["compound-v2", "morpho"],
      [
        "aave-v3-base",
        "aave-v3-base-2000",
        "aave-v3-base-liquidated",
        "moonwell-base",
        "moonwell-base-cut",
        "moonwell-base-anchored",
      ],
      ["moonwell-base-grouped", "seamless", "aave-v3-base-grouped", "seamless-grouped", "compound-base", "morpho-base"],
      [
        "compound-base-grouped",
        "morpho-base-grouped",
        "vault-eth",
        "vault-eth-mid",
        "vault-base",
        "control-liquity-v2",
        "control-vault",
        "rewind",
      ],
    ],
  },
  // verify-wallet-links opens up to eight positions per explorer and then the
  // wallet view, which reads the wallet on every chain before its URL moves
  // (67s measured for one morpho owner, 23 Oct 2026); 17 explorers whole hit
  // the cap on 23 Oct, so five or six a part.
  "verify-wallet-links.mjs": {
    env: "FAMILIES",
    parts: [
      ["liquity-v2", "aave-v4", "morpho", "compound", "compound-v2", "spark"],
      ["aave-v3", "dolomite", "fluid", "maple", "makerdao", "moonwell"],
      ["frankencoin", "fx", "llamalend", "liquity-v1", "pwn"],
    ],
  },
  "verify-anatomy-codes.mjs": {
    env: "ONLY",
    parts: [
      ["liquity-v2", "compound-v2", "moonwell", "compound-v3"],
      ["liquity-v1", "ebisu", "polaris", "aave-v3"],
      ["spark", "seamless", "morpho", "makerdao"],
      ["llamalend", "fluid", "fx", "frankencoin"],
      ["maple", "pwn", "aave-v4", "alchemix-v3"],
      ["alchemix-v2", "alchemix-transmuter", "sky-savings", "morpho-base-vaults"],
      ["yearn-vaults", "aave-vaults", "dolomite", "asymmetry", "basedollar"],
    ],
  },
};

// Not runnable against a plain dev server on this checkout. A reason, not a
// shrug — anything listed here is evidence nobody is collecting.
//
// ⚠️ A file in this directory is not automatically a verifier. `rpc-counting-proxy.mjs`
// is the RPC proxy this runner starts; collected as a script it would sit
// waiting on its port and be reported as a CRASH with a finding nobody can act
// on — and a false red in the table costs the same attention as a real one.
// Anything not named `verify-*` is stated as a skip rather than silently
// dropped, so a verifier that lands here under the wrong name is still visible.
const NOT_A_VERIFIER =
  "not a verifier — a rig or helper kept beside them. run-all runs verify-*.mjs and verify-*.ts; " +
  "rename it if it is meant to be collected.";
// `tsx` is a devDependency; TSX= names another binary (a global or npx cache one).
const TSX = process.env.TSX ?? join(ROOT, "node_modules", ".bin", "tsx");
const SKIPS = {
  "preflight.mjs":
    "not a verifier — the dev-server health gate this runner calls before the " +
    "suite, and a CLI for a single verifier: `npm run verify:preflight -- --warm <path>`.",
  "rpc-counting-proxy.mjs":
    "not a verifier — the record-and-replay RPC proxy this runner starts for the " +
    "server it starts (RPC_PROXY=0 runs without it).",
  "verify-dolomite-frontend.mjs":
    "needs its own backend: api/src/routes/dolomite.ts run locally over the seeded " +
    "dolomite_scratch DB pinned at block 25543616 (rails-server-onboarding). Its " +
    "listing/detail assertions read that pinned index, so a plain dev server " +
    "cannot answer them.",
  "verify-queued-export.mjs":
    "live only: requests queued exports from the deployed site and the onboarding box " +
    "(BASE=https://rails.finance), spends test readers' daily quota, and with " +
    "RESTART_CMD redeploys the api. Run it by hand.",
  "verify-timeline-abuse.mjs":
    "live only: bursts 310 bare /timeline requests at the deployed site to meet the " +
    "Vercel Firewall rate limit (BASE=https://rails.finance BURST=1), which " +
    "denies the runner's IP on every /timeline path for the rest of the window. Run it by hand.",
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
  /(ALL(\s+\w+)*\s+CHECKS?\b|ALL ASSERTIONS|ALL PASS\b|All assertions passed|=== SUMMARY ===|\d+\s+(CHECK\(S\)|ASSERTION\(S\))\s+FAILED|\d+\s+FAILURES?\b|\d+\s+FAILED\b|check\(s\) failed|checks passed|validated \d+ actionLabels|distinct unscoped receipt label|ABORT — \d+ page|^# (pass|fail) \d+|\bPASS=\d+ FAIL=\d+|^\s*[✗❌] )/im;

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

/** A `.ts` verifier under node:test runs as `tsx --test`; the two that are
 *  plain scripts run as `tsx <file>`. One that mocks a module gets node's flag
 *  for it and mocks `server-only` itself; the rest get the server-only hook
 *  (lib/server-only-hook.mjs), which a module mock does not tolerate.
 *  Declared before the roster below, which calls tsCommand for the SKIP line
 *  when tsx is missing (a checkout that has not run `pnpm install` since tsx
 *  entered the lockfile crashed here on 2026-10-23 instead of skipping). */
const SERVER_ONLY_HOOK = join(HERE, "lib", "server-only-hook.mjs");
function tsFlags(file) {
  const src = readFileSync(join(HERE, file), "utf8");
  return [
    ...(/mock\.module\(/.test(src) ? ["--experimental-test-module-mocks"] : ["--import", SERVER_ONLY_HOOK]),
    ...(/from "node:test"/.test(src) ? ["--test"] : []),
  ];
}
function tsCommand(file) {
  return `npx tsx ${tsFlags(file).join(" ").replace(SERVER_ONLY_HOOK, "scripts/verify/lib/server-only-hook.mjs")} scripts/verify/${file}`;
}

const scripts = readdirSync(HERE)
  .filter((f) => (f.endsWith(".mjs") || f.endsWith(".ts")) && f !== SELF)
  .map((f) => {
    if (!f.startsWith("verify-") && !SKIPS[f]) SKIPS[f] = NOT_A_VERIFIER;
    else if (f.endsWith(".ts") && !existsSync(TSX))
      SKIPS[f] = `needs tsx, which this checkout has not installed (pnpm install): ${tsCommand(f)}`;
    return f;
  })
  .filter((f) => !process.env.ONLY || process.env.ONLY.split(",").some((s) => f.includes(s.trim())))
  .sort();

/** The rows of the table: a script, or one part of a split script. A caller's
 *  `FIXTURES=` is its own part, so a split script then runs once with it. */
function jobsFor(file) {
  const split = SPLIT[file];
  if (!split || process.env.FIXTURES) return [{ file, label: file, env: {} }];
  return split.parts.map((part) => ({
    file,
    label: `${file} [${part.join(",")}]`,
    env: { [split.env]: part.join(",") },
  }));
}

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
let proxy = null;
let proxyLanes = [];

// ── the RPC proxy ───────────────────────────────────────────────────────────

async function proxyStatus() {
  try {
    const res = await fetch(`${RPC_PROXY_URL}/__count`, { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    return json?.proxy === "rpc-counting-proxy" ? json : null;
  } catch {
    return null;
  }
}

/** Start the proxy, or adopt one already on the port (started by hand, for a
 *  server started by hand). Returns false when there is nothing to forward to. */
async function startProxy() {
  const running = await proxyStatus();
  if (running) {
    proxyLanes = running.lanes;
    console.log(`· an RPC proxy is already on ${RPC_PROXY_URL} — using it (lanes ${proxyLanes.join(", ")})`);
    return true;
  }
  proxy = spawn(process.execPath, [join(HERE, "rpc-counting-proxy.mjs")], {
    cwd: ROOT,
    env: { ...process.env, ...envLocal(), PORT: String(RPC_PROXY_PORT), RPC_QUIET: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let said = "";
  proxy.stdout.on("data", (d) => (said += d));
  proxy.stderr.on("data", (d) => (said += d));
  for (let i = 0; i < 20; i++) {
    if (proxy.exitCode !== null) {
      console.log(`· no RPC proxy: ${said.trim().split("\n").at(-1) ?? `exited ${proxy.exitCode}`}`);
      proxy = null;
      return false;
    }
    const status = await proxyStatus();
    if (status) {
      proxyLanes = status.lanes;
      console.log(`· RPC proxy on ${RPC_PROXY_URL} — lanes ${proxyLanes.join(", ")}; cache ${status.cacheDir}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log("· the RPC proxy did not come up within 10s; running without it");
  stopProxy();
  return false;
}

/** The server this runner starts reads its keys from `.env.local` itself, so
 *  the proxy needs the same values to forward to. Read here for the proxy
 *  only; never printed. */
function envLocal() {
  const out = {};
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  } catch {
    /* no .env.local: the environment is all there is */
  }
  return out;
}

/** The variables the dev server and the verifiers read their chain URLs from,
 *  pointed at the proxy's lanes — only the lanes the proxy has an upstream
 *  for, so a chain with no key keeps the app's own "not set" error. */
function proxiedEnv() {
  const lane = (name) => (proxyLanes.includes(name) ? `${RPC_PROXY_URL}/${name}` : undefined);
  const env = {
    ALCHEMY_URL: lane("ethereum"),
    BASE_RPC_URL: lane("base"),
    ENS_RPC_URL: lane("ens"),
    SEPOLIA_RPC_URL: lane("sepolia"),
    ETHEREUM_LOGS_RPC_URL: lane("ethereum-logs"),
    BASE_BACKFILL_RPC_URL: lane("base-logs"),
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return env;
}

function stopProxy() {
  if (!proxy) return;
  const p = proxy;
  proxy = null;
  try {
    p.kill("SIGTERM");
  } catch {
    /* already gone */
  }
}

async function rpcCountLines() {
  const status = await proxyStatus();
  if (!status) return ["RPC count: the proxy did not answer"];
  const t = status.totals;
  const lines = [
    `RPC through the proxy: ${t.calls} calls — ${t.replayed} replayed from cache, ${t.pinned} from the pin, ` +
      `${t.upstream} sent upstream (${t.cached} cached for next time), ${t.errors} upstream errors`,
  ];
  for (const [name, c] of Object.entries(status.lanesCount ?? {})) {
    const top = Object.entries(c.byMethod)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([m, n]) => `${m} ${n}`)
      .join(", ");
    lines.push(`  ${name}: ${c.calls} calls, ${c.upstream} upstream${top ? ` (${top})` : ""}`);
  }
  const pins = Object.entries(status.pins ?? {}).map(([c, h]) => `${c} ${parseInt(h, 16)}`);
  if (pins.length) lines.push(`  pinned: ${pins.join(", ")}`);
  if (t.calls === 0 && reusing)
    lines.push("  (no call reached the proxy: a server this runner did not start reads the chain on its own URLs)");
  return lines;
}

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

// The server's last lines, kept so that a death has a cause on record. On
// 2026-10-23 the server this runner started died 123 scripts into a pass
// (ERR_EMPTY_RESPONSE on a Base vault page, then refused connections) and the
// remaining 60 rows were a table of 0.3 s CRASHes that said nothing; its
// output had been discarded, so nothing said why.
const SERVER_TAIL = 30;
let serverTail = [];
let serverDeaths = [];
let serverRestarting = null;

function keepTail(chunk) {
  for (const line of String(chunk).split("\n")) {
    if (!line.trim()) continue;
    serverTail.push(line.trimEnd());
    if (serverTail.length > SERVER_TAIL) serverTail.shift();
  }
}

async function startServer() {
  const port = new URL(BASE).port || "3000";
  console.log(`· ${BASE} is not serving — starting next dev on :${port}`);
  const env = { ...process.env, ...proxiedEnv() };
  const child = spawn("npx", ["next", "dev", "--port", port], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server = child;
  serverTail = [];
  child.stdout.on("data", keepTail);
  child.stderr.on("data", keepTail);
  child.on("exit", (code, signal) => {
    // Stopped by this runner: `server` was cleared first. Anything else is a death.
    if (server !== child) return;
    serverDeaths.push({ code, signal, at: new Date().toISOString(), tail: serverTail.slice() });
  });

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

/** True when the server this runner started is no longer running. A server
 *  this runner did not start is nobody's to restart, so this is always false
 *  for it. */
function serverDied() {
  // A process a signal ended has a null exitCode and a signalCode instead.
  return server !== null && (server.exitCode !== null || server.signalCode !== null);
}

/** Called before each verifier: a dead server is restarted, with the death and
 *  its last lines printed, so the rows after it are read against a server
 *  rather than against a refused connection. One restart at a time under a
 *  pool: workers that arrive during it wait for the same promise. */
async function ensureServer(before) {
  if (!serverDied()) return;
  if (!serverRestarting) {
    serverRestarting = (async () => {
      const death = serverDeaths.at(-1);
      const how = death?.signal ? `killed by ${death.signal}` : `exit code ${death?.code ?? server.exitCode}`;
      console.log(`\n⚠ dev server DIED (${how}) before ${before} — its last lines:`);
      console.log((death?.tail ?? serverTail).join("\n").replace(/^/gm, "       │ "));
      server = null;
      await startServer();
      const unhealthy = await checkDevServer(BASE);
      if (unhealthy) throw new Error(`restarted dev server is not healthy:\n${unhealthy}`);
      console.log(`· dev server restarted (${serverDeaths.length} death(s) this run)\n`);
    })().finally(() => {
      serverRestarting = null;
    });
  }
  await serverRestarting;
}

for (const sig of ["exit", "SIGINT", "SIGTERM", "uncaughtException"]) {
  process.on(sig, (arg) => {
    // The handler exits before node would print the error, so print it here:
    // a server that never came up left "exit 1" and nothing else (23 Oct 2026).
    if (sig === "uncaughtException") console.error(`\n✗ run-all: ${arg?.stack ?? arg}`);
    stopServer();
    stopProxy();
    if (sig !== "exit") process.exit(1);
  });
}

// ── running one verifier ────────────────────────────────────────────────────

function runOne(job) {
  const { file, label } = job;
  return new Promise((resolve) => {
    const started = Date.now();
    // ⚠️ `ONLY` IS THIS RUNNER'S OWN SELECTOR AND MUST NOT REACH A CHILD.
    // A verifier that reads `ONLY` itself to pick FIXTURES (timeline-boundary-card)
    // would get a fixture filter matching none of its fixtures, run nothing,
    // print "0/0 checks passed" and be reported as a PASS. A verifier's own
    // fixture filter now travels as `FIXTURES=`, which is handed on under the
    // name that verifier reads — the SPLIT table's `env` (`FAMILIES` for
    // event-share and wallet-links), `ONLY` for the rest; this runner's
    // selector stops here. Until 24 Oct 2026 it went as `ONLY` to every
    // script, so `FIXTURES=` on event-share or wallet-links ran the whole
    // family list and timed out at the cap with no verdict.
    //
    // ⚠️ DO NOT PICK A CHEAP SCRIPT BY ITS LINE COUNT. Measured 2026-09-12: `verify-stage-rail-dots.mjs` (66 lines) runs in 2.4s, and
    // `verify-unscoped-prov.mjs` — FOUR LINES SHORTER — takes 125.7s, because a
    // short file can hold a loop over twenty routes. What a verifier costs is
    // how many pages it opens, and the only way to know is the seconds column
    // this runner already prints. Read it before choosing.
    const { ONLY: _runnerSelector, FIXTURES, ...inherited } = process.env;
    const [cmd, ...args] = file.endsWith(".ts")
      ? [TSX, ...tsFlags(file), join(HERE, file)]
      : [process.execPath, join(HERE, file)];
    // The proxied URLs go to the verifier too: a script that builds its own
    // viem client from the environment then reads through the cache like the
    // server does. One that parses .env.local itself is outside it.
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: {
        ...inherited,
        ...(proxied ? proxiedEnv() : {}),
        BASE,
        ...(FIXTURES ? { [SPLIT[file]?.env ?? "ONLY"]: FIXTURES } : {}),
        ...job.env,
      },
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
      resolve({ file: label, outcome: "CRASH", secs: (Date.now() - started) / 1000, detail: err.message, out });
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
      } else if (crashed(out) && (code !== 0 || !lines.some((l) => VERDICT_RE.test(l)))) {
        // A stack trace in the output of a script that exited 0 WITH a verdict is
        // something it printed on purpose (verify-ethereum-vault-cold-build prints
        // the error object its mocked-429 test provokes, then "14/14 checks
        // passed"); without a verdict, or with a non-zero exit, it is a death.
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
      resolve({ file: label, outcome, secs, detail, out });
    });
  });
}

// ── the run ─────────────────────────────────────────────────────────────────

console.log(`verify/run-all — ${scripts.length} script(s) against BASE=${BASE}\n`);

const reusing = !(await portIsFree(BASE));
const proxied = RPC_PROXY && (await startProxy());
if (reusing) {
  console.log(`· ${BASE} already serving — reusing it, and leaving it running`);
  if (proxied) console.log("  (its chain reads pass through the proxy only if it was started pointed at it)");
  console.log();
} else await startServer();

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
  // A red line is "FAIL …" in most scripts, "✗ …" or "❌ …" in the rest
  // (verify-operator-denominator, verify-polish-batch).
  const failing = r.outcome === "FAIL" ? lines.filter((l) => /\bFAIL(ED|URE|:)?\b|[✗❌]/i.test(l)) : [];
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
// Measured on one commit, 2026-09-12, with three of the timeline verifiers: on
// an idle machine they passed; with tsc and knip beside them, or under JOBS=2,
// one of them went red on an empty toolbar and another crashed on a control
// that had moved. None of that was the page being wrong. It was the scripts'
// waits being tight: fixed post-hydration sleeps, and waits on an element being
// VISIBLE while the shell is still animating it in. Under contention those
// windows close. A red that moves between runs costs more than the concurrency
// saves, and it teaches a reader to re-run a failure instead of believing it.
//
// `JOBS=2` (or more) is one env var away, for a selection of light scripts or a
// machine with room. The bar for moving the default is that the waits get
// fixed, meaning a wait on a control RESPONDING rather than on a timer.
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
// MEASURE=1 JOBS=2 — ALL PASS in 43.5s.
// So it is NOT quarantined, and the way back in is another measurement.
//
// `MEASURE=1` EMPTIES THIS MAP. That is the only way to take a measurement of a
// membership claim, because a quarantined script never shares a machine and so
// can never produce the evidence that would release it. It is not a speed knob:
// setting it puts every script here back into the pool and hands you the flaky
// configuration each entry below was written to avoid, with no warning at the
// point of use — the run just starts moving around. Reach for it to re-test an
// entry, read the entry first, and write down what came back.
const RUN_ALONE = process.env.MEASURE ? {} : {};

const results = [];
const queue = scripts.filter((f) => !RUN_ALONE[f]).flatMap(jobsFor);
const alone = scripts.filter((f) => RUN_ALONE[f]).flatMap(jobsFor);
async function worker() {
  for (;;) {
    const job = queue.shift();
    if (!job) return;
    if (SKIPS[job.file]) {
      const r = { file: job.label, outcome: "SKIP", secs: 0, detail: SKIPS[job.file] };
      results.push(r);
      report(r);
      console.log(`       ${SKIPS[job.file]}`);
      continue;
    }
    await ensureServer(job.label);
    const r = await runOne(job);
    if (serverDied()) {
      // The server went down under this script. Whatever it reported was read
      // against a dying server, so the row says that instead of a verdict.
      r.outcome = "CRASH";
      r.detail = `the dev server died during this script — ${r.detail}`;
    }
    results.push(r);
    report(r);
  }
}
console.log(
  `· ${queue.length + alone.length} row(s), ${JOBS} at a time${alone.length ? `, then ${alone.length} on their own` : ""}\n`,
);
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, worker));
// The pool has drained; these get the machine to themselves.
for (const job of alone) {
  console.log(`·      ${job.label} — alone: ${RUN_ALONE[job.file]}`);
  if (SKIPS[job.file]) {
    const r = { file: job.label, outcome: "SKIP", secs: 0, detail: SKIPS[job.file] };
    results.push(r);
    report(r);
    continue;
  }
  await ensureServer(job.label);
  const r = await runOne(job);
  if (serverDied()) {
    r.outcome = "CRASH";
    r.detail = `the dev server died during this script — ${r.detail}`;
  }
  results.push(r);
  report(r);
}
// Completion order is whatever finished first; the table below is the record,
// so it reads in the order the suite is listed in rather than the order the
// machine happened to get through it.
results.sort((a, b) => a.file.localeCompare(b.file));

if (!reusing) await stopServerGracefully();
const rpcLines = proxied
  ? await rpcCountLines()
  : ["RPC count: no proxy (RPC_PROXY=0 or no upstream), the key paid whole"];
stopProxy();

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
if (serverDeaths.length) {
  // On the pass line with the RPC count: a row read against a restarted
  // server is a row to re-run alone before it is classed.
  console.log(
    `\n⚠ dev server died ${serverDeaths.length} time(s) and was restarted — at ${serverDeaths.map((d) => d.at).join(", ")}`,
  );
}
console.log(`\n${rpcLines.join("\n")}`);

const red = tally("FAIL") + tally("CRASH");
process.exit(red ? 1 : 0);
