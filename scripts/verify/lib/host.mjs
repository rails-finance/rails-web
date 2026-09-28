// The host a verifier reads, and the header that gets it past Vercel
// Authentication. For the verifiers that read a deployment rather than a dev
// server.
// ----------------------------------------------------------------------------
// Since 2026-09-24 the Vercel project builds `main` as rails.finance and the
// `preview` branch as dev.rails.finance, and dev.rails.finance sits behind
// Vercel Authentication: a bare request is answered 302 to the Vercel login.
// preview.rails.finance is a public 308 to the apex, so a verifier that still
// named it was reading production through a redirect.
//
// A request gets through with `x-vercel-protection-bypass: <secret>`, the
// project's VERCEL_AUTOMATION_BYPASS_SECRET (.env.local, or the process env).
// The secret is read here and sent, never printed. It is sent only to this
// project's own hosts, so a BASE pointed elsewhere does not carry it.
//
//   import { BASE, hostFetch, bypassHeaders } from "./lib/host.mjs";
//
//   BASE            https://dev.rails.finance unless BASE is set in the env
//                   (a local dev server, or production), trailing slash off.
//   hostFetch       fetch, with the header added when the URL is one of ours.
//   bypassHeaders   the header alone, for a Playwright context:
//                   browser.newContext({ extraHTTPHeaders: bypassHeaders() }).
//
// Without the secret every call is plain fetch, and a run against
// dev.rails.finance reports the 302 it gets.
//
// THE TIMELINE FIREWALL RULE. Since 2026-09-24 the Vercel Firewall on this
// project denies (403, `x-vercel-mitigated: deny`) a 61st request in a fixed
// 60 s window, per IP, to any path containing `/timeline` without a `recent`
// parameter (rails-ops playbooks/deployment.md, "Vercel Firewall rules";
// verify-timeline-abuse.mjs checks it). `/timeline?group=1` and
// `/timeline/folder` both match, so a verifier that opens every folder of
// two positions meets the rule mid-run and reads its 403s as the route
// refusing. hostFetch keeps such requests to TIMELINE_BUDGET in any rolling
// minute, and a Deny that still arrives (a browser context's requests
// count too, and they do not pass through here) is waited out and retried
// once. `reserveTimeline(n)` books n slots before a page load for that reason.
// A local dev server has no firewall, so none of this applies to it.

import { existsSync, readFileSync } from "node:fs";

export const DEFAULT_BASE = "https://dev.rails.finance";
export const BASE = (process.env.BASE ?? DEFAULT_BASE).replace(/\/$/, "");

const SECRET_KEY = "VERCEL_AUTOMATION_BYPASS_SECRET";
const HEADER = "x-vercel-protection-bypass";

/** This project's hosts: the only ones the secret is sent to. */
const OWN_HOST = /(^|\.)rails\.finance$|\.vercel\.app$/;

/** .env.local at the repo root, three levels up, the way the sibling verifiers
 *  read it; an absent file is an empty env. */
function readEnvLocal() {
  const file = new URL("../../../.env.local", import.meta.url);
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [
        l.slice(0, l.indexOf("=")).trim(),
        l
          .slice(l.indexOf("=") + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ]),
  );
}

let secret;
function bypassSecret() {
  if (secret === undefined) secret = process.env[SECRET_KEY] || readEnvLocal()[SECRET_KEY] || null;
  return secret;
}

/** The bypass header for `url` (BASE by default): `{}` when there is no secret
 *  or the host is not ours. */
export function bypassHeaders(url = BASE) {
  const s = bypassSecret();
  if (!s) return {};
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return {};
  }
  return OWN_HOST.test(host) ? { [HEADER]: s } : {};
}

/** The rule allows 60 requests per fixed window; 50 in any rolling minute
 *  stays under it wherever Vercel's window boundary falls, with room for a
 *  browser context's requests. */
const TIMELINE_BUDGET = 50;
const WINDOW_MS = 60_000;
const stamps = [];
let queue = Promise.resolve();

/** True when `url` is one the timeline rule counts: one of our deployed
 *  hosts, a path containing `/timeline`, no `recent` parameter. */
function countedByTimelineRule(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return OWN_HOST.test(u.hostname) && u.pathname.includes("/timeline") && !u.searchParams.has("recent");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until n more rule-counted requests fit in the rolling minute, then
 *  book them. Calls are served in order. */
export function reserveTimeline(n = 1) {
  const turn = queue.then(async () => {
    for (;;) {
      const now = Date.now();
      while (stamps.length && stamps[0] <= now - WINDOW_MS) stamps.shift();
      if (stamps.length + n <= TIMELINE_BUDGET) break;
      await sleep(stamps[stamps.length + n - TIMELINE_BUDGET - 1] + WINDOW_MS - now + 50);
    }
    const at = Date.now();
    for (let i = 0; i < n; i++) stamps.push(at);
  });
  queue = turn.catch(() => {});
  return turn;
}

function withBypass(input, init, url) {
  const extra = bypassHeaders(url);
  if (!extra[HEADER]) return init;
  const headers = new Headers(
    init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined),
  );
  headers.set(HEADER, extra[HEADER]);
  return { ...init, headers };
}

/** fetch with the bypass header added when the URL is one of ours, paced
 *  under the timeline Firewall rule when the rule counts it. */
export async function hostFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const sent = withBypass(input, init, url);
  if (!countedByTimelineRule(url)) return fetch(input, sent);
  await reserveTimeline();
  const res = await fetch(input, sent);
  if (res.status !== 403 || res.headers.get("x-vercel-mitigated") !== "deny") return res;
  console.error(`(the Vercel Firewall denied a /timeline request; waiting ${WINDOW_MS / 1000 + 1} s to retry)`);
  await sleep(WINDOW_MS + 1000);
  stamps.length = 0;
  await reserveTimeline();
  return fetch(input, sent);
}
