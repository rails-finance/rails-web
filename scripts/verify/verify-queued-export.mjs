#!/usr/bin/env node
// The queued CSV export (rails-ops decision 0029), end to end against a
// deployed preview and the onboarding box.
// ---------------------------------------------------------------------------
// A large export is requested (POST /api/exports), built on the box from the
// timeline route's own rows, kept 24 hours and collected with the token the
// request returned. This checks, live:
//
//   R  ROW FOR ROW — for each fixture the downloaded file is the served
//      history: the header is `date_utc` then the route's fields, and line i
//      is served row i with each cell the route's JSON value as text. The
//      served history is the un-windowed route read straight from the box;
//      where the route caps (50,000 rows) it is read in spans of time that
//      never split a transaction, and where it pages (Compound V2) its cursor
//      is drained. Rows the box served AFTER the file was built (a live
//      position gains events) are counted and allowed; nothing before them
//      may differ.
//   W  THROUGH THE WEB — the deep fixture is requested through BASE's
//      /api/exports proxy, polled there, and its download there is the box's
//      file formatted as the in-browser CSV is: byte for byte what
//      lib/sources/api/queued-export-format.ts writes for the box's gzipped
//      file, run here (verify-export-format.mjs FORMAT_ONLY).
//   L  THE LIMITS — a second request from the same reader while one is in
//      progress is refused (409); a wrong or missing token is refused on
//      status and download (404); the eleventh request in a day from one
//      reader is refused (429); a ready file is kept 24 hours.
//   S  A RESTART MID-JOB — with RESTART_CMD set (the api deploy), deep
//      exports are requested back to back while it runs; the job the restart
//      interrupted is taken up again (attempts ≥ 2), finishes, and its file
//      passes R. Without RESTART_CMD the arm prints SKIPPED.
//   (The 24-hour deletion runs on the box's clock and is proven with a short
//   TTL in rails-server-onboarding api/src/services/timeline-export/
//   timeline-export.test.ts.)
//
// Usage (the box URL and bearer token come from .env.local, never printed):
//   BASE=https://rails.finance node scripts/verify/verify-queued-export.mjs
//   RESTART_CMD="<a command that redeploys the api>" BASE=… node …
// BREAK=drop|cell|order|header|token|concurrent|daily|ttl|restart|format turns one
// check's input wrong; the run must go red on that check.

import { gunzipSync } from "node:zlib";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(path.join(REPO, ".env.local"));
} catch {
  /* the env must already carry RAILS_API_URL and API_BEARER_TOKEN */
}
const API = process.env.RAILS_API_URL;
const TOKEN = process.env.API_BEARER_TOKEN;
const BASE = process.env.BASE;
const BREAK = process.env.BREAK ?? "";
const RESTART_CMD = process.env.RESTART_CMD ?? "";
if (!API || !TOKEN || !BASE) {
  console.error("needs BASE, and RAILS_API_URL + API_BEARER_TOKEN (from .env.local)");
  process.exit(2);
}

const RUN = Date.now() % 100000;
/** A reader address of our own for each arm, so arms never meet each
 *  other's one-in-progress rule or daily count (198.18.0.0/15 is benchmark space). */
const reader = (arm) => `198.18.${arm}.${(RUN % 250) + 1}`;

let failures = 0;
let checks = 0;
const check = (id, ok, detail) => {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the box, direct ──────────────────────────────────────────────────────────
const boxHeaders = (readerIp) => ({
  Authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
  ...(readerIp ? { "X-Rails-Reader-IP": readerIp } : {}),
});
async function boxJson(pathQs, readerIp) {
  // The restart arm reads while the api container is being replaced: a refused
  // or reset connection is retried for up to three minutes, never a verdict.
  for (let tries = 0; ; tries++) {
    try {
      const r = await fetch(`${API}${pathQs}`, { headers: boxHeaders(readerIp) });
      return { status: r.status, body: await r.json().catch(() => null) };
    } catch (err) {
      if (tries >= 90) throw err;
      await sleep(2000);
    }
  }
}
async function boxRequest(protocol, params, readerIp) {
  const r = await fetch(`${API}/api/exports`, {
    method: "POST",
    headers: boxHeaders(readerIp),
    body: JSON.stringify({ protocol, params }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function waitReady(id, token, via = "box", ms = 10 * 60_000) {
  const t0 = Date.now();
  for (;;) {
    const s =
      via === "web"
        ? await fetch(`${BASE}/api/exports/${id}?token=${token}`).then(async (r) => ({
            status: r.status,
            body: await r.json().catch(() => null),
          }))
        : await boxJson(`/api/exports/${id}?token=${token}`);
    if (s.body?.status === "ready" || s.body?.status === "failed" || s.body?.status === "expired") return s.body;
    if (Date.now() - t0 > ms) return s.body;
    await sleep(1500);
  }
}
async function boxDownload(id, token) {
  const r = await fetch(`${API}/api/exports/${id}/download?token=${token}`, { headers: boxHeaders() });
  if (r.status !== 200) return { status: r.status, text: null };
  const gz = Buffer.from(await r.arrayBuffer());
  return { status: 200, gz, text: gunzipSync(gz).toString("utf8") };
}

/** The box's gzipped file as the download proxy formats it, run in this
 *  machine through verify-export-format.mjs (TypeScript needs its loader). */
function formattedHere(gz, family) {
  if (!gz) return null;
  const tmp = path.join(os.tmpdir(), `queued-export-${process.pid}.csv.gz`);
  writeFileSync(tmp, gz);
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts/verify/verify-export-format.mjs")], {
    env: { ...process.env, FORMAT_ONLY: tmp, FAMILY: family },
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
  unlinkSync(tmp);
  return r.status === 0 ? r.stdout : null;
}

// ── the served history ───────────────────────────────────────────────────────
// The same text rule as api/src/services/timeline-export/csv.ts.
const cellText = (v) =>
  v === null || v === undefined
    ? ""
    : typeof v === "string"
      ? v
      : typeof v === "number" || typeof v === "boolean"
        ? JSON.stringify(v)
        : JSON.stringify(v);
const csvEscape = (t) => (/[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
function dateUtc(ts) {
  const s = typeof ts === "number" ? String(ts) : typeof ts === "string" ? ts : "";
  if (/^\d{1,12}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
  if (s && !Number.isNaN(Date.parse(s))) return new Date(s).toISOString();
  return "";
}
const lineOf = (columns, row) =>
  [dateUtc(row.block_timestamp), ...columns.slice(1).map((c) => cellText(row[c]))].map(csvEscape).join(",");

/** Split a CSV text into records (RFC 4180, CRLF; a quoted cell may hold a comma
 *  or a quote). Each record is kept as its raw line for exact comparison. */
function records(text) {
  const out = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "\r" && text[i + 1] === "\n") {
      out.push(text.slice(start, i));
      start = i + 2;
      i++;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}
const splitCells = (line) => {
  const cells = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') ((cur += '"'), i++);
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") (cells.push(cur), (cur = ""));
    else cur += ch;
  }
  cells.push(cur);
  return cells;
};

async function servedRows(fx, fileRecords) {
  if (fx.pager === "cursor") {
    const rows = [];
    let cursor = null;
    do {
      const { status, body } = await boxJson(`${fx.route}&limit=5000${cursor ? `&cursor=${cursor}` : ""}`);
      if (status !== 200) throw new Error(`${fx.route} answered ${status}`);
      rows.push(...body.rows);
      cursor = body.nextCursor;
    } while (cursor);
    return rows;
  }
  const whole = await boxJson(fx.route);
  if (whole.status !== 200) throw new Error(`${fx.route} answered ${whole.status}`);
  if (!whole.body.truncated) return whole.body.rows;
  if (fx.pager !== "span") throw new Error(`${fx.route} is capped and has no span to page by`);
  // Capped: read spans of time cut where the timestamp changes, so no
  // transaction is split, each well under the cap. Timestamps from the file.
  const tsIdx = splitCells(fileRecords[0]).indexOf("block_timestamp");
  const rows = [];
  let from = null;
  let count = 0;
  let prevTs = null;
  const spans = [];
  for (const rec of fileRecords.slice(1)) {
    const ts = Number(splitCells(rec)[tsIdx]);
    if (from === null) from = ts;
    if (count >= 40_000 && ts !== prevTs) {
      spans.push([from, prevTs]);
      from = ts;
      count = 0;
    }
    count++;
    prevTs = ts;
  }
  spans.push([from, Math.floor(Date.now() / 1000) + 3600]);
  for (const [a, b] of spans) {
    const { status, body } = await boxJson(`${fx.route}&from=${a}&to=${b}`);
    if (status !== 200 || body.truncated)
      throw new Error(`span ${a}-${b} answered ${status}${body?.truncated ? " (capped)" : ""}`);
    rows.push(...body.rows);
  }
  return rows;
}

/** R: the file against the served history. */
async function rowForRow(id, fx, text) {
  let recs = records(text);
  if (BREAK === "drop" && recs.length > 50) recs = [...recs.slice(0, 40), ...recs.slice(41)];
  if (BREAK === "cell" && recs.length > 20)
    recs[20] = recs[20].replace(/\d(?=[^\d]*$)/, (d) => String((Number(d) + 1) % 10));
  if (BREAK === "order" && recs.length > 12) [recs[10], recs[11]] = [recs[11], recs[10]];
  if (BREAK === "header") recs[0] = recs[0].replace("block_number", "block_no");
  const columns = splitCells(recs[0]);
  const served = await servedRows(fx, recs);
  const fields = served.length ? [...new Set(served.flatMap((r) => Object.keys(r)))] : [];
  const headerOk =
    columns[0] === "date_utc" &&
    fields.every((f) => columns.includes(f)) &&
    columns.slice(1).every((c) => fields.includes(c) || fx.optional?.includes(c));
  check(
    `${id} R1`,
    headerOk,
    `header = date_utc + the route's ${fields.length} fields (${columns.length - 1} columns)`,
  );
  const fileRows = recs.slice(1);
  let firstDiff = -1;
  const n = Math.min(fileRows.length, served.length);
  for (let i = 0; i < n; i++) {
    if (fileRows[i] !== lineOf(columns, served[i])) {
      firstDiff = i;
      break;
    }
  }
  const newer = served.length - fileRows.length;
  const cellDiff = (i) => {
    const f = splitCells(fileRows[i]);
    const e = splitCells(lineOf(columns, served[i]));
    return columns
      .map((c, k) =>
        f[k] === e[k]
          ? null
          : `${c}: file ${JSON.stringify(f[k]).slice(0, 90)} / served ${JSON.stringify(e[k]).slice(0, 90)}`,
      )
      .filter(Boolean)
      .slice(0, 6)
      .join("; ");
  };
  const detail =
    firstDiff >= 0
      ? `row ${firstDiff + 1} of ${fileRows.length} differs (${splitCells(fileRows[firstDiff])[0]}): ${cellDiff(firstDiff)}`
      : `${fileRows.length.toLocaleString("en-US")} rows equal the served history in order` +
        (newer > 0 ? ` (${newer} served since the file was built, allowed)` : "");
  check(
    `${id} R2`,
    firstDiff < 0 && newer >= 0,
    newer < 0 ? `the file has ${-newer} rows the route does not serve` : detail,
  );
  return fileRows.length;
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const FIXTURES = [
  {
    id: "aave-v3 deep 0xee7c…2954",
    protocol: "aave-v3",
    params: { wallet: "0xee7ca610d896c53ffe716b801c05748efd902954", market: "core" },
    route: "/api/aave-v3/timeline?wallet=0xee7ca610d896c53ffe716b801c05748efd902954&market=core&swaps=1",
    pager: "span",
    optional: ["swap"],
    viaWeb: true,
  },
  {
    id: "aave-v3 capped 0xd016…5722",
    protocol: "aave-v3",
    params: { wallet: "0xd01607c3c5ecaba394d8be377a08590149325722", market: "core" },
    route: "/api/aave-v3/timeline?wallet=0xd01607c3c5ecaba394d8be377a08590149325722&market=core&swaps=1",
    pager: "span",
    optional: ["swap"],
  },
  {
    id: "maple small",
    protocol: "maple",
    params: { wallet: null }, // resolved below: the last wallet on the listing's first page
    route: null,
  },
  {
    id: "maple deep 0x134c…df76",
    protocol: "maple",
    params: { wallet: "0x134ccaaa4f1e4552ec8aecb9e4a2360ddcf8df76" },
    route: "/api/maple/timeline?wallet=0x134ccaaa4f1e4552ec8aecb9e4a2360ddcf8df76",
  },
  {
    id: "spark deep 0xed0c…4312",
    protocol: "spark",
    params: { wallet: "0xed0c6079229e2d407672a117c22b62064f4a4312" },
    route: "/api/spark/timeline?wallet=0xed0c6079229e2d407672a117c22b62064f4a4312",
  },
  {
    id: "compound-v3 deep 0xe7f5…e110 usdc",
    protocol: "compound-v3",
    params: { wallet: "0xe7f525dd1bc6d748ae4d7f21d31e54741e05e110", market: "usdc" },
    route: "/api/compound/timeline?wallet=0xe7f525dd1bc6d748ae4d7f21d31e54741e05e110&market=usdc",
  },
  {
    id: "compound-v2 deep 0xeb21…bc06 (8 pages)",
    protocol: "compound-v2",
    params: { wallet: "0xeb21209ae4c2c9ff2a86aca31e123764a3b6bc06" },
    route: "/api/compound-v2/timeline?wallet=0xeb21209ae4c2c9ff2a86aca31e123764a3b6bc06",
    pager: "cursor",
  },
];

/** The last wallet on the Maple listing's first page: a position with a
 *  short history, for the small fixture. */
async function pickSmallMapleWallet() {
  const { body } = await boxJson("/api/maple/positions?limit=50");
  const w = (body?.rows ?? []).map((p) => p.wallet).filter((x) => typeof x === "string");
  return w[w.length - 1];
}

async function resolveFixtures() {
  for (const fx of FIXTURES) {
    if (fx.params.wallet) continue;
    const w = await pickSmallMapleWallet();
    if (!w) throw new Error(`no wallet for ${fx.id}`);
    fx.params.wallet = w.toLowerCase();
    fx.id = `${fx.id} ${w.slice(0, 6)}…${w.slice(-4)}`;
    fx.route = `/api/maple/timeline?wallet=${fx.params.wallet}`;
  }
}

// ── the run ──────────────────────────────────────────────────────────────────
console.log(`queued export — BASE ${BASE}, box ${API.replace(/\/\/.*@/, "//")}${BREAK ? `, BREAK=${BREAK}` : ""}\n`);
await resolveFixtures();

// W + L on the deep fixture, through the web, as this machine's own reader.

// ONLY=web | daily | <part of a fixture id> runs just that arm.
if (!process.env.ONLY || process.env.ONLY === "web") {
  const fx = FIXTURES[0];
  const post = () =>
    fetch(`${BASE}/api/exports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocol: fx.protocol, params: fx.params }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const first = await post();
  check(
    "W1",
    first.status === 202 && /^[0-9a-f]{64}$/.test(first.body?.token ?? ""),
    `web request answered ${first.status}${first.body?.code ? ` ${first.body.code}` : ""}`,
  );
  if (first.status !== 202) {
    console.log(`\n${failures} CHECK(S) FAILED of ${checks}`);
    process.exit(1);
  }
  const { id, token } = first.body;
  if (BREAK === "concurrent") await waitReady(id, token, "web");
  const second = await post();
  check(
    "L1",
    second.status === 409 && second.body?.code === "EXPORT_IN_PROGRESS",
    `a second request while one is in progress answered ${second.status} ${second.body?.code ?? ""}`,
  );
  const bad = BREAK === "token" ? token : token.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  const badStatus = await fetch(`${BASE}/api/exports/${id}?token=${bad}`).then((r) => r.status);
  const noToken = await fetch(`${BASE}/api/exports/${id}`).then((r) => r.status);
  check("L2", badStatus === 404 && noToken === 404, `status with a wrong token ${badStatus}, with none ${noToken}`);
  const job = await waitReady(id, token, "web");
  check("W2", job?.status === "ready", `the job is ${job?.status} (${job?.rowsWritten ?? "?"} rows)`);
  const badDl = await fetch(`${BASE}/api/exports/${id}/download?token=${bad}`).then((r) => r.status);
  check("L3", badDl === 404, `download with a wrong token ${badDl}`);
  const ttl = (Date.parse(job.expiresAt) - Date.parse(job.readyAt)) / 1000;
  check(
    "L4",
    Math.abs(ttl - (BREAK === "ttl" ? 23 : 24) * 3600) <= 2,
    `kept ${(ttl / 3600).toFixed(3)} h after it was ready`,
  );
  const web = await fetch(`${BASE}/api/exports/${id}/download?token=${token}`);
  const webText = Buffer.from(await web.arrayBuffer()).toString("utf8");
  const box = await boxDownload(id, token);
  const expected = formattedHere(box.gz, fx.protocol);
  const webBody = BREAK === "format" ? webText.replace(/,(\d)/, (_, d) => `,${(Number(d) + 1) % 10}`) : webText;
  check(
    "W3",
    web.status === 200 && (web.headers.get("content-type") ?? "").startsWith("text/csv") && webBody === expected,
    `web download ${web.status} ${web.headers.get("content-type")}, ${web.headers.get("content-disposition")}; ` +
      `equals the box's file formatted here (${Buffer.byteLength(expected ?? "")} bytes): ${webBody === expected}`,
  );
  await rowForRow(fx.id, fx, box.text);
}

// R on every other fixture, straight to the box, one reader each.
for (const [i, fx] of FIXTURES.slice(1).entries()) {
  if (process.env.ONLY && !fx.id.includes(process.env.ONLY)) continue;
  const t0 = Date.now();
  const r = await boxRequest(fx.protocol, fx.params, reader(10 + i));
  if (r.status !== 202) {
    check(`${fx.id} R0`, false, `request answered ${r.status} ${r.body?.code ?? ""}`);
    continue;
  }
  const job = await waitReady(r.body.id, r.body.token);
  check(
    `${fx.id} R0`,
    job?.status === "ready",
    `${job?.status}, ${job?.rowsWritten?.toLocaleString("en-US")} rows, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  const dl = await boxDownload(r.body.id, r.body.token);
  if (dl.text) await rowForRow(fx.id, fx, dl.text);
}

// L5: the daily limit, as one reader: ten small requests, one after another.
if (!process.env.ONLY || process.env.ONLY === "daily") {
  const small = FIXTURES[2];
  const who = reader(40);
  const allowed = BREAK === "daily" ? 9 : 10;
  let ok = 0;
  for (let i = 0; i < allowed; i++) {
    const r = await boxRequest(small.protocol, small.params, who);
    if (r.status !== 202) break;
    ok++;
    await waitReady(r.body.id, r.body.token);
  }
  const over = await boxRequest(small.protocol, small.params, who);
  check(
    "L5",
    ok === allowed && over.status === 429 && over.body?.code === "EXPORT_DAILY_LIMIT",
    `${ok} requests accepted, then ${over.status} ${over.body?.code ?? ""}`,
  );
}

// S: a restart mid-job.
if (!RESTART_CMD && BREAK !== "restart") {
  console.log("SKIPPED  S  RESTART_CMD is not set");
} else {
  const deep = FIXTURES[1];
  const jobs = [];
  let restartDone = false;
  let restartCode = null;
  if (BREAK !== "restart") {
    const child = spawn("sh", ["-c", RESTART_CMD], { stdio: ["ignore", "ignore", "ignore"] });
    child.on("exit", (c) => ((restartDone = true), (restartCode = c)));
  } else {
    setTimeout(() => (restartDone = true), 30_000);
  }
  let k = 0;
  while (!restartDone) {
    const r = await boxRequest(deep.protocol, deep.params, reader(60 + (k++ % 50))).catch(() => null);
    if (r?.status === 202) {
      jobs.push(r.body);
      // Wait for this one to finish or the restart to end, whichever first.
      for (;;) {
        const s = await boxJson(`/api/exports/${r.body.id}?token=${r.body.token}`).catch(() => null);
        if (restartDone || s?.body?.status === "ready" || s?.body?.status === "failed") break;
        await sleep(1000);
      }
    } else await sleep(2000);
  }
  let resumed = null;
  for (const j of jobs) {
    const s = await waitReady(j.id, j.token);
    if (s?.attempts >= 2) resumed = { ...j, state: s };
  }
  check(
    "S1",
    resumed?.state?.status === "ready",
    resumed
      ? `the job the restart interrupted was taken up again (attempt ${resumed.state.attempts}) and is ${resumed.state.status}, ${resumed.state.rowsWritten?.toLocaleString("en-US")} rows; restart exit ${restartCode}`
      : `no job was interrupted (${jobs.length} requested during the restart; exit ${restartCode})`,
  );
  if (resumed?.state?.status === "ready") {
    const dl = await boxDownload(resumed.id, resumed.token);
    if (dl.text) await rowForRow(`S2 ${deep.id}`, deep, dl.text);
  }
}

console.log(failures ? `\n${failures} CHECK(S) FAILED of ${checks}` : `\nALL ${checks} CHECKS PASS`);
process.exit(failures ? 1 : 0);
