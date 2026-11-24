// lib/wallet/families/ethereum-single.ts (morphoEthereum) and morpho-card.ts:
// the Morpho Ethereum wallet card reads its market totals at visit (rails-server
// mig 532, as 516 on Base). The stored card's totals and state stamp are left
// out whether or not the row still carries them; the debt with interest is the
// stored borrow shares through the head read's totals, its receipt naming that
// read; a card the head read does not reach keeps the stored principal and
// counts as unread at head. Every open row is read, so one owing nothing takes
// the read's stamp in place of its last event's. The head read (withServerHead)
// and the token metadata route are stubbed. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../../", import.meta.url).href;
const stub = `export async function withServerHead() { return globalThis.__morphoHead(); }`;
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = ${JSON.stringify(root)};
const stub = ${JSON.stringify("data:text/javascript," + encodeURIComponent(stub))};
export async function resolve(specifier, context, next) {
  if (specifier === "@/lib/sources/api/lender-position-head") return { url: stub, shortCircuit: true };
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

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
const ORACLE = "0x48f7e36eb6b826b2df4b2e630b62cd25e89e40e2";
const IRM = "0x870ac11d48b15db9a138cf899d20f13f79ba00bc";
const MARKET = "b323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc";
const W = "0x1111111111111111111111111111111111111111";
const PARAMS = `(Address(${USDC}), Address(${WSTETH}), Address(${ORACLE}), Address(${IRM}), Uint(860000000000000000, 256))`;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.pathname === "/api/reference/erc20") {
    const { addresses } = JSON.parse(init.body);
    const known = {
      [USDC]: { symbol: "USDC", decimals: 6, name: "USD Coin" },
      [WSTETH]: { symbol: "wstETH", decimals: 18, name: "Wrapped liquid staked Ether 2.0" },
    };
    const tokens = Object.fromEntries(addresses.filter((a) => known[a]).map((a) => [a, known[a]]));
    return new Response(JSON.stringify({ tokens, missing: addresses.filter((a) => !known[a]) }), { status: 200 });
  }
  throw new Error(`unexpected fetch ${url}`);
};

const { morphoEthereum } = await import("../../lib/wallet/families/ethereum-single.ts");
const { storedMorphoCard, morphoCardAtHead } = await import("../../lib/wallet/families/morpho-card.ts");
const { unreadAtHead } = await import("../../lib/wallet/wallet-sections.ts");
const { morphoCurrentDebtProv } = await import("../../lib/morpho/event-provenance.ts");

const SHARES = "4000000000000000"; // 4e15 borrow shares
// The card as wallet_positions stores it before mig 532: the market totals and
// their state stamp still on it.
const before532 = {
  market: MARKET,
  borrower: W,
  coll_raw: "2000000000000000000",
  borr_raw: "3900000000", // 3,900 USDC principal
  bsh_raw: SHARES,
  status: "open",
  liquidated: false,
  market_params: PARAMS,
  event_count: "3",
  first_block: "20000000",
  last_block: "21000000",
  last_ts: "1730000000",
  last_tx_hash: null,
  total_borrow_assets: "100000000000000", // stored: 1e14 assets / 1e17 shares
  total_borrow_shares: "100000000000000000",
  state_block: "23800000",
  state_read_at: "2026-11-20T00:00:00Z",
  state_in_refresh_set: false,
  state_stale: true,
  peak_coll_raw: "2000000000000000000",
  peak_borr_raw: "3900000000",
  tx_count: 3,
  bad_debt_raw: null,
};
const after532 = Object.fromEntries(
  Object.entries(before532).filter(
    ([k]) =>
      ![
        "total_borrow_assets",
        "total_borrow_shares",
        "state_block",
        "state_read_at",
        "state_in_refresh_set",
        "state_stale",
      ].includes(k),
  ),
);
const summaryRow = (card) => ({
  chain: "ethereum",
  family: "morpho",
  positionId: `${MARKET}-${W}`,
  owner: W,
  market: null,
  status: "open",
  collateral: null,
  debt: null,
  collateralUsd: null,
  debtUsd: null,
  usdSource: null,
  peakCollateral: null,
  peakDebt: null,
  openedAt: null,
  closedAt: null,
  lastActivityAt: null,
  txCount: 3,
  liquidationCount: 0,
  readBlock: 21000000,
  readAt: "2024-10-27T03:33:20Z",
  href: null,
  card,
  writtenAt: "2026-11-24T00:00:00Z",
});
// The head read: totals of 1.1e14 assets over 1e17 shares at block 23,900,000.
const HEAD_BLOCK = 23900000;
const HEAD_TS = 1795000000;
const live = (over = {}) => ({
  chainStale: false,
  blockNumber: HEAD_BLOCK,
  timestamp: HEAD_TS,
  borrowSharesRaw: SHARES,
  totalBorrowAssetsRaw: "110000000000000",
  totalBorrowSharesRaw: "100000000000000000",
  loanSymbol: "USDC",
  ltv: 0.5,
  lltv: 0.86,
  healthy: true,
  borrowApr: 0.05,
  collateralValue: 8800,
  ...over,
});

async function visit(card, head) {
  globalThis.__morphoHead = async () => (head ? { answer: head } : null);
  const rows = [summaryRow(card)];
  const shaped = await morphoEthereum.shape(rows);
  const out = await morphoEthereum.head(shaped, W, new AbortController().signal, 1000, { rows });
  return { shaped: shaped[0], read: out.positions[0], reads: out.reads };
}

// shares × (assets + 1) ÷ (shares + 1e6), rounded up, in USDC.
const debtAt = (assets, totalShares) => {
  const num = BigInt(SHARES) * (BigInt(assets) + BigInt(1));
  const den = BigInt(totalShares) + BigInt(1000000);
  return Number((num + den - BigInt(1)) / den) / 1e6;
};

for (const [name, card] of [
  ["before 532 (the stored totals still on the card)", before532],
  ["after 532", after532],
]) {
  test(`the card's debt is the stored shares at the head read's totals, ${name}`, async () => {
    const { shaped, read, reads } = await visit(card, live());
    // Before the head read the card states no totals.
    assert.equal(shaped.card.row.currentDebt, null);
    assert.equal(read.headRead, "read");
    assert.equal(reads, 1);
    const d = read.card.row.currentDebt;
    assert.ok(d, "a debt with interest");
    assert.equal(d.amount, debtAt("110000000000000", "100000000000000000"));
    assert.notEqual(d.amount, debtAt("100000000000000", "100000000000000000"));
    assert.equal(d.totalBorrowAssets, "110000000000000");
    assert.equal(d.totalBorrowShares, "100000000000000000");
    assert.deepEqual(d.index, {
      block: HEAD_BLOCK,
      readAt: new Date(HEAD_TS * 1000).toISOString(),
      stale: false,
      atHead: true,
    });
    assert.equal(d.accruedAmount, d.amount - 3900);
    assert.equal(read.readAtBlock, HEAD_BLOCK);
    assert.equal(read.readAt, HEAD_TS);
    assert.equal(unreadAtHead(read), false);
  });

  test(`a failed head read keeps the stored principal and leaves the section unread, ${name}`, async () => {
    const { read } = await visit(card, live({ chainStale: true }));
    assert.equal(read.headRead, "failed");
    assert.equal(read.card.row.currentDebt, null);
    assert.equal(read.card.row.borrowed.amount, 3900);
    assert.equal(read.card.row.collateral.amount, 2);
    assert.equal(unreadAtHead(read), true);
    // The row's stamp is its last event's after 532: a failed read states none.
    assert.equal(read.readAt, undefined);
    assert.equal(read.readAtBlock, undefined);
  });

  const collateralOnly = { ...card, borr_raw: "0", bsh_raw: "0" };

  test(`an open row owing nothing is read at visit and takes the read's stamp, ${name}`, async () => {
    const { shaped, read, reads } = await visit(
      collateralOnly,
      live({ borrowSharesRaw: "0", ltv: null, healthy: null }),
    );
    assert.equal(shaped.readAtBlock, 21000000);
    assert.equal(reads, 1);
    assert.equal(read.headRead, "read");
    assert.equal(read.readAtBlock, HEAD_BLOCK);
    assert.equal(read.readAt, HEAD_TS);
    assert.equal(read.riskFigure, undefined);
    assert.equal(read.liquidatable, undefined);
    assert.equal(read.debtRate, undefined);
    assert.equal(read.card.row.currentDebt, null);
    assert.equal(read.card.row.collateral.amount, 2);
  });

  test(`an open row owing nothing whose read fails states no stamp and counts as unread, ${name}`, async () => {
    const { read } = await visit(collateralOnly, live({ chainStale: true }));
    assert.equal(read.headRead, "failed");
    assert.equal(read.readAt, undefined);
    assert.equal(read.readAtBlock, undefined);
    assert.equal(unreadAtHead(read), true);
  });

  test(`a row stored owing nothing that the chain finds owing is a failed read, ${name}`, async () => {
    const { read } = await visit(collateralOnly, live());
    assert.equal(read.headRead, "failed");
    assert.equal(read.card.row.currentDebt, null);
    assert.equal(read.readAt, undefined);
    assert.equal(unreadAtHead(read), true);
  });

  test(`a head read whose borrow shares moved leaves the card's stored figures, ${name}`, async () => {
    const { read } = await visit(card, live({ borrowSharesRaw: "5000000000000000" }));
    assert.equal(read.headRead, "read");
    assert.equal(read.card.row.currentDebt, null);
    assert.equal(read.card.row.borrowed.amount, 3900);
  });
}

test("a position owing a debt whose principal reads zero is still read", async () => {
  const { read } = await visit({ ...after532, borr_raw: "0" }, live());
  assert.equal(read.headRead, "read");
  assert.equal(read.card.row.currentDebt.amount, debtAt("110000000000000", "100000000000000000"));
});

test("storedMorphoCard leaves out the totals and the state stamp; morphoCardAtHead sets the head read's", () => {
  const s = storedMorphoCard(before532);
  for (const k of ["total_borrow_assets", "total_borrow_shares", "state_block", "state_read_at", "state_stale"])
    assert.equal(s[k], null, k);
  assert.equal("state_in_refresh_set" in s, false);
  assert.equal(s.bsh_raw, SHARES);
  const h = morphoCardAtHead(s, live());
  assert.equal(h.total_borrow_assets, "110000000000000");
  assert.equal(h.state_block, String(HEAD_BLOCK));
  assert.equal(h.state_stale, false);
  assert.equal(h.state_at_head, true);
  // A numeric served with a fractional part is the same share count.
  assert.ok(morphoCardAtHead({ ...s, bsh_raw: `${SHARES}.0` }, live()));
  assert.equal(morphoCardAtHead(s, live({ borrowSharesRaw: "1" })), null);
});

test("the debt receipt names the visit's head read", () => {
  const index = { block: HEAD_BLOCK, readAt: new Date(HEAD_TS * 1000).toISOString(), stale: false, atHead: true };
  const p = morphoCurrentDebtProv("USDC", "4", "110000000000000", "100000000000000000", undefined, index);
  assert.match(p.summary, /totals from this visit's head read at block 23,900,000, interest accrued to that block/);
  assert.doesNotMatch(p.summary, /has not refreshed them/);
  assert.match(p.via, /read at the chain head on this visit/);
  assert.equal(p.source.block, HEAD_BLOCK);
  for (const i of p.inputs.slice(1)) assert.match(i.note, /this visit's head read/);
  // The stored index keeps its wording.
  const stored = morphoCurrentDebtProv("USDC", "4", "1", "1", undefined, { ...index, atHead: undefined, stale: true });
  assert.match(stored.summary, /the market's totals at block 23,900,000/);
  assert.match(stored.summary, /has not refreshed them since/);
});

// The cap on api-host requests sits in route-gate.ts, under withServerHead (wallet-api-cap.test.mjs).
test("every open row's head read goes out together, with no limiter of the family's", async () => {
  let inFlight = 0;
  let most = 0;
  globalThis.__morphoHead = async () => {
    inFlight++;
    most = Math.max(most, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { answer: live() };
  };
  const rows = Array.from({ length: 11 }, (_, i) => {
    const market = MARKET.slice(0, -2) + i.toString(16).padStart(2, "0");
    return { ...summaryRow({ ...after532, market }), positionId: `${market}-${W}` };
  });
  const shaped = await morphoEthereum.shape(rows);
  assert.equal(shaped.length, 11);
  const out = await morphoEthereum.head(shaped, W, new AbortController().signal, 1000, { rows });
  assert.equal(out.reads, 11);
  assert.ok(out.positions.every((p) => p.headRead === "read"));
  assert.equal(most, 11);
});
