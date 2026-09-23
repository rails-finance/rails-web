// The Compound V3 Base SWEEP reads a base transfer the way the index does.
// Run: `npx tsx --experimental-test-module-mocks --test scripts/verify/verify-comet-sweep-base-transfers.ts`
// ----------------------------------------------------------------------------
// OFFLINE. No chain endpoint and no API is contacted: `lib/sources/chain/rpc`
// is replaced by a fake client answering from recorded logs, and `fetch` by a
// fake index. The same pattern as verify-base-sweep-peak-withheld.ts.
//
// Comet logs a base transfer as Transfer(src, 0x0) + Transfer(0x0, dst), the
// shape a Supply, Withdraw or AbsorbDebt companion also has, and the sweep
// (lib/sources/chain/compound-v3-events.ts) dropped every zero-address leg, so
// it drew no base transfer. It now keeps the legs no companion explains and
// names the other side from the transaction's receipt (keepCometTransferLegs,
// pairCometTransferLegs), the rule rails-server's index uses (b4ae29a).
//
//   1. AggregationRouterV6, tx 0x2efa…46ee, from the recorded fixture
//      (fixtures/comet-base-router-transfer.json: every Comet log sieve_base
//      holds for that tx, and the index's recorded answer). The compound-base
//      timeline route runs twice — once answered by the recorded index, once
//      forced onto the sweep over the recorded logs — and the two responses
//      must draw the same events: kind, block, log index, amount and
//      counterparty. Both must be the two rows the index serves: 3,166 in from
//      0xf9e8…1655 and 3,166 out to 0xd015…165d.
//   2. The keep rule's companions, on a constructed transaction: a Supply with
//      its mint, a Withdraw with its burn, an AbsorbDebt with its mint, and one
//      transfer in from another account. Exactly the transfer is kept, paired
//      with its sender, and the Supply / Withdraw / AbsorbDebt rows stand.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FX = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/verify/fixtures/comet-base-router-transfer.json"), "utf8"),
) as {
  wallet: string;
  market: string;
  blockNumber: number;
  transactionIndex: number;
  transactionHash: string;
  logs: { logIndex: number; from: string; to: string; amount: string }[];
  served: Record<string, unknown> & { rows: unknown[] };
};

interface FakeLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
}

let HEAD = 0;
let LOGS: FakeLog[] = [];
let WALLET = "";
let INDEX_BODY: Record<string, unknown> = {};

const topicMatches = (want: string | string[] | null | undefined, got: string | undefined): boolean => {
  if (want == null) return true;
  const g = (got ?? "").toLowerCase();
  return Array.isArray(want) ? want.some((w) => w.toLowerCase() === g) : want.toLowerCase() === g;
};

const fakeClient = {
  getBlockNumber: async () => BigInt(HEAD),
  request: async ({ method, params }: { method: string; params: [Record<string, unknown>] }) => {
    if (method !== "eth_getLogs") throw new Error(`fake client: unexpected ${method}`);
    const f = params[0] as {
      address?: string | string[];
      topics: (string | string[] | null)[];
      fromBlock: string;
      toBlock: string;
    };
    const addrs =
      f.address == null ? null : (Array.isArray(f.address) ? f.address : [f.address]).map((a) => a.toLowerCase());
    const lo = Number(f.fromBlock);
    const hi = Number(f.toBlock);
    return LOGS.filter(
      (l) =>
        Number(l.blockNumber) >= lo &&
        Number(l.blockNumber) <= hi &&
        (addrs == null || addrs.includes(l.address.toLowerCase())) &&
        f.topics.every((t, i) => topicMatches(t, l.topics[i])),
    );
  },
  getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
    number: blockNumber,
    timestamp: BigInt(1_719_566_853),
  }),
  getTransaction: async () => ({ from: WALLET }),
  // The receipt carries every log of the transaction, which is what the sweep
  // pairs a leg's other side from.
  getTransactionReceipt: async ({ hash }: { hash: string }) => ({
    logs: LOGS.filter((l) => l.transactionHash === hash).map((l) => ({
      ...l,
      logIndex: Number(l.logIndex),
      transactionIndex: Number(l.transactionIndex),
      blockNumber: BigInt(l.blockNumber),
    })),
  }),
  readContract: async () => {
    throw new Error("fake client: unexpected readContract");
  },
  multicall: async ({ contracts }: { contracts: { functionName: string }[] }) =>
    contracts.map((c) =>
      c.functionName === "symbol"
        ? { status: "success", result: "TKN" }
        : c.functionName === "decimals"
          ? { status: "success", result: 6 }
          : { status: "failure", error: new Error(`fake client: ${c.functionName}`) },
    ),
};

mock.module(pathToFileURL(path.join(ROOT, "lib/sources/chain/rpc.ts")).href, {
  namedExports: {
    chainClient: () => fakeClient,
    alchemyClient: () => fakeClient,
    chainBatchClient: () => fakeClient,
    chainLogsClient: () => fakeClient,
    isRateLimited: () => false,
  },
});

process.env.RAILS_API_URL = "http://index.invalid";
globalThis.fetch = (async (url: string | URL) => {
  const u = String(url);
  if (!u.startsWith("http://index.invalid/")) throw new Error(`fake fetch: unexpected ${u}`);
  return new Response(JSON.stringify(INDEX_BODY), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const ABI = parseAbi([
  "event Supply(address indexed from, address indexed dst, uint256 amount)",
  "event Transfer(address indexed from, address indexed to, uint256 amount)",
  "event Withdraw(address indexed src, address indexed to, uint256 amount)",
  "event AbsorbDebt(address indexed absorber, address indexed borrower, uint256 basePaidOut, uint256 usdValue)",
]);
const hex = (n: number) => `0x${n.toString(16)}`;
const u256 = (v: string | bigint) => encodeAbiParameters([{ type: "uint256" }], [BigInt(v)]);
const log = (
  comet: string,
  tx: string,
  block: number,
  txIndex: number,
  logIndex: number,
  topics: string[],
  data: string,
): FakeLog => ({
  address: comet,
  topics,
  data,
  blockNumber: hex(block),
  logIndex: hex(logIndex),
  transactionHash: tx,
  transactionIndex: hex(txIndex),
});

async function callRoute(): Promise<Record<string, unknown>> {
  const { NextRequest } = await import("next/server");
  const { GET } = (await import(
    pathToFileURL(path.join(ROOT, "app/api/chain/compound-base/timeline/route.ts")).href
  )) as {
    GET: (r: InstanceType<typeof NextRequest>) => Promise<Response>;
  };
  const res = await GET(new NextRequest(`http://localhost/x?wallet=${WALLET}`));
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(res.status, 200, `route answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** The drawn events, reduced to what a reader sees: kind, block, the event's
 *  log index (from its id, `<tx>-<logIndex>-<kind>`), the flow amount, and the
 *  other side of a transfer. */
function drawn(body: Record<string, unknown>): string[] {
  const events = (body.events ?? []) as {
    id: string;
    blockNumber: number;
    actionType: string;
    flows?: { amount: string }[];
    context?: { data?: { counterparty?: string } };
  }[];
  return events
    .map((e) =>
      [
        e.actionType,
        e.blockNumber,
        e.id.split("-")[1],
        (e.flows ?? []).map((f) => f.amount).join("+"),
        e.context?.data?.counterparty ?? "",
      ].join("|"),
    )
    .sort();
}

const sourceOf = (body: Record<string, unknown>) => (body.coverage as { source?: string } | undefined)?.source;

test("the router's transaction: the sweep draws what the index serves", async () => {
  const { COMPOUND_BASE_DEPLOYMENT } = await import("@/lib/compound-base/asset-catalog");
  const m = COMPOUND_BASE_DEPLOYMENT.markets.find((x) => x.key === FX.market)!;
  WALLET = FX.wallet;
  HEAD = FX.blockNumber + 10;
  LOGS = FX.logs.map((l) =>
    log(
      m.comet,
      FX.transactionHash,
      FX.blockNumber,
      FX.transactionIndex,
      l.logIndex,
      encodeEventTopics({
        abi: ABI,
        eventName: "Transfer",
        args: { from: l.from as `0x${string}`, to: l.to as `0x${string}` },
      }) as string[],
      u256(l.amount),
    ),
  );

  INDEX_BODY = FX.served; // the recorded index answer: whole, two rows
  const indexed = await callRoute();
  assert.notEqual(sourceOf(indexed), "sweep", "the recorded index answer should be served, not swept");

  INDEX_BODY = { ...FX.served, rows: [], totalEvents: 0, coverage: null }; // "not whole": forces the sweep
  const swept = await callRoute();
  assert.equal(sourceOf(swept), "sweep", "the fallback run did not reach the sweep");

  const a = drawn(indexed);
  const b = drawn(swept);
  console.log(`  index: ${a.join("  ·  ")}\n  sweep: ${b.join("  ·  ")}`);
  assert.equal(a.length, 2, `the index path should draw two events, drew ${a.length}`);
  assert.deepEqual(b, a, "the sweep draws different events from the index");
  const joined = b.join("\n");
  assert.ok(joined.includes("transfer_in|16388753|106|3166|0xf9e8f4d2102b2ee5ae3481162fc25be9fc5a1655"), joined);
  assert.ok(joined.includes("transfer_out|16388753|110|3166|0xd01507a6d6fc069471f2df6144da5a4ca4c3165d"), joined);
});

test("the keep rule: companions dropped, the transfer kept and paired", async () => {
  const { COMPOUND_BASE_DEPLOYMENT } = await import("@/lib/compound-base/asset-catalog");
  const m = COMPOUND_BASE_DEPLOYMENT.markets[0];
  const W = "0x00000000000000000000000000000000000c0ffe";
  const SENDER = "0x000000000000000000000000000000000000beef";
  const ABSORBER = "0x0000000000000000000000000000000000000abc";
  const Z = "0x0000000000000000000000000000000000000000";
  const TX = `0x${"cd".repeat(32)}`;
  const t = (eventName: string, args: Record<string, string>) =>
    encodeEventTopics({ abi: ABI, eventName, args } as never) as string[];
  const B = 30_000_000;
  const logs = [
    log(m.comet, TX, B, 3, 1, t("Supply", { from: W, dst: W }), u256(BigInt(100))),
    log(m.comet, TX, B, 3, 2, t("Transfer", { from: Z, to: W }), u256(BigInt(100))), // Supply's mint
    log(m.comet, TX, B, 3, 3, t("Withdraw", { src: W, to: W }), u256(BigInt(40))),
    log(m.comet, TX, B, 3, 4, t("Transfer", { from: W, to: Z }), u256(BigInt(40))), // Withdraw's burn
    log(
      m.comet,
      TX,
      B,
      3,
      5,
      t("AbsorbDebt", { absorber: ABSORBER, borrower: W }),
      encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(7), BigInt(7)]),
    ),
    log(m.comet, TX, B, 3, 6, t("Transfer", { from: Z, to: W }), u256(BigInt(7))), // AbsorbDebt's mint
    log(m.comet, TX, B, 3, 7, t("Transfer", { from: SENDER, to: Z }), u256(BigInt(51))), // transferBase: burn from SENDER
    log(m.comet, TX, B, 3, 8, t("Transfer", { from: Z, to: W }), u256(BigInt(50))), //                 mint to W
  ];
  WALLET = W;
  HEAD = B + 10;
  LOGS = logs;
  INDEX_BODY = { wallet: W, rows: [], totalEvents: 0, coverage: null, peakWithheldMarkets: [] };
  const swept = await callRoute();
  assert.equal(sourceOf(swept), "sweep");
  const d = drawn(swept);
  console.log(`  sweep: ${d.join("  ·  ")}`);
  const kinds = d.map((x) => x.split("|")[0]).sort();
  assert.deepEqual(kinds, ["absorb_debt", "supply", "transfer_in", "withdraw"], `drew ${kinds.join(", ")}`);
  assert.equal(
    d.find((x) => x.startsWith("transfer_in")),
    `transfer_in|${B}|8|50|${SENDER}`,
  );
});
