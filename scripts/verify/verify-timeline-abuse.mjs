#!/usr/bin/env node
// Timeline routes — abuse prevention at the edge.
// ---------------------------------------------------------------------------
// Every timeline route (`/api/<protocol>/…/timeline`) answers a free
// parameter with a backend query, and a request WITHOUT `?recent=N` asks for
// the whole history — the expensive shape. The explorers themselves always
// send `recent`, so a bare `/timeline` request is a scraper or a mistake, and
// the Vercel Firewall on the project serving preview.rails.finance rate-limits
// it before it reaches a function:
//
//   IF   request path contains `/timeline`
//   AND  query parameter `recent` does not exist
//   →    rate limit, fixed window 60 s, 60 requests, keyed on IP → Deny (403)
//
// It sits beside the "Share image rate limit" rule that
// verify-share-abuse.mjs D3 checks. This asserts the rule is live and scoped
// as written, against the deployed preview only:
//
//   T1  THE BURST — 70 distinct requests (`?n=<i>`) inside one minute to a
//       cheap `/timeline` path with NO `recent` meet at least one 403. The
//       path is `/api/ebisu/sUSDe/hello/timeline`: it passes the edge like any
//       timeline request, and the backend rejects `hello` at its trove-id
//       check with a 400 before any query, so the burst costs it nothing.
//   T3  THE SCOPE — while the runner's IP is still denied on `/timeline`, one
//       request to a non-timeline path with no `recent`
//       (`/api/ebisu/sUSDe/hello`) is NOT 403. Run straight after T1 because
//       that is when a rule matching too widely would show.
//   T2  THE EXEMPTION — after the window has cleared (61 s past T1's last
//       request; the window's alignment is Vercel's, so it is measured from
//       the end), the same 70 requests WITH `recent=100` meet ZERO 403s.
//
// All three are live only: without BASE pointing at the preview they print
// SKIPPED, and T1/T2 also need BURST=1 because the burst blocks the runner's
// own IP on every `/timeline` path for the rest of the window. Never a
// vacuous green. Requests run five at a time; nothing secret is involved and
// no URL or header value beyond the status is printed.
//
// Run:  BASE=https://preview.rails.finance BURST=1 node scripts/verify/verify-timeline-abuse.mjs

const BASE = process.env.BASE ?? "http://localhost:3000";
const LIVE = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
const BURST = process.env.BURST === "1";

const TIMELINE_PATH = "/api/ebisu/sUSDe/hello/timeline";
const NON_TIMELINE_PATH = "/api/ebisu/sUSDe/hello";
const REQUESTS = 70;
const CONCURRENCY = 5;
const WINDOW_MS = 60_000;

let checked = 0;
let failures = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);
const skipped = (name, why) => console.log(`SKIPPED  ${name} — ${why}`);
const secs = (ms) => `${(ms / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} s`;

const get = async (p) => {
  try {
    const res = await fetch(`${BASE}${p}`, { headers: { "user-agent": "rails-verify" } });
    await res.arrayBuffer(); // drain, so the socket is reused
    return res.status;
  } catch {
    return -1;
  }
};

// `count` requests to `path` with a distinct `n=<i>` each, `CONCURRENCY` in
// flight. Returns the status tally and the wall time from first send to last
// response.
async function burst(path, count) {
  const statuses = new Array(count);
  let next = 0;
  const t0 = Date.now();
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= count) return;
      const sep = path.includes("?") ? "&" : "?";
      statuses[i] = await get(`${path}${sep}n=${i}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { statuses, elapsed: Date.now() - t0, endedAt: Date.now() };
}

const tally = (statuses) => {
  const m = new Map();
  for (const s of statuses) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([s, n]) => `${n} × ${s === -1 ? "error" : s}`)
    .join(", ");
};
const count403 = (statuses) => statuses.filter((s) => s === 403).length;

if (!LIVE) {
  skipped("T1–T3. live checks", `BASE is ${BASE}; run with BASE=https://preview.rails.finance BURST=1`);
} else if (!BURST) {
  skipped(
    "T1–T3. the burst and its scope",
    "BURST=1 not set; T1 blocks the runner's IP on every /timeline path for the rest of the window, so it is opt-in",
  );
} else {
  info("burst", `${REQUESTS} requests, ${CONCURRENCY} in flight, against ${TIMELINE_PATH}`);

  const t1 = await burst(TIMELINE_PATH, REQUESTS);
  check(
    "T1. live burst: 70 distinct /timeline requests with NO recent inside one minute → at least one 403 (Deny) from the edge",
    t1.elapsed < WINDOW_MS && count403(t1.statuses) >= 1,
    `${tally(t1.statuses)}, in ${secs(t1.elapsed)}`,
  );

  const t3 = await get(NON_TIMELINE_PATH);
  check(
    "T3. live scope: while the IP is denied on /timeline, one non-timeline request with no recent is not 403",
    t3 !== 403 && t3 !== -1,
    `${t3 === -1 ? "error" : t3}`,
  );

  const wait = Math.max(0, t1.endedAt + WINDOW_MS + 1_000 - Date.now());
  info("window", `waiting ${secs(wait)} for the fixed window to clear before T2`);
  await new Promise((r) => setTimeout(r, wait));

  const t2 = await burst(`${TIMELINE_PATH}?recent=100`, REQUESTS);
  check(
    "T2. live exemption: 70 distinct /timeline requests WITH recent=100 inside one minute → zero 403s",
    t2.elapsed < WINDOW_MS && count403(t2.statuses) === 0 && t2.statuses.every((s) => s !== -1),
    `${tally(t2.statuses)}, in ${secs(t2.elapsed)}`,
  );
}

console.log(`\n${checked - failures}/${checked} passed${failures ? ` — ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
