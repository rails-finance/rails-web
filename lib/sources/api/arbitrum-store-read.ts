// One GET of a rails-server Arbitrum lane route (/api/<family>/timeline).
// ----------------------------------------------------------------------------
// The store reads a wallet's history body on its first request and answers
// once it is stored; a wait that runs out means it is still reading
// (rails-ops TO-DO-arbitrum-scoping.md items 12 and 13). That is thrown as
// ChainTimelinePending, which the chain route answers as 202 and the page
// asks again on. Any other failure propagates as before.
//
// The request is left open past the wait, up to HOLD_MS: the store cancels
// the database work of a request its caller closes, and the first request
// for a wallet is the one that writes its body. Closing it at the wait
// discarded the body and the page's next ask started the read again.
//
// SERVER-ONLY.

import { after } from "next/server";
import { createAuthFetchOptions, type AuthCallOptions } from "@/lib/api/fetch-with-auth";
import { ChainTimelinePending } from "@/lib/api/fetch-chain-timeline";

/** How long a first read may keep the request open after the page has been
 *  told it is pending. */
const HOLD_MS = 180_000;

export async function fetchStore(
  url: string,
  readerIp: string | undefined,
  timeoutMs: number,
  call?: AuthCallOptions,
): Promise<Response> {
  const request = fetch(url, {
    ...createAuthFetchOptions(undefined, readerIp, call),
    cache: "no-store",
    signal: AbortSignal.timeout(HOLD_MS),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<"pending">((resolve) => {
    timer = setTimeout(() => resolve("pending"), timeoutMs);
  });
  try {
    const res = await Promise.race([request, waited]);
    if (res !== "pending") return res;
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
      throw new ChainTimelinePending(`${new URL(url).pathname} did not answer within ${HOLD_MS} ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  // Still reading: the request stays open until the store answers.
  const held = request.then(
    (r) => r.body?.cancel(),
    () => undefined,
  );
  try {
    after(() => held);
  } catch {
    // Outside a request scope the promise runs on by itself.
  }
  throw new ChainTimelinePending(`${new URL(url).pathname} did not answer within ${timeoutMs} ms`);
}
