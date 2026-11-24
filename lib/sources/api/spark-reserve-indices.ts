// SparkLend's reserve indices from rails-server's `/api/spark/reserve-indices`
// (mig 535): each reserve's latest liquidity and variable borrow index and
// rate, the block they stand at and its time. The wallet page accrues each
// stored scaled balance with them (lib/spark/scaled-accrual.ts). The route
// is cached 30 s on the box and asked through the route gate, so inside a
// wallet read it takes a slot of the api cap (lib/wallet/api-hop.ts).
//
// Null where the route cannot answer; the page then draws the scaled
// reserves "Not read".
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { rethrowAtBuild, routeGate, type AskOpts } from "./route-gate";
import { parseSparkReserveIndices, type SparkReserveIndices } from "@/lib/spark/scaled-accrual";

const gate = routeGate();

/** How long the wallet page waits for the indices: the route is a cached read. */
export const SPARK_INDICES_WAIT_MS = 2_000;

/** One read of the route. */
export async function readSparkReserveIndices(opts: AskOpts = {}): Promise<SparkReserveIndices | null> {
  const body = await gate.json<unknown>(
    "spark-reserve-indices",
    `${process.env.RAILS_API_URL}/api/spark/reserve-indices`,
    createAuthFetchOptions(),
    { timeoutMs: SPARK_INDICES_WAIT_MS, ...opts },
  );
  return parseSparkReserveIndices(body);
}

const perRead = new WeakMap<object, Promise<SparkReserveIndices | null>>();

/** The indices for one page's read, asked once: `read` is any object the page's
 *  read holds for its length (the wallet page passes the family's summary rows,
 *  which its shape and head both receive). */
export function sparkReserveIndicesFor(read: object, opts: AskOpts = {}): Promise<SparkReserveIndices | null> {
  let got = perRead.get(read);
  if (!got) {
    got = readSparkReserveIndices(opts).catch((err) => {
      rethrowAtBuild(err);
      return null;
    });
    perRead.set(read, got);
  }
  return got;
}
