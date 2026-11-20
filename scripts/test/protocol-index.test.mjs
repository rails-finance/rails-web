// The protocols index's selection and order (lib/shared/protocol-index.ts;
// rails-ops decisions 0068 and 0069, ui-jobs 781, 786): one chain at a time,
// Ethereum by default, a category and a search narrowing it, by name.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { protocolIndexState, protocolRowsShown } from "../../lib/shared/protocol-index.ts";
import { PROTOCOL_TYPE_LABELS } from "../../lib/shared/protocol-types.ts";

const TYPES = Object.keys(PROTOCOL_TYPE_LABELS);
const CHAINS = [1, 8453, 42161];
const label = (t) => PROTOCOL_TYPE_LABELS[t];
const row = (id, name, type, chainId) => ({ id, label: name, type, chainId, href: `/${id}`, sections: [] });
const ROWS = [
  row("uniswap-v3", "Uniswap V3", "dex", 1),
  row("aave-v3", "Aave V3", "lending", 1),
  row("aave-v3-base", "Aave V3", "lending", 8453),
  row("lido", "Lido", "staking", 1),
];
const ids = (rs) => rs.map((r) => r.id);

test("the chain: one, Ethereum when none or an unknown one is named", () => {
  assert.equal(protocolIndexState({}, TYPES, CHAINS).chain, 1);
  assert.equal(protocolIndexState({ chain: "8453" }, TYPES, CHAINS).chain, 8453);
  assert.equal(protocolIndexState({ chain: "8453,1" }, TYPES, CHAINS).chain, 8453);
  assert.equal(protocolIndexState({ chain: "999" }, TYPES, CHAINS).chain, 1);
  assert.deepEqual(protocolIndexState({ type: "dex,nope" }, TYPES, CHAINS).types, ["dex"]);
});

test("a tab keeps its chain's explorers, by name", () => {
  assert.deepEqual(ids(protocolRowsShown(ROWS, { chain: 1, types: [] }, "", label)), ["aave-v3", "lido", "uniswap-v3"]);
  assert.deepEqual(ids(protocolRowsShown(ROWS, { chain: 8453, types: [] }, "", label)), ["aave-v3-base"]);
});

test("the category and the search narrow the tab", () => {
  assert.deepEqual(ids(protocolRowsShown(ROWS, { chain: 1, types: ["dex"] }, "", label)), ["uniswap-v3"]);
  assert.deepEqual(ids(protocolRowsShown(ROWS, { chain: 1, types: [] }, "aave", label)), ["aave-v3"]);
  // The heading's search reads the name; the phone's reads the category too.
  assert.deepEqual(ids(protocolRowsShown(ROWS, { chain: 1, types: [] }, label("staking"), label)), []);
  assert.deepEqual(ids(protocolRowsShown(ROWS, { chain: 1, types: [] }, label("staking"), label, true)), ["lido"]);
});
