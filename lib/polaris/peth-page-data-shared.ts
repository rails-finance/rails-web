// What the pETH account page's server read and its client view share
// (ui-jobs 865): the first read's size and the shape of a refusal. Client-safe.

/** Rows the page's first read brings, newest first. */
export const PETH_FIRST_READ = 500;

/** Rows each "Load the older events" read asks for: the route's most
 *  (rails-server api/src/routes/polaris-peth.ts, limit ≤ 5,000). Each read
 *  reruns the route's head reads, so fewer, larger pages. */
export const PETH_OLDER_READ = 5000;

/** The route's refusal of an address, with its reason (a protocol contract,
 *  an address too heavy to replay). */
export interface PethRefusal {
  refused: true;
  status: number;
  reason: string | null;
  code: string | null;
}

export const isPethRefusal = (x: unknown): x is PethRefusal =>
  x != null && typeof x === "object" && (x as PethRefusal).refused === true;
