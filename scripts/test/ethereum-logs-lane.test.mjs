// Where Ethereum's eth_getLogs goes (lib/sources/chain/rpc.ts, chainLogsClient;
// lib/shared/chains.ts, the chain-1 row): to ETHEREUM_BACKFILL_RPC_URL when it
// is set, and to ALCHEMY_URL when it is not, while the state reads stay on
// ALCHEMY_URL either way. Driven through chainLogsClient(1) and the MakerDAO
// auction read (lib/sources/chain/makerdao-history.ts), whose Take logs ride
// the logs lane and whose receipt and Spotter read ride the state URL, against
// a mocked fetch that records each request's URL. Also: Sepolia's URL is
// derived from ALCHEMY_URL only when that is an Alchemy eth-mainnet URL, and
// a log-range refusal on the logs lane is asked once.
// The modules import through `@/`, so this file resolves `@/` and
// extensionless paths as transfers-client.test.mjs does, and stubs
// ./at-block-api, which the auction read does not call.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  // makerdao-history's ilk read; its module uses syntax type stripping refuses.
  if (spec === "./at-block-api")
    return { url: "data:text/javascript,export const atBlockGet = () => { throw new Error('stub'); };", shortCircuit: true };
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
// The state URL on a provider that is not Alchemy, as it will be on Dwellir.
process.env.ALCHEMY_URL = "https://dwellir.example/eth-mainnet";
delete process.env.ETHEREUM_BACKFILL_RPC_URL;
delete process.env.SEPOLIA_RPC_URL;

const { chainClient, chainLogsClient, isRateLimited, servingLogsRpcEnv } = await import(
  ROOT + "lib/sources/chain/rpc.ts"
);
const { readMakerAuction } = await import(ROOT + "lib/sources/chain/makerdao-history.ts");
const { MAKER_ADDRESSES } = await import(ROOT + "lib/makerdao/asset-catalog.ts");

const BACKFILL = "https://alchemy.example/eth-backfill";
const URN = "0x1111111111111111111111111111111111111111";
const CLIP = "0x3333333333333333333333333333333333333333";
const ILK = "0x" + "45".repeat(32);
const hashOf = (n) => "0x" + n.toString(16).padStart(64, "0");
const AUCTION_ABI = parseAbi([
  "event Bark(bytes32 indexed ilk, address indexed urn, uint256 ink, uint256 art, uint256 due, address clip, uint256 indexed id)",
  "event Kick(uint256 indexed id, uint256 top, uint256 tab, uint256 lot, address indexed usr, address indexed kpr, uint256 coin)",
]);

/** A receipt carrying the Dog's Bark for URN and the Clipper's Kick. */
function receiptFor(hash) {
  const id = BigInt(7);
  const log = (address, topics, data, logIndex) => ({
    address,
    topics,
    data,
    blockNumber: "0x10",
    blockHash: hashOf(9),
    transactionHash: hash,
    transactionIndex: "0x0",
    logIndex,
    removed: false,
  });
  const u = (n) => BigInt(n);
  return {
    blockHash: hashOf(9),
    blockNumber: "0x10",
    contractAddress: null,
    cumulativeGasUsed: "0x0",
    effectiveGasPrice: "0x0",
    from: URN,
    gasUsed: "0x0",
    logs: [
      log(
        MAKER_ADDRESSES.DOG,
        encodeEventTopics({ abi: AUCTION_ABI, eventName: "Bark", args: { ilk: ILK, urn: URN, id } }),
        encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
          [u(10), u(10), u(100), CLIP],
        ),
        "0x0",
      ),
      log(
        CLIP,
        encodeEventTopics({ abi: AUCTION_ABI, eventName: "Kick", args: { id, usr: URN, kpr: URN } }),
        encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
          [u(1), u(113), u(10), u(0)],
        ),
        "0x1",
      ),
    ],
    logsBloom: "0x" + "0".repeat(512),
    status: "0x1",
    to: MAKER_ADDRESSES.DOG,
    transactionHash: hash,
    transactionIndex: "0x0",
    type: "0x2",
  };
}

/** A fetch answering a receipt, getLogs (no takes) and the Spotter's ilks;
 *  returns the [url, method] of every request. */
function mockChain(t) {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const bodies = [].concat(JSON.parse(init.body));
    const answers = bodies.map((body) => {
      seen.push([String(url), body.method]);
      const reply = (result) => ({ jsonrpc: "2.0", id: body.id, result });
      if (body.method === "eth_getTransactionReceipt") return reply(receiptFor(body.params[0]));
      if (body.method === "eth_getLogs") return reply([]);
      if (body.method === "eth_call")
        return reply(
          encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [URN, BigInt(15) * BigInt(10) ** BigInt(26)]),
        );
      throw new Error(`unexpected ${body.method} to ${url}`);
    });
    return new Response(JSON.stringify(Array.isArray(JSON.parse(init.body)) ? answers : answers[0]), { status: 200 });
  });
  return seen;
}

const urlsOf = (seen, method) => seen.filter(([, m]) => m === method).map(([u]) => u);

test("logs var unset: Ethereum getLogs and the state reads all go to ALCHEMY_URL", async (t) => {
  const seen = mockChain(t);
  assert.equal(servingLogsRpcEnv(1), "ALCHEMY_URL");
  await chainLogsClient(1).getLogs({ fromBlock: BigInt(1), toBlock: BigInt(2) });
  const read = await readMakerAuction(hashOf(1), URN);
  assert.equal(read.kind, "clipper");
  assert.deepEqual(urlsOf(seen, "eth_getLogs"), [process.env.ALCHEMY_URL, process.env.ALCHEMY_URL]);
  assert.deepEqual(urlsOf(seen, "eth_getTransactionReceipt"), [process.env.ALCHEMY_URL]);
  assert.deepEqual(urlsOf(seen, "eth_call"), [process.env.ALCHEMY_URL]);
});

test("logs var set: Ethereum getLogs go to it; the receipt and eth_call stay on ALCHEMY_URL", async (t) => {
  process.env.ETHEREUM_BACKFILL_RPC_URL = BACKFILL;
  t.after(() => delete process.env.ETHEREUM_BACKFILL_RPC_URL);
  const seen = mockChain(t);
  assert.equal(servingLogsRpcEnv(1), "ETHEREUM_BACKFILL_RPC_URL");
  await chainLogsClient(1).getLogs({ fromBlock: BigInt(1), toBlock: BigInt(2) });
  const read = await readMakerAuction(hashOf(2), URN);
  assert.equal(read.kind, "clipper");
  assert.deepEqual(urlsOf(seen, "eth_getLogs"), [BACKFILL, BACKFILL]);
  assert.deepEqual(urlsOf(seen, "eth_getTransactionReceipt"), [process.env.ALCHEMY_URL]);
  assert.deepEqual(urlsOf(seen, "eth_call"), [process.env.ALCHEMY_URL]);
});

test("Ethereum's logs lane on a range-capped ALCHEMY_URL asks an over-range getLogs once", async (t) => {
  let n = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    n++;
    const { id } = JSON.parse(init.body);
    const error = { code: -32005, message: "eth_getLogs range of 501 blocks exceeds the 500-block limit" };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, error }), { status: 200 });
  });
  await assert.rejects(chainLogsClient(1).getLogs({ fromBlock: BigInt(1), toBlock: BigInt(502) }));
  assert.equal(n, 1);
});

test("a range refusal is not a rate limit; a provider's throttle wording is", () => {
  const range = { code: -32005, message: "eth_getLogs range of 501 blocks exceeds the 500-block limit for this plan" };
  assert.equal(isRateLimited(range), false);
  assert.equal(
    isRateLimited({
      code: -32000,
      message: "batch not executed: member 2 (eth_getLogs) violated the log range policy",
    }),
    false,
  );
  assert.equal(isRateLimited({ code: -32005, message: "Too Many Requests" }), true);
  assert.equal(isRateLimited({ code: 429, message: "exceeded its compute units per second capacity" }), true);
});

test("Sepolia: a non-Alchemy ALCHEMY_URL derives nothing, and the error names SEPOLIA_RPC_URL", () => {
  assert.throws(() => chainClient(11155111), /SEPOLIA_RPC_URL not set.*not an Alchemy eth-mainnet URL/);
  assert.throws(() => chainLogsClient(11155111), /SEPOLIA_RPC_URL not set/);
});

test("Sepolia: an Alchemy eth-mainnet ALCHEMY_URL derives the eth-sepolia host", async (t) => {
  const was = process.env.ALCHEMY_URL;
  process.env.ALCHEMY_URL = "https://eth-mainnet.g.alchemy.com/v2/test-key";
  t.after(() => (process.env.ALCHEMY_URL = was));
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    seen.push(String(url));
    const { id } = JSON.parse(init.body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: "0x1" }), { status: 200 });
  });
  await chainClient(11155111).getBlockNumber();
  assert.deepEqual(seen, ["https://eth-sepolia.g.alchemy.com/v2/test-key"]);
});
