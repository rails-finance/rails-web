#!/usr/bin/env node
// verify-chain-all — every per-protocol chain verifier, in sequence.
// ----------------------------------------------------------------------------
// scripts/verify-<proto>-chain.mjs each check one explorer's claims against the
// live contracts. They were written one per onboarding and have never been run
// as a set, so a regression in one could sit unnoticed while the others stayed
// green. This runs all of them and reports one table.
//
// ⇒ THREE OUTCOMES, NOT TWO. A verifier that throws before printing its own
// summary has said nothing about the protocol — that is an absence of evidence,
// not a passing or failing claim, and reporting it as either is a lie about
// what was checked:
//
//   PASS   — reached its verdict, and the verdict is green.
//   FAIL   — reached its verdict, and the verdict is red. This is a finding.
//   CRASH  — never reached a verdict: an uncaught throw (a missing key, an RPC
//            refusal — a stack trace, or the "Node.js v…" line node prints as
//            it dies), a timeout, a kill signal, or exit 0 having printed
//            nothing at all. The last is treated as a CRASH rather than a pass
//            on purpose: a script that exits green having checked nothing is
//            the failure mode this repo has actually been bitten by.
//   SKIP   — declared not runnable here, with a reason, in SKIPS below.
//
// Environment. The children each read ../.env.local off disk themselves; this
// reads it the same way, only to state the preconditions up front rather than
// let nineteen scripts discover them one at a time:
//   · ALCHEMY_URL              — required by every Ethereum child. Without it
//                                each of them throws on startup and reads CRASH.
//   · BASE_RPC_URL             — required by the Base children
//                                (verify-aave-v3-base-chain, verify-seamless-chain,
//                                and verify-liquity-forks-chain's Basedollar pass).
//                                Full archive for eth_call; its eth_getLogs answers
//                                ten blocks at a time, so no child here sweeps logs
//                                on it.
//   · RAILS_API_URL            — gates the indexed-sample checks in the twelve
//   · API_BEARER_TOKEN           children that cross-check the index. Those
//                                children degrade with a stated reason rather
//                                than failing, so a run without them is a
//                                NARROWER green, not the same green.
//
// Usage:
//   node scripts/verify-chain-all.mjs
//   ONLY=llamalend,fluid node scripts/verify-chain-all.mjs   (substring filter)
//   TIMEOUT_MS=900000 node scripts/verify-chain-all.mjs

import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// Chain verifiers walk large log ranges and batch hundreds of eth_calls; the
// slowest legitimately take minutes. 420s only fires on a genuine hang.
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 420_000);

// Nothing is skipped today. Anything added here is evidence nobody is
// collecting, so it carries a reason, not a shrug.
const SKIPS = {};

// ⚠️ A SUITE CAN MANUFACTURE ITS OWN FAILURES. Run back-to-back, these children
// share one rate-limit window at the indexed backend and at Etherscan, and the
// first request of a script lands inside the window the previous script just
// filled. The first full run lost verify-frankencoin-chain and verify-fx-chain
// to HTTP 429 within half a second of starting — both pass on their own — and
// verify-pwn-chain to Etherscan's 3/sec. That is the runner failing the
// protocol, not the protocol failing, and it is indistinguishable from a real
// CRASH in the table. A pause between children buys the window back.
const GAP_MS = Number(process.env.GAP_MS ?? 5_000);

// The chain suite's summary vocabulary, as it actually is in the tree: "ALL
// CHECKS GREEN/PASS/PASSED", "ALL CHAIN CHECKS PASS", "N CHECK(S) FAILED",
// "N FAILURES", "N passed · N failed", "N/M checks passed", "N PASS, N FAIL".
//
// ⚠️ FOR PICKING THE DETAIL LINE ONLY — NOT THE CLASSIFIER, WHICH IT USED TO
// BE. Classifying on "did it print a phrase I recognise" made every summary
// form not enumerated here look like a crash: the first full run reported
// verify-aave-v4-chain and verify-morpho-chain as CRASHes when both had run
// clean and exited 0, saying "ALL CHAIN CHECKS PASS" and "51 PASS, 0 FAIL". A
// false CRASH is indistinguishable from a real one in the table, so the
// classifier now looks for evidence a crash HAPPENED instead.
const VERDICT_RE =
  /(ALL(\s+\w+)*\s+CHECKS?\b|\d+\s+passed\b|checks passed|\d+\s+CHECK\(S\)\s+FAILED|\d+\s+FAILURES?\b|\d+\s+failed\b|\d+\s+PASS,\s*\d+\s+FAIL)/i;

// Node prints "Node.js v<version>" as its last line when an uncaught throw
// terminates the process; a stack frame is the other reliable tell. Either
// means the script stopped where it stood, whatever it printed beforehand.
const crashed = (out) => /^Node\.js v\d/m.test(out) || (/^\s{4}at\s+\S/m.test(out) && /\b\w*Error\b/.test(out));
const errorLine = (lines) =>
  lines
    .find((l) => /\b\w*Error\b/.test(l) && !/^\s{4}at\s/.test(l))
    ?.trim()
    .slice(0, 120);

// Read .env.local the way the children do — one regex per key off the raw file,
// no dotenv dependency — so the preflight cannot disagree with what they see.
function envValue(text, key) {
  return text
    .match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
    ?.trim()
    .replace(/^"|"$/g, "");
}

let envText = "";
try {
  envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
} catch (e) {
  console.log(`⚠ could not read .env.local (${e.code ?? e.message}) — every child will throw on startup.\n`);
}
const ALCHEMY_URL = envValue(envText, "ALCHEMY_URL");
const BASE_RPC_URL = envValue(envText, "BASE_RPC_URL");
const RAILS_API_URL = envValue(envText, "RAILS_API_URL");
const API_BEARER_TOKEN = envValue(envText, "API_BEARER_TOKEN");

const scripts = readdirSync(HERE)
  .filter((f) => /^verify-.*-chain\.mjs$/.test(f))
  .filter((f) => !process.env.ONLY || process.env.ONLY.split(",").some((s) => f.includes(s.trim())))
  .sort();

function runOne(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(HERE, file)], {
      cwd: join(HERE, ".."),
      env: { ...process.env },
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
        outcome = "CRASH";
        detail = `printed nothing at all (exit ${code})`;
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

console.log(`verify-chain-all — ${scripts.length} protocol verifier(s)\n`);
console.log(`· ALCHEMY_URL       ${ALCHEMY_URL ? "present" : "MISSING — every Ethereum child will throw on startup"}`);
console.log(`· BASE_RPC_URL      ${BASE_RPC_URL ? "present" : "MISSING — every Base child will throw on startup"}`);
console.log(
  `· RAILS_API_URL     ${RAILS_API_URL ? "present" : "absent — indexed-sample checks will degrade, per child"}`,
);
console.log(
  `· API_BEARER_TOKEN  ${API_BEARER_TOKEN ? "present" : "absent — indexed-sample checks will degrade, per child"}\n`,
);

const results = [];
let ran = 0;
for (const file of scripts) {
  if (SKIPS[file]) {
    console.log(`SKIP   ${file}\n       ${SKIPS[file]}`);
    results.push({ file, outcome: "SKIP", secs: 0, detail: SKIPS[file] });
    continue;
  }
  if (ran++ && GAP_MS) await new Promise((r) => setTimeout(r, GAP_MS));
  process.stdout.write(`·      ${file} … `);
  const r = await runOne(file);
  console.log(`${r.outcome} (${r.secs.toFixed(1)}s)`);
  if (r.outcome !== "PASS") {
    // Print the RIGHT evidence, not just the end of it. A chain verifier prints
    // its failures as it goes and its count last, so a blind tail can show
    // twenty-five passing lines and none of what broke. For a FAIL the evidence
    // is the failing lines; for a CRASH it is the tail, where the trace is.
    const lines = r.out.split("\n").map((l) => l.trimEnd());
    const failing = r.outcome === "FAIL" ? lines.filter((l) => /\bFAIL(ED|URE|:)?\b/i.test(l)) : [];
    const shown = failing.length ? failing.slice(0, 20) : lines.filter(Boolean).slice(-25);
    console.log(shown.join("\n").replace(/^/gm, "       │ "));
    if (failing.length > 20) console.log(`       │ … and ${failing.length - 20} more failing line(s)`);
  }
  results.push(r);
}

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
if (!RAILS_API_URL || !API_BEARER_TOKEN)
  console.log("⚠ this green is NARROWER than a full run — the indexed-sample checks did not run.");

process.exit(tally("FAIL") + tally("CRASH") ? 1 : 0);
