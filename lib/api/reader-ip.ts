// Extracts the reader's IP from an incoming request's own headers. Free of
// `next/headers` so it stays importable from route handlers, server loaders,
// and any lib code that only ever sees a Request-shaped object. SERVER-ONLY
// (it signs with the bearer token through node:crypto). See
// reader-ip-server.ts for the next/headers-backed twin used outside a route
// handler's own request.
//
// Why this exists at all: every request from this deployment reaches the box
// from Vercel's shared egress IPs, so the box cannot budget its per-minute
// rate limit by connecting IP the way it would for a direct caller. It now
// accepts an optional X-Rails-Reader-IP header naming the human reader on the
// other end and keys the budget on that instead — see
// createAuthHeaders/createAuthFetchOptions in fetch-with-auth.ts, which attach
// it. This function is how a caller resolves that value off the request it
// was itself called with.
//
// THE SSR HOP. A page render that reads through this deployment's own
// /api/<proto>/* proxy (lib/shared/listing-ssr.ts `ssrHop()`) reaches that
// proxy from the function's egress address, and Vercel overwrites x-real-ip /
// x-forwarded-for with it — so the proxy would name the deployment as the
// reader. The render therefore names the reader in `x-rails-ssr-reader-ip`
// with an HMAC of it under API_BEARER_TOKEN in `x-rails-ssr-reader-sig`
// (`readerHopHeaders`), and the proxy believes that pair only when the
// signature checks. A reader cannot forge one without the token, and a
// captured pair names only the address it was signed for, so it mints no
// fresh budget key.

import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_LENGTH = 64;
const VALID_CHARS = /^[0-9a-fA-F.:]+$/;

const HOP_IP_HEADER = "x-rails-ssr-reader-ip";
const HOP_SIG_HEADER = "x-rails-ssr-reader-sig";

function normalize(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH || !VALID_CHARS.test(trimmed)) return undefined;
  return trimmed;
}

function hopSignature(ip: string): string | undefined {
  const key = process.env.API_BEARER_TOKEN;
  if (!key) return undefined;
  return createHmac("sha256", key).update(`rails-ssr-reader:${ip}`).digest("hex");
}

/**
 * The headers a server render attaches to its request to this deployment's
 * own /api proxy so the proxy reads the backend as `readerIp`. Empty when
 * there is no reader to name or no token to sign with — the proxy then falls
 * back to the address the request arrived from, as before.
 */
export function readerHopHeaders(readerIp: string | undefined): Record<string, string> {
  const ip = normalize(readerIp);
  const sig = ip ? hopSignature(ip) : undefined;
  if (!ip || !sig) return {};
  return { [HOP_IP_HEADER]: ip, [HOP_SIG_HEADER]: sig };
}

/** The reader a server render named on its hop, when the signature checks. */
function readerIpFromHop(headers: Headers): string | undefined {
  const ip = normalize(headers.get(HOP_IP_HEADER));
  const given = headers.get(HOP_SIG_HEADER);
  if (!ip || !given) return undefined;
  const want = hopSignature(ip);
  if (!want) return undefined;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b) ? ip : undefined;
}

/**
 * The reader's IP off an incoming request's headers: a signed SSR hop's named
 * reader, else `x-real-ip`, else the first comma-separated entry of
 * `x-forwarded-for`. Returns undefined when none is present, or the candidate
 * value isn't a plausible IPv4/IPv6 literal (too long, or characters outside
 * `[0-9a-fA-F.:]`).
 */
export function readerIpFromRequest(req: Request | { headers: Headers }): string | undefined {
  const hop = readerIpFromHop(req.headers);
  if (hop) return hop;

  const realIp = normalize(req.headers.get("x-real-ip"));
  if (realIp) return realIp;

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) return undefined;
  const first = forwardedFor.split(",")[0];
  return normalize(first);
}
