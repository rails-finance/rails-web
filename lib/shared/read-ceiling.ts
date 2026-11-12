// The daily ceiling on Rails's paid chain reads, as the web carries it. Client-safe.
// ----------------------------------------------------------------------------
// rails-server's "Read on visit" routes answer 503 `{ error: "read_ceiling", message, until }`
// with a Retry-After once the day's paid-leg ceiling is reached (rails-ops decisions/0061,
// infra entry "2026-11-10 — Read on visit"). Every client recognises it with
// `isReadCeiling` and the page draws `READ_CEILING_LINE` where the figure would have been,
// in place of its failed-read line, marked `data-read-ceiling`.

/** The line a page shows in place of a read refused by the ceiling (wording approved by Miles). */
export const READ_CEILING_LINE =
  "Rails has reached its daily limit for reading the chain. Pages read again from midnight UTC.";

/** The error code the routes answer with at the ceiling. */
export const READ_CEILING_CODE = "read_ceiling";

/** True for the ceiling's answer: status 503 and a body whose `error` is `read_ceiling`. */
export function isReadCeiling(status: number, body: unknown): boolean {
  return (
    status === 503 &&
    typeof body === "object" &&
    body !== null &&
    (body as { error?: unknown }).error === READ_CEILING_CODE
  );
}
