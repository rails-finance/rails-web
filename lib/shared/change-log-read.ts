// A protocol change log's read, with a failed read kept apart from an empty
// log. The mainnet change-log routes answer from Sieve alone, so with Sieve
// down they answer 502 (rails-ops decisions/0056): the page says the markers
// are unavailable, and a log with no changes in it draws none and says
// nothing.
//
// The fetch is the only browser part; `changeLogRead` is pure.

export interface ChangeLogRead<T> {
  /** The log as the route answered it; null where the read failed. */
  log: T | null;
  /** The read failed: the chart's change markers cannot be drawn. */
  unavailable: boolean;
}

/** The page's line where the change markers would be explained. */
export const CHANGES_UNAVAILABLE_NOTE = "Parameter changes unavailable right now";

/** The reading: an answer (even an empty one) is the log; any other status or
 *  an unreadable body is unavailable. */
export function changeLogRead<T>(ok: boolean, body: T | null | undefined): ChangeLogRead<T> {
  return ok && body != null ? { log: body, unavailable: false } : { log: null, unavailable: true };
}

/** Reads a change-log route. An abort rethrows; every other failure is
 *  unavailable. */
export async function fetchChangeLog<T>(url: string, signal?: AbortSignal): Promise<ChangeLogRead<T>> {
  try {
    const r = await fetch(url, { signal });
    return changeLogRead(r.ok, r.ok ? ((await r.json()) as T) : null);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return changeLogRead<T>(false, null);
  }
}
