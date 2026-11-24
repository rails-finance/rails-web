// lib/wallet/families/fx.ts: an open f(x) row whose wallet_positions card has no
// boundary read (no units; rails-server mig 525) is shaped not read, as an Aave
// V3 Base account the chain has not been read for. Its card states no figure,
// its section states no total and the wallet total leaves it out; the head read
// fills it where the listing's sweep has read the position. A row with units is
// shaped as before. The listing route is a stubbed fetch; the modules import
// through `@/`, resolved as wallet-visit-families.test.mjs does. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const url = root + specifier.slice(2) + ext;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith("file:")) {
    for (const ext of [".ts", ".tsx"]) {
      const url = new URL(specifier + ext, context.parentURL).href;
      if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
    }
  }
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

process.env.RAILS_API_URL = "http://box.test";
process.env.API_BEARER_TOKEN = "test-token";

const { fx } = await import("../../lib/wallet/families/fx.ts");
const { walletSections, walletTotal, unreadAtHead } = await import("../../lib/wallet/wallet-sections.ts");

const W = "0x2222222222222222222222222222222222222222";

// The listing's row as mig 525 writes it into the card: an open position's
// units are the boundary read at its last event, null where none is stored.
const card = (position, units) => ({
  pool_key: "wsteth",
  position,
  opened_block: "21600000",
  opened_ts: "1736000000",
  opened_by: W,
  last_event_block: "26100000",
  last_event_ts: "1790000000",
  n_operates: 2,
  n_liquidations: 0,
  liquidation_count: 0,
  ever_liquidated: false,
  implied_debt: "1500000000000000000000",
  coll_in_token: "1000000000000000000",
  coll_out_token: "0",
  protocol_fees_paid: null,
  gas_wei: null,
  last_tick: null,
  last_snap_price: null,
  last_snap_block: null,
  closed_hint: false,
  chain_raw_colls: units ? "1000000000000000000" : null,
  chain_raw_debts: units ? "1500000000000000000000" : null,
  chain_debt_ratio: null,
  chain_owner: W,
  chain_closed: false,
  chain_block: units ? "26100000" : null,
  pool_oracle_price: null,
  pool_price_block: null,
});

const row = (position, units) => ({
  chain: "ethereum",
  family: "fx",
  positionId: `wsteth-${position}`,
  owner: W,
  market: "wstETH",
  status: "open",
  collateral: units ? { amount: "1", symbol: "stETH" } : null,
  debt: units ? { amount: "1500", symbol: "fxUSD" } : null,
  collateralUsd: null,
  debtUsd: null,
  usdSource: null,
  peakCollateral: null,
  peakDebt: null,
  openedAt: 1736000000,
  closedAt: null,
  lastActivityAt: 1790000000,
  txCount: 2,
  liquidationCount: 0,
  readBlock: 26100000,
  readAt: null,
  href: `/ethereum/fx/wsteth-${position}`,
  card: card(position, units),
  writtenAt: "2026-11-24T00:00:00Z",
});

const priced = {
  chain: 1,
  family: "aave-v3",
  familyName: "Aave V3",
  positionId: "a1",
  href: "/x",
  status: "open",
  card: { kind: "aave-v3" },
  headRead: "read",
  usdOwnOracle: true,
  collateralUsd: 1000,
  debtUsd: 100,
};

test("an open f(x) row with no units is not read, and its card states no figure", async () => {
  const [p] = await fx.shape([row("7", false)]);
  assert.equal(p.status, "open");
  assert.equal(p.notRead, true);
  assert.equal(unreadAtHead(p), true);
  // No dollars and no buffer: nothing for a total or the risk sort.
  assert.equal(p.collateralUsd, undefined);
  assert.equal(p.debtUsd, undefined);
  assert.equal(p.buffer, undefined);
  // The card's heads take the settled lane: null draws the dash.
  const { settled } = p.card.row;
  assert.equal(settled.colls, null);
  assert.equal(settled.debts, null);
  assert.equal(settled.debtRatio, null);
  assert.equal(settled.collUsd, null);
});

test("an open f(x) row with units is shaped as before", async () => {
  const [p] = await fx.shape([row("8", true)]);
  assert.equal(p.notRead, undefined);
  assert.equal(p.headRead, "none");
  assert.equal(p.card.row.settled.colls, 1);
  assert.equal(p.card.row.settled.debts, 1500);
  assert.equal(p.card.row.settled.block, 26100000);
});

test("a section holding a not-read f(x) row states no total, and the wallet total leaves it out", async () => {
  const [p] = await fx.shape([row("7", false)]);
  const s = walletSections([priced, p], { bands: true });
  const sec = s.find((x) => x.slug === "fx");
  assert.equal(sec.collateral, undefined);
  assert.equal(sec.debt, undefined);
  assert.equal(sec.band.legs.length, 0);
  assert.equal(sec.band.note, "The open position could not be read at the chain head, so the section states no total.");
  // Drawn after the section's read positions.
  assert.deepEqual(
    sec.open.map((x) => x.positionId),
    ["wsteth-7"],
  );
  const coll = walletTotal(s, "collateral");
  assert.equal(coll.figure.usd, 1000);
  assert.equal(coll.of, 1);
  assert.equal(coll.leaves, "Leaves out f(x) Protocol (not read at the chain head).");
  assert.equal(walletTotal(s, "debt").figure.usd, 100);
});

test("a read f(x) row keeps its section outside the dollar totals as a section with no dollars", async () => {
  const [p] = await fx.shape([row("8", true)]);
  const s = walletSections([priced, { ...p, headRead: "read" }], { bands: true });
  const sec = s.find((x) => x.slug === "fx");
  assert.equal(sec.band.note, undefined);
  const coll = walletTotal(s, "collateral");
  assert.equal(coll.figure.usd, 1000);
  assert.equal(coll.leaves, "Leaves out f(x) Protocol (no dollars).");
});

const answer = (rows) => {
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    assert.equal(url.pathname, "/api/fx/positions");
    return new Response(JSON.stringify({ positions: rows, total: rows.length }), { status: 200 });
  };
};

test("the head read fills a not-read row where the sweep has read it, and leaves it not read where not", async () => {
  const [p] = await fx.shape([row("7", false)]);
  const ctx = { rows: [], readerIp: undefined };

  answer([card("7", false)]);
  const unswept = await fx.head([p], W, new AbortController().signal, 1000, ctx);
  assert.equal(unswept.positions[0].notRead, true);
  assert.equal(unswept.positions[0].headRead, "none");

  answer([{ ...card("7", true), chain_block: "26200000", chain_debt_ratio: "500000000000000000" }]);
  const swept = await fx.head([p], W, new AbortController().signal, 1000, ctx);
  const q = swept.positions[0];
  assert.equal(q.notRead, undefined);
  assert.equal(q.headRead, "read");
  assert.equal(q.readAtBlock, 26200000);
  assert.equal(q.card.row.settled.colls, 1);
  assert.equal(unreadAtHead(q), false);
});
