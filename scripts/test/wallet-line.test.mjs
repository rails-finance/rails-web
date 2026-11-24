// The wallet heading's positions menu (H13.2; Miles 17 Nov 2026, rails-ops ui-jobs 701):
// lib/wallet/summary-counts.ts walletProtocolMenu, one row per protocol and chain with its counts,
// linking to its one position or to the listing searched by the wallet.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { ARC_CHAIN_ID, CHAINS, SEPOLIA_CHAIN_ID } from "../../lib/shared/chains.ts";
import { MENU_TESTNETS, WALLET_COUNTS_SCOPE, rowIsPage, walletProtocolMenu } from "../../lib/wallet/summary-counts.ts";

const W = "0x3df83ec9d2b62bb9bb83eba1218a202564bb67da";
const DASHBOARD = `/wallet/${W}`;
const pos = (family, status, id, chain = "ethereum") => ({
  chain,
  family,
  positionId: String(id),
  status,
  href: `/${chain}/${family}/${id}`,
});
// The roster stand-in: name, order, and the listing searched by the wallet
// (null for a listing that takes no wallet).
const ROSTER = {
  "aave-v3": ["Aave V3", 0],
  "liquity-v2": ["Liquity V2", 1],
  "compound-v3": ["Compound V3", 2],
  morpho: ["Morpho Blue", 3],
};
const protocolOf = (p) => {
  const [name, order] = ROSTER[p.family] ?? [];
  if (!name) return undefined;
  return {
    name,
    order: order + (p.chain === "ethereum" ? 0 : 0.5),
    listing: p.family === "morpho" ? null : `/${p.chain}/${p.family}?q=${W}`,
  };
};
const menu = (positions, path) =>
  walletProtocolMenu(positions, (p) => rowIsPage(p.href, path, ""), protocolOf, DASHBOARD);

test("the trigger counts every position, singular at one", () => {
  const rows = [pos("aave-v3", "open", 1), pos("aave-v3", "closed", 2), pos("liquity-v2", "liquidated", 3)];
  assert.equal(menu(rows, "/ethereum/aave-v3/1").trigger, "3 positions");
  assert.equal(menu([pos("aave-v3", "closed", 2)], "/elsewhere").trigger, "1 position");
});

test("nothing besides the page's position draws nothing", () => {
  assert.equal(menu([], "/x"), null);
  assert.equal(menu([pos("aave-v3", "open", 1)], "/ethereum/aave-v3/1"), null);
});

test("one row per protocol and chain, with its counts", () => {
  const m = menu(
    [
      pos("aave-v3", "open", 1),
      pos("aave-v3", "closed", 2),
      pos("aave-v3", "liquidated", 3),
      pos("aave-v3", "open", 4, "base"),
      pos("liquity-v2", "redeemed", 5),
      pos("compound-v3", "open", 6),
    ],
    "/x",
  );
  assert.deepEqual(
    m.rows.map((r) => [r.key, r.name, r.counts]),
    [
      ["ethereum:aave-v3", "Aave V3", "1 open · 2 closed"],
      ["base:aave-v3", "Aave V3", "1 open"],
      ["ethereum:compound-v3", "Compound V3", "1 open"],
      ["ethereum:liquity-v2", "Liquity V2", "1 closed"],
    ],
  );
});

test("open rows first, each group in roster order", () => {
  const m = menu(
    [
      pos("morpho", "closed", 1),
      pos("liquity-v2", "closed", 2),
      pos("compound-v3", "open", 3),
      pos("aave-v3", "open", 4),
    ],
    "/x",
  );
  assert.deepEqual(
    m.rows.map((r) => r.name),
    ["Aave V3", "Compound V3", "Liquity V2", "Morpho Blue"],
  );
});

test("one position links to it; several to the listing searched by the wallet; else the wallet view", () => {
  const m = menu(
    [
      pos("aave-v3", "open", 1),
      pos("liquity-v2", "open", 2),
      pos("liquity-v2", "closed", 3),
      pos("morpho", "open", 4),
      pos("morpho", "open", 5),
    ],
    "/x",
  );
  const href = Object.fromEntries(m.rows.map((r) => [r.name, r.href]));
  assert.equal(href["Aave V3"], "/ethereum/aave-v3/1");
  assert.equal(href["Liquity V2"], `/ethereum/liquity-v2?q=${W}`);
  assert.equal(href["Morpho Blue"], DASHBOARD);
});

test("this page: the page's row marked; not a link where the row is the page", () => {
  const alone = menu([pos("aave-v3", "open", 1), pos("liquity-v2", "closed", 2)], "/ethereum/aave-v3/1");
  const aave = alone.rows.find((r) => r.name === "Aave V3");
  assert.deepEqual([aave.page, aave.current], [true, true]);
  assert.equal(alone.pageCounted, true);
  const shared = menu([pos("aave-v3", "open", 1), pos("aave-v3", "closed", 2)], "/ethereum/aave-v3/1");
  assert.deepEqual(
    [shared.rows[0].page, shared.rows[0].current, shared.rows[0].href],
    [true, false, `/ethereum/aave-v3?q=${W}`],
  );
  assert.equal(menu([pos("aave-v3", "open", 1)], "/sepolia/polaris/goldp/20").pageCounted, false);
});

test("a position on no roster entry is named by its family", () => {
  const m = menu([pos("unknown", "open", 1)], "/x");
  assert.deepEqual([m.rows[0].name, m.rows[0].href], ["unknown", "/ethereum/unknown/1"]);
});

test("a position with a null href is no page; its row links to the listing or the wallet view", () => {
  assert.equal(rowIsPage(null, "/ethereum/aave-v3/1", ""), false);
  const noPage = (family, id) => ({ ...pos(family, "open", id), href: null });
  const alone = menu([noPage("liquity-v2", 1), pos("aave-v3", "open", 2)], "/ethereum/aave-v3/2");
  assert.equal(alone.pageCounted, true);
  assert.equal(alone.rows.find((r) => r.name === "Liquity V2").href, `/ethereum/liquity-v2?q=${W}`);
  const unlisted = menu([noPage("morpho", 1)], "/x");
  assert.equal(unlisted.trigger, "1 position");
  assert.equal(unlisted.rows[0].href, DASHBOARD);
  assert.equal(unlisted.rows[0].current, false);
});

test("an Arc or Sepolia position keeps its chain and its menu row", () => {
  assert.equal(CHAINS[ARC_CHAIN_ID].slug, "arc");
  assert.equal(CHAINS[SEPOLIA_CHAIN_ID].slug, "sepolia");
  const m = menu([pos("aave-v3", "open", 1, "arc"), pos("aave-v3", "open", 2)], "/x");
  assert.deepEqual(m.rows.map((r) => r.key).sort(), ["arc:aave-v3", "ethereum:aave-v3"]);
});

test("the footer and the wallet view's tip", () => {
  assert.equal(MENU_TESTNETS, "Testnets not included");
  assert.equal(WALLET_COUNTS_SCOPE, "Counts mainnet positions; the Sepolia testnet is not counted.");
});

test("a position passed to another wallet counts as moved, never open or closed (ui-jobs 705)", () => {
  const m = menu(
    [
      pos("liquity-v2", "open", 1),
      pos("liquity-v2", "moved", 2),
      pos("aave-v3", "closed", 3),
      pos("aave-v3", "moved", 4),
    ],
    "/x",
  );
  const liquity = m.rows.find((r) => r.key === "ethereum:liquity-v2");
  assert.deepEqual([liquity.open, liquity.closed, liquity.moved, liquity.counts], [1, 0, 1, "1 open · 1 moved"]);
  const aave = m.rows.find((r) => r.key === "ethereum:aave-v3");
  assert.deepEqual([aave.open, aave.closed, aave.moved, aave.counts], [0, 1, 1, "1 closed · 1 moved"]);
  // A row of moved positions alone sorts with the rows that hold nothing open.
  const onlyMoved = menu([pos("aave-v3", "open", 1), pos("liquity-v2", "moved", 2)], "/x");
  assert.deepEqual(
    onlyMoved.rows.map((r) => r.counts),
    ["1 open", "1 moved"],
  );
});
