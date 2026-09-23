// One read of `/api/vaults/positions`, retried where a retry is honest.
// ----------------------------------------------------------------------------
// Three vault verifiers read this route in long loops — verify-base-vault-
// positions.mjs alone issues about 1,533 reads across its L3 partition pass —
// and they each carried their own copy of the read, with two different
// retry rules and one with none at all. This is the one copy.
//
// WHAT IS RETRIED, and why each is not a finding about the page:
//
//   429 — the proxy's rate limiter answering the loop's own volume. Six
//         attempts, backing off 1.5 s per attempt.
//   404 — a transient miss. Read 2026-09-20: verify-base-vault-positions died
//         40 checks in on a 404 for a vault catalogued in BOTH rosters, and
//         three immediate curls of the same query answered 200 with real rows;
//         the re-run went 57/57. One bad read ended a run of 1,533.
//   5xx — the dev server having a bad minute, the same way the Base vault page
//         verifier already treats a 500 on one request.
//   a dropped connection — `fetch` throwing rather than answering. Same class,
//         same bounded three; a server that is not there still fails.
//
// WHAT KEEPS IT FROM HIDING A REAL ONE: the retry is BOUNDED and it SPEAKS. A
// 404 that is real still fails the read, three seconds later, with the status
// in the message. A 404 that clears prints a line naming the query and the
// attempt it took, so a route that intermittently 404s cannot pass as a route
// that answers — which is the failure mode a silent retry would have bought.
//
// `retriedReads` tallies them for a caller that wants to say so in its verdict.

/** Every read that needed more than one attempt: `{ qs, status, attempts }`. */
export const retriedReads = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The statuses worth another attempt, and how many attempts each one gets
 *  (the first attempt included). */
const RETRYABLE = (status) => (status === 429 ? 6 : status === 404 || status >= 500 ? 3 : 1);

/**
 * @param {string} base      origin, e.g. `http://localhost:3000`
 * @param {string} qs        the query string, without the leading `?`
 * @returns {Promise<any>}   the parsed JSON body
 */
export async function readPositionsRoute(base, qs) {
  let refused = null; // how the attempt before this one failed, if it did
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${base}/api/vaults/positions?${qs}`);
    } catch (e) {
      // A dropped connection is the same class as a 500 and gets the same
      // bounded three: a server that is not there at all still fails, and says
      // the transport error rather than a status it never received.
      refused = `transport (${e?.cause?.code ?? e?.message ?? e})`;
      if (attempt < 3) {
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(`route ${qs} could not be read on ${attempt} attempts — ${refused}`);
    }
    if (res.ok) {
      if (refused != null) {
        retriedReads.push({ qs, status: refused, attempts: attempt });
        console.log(`  ⟳ ${qs} answered ${refused}, then 200 on attempt ${attempt} — RETRIED, not clean`);
      }
      return res.json();
    }
    refused = res.status;
    if (attempt < RETRYABLE(res.status)) {
      await sleep(res.status === 429 ? 1500 * attempt : 1000 * attempt);
      continue;
    }
    throw new Error(`route ${qs} answered ${res.status} on ${attempt} attempt${attempt === 1 ? "" : "s"}`);
  }
}
