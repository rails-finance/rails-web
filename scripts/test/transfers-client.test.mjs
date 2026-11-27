// Where `alchemy_getAssetTransfers` goes (lib/sources/chain/rpc.ts,
// chainTransfersClient): to the chain's transfersRpcEnv URL when it is set,
// and otherwise where it went before that var existed, the chain's state
// client. Driven through readTxLegs on Arbitrum, which reads the receipt and
// the asset transfers from the chain (the at-block store answers Ethereum and
// Base only), against a mocked fetch that records each request's URL. One
// case checks Base's state client asks an over-range getLogs once
// (lib/sources/chain/range-refusal.ts; its cases are range-refusal.test.mjs).
// The modules import through `@/`, so this file resolves `@/` and
// extensionless paths as arbitrum-over-budget.test.mjs does.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  if (spec === "next/server") return next("next/server.js", ctx);
  if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

process.env.API_BEARER_TOKEN = "test-token";
process.env.RAILS_API_URL = "https://api.example";
// Arbitrum's state lane as deployed: Tenderly first, the Alchemy app behind it.
process.env.ARBITRUM_RPC_URL = "https://tenderly.example/arbitrum";
process.env.ARBITRUM_FALLBACK_RPC_URL = "https://alchemy.example/arbitrum-fallback";
process.env.ALCHEMY_URL = "https://alchemy.example/eth-mainnet";
delete process.env.ARBITRUM_TRANSFERS_RPC_URL;
delete process.env.ETHEREUM_TRANSFERS_RPC_URL;

const { readTxLegs } = await import(ROOT + "lib/sources/chain/tx-legs.ts");
const { chainClient, chainTransfersClient } = await import(ROOT + "lib/sources/chain/rpc.ts");

const WALLET = "0x1111111111111111111111111111111111111111";
const ROUTER = "0x2222222222222222222222222222222222222222";
const hashOf = (n) => "0x" + n.toString(16).padStart(64, "0");

/** A fetch answering the receipt and the asset transfers for `hash`; the
 *  Tenderly URL refuses `alchemy_*` as a non-Alchemy provider does. Returns
 *  the [url, method] of every request. */
function mockChain(t, hash) {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    const u = String(url);
    seen.push([u, body.method]);
    const reply = (result) => new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), { status: 200 });
    if (body.method === "eth_getTransactionReceipt")
      return reply({
        blockHash: hashOf(9),
        blockNumber: "0x10",
        contractAddress: null,
        cumulativeGasUsed: "0x0",
        effectiveGasPrice: "0x0",
        from: WALLET,
        gasUsed: "0x0",
        logs: [],
        logsBloom: "0x" + "0".repeat(512),
        status: "0x1",
        to: ROUTER,
        transactionHash: hash,
        transactionIndex: "0x0",
        type: "0x2",
      });
    if (body.method === "alchemy_getAssetTransfers") {
      if (u.startsWith("https://tenderly.example"))
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "method not found" } }),
          { status: 200 },
        );
      return reply({
        transfers: [
          {
            hash,
            from: ROUTER,
            to: WALLET,
            asset: "ETH",
            category: "internal",
            rawContract: { value: "0xde0b6b3a7640000", address: null, decimal: "0x12" },
          },
        ],
      });
    }
    throw new Error(`unexpected ${body.method} to ${u}`);
  });
  return seen;
}

const transfersUrls = (seen) => seen.filter(([, m]) => m === "alchemy_getAssetTransfers").map(([u]) => u);

test("transfers var unset: asset transfers ride the state client, Tenderly then the Alchemy fallback", async (t) => {
  const seen = mockChain(t, hashOf(1));
  const legs = await readTxLegs(42161, hashOf(1), WALLET);
  assert.deepEqual(transfersUrls(seen), [process.env.ARBITRUM_RPC_URL, process.env.ARBITRUM_FALLBACK_RPC_URL]);
  assert.equal(legs.back.length, 1);
  assert.equal(legs.back[0].source, "asset-transfers");
  assert.equal(legs.back[0].raw, "1000000000000000000");
});

test("transfers var set: asset transfers go to it alone; the receipt stays on the state lane", async (t) => {
  process.env.ARBITRUM_TRANSFERS_RPC_URL = "https://alchemy.example/arbitrum-transfers";
  t.after(() => delete process.env.ARBITRUM_TRANSFERS_RPC_URL);
  const seen = mockChain(t, hashOf(2));
  const legs = await readTxLegs(42161, hashOf(2), WALLET);
  assert.deepEqual(transfersUrls(seen), [process.env.ARBITRUM_TRANSFERS_RPC_URL]);
  assert.deepEqual(
    seen.filter(([, m]) => m === "eth_getTransactionReceipt").map(([u]) => u),
    [process.env.ARBITRUM_RPC_URL],
  );
  assert.equal(legs.back.length, 1);
});

test("Ethereum: unset is the state client itself; set is a separate client on the transfers URL", async (t) => {
  assert.equal(chainTransfersClient(1), chainClient(1));
  process.env.ETHEREUM_TRANSFERS_RPC_URL = "https://alchemy.example/eth-transfers";
  t.after(() => delete process.env.ETHEREUM_TRANSFERS_RPC_URL);
  const seen = mockChain(t, hashOf(3));
  const client = chainTransfersClient(1);
  assert.notEqual(client, chainClient(1));
  await client.request({ method: "alchemy_getAssetTransfers", params: [{}] });
  assert.deepEqual(transfersUrls(seen), [process.env.ETHEREUM_TRANSFERS_RPC_URL]);
});

test("Base's state client asks an over-range getLogs once", async (t) => {
  process.env.BASE_RPC_URL = "https://dwellir.example/base";
  let n = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    n++;
    const { id } = JSON.parse(init.body);
    const error = { code: -32005, message: "eth_getLogs range of 501 blocks exceeds the 500-block limit" };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, error }), { status: 200 });
  });
  await assert.rejects(chainClient(8453).getLogs({ fromBlock: BigInt(1), toBlock: BigInt(502) }));
  assert.equal(n, 1);
});

test("a chain with no transfersRpcEnv uses its state client", () => {
  process.env.OPTIMISM_RPC_URL ??= "https://tenderly.example/optimism";
  assert.equal(chainTransfersClient(10), chainClient(10));
});
