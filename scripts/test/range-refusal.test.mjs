// A log-range refusal fails at once; any other -32005 is retried as viem
// retries it (lib/sources/chain/range-refusal.ts). Against a mocked fetch that
// counts requests.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { isRangeRefusal, rangeRefusalsFailAtOnce } from "../../lib/sources/chain/range-refusal.ts";

const URL = "https://dwellir.example/base";

/** A fetch answering every request with JSON-RPC error `code` and `message`;
 *  returns the request count. */
function refuse(t, code, message) {
  const seen = { n: 0 };
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    seen.n++;
    const { id } = JSON.parse(init.body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), { status: 200 });
  });
  return seen;
}

const client = () =>
  createPublicClient({ chain: base, transport: rangeRefusalsFailAtOnce(http(URL, { retryCount: 0 })) });
const getLogs = (c) => c.getLogs({ fromBlock: BigInt(1), toBlock: BigInt(502) });

test("an over-range refusal is asked once and thrown", async (t) => {
  const seen = refuse(t, -32005, "eth_getLogs range of 501 blocks exceeds the 500-block limit for this plan");
  await assert.rejects(getLogs(client()), (e) => isRangeRefusal(e) && e.code === -32005);
  assert.equal(seen.n, 1);
});

test("the log range policy wording is a refusal too", async (t) => {
  const seen = refuse(t, -32005, "query violated the log range policy");
  await assert.rejects(getLogs(client()));
  assert.equal(seen.n, 1);
});

test("a -32005 throttle is retried three times, as viem's transport does", async (t) => {
  const seen = refuse(t, -32005, "request rate exceeded, try again later");
  await assert.rejects(getLogs(client()), (e) => !isRangeRefusal(e) && e.code === -32005);
  assert.equal(seen.n, 4);
  // The same answer through a plain viem transport: the count this keeps.
  const plain = refuse(t, -32005, "request rate exceeded, try again later");
  await assert.rejects(getLogs(createPublicClient({ chain: base, transport: http(URL) })));
  assert.equal(plain.n, 4);
});

test("an answer viem does not retry is not retried", async (t) => {
  const seen = refuse(t, 3, "execution reverted");
  await assert.rejects(client().request({ method: "eth_call", params: [{}, "latest"] }));
  assert.equal(seen.n, 1);
});

test("isRangeRefusal reads the cause chain and nothing else", () => {
  assert.equal(isRangeRefusal({ cause: { cause: { details: "exceeds the 10,000-block limit" } } }), true);
  assert.equal(isRangeRefusal(new Error("exceeded its compute units per second capacity")), false);
  assert.equal(isRangeRefusal(null), false);
});
