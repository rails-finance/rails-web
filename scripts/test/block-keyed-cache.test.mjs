// Reads at a named block kept by block (ui-jobs 747): the branches page reads
// the CCR figures at the roster's block, and two views at one block make one
// read (one getBlock and one multicall in lib/sources/chain/liquity-v2-branch-ccr.ts).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { blockKeyedCache } from "../../lib/liquity-v2/block-keyed-cache.ts";

function counting() {
  const calls = [];
  const load = async (block) => {
    calls.push(block);
    return { blockNumber: block };
  };
  return { calls, load };
}

test("two reads at one block make one read, concurrent or after", async () => {
  const { calls, load } = counting();
  const get = blockKeyedCache(8, load);
  const [a, b] = await Promise.all([get(26_444_500), get(26_444_500)]);
  await get(26_444_500);
  assert.equal(calls.length, 1);
  assert.equal(a, b);
});

test("past the limit the least recently used block goes", async () => {
  const { calls, load } = counting();
  const get = blockKeyedCache(2, load);
  await get(1);
  await get(2);
  await get(1); // 1 is now the most recent
  await get(3); // 2 goes
  await get(1);
  await get(2);
  assert.deepEqual(calls, [1, 2, 3, 2]);
});

test("an answer the keep rule refuses is read again", async () => {
  const { calls, load } = counting();
  const get = blockKeyedCache(8, load, (v) => v.blockNumber > 5);
  await get(5);
  await get(5);
  assert.deepEqual(calls, [5, 5]);
});
