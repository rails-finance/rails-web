// The protocols index's groups, lines, selection and order
// (lib/shared/protocol-index.ts; rails-ops decision 0068, ui-jobs 781).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  groupProtocolRows,
  protocolIndexState,
  protocolLinesShown,
  sortProtocolRows,
} from "../../lib/shared/protocol-index.ts";
import { PROTOCOL_TYPE_LABELS } from "../../lib/shared/protocol-types.ts";

const TYPES = Object.keys(PROTOCOL_TYPE_LABELS);
const label = (t) => PROTOCOL_TYPE_LABELS[t];
const ORDER = { 1: 0, 8453: 1, 42161: 2 };
const NAME = { 1: "Ethereum", 8453: "Base", 42161: "Arbitrum" };
const CHAIN = { "aave-v3": 1, "aave-v3-base": 8453, "aave-v3-arbitrum": 42161, "uniswap-v3": 1, lido: 1 };
const ENTRIES = [
  { id: "aave-v3-base", protocolKey: "aave-v3", label: "Aave V3", type: "lending" },
  { id: "uniswap-v3", label: "Uniswap V3", type: "dex" },
  { id: "aave-v3", label: "Aave V3", type: "lending" },
  { id: "aave-v3-arbitrum", protocolKey: "aave-v3", label: "Aave V3", type: "lending" },
  { id: "lido", label: "Lido", type: "staking" },
];
const lineOf = (e) => ({
  id: e.id,
  chainId: CHAIN[e.id],
  chainName: NAME[CHAIN[e.id]],
  chainOrder: ORDER[CHAIN[e.id]],
  href: `/${e.id}`,
});
const ASSETS = {
  "aave-v3": [{ symbol: "USDC", address: "0x1", chainId: 1 }],
  "aave-v3-base": [{ symbol: "cbETH", address: "0x3", chainId: 8453 }],
};
const rows = groupProtocolRows(ENTRIES, lineOf, (id) => ASSETS[id] ?? []);
const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
const ALL = { chains: [], types: [] };
const ids = (lines) => lines.map((l) => l.id);

test("a group per version, a line per explorer in the chain order", () => {
  assert.equal(rows.length, 3);
  assert.deepEqual(ids(byKey["aave-v3"].lines), ["aave-v3", "aave-v3-base", "aave-v3-arbitrum"]);
  assert.equal(byKey["aave-v3"].iconId, "aave-v3");
});

test("each line holds its own explorer's assets; a DEX takes any token", () => {
  const [eth, base, arb] = byKey["aave-v3"].lines;
  assert.deepEqual(
    eth.assets.map((a) => a.symbol),
    ["USDC"],
  );
  assert.deepEqual(
    base.assets.map((a) => a.symbol),
    ["cbETH"],
  );
  assert.deepEqual(arb.assets, []);
  assert.equal(byKey["uniswap-v3"].anyToken, true);
  const unread = groupProtocolRows(ENTRIES, lineOf, () => null);
  assert.equal(unread.find((r) => r.key === "aave-v3").lines[0].assets, null, "no read, no list");
});

test("?chain= and ?type= read as comma lists, unknown values dropped", () => {
  assert.deepEqual(protocolIndexState({ chain: "1,8453,x,0", type: "dex,lending,nope" }, TYPES), {
    chains: ["1", "8453"],
    types: ["dex", "lending"],
  });
  assert.deepEqual(protocolIndexState({}, TYPES), ALL);
});

test("the chain keeps its lines; the category keeps or drops the group", () => {
  assert.deepEqual(ids(protocolLinesShown(byKey["aave-v3"], { chains: ["8453"], types: [] }, "", label)), [
    "aave-v3-base",
  ]);
  assert.deepEqual(protocolLinesShown(byKey["uniswap-v3"], { chains: ["42161"], types: [] }, "", label), []);
  assert.deepEqual(protocolLinesShown(byKey["uniswap-v3"], { chains: [], types: ["lending"] }, "", label), []);
});

test("the search keeps the whole group on its name or category, else the lines on their chain", () => {
  assert.equal(protocolLinesShown(byKey["aave-v3"], ALL, " aave ", label).length, 3);
  assert.equal(protocolLinesShown(byKey["aave-v3"], ALL, "lending", label).length, 3);
  assert.deepEqual(ids(protocolLinesShown(byKey["aave-v3"], ALL, "arbitrum", label)), ["aave-v3-arbitrum"]);
  assert.deepEqual(protocolLinesShown(byKey.lido, ALL, "aave", label), []);
});

test("groups run by name", () => {
  assert.deepEqual(
    sortProtocolRows(rows).map((r) => r.key),
    ["aave-v3", "lido", "uniswap-v3"],
  );
});
