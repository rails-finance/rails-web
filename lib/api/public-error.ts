// The one way a caught error reaches a response body: every URL is removed
// (an RPC URL carries its API key in the path or query), and viem's
// HttpRequestError is cut to its status and the provider's message.
// scripts/check-error-bodies.mjs fails any route that writes a caught error's
// `.message` or `String(e)` into a body without this. Imports nothing, so
// scripts/test/public-error.test.mjs loads it under node directly.

const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
// A host with a path and no scheme ("eth-mainnet.g.alchemy.com/v2/<key>").
const BARE_HOST_PATH_RE = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/\S*/gi;
const KEY_PARAM_RE = /\b(api[-_]?key|key|token|access[-_]?token|secret|auth)=[^\s&"',]+/gi;
// viem detail lines that echo the request or point at its docs.
const DROPPED_LINE_RE = /^\s*(URL|Request body|Request Arguments|Raw Call Arguments|Docs|Version):/i;

function redact(text: string): string {
  return text.replace(URL_RE, "[url]").replace(BARE_HOST_PATH_RE, "[url]").replace(KEY_PARAM_RE, "$1=[redacted]");
}

/** The provider's `message` out of viem's `Details:` line, which is JSON or text. */
function providerMessage(details: string): string {
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const m = (parsed as { message?: unknown }).message;
      if (typeof m === "string") return m;
    }
  } catch {
    // Not JSON: the line is the message.
  }
  return details;
}

function rawMessage(e: unknown, fallback: string | undefined): string {
  if (e instanceof Error) return e.message;
  if (fallback !== undefined) return fallback;
  return typeof e === "string" ? e : String(e);
}

/**
 * A message safe to send to a browser. An Error gives its message; anything
 * else gives `fallback` when one is passed, or `String(e)`.
 */
export function publicErrorMessage(e: unknown, fallback?: string): string {
  const text = rawMessage(e, fallback);
  const lines = text.split("\n");
  const status = lines.map((l) => /^\s*Status:\s*(\d{3})\b/i.exec(l)?.[1]).find(Boolean);
  const details = lines.map((l) => /^\s*Details:\s*(.+)$/i.exec(l)?.[1]).find(Boolean);
  if (status || details) {
    const head = lines[0].trim();
    const parts = [head, status, details ? providerMessage(details.trim()) : undefined].filter(Boolean);
    return redact(parts.join(" "));
  }
  const kept = lines.filter((l) => !DROPPED_LINE_RE.test(l));
  return redact(kept.join("\n"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
