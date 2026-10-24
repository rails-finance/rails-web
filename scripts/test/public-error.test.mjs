// lib/api/public-error.ts: no URL or key reaches a response body; the status
// and the provider's message do. The key below is invented.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { publicErrorMessage } from "../../lib/api/public-error.ts";

const KEY = "Zx9fakeKEYq7Lm2Pn4Rt8Vw1";
const VIEM_429 = [
  "HTTP request failed.",
  "",
  "Status: 429",
  `URL: https://eth-mainnet.g.alchemy.com/v2/${KEY}`,
  'Request body: {"method":"eth_getBlockByNumber","params":["latest",false]}',
  "",
  'Details: {"code":429,"message":"Monthly capacity limit exceeded. Visit https://dashboard.alchemy.com/settings/billing to upgrade."}',
  "Version: viem@2.33.2",
].join("\n");

test("a viem HttpRequestError keeps its status and provider message and loses the URL and key", () => {
  const out = publicErrorMessage(new Error(VIEM_429));
  assert.ok(!out.includes(KEY), out);
  assert.ok(!/https?:\/\//.test(out), out);
  assert.ok(!out.includes("alchemy.com"), out);
  assert.ok(out.includes("429 Monthly capacity limit exceeded"), out);
});

test("a URL anywhere in a plain message is removed, whatever the host", () => {
  const out = publicErrorMessage(
    new Error(`fetch failed for https://rpc.example.org/key/${KEY}?apikey=${KEY}: timeout`),
  );
  assert.ok(!out.includes(KEY), out);
  assert.ok(out.includes("timeout"), out);
});

test("a host path without a scheme, and a key parameter, are removed", () => {
  const out = publicErrorMessage(new Error(`bad gateway at base-mainnet.g.example.net/v2/${KEY} (token=${KEY})`));
  assert.ok(!out.includes(KEY), out);
  assert.ok(out.includes("bad gateway"), out);
});

test("a non-Error gives the fallback when one is passed, else its string, redacted", () => {
  assert.equal(publicErrorMessage({ x: 1 }, "Failed to load"), "Failed to load");
  assert.equal(publicErrorMessage("plain words"), "plain words");
  assert.ok(!publicErrorMessage(`see https://x.example/${KEY}`).includes(KEY));
});

test("an ordinary message passes through", () => {
  assert.equal(publicErrorMessage(new Error("market not found")), "market not found");
});
