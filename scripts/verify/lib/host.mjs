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

/** fetch with the bypass header added when the URL is one of ours. */
export function hostFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const extra = bypassHeaders(url);
  if (!extra[HEADER]) return fetch(input, init);
  const headers = new Headers(
    init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined),
  );
  headers.set(HEADER, extra[HEADER]);
  return fetch(input, { ...init, headers });
}
