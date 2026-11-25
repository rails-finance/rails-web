// The wallet heading's positions menu (H13.2; Miles 17 Nov 2026, rails-ops ui-jobs 701):
// lib/wallet/summary-counts.ts walletProtocolMenu, one row per protocol and chain with its counts,
// linking to its one position or to the listing searched by the wallet.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { ARC_CHAIN_ID, CHAINS, SEPOLIA_CHAIN_ID } from "../../lib/shared/chains.ts";
import {
  MENU_TESTNETS,
  WALLET_COUNTS_SCOPE,
  menuKey,
  rowIsPage,
  vaultProtocolOfHref,
  vaultRoot,
  hrefIsPage,
  walletProtocolMenu,
  walletProtocolRows,
  walletTrailCrumb,
} from "../../lib/wallet/summary-counts.ts";

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

// Vault shares (ui-jobs 783): one summary family, "vaults", over MetaMorpho,
// Aave's vaults and Yearn V3; the menu gives each vault protocol its row.
const vault = (chain, root, n, status = "open") => ({
  chain,
  family: "vaults",
  positionId: `0xv${n}-${W}`,
  status,
  href: `/${chain}/${root}/vaults/0xv${n}/${W}`,
});
const VAULT_ROSTER = { morpho: ["Morpho Blue", 3], aave: ["Aave vaults", 4], yearn: ["Yearn V3", 5] };
const vaultProtocolOf = (p) => {
  if (p.family !== "vaults") return protocolOf(p);
  const root = vaultRoot(p.href);
  const [label, order] = VAULT_ROSTER[root];
  return {
    name: vaultProtocolOfHref(p.href) ?? label,
    order,
    // Yearn V3 has no holder listing: the wallet view narrowed to the vault shares.
    listing: root === "yearn" ? `${DASHBOARD}?protocol=vaults` : `/${p.chain}/${root}/vaults/positions?q=${W}`,
  };
};

test("vault rows take one menu row per vault protocol and chain, each named", () => {
  const m = walletProtocolMenu(
    [
      vault("ethereum", "morpho", 1),
      vault("ethereum", "morpho", 2, "closed"),
      vault("ethereum", "aave", 3),
      vault("ethereum", "yearn", 4),
      vault("ethereum", "yearn", 5),
      vault("base", "morpho", 6),
      pos("morpho", "open", 7),
    ],
    (p) => rowIsPage(p.href, "/x", ""),
    vaultProtocolOf,
    DASHBOARD,
  );
  const rows = Object.fromEntries(m.rows.map((r) => [r.key, r]));
  assert.deepEqual(Object.keys(rows).sort(), [
    "base:vaults:morpho",
    "ethereum:morpho",
    "ethereum:vaults:aave",
    "ethereum:vaults:morpho",
    "ethereum:vaults:yearn",
  ]);
  assert.equal(rows["ethereum:vaults:morpho"].name, "MetaMorpho vaults");
  assert.equal(rows["ethereum:vaults:morpho"].counts, "1 open · 1 closed");
  assert.equal(rows["ethereum:vaults:morpho"].href, `/ethereum/morpho/vaults/positions?q=${W}`);
  assert.equal(rows["ethereum:morpho"].name, "Morpho Blue");
  assert.equal(rows["ethereum:vaults:aave"].name, "Aave vaults");
  assert.equal(rows["ethereum:vaults:aave"].href, `/ethereum/aave/vaults/0xv3/${W}`);
  // Yearn V3 has no holder listing: past one holding, the wallet view's vault shares.
  assert.equal(rows["ethereum:vaults:yearn"].name, "Yearn V3");
  assert.equal(rows["ethereum:vaults:yearn"].href, `${DASHBOARD}?protocol=vaults`);
  assert.equal(rows["base:vaults:morpho"].name, "MetaMorpho vaults");
});

test("menuKey splits vault rows by their href's root and leaves other families whole", () => {
  assert.equal(menuKey(vault("base", "morpho", 1)), "base:vaults:morpho");
  assert.equal(menuKey(pos("aave-v3", "open", 1)), "ethereum:aave-v3");
  assert.equal(vaultRoot("/ethereum/aave-v3/0xabc"), undefined);
  assert.equal(vaultProtocolOfHref("/ethereum/yearn/vaults/0xv/0xh?x=1"), "Yearn V3");
});

// The trail's protocol crumb (H13.4).
const trail = (positions, path, search, page) =>
  walletTrailCrumb(
    walletProtocolRows(positions, (p) => rowIsPage(p.href, path, search), protocolOf, DASHBOARD),
    path,
    search,
    page,
  );

test("a href is the page where its path and every parameter it states match", () => {
  assert.equal(hrefIsPage(`/wallet/${W}?protocol=liquity-v2`, `/wallet/${W}`, "?protocol=liquity-v2"), true);
  assert.equal(hrefIsPage(`/wallet/${W}?protocol=liquity-v2`, `/wallet/${W}`, ""), false);
  assert.equal(hrefIsPage(`/wallet/${W}`, `/wallet/${W}`, "?protocol=aave-v3"), true);
});

test("on a position page the crumb links to the protocol's listing searched by the wallet", () => {
  const rows = [pos("aave-v3", "open", 1), pos("aave-v3", "closed", 2), pos("liquity-v2", "open", 3)];
  const c = trail(rows, "/ethereum/aave-v3/1", "", "position");
  assert.equal(c.row.name, "Aave V3");
  assert.equal(c.href, `/ethereum/aave-v3?q=${W}`);
  assert.equal(c.current, false);
  // The page's position alone in its protocol: the listing still.
  const alone = trail([pos("aave-v3", "open", 1)], "/ethereum/aave-v3/1", "", "event");
  assert.equal(alone.href, `/ethereum/aave-v3?q=${W}`);
});

test("a row's one position above the page is the crumb's link", () => {
  const wallet = { ...pos("morpho", "open", 1, "arbitrum"), href: `/arbitrum/morpho/${W}` };
  const c = trail([wallet, pos("aave-v3", "open", 2)], `/arbitrum/morpho/${W}/0xabc`, "", "position");
  assert.equal(c.href, `/arbitrum/morpho/${W}`);
  assert.equal(c.current, false);
});

test("on a wallet page the crumb is the page", () => {
  const rows = [pos("liquity-v2", "open", 1), pos("liquity-v2", "open", 2), pos("aave-v3", "open", 3)];
  const listing = (p) => ({
    ...protocolOf(p),
    listing: p.family === "liquity-v2" ? `/wallet/${W}?protocol=liquity-v2` : null,
  });
  const r = walletProtocolRows(rows, () => false, listing, DASHBOARD);
  const c = walletTrailCrumb(r, `/wallet/${W}`, "?protocol=liquity-v2", "wallet");
  assert.equal(c.row.name, "Liquity V2");
  assert.equal(c.current, true);
  assert.equal(walletTrailCrumb(r, `/wallet/${W}`, "?protocol=pwn", "wallet"), null);
  // A wallet page above its positions' pages.
  const under = trail(
    [{ ...pos("morpho", "open", 1, "base"), href: `/base/morpho/${W}/0x1` }],
    `/base/morpho/${W}`,
    "",
    "wallet",
  );
  assert.equal(under.current, true);
});

test("on the wallet view narrowed to a protocol every chain's row is the page", () => {
  const rows = [pos("aave-v3", "open", 1), pos("aave-v3", "open", 2, "arbitrum"), pos("liquity-v2", "open", 3)];
  const narrowed = (p) => ({ ...protocolOf(p), listing: `/wallet/${W}?protocol=${p.family}` });
  const r = walletProtocolRows(rows, () => false, narrowed, DASHBOARD);
  const c = walletTrailCrumb(r, `/wallet/${W}`, "?protocol=aave-v3", "wallet");
  assert.equal(c.row.name, "Aave V3");
  assert.deepEqual(c.keys.sort(), ["arbitrum:aave-v3", "ethereum:aave-v3"]);
});
