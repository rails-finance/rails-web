// One host per page read: the app's own fetch helpers (lib/api/fetch-*.ts)
// call `fetch("/api/...")` with a same-origin path, the way the browser runs
// them. `onHost(base, fn)` runs fn with every relative URL resolved against
// `base`, the Vercel bypass header added where the host is one of ours
// (scripts/verify/lib/host.mjs holds the secret and never prints it), each
// request logged on the page's record, and the /timeline paths paced under the
// Vercel Firewall rule.
//
// THE PACING. The Firewall refuses a 301st request to a path containing
// `/timeline` (without `recent`) in a fixed 60 s window, per IP, across the
// project — preview and production are one project, so the two hosts share
// the budget. TIMELINE_GAP_MS spaces those requests at most 150 a minute,
// whatever the concurrency; a refusal that still arrives (another process on
// this IP) is waited out once and retried.

import { AsyncLocalStorage } from "node:async_hooks";
import { bypassHeaders } from "../../verify/lib/host.mjs";

const realFetch = globalThis.fetch;
const store = new AsyncLocalStorage();

/** Minimum spacing between two Firewall-counted /timeline requests. */
const TIMELINE_GAP_MS = 400;
/** A sweep route can take half a minute; anything past this is a failure. */
const REQUEST_TIMEOUT_MS = 180_000;

let nextTimelineAt = 0;
/** Requests sent to the hosts this run, and how many the Firewall rule counts. */
const sent = { all: 0, timeline: 0 };
export const requestsSent = () => ({ ...sent });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function countedByTimelineRule(u) {
  return u.pathname.includes("/timeline") && !u.searchParams.has("recent");
}

async function paceTimeline() {
  const now = Date.now();
  const at = Math.max(now, nextTimelineAt);
  nextTimelineAt = at + TIMELINE_GAP_MS;
  if (at > now) await sleep(at - now);
}

function urlOf(input) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

async function send(url, init) {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(bypassHeaders(url))) headers.set(k, v);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return realFetch(url, { ...init, headers, signal });
}

globalThis.fetch = async function gateFetch(input, init) {
  const ctx = store.getStore();
  if (!ctx) return realFetch(input, init);
  const u = new URL(urlOf(input), ctx.base);
  if (ctx.capture) {
    // captureUrls: note the path and send nothing.
    ctx.capture.push(u.pathname + u.search);
    return new Response("{}", { status: 599 });
  }
  const url = u.href;
  const counted = countedByTimelineRule(u);
  if (counted) await paceTimeline();
  sent.all++;
  if (counted) sent.timeline++;
  const started = Date.now();
  let res;
  try {
    res = await send(url, init);
    if (counted && (res.status === 429 || res.status === 403) && res.headers.get("x-vercel-mitigated")) {
      console.error(`  (the Vercel Firewall refused ${u.pathname}; waiting 61 s to retry)`);
      await sleep(61_000);
      sent.all++;
      sent.timeline++;
      res = await send(url, init);
    }
  } catch (err) {
    ctx.requests.push({ url: u.pathname + u.search, status: "failed", ms: Date.now() - started });
    throw err;
  }
  ctx.requests.push({ url: u.pathname + u.search, status: res.status, ms: Date.now() - started });
  return res;
};

/** Run `fn` with relative fetches going to `base`. Resolves to fn's value and
 *  the requests it made. */
export async function onHost(base, fn) {
  const ctx = { base: base.replace(/\/$/, "") + "/", requests: [] };
  const value = await store.run(ctx, fn);
  return { value, requests: ctx.requests };
}

/** The paths the app's own fetch helpers request, without requesting them:
 *  `fn` returns the helper calls' promises; every fetch they make is noted and
 *  answered 599, so each helper fails once it has built its URL. A route map
 *  built this way takes the query the page sends from the code that sends it.
 *  Throws when nothing was requested (a helper renamed under the map). */
export async function captureUrls(fn) {
  const ctx = { base: "https://capture.invalid/", requests: [], capture: [] };
  await store.run(ctx, async () => {
    try {
      await Promise.allSettled([].concat(await fn()));
    } catch {
      // A helper that throws before it fetches leaves nothing to note.
    }
  });
  if (ctx.capture.length === 0) throw new Error("the route map's helpers requested nothing");
  return ctx.capture;
}

/** GET a path on the current host as JSON; null on a non-2xx answer. */
export async function getJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}
