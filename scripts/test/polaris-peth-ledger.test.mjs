// lib/polaris/peth-ledger.ts — a Polaris pETH account (ui-jobs 865): the
// headline figures, the places the pETH sits, the rows as timeline events and
// the Type filter's effect umbrellas. Fixtures: three answers of rails-server's
// GET /api/polaris/peth/:address on a local partial ledger (27 Nov 2026):
// a CDP holder, a stability-pool depositor (rows trimmed to one per kind) and
// the light address with POLARIS_RPC_URL unset.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PETH_ACTION_LEGS,
  PETH_EFFECT_LABELS,
  PETH_KINDS,
  pethActionLegs,
  pethHeadlines,
  pethHeadRead,
  pethLedgerComplete,
  pethLedgerGap,
  pethLedgerUnchecked,
  pethLineToken,
  pethWalletLines,
  pethScannedTo,
  pethPlaces,
  pethRowBullets,
  pethTimelineEvent,
} from "../../lib/polaris/peth-ledger.ts";

const fx = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/polaris-peth/${name}.json`, import.meta.url), "utf8"));
const NAMES = {
  peth: { symbol: "pETH", address: "0x07ea2ff889e6228cded329a09f66e370f12c705e" },
  fpeth: { symbol: "fpETH", address: "0x94220c1c340336527c719bcf06067ca7769ac185" },
  vpeth: { symbol: "vpETH", address: "0x43cc4978e11bc1e1d8cfcd8348cb7e7246c49b6e" },
  weth: { symbol: "WETH", address: "0xf430240a61e0a5bd7a3637d616e0dab5632fbe89" },
};
const VENUES = {
  venue_curve_tripool: { address: "0x28b6f412904834dee78a4fa464f2089f5264770c" },
  venue_univ2_polar_peth: { address: "0xdce2d72d07760cdb29604baee6271fcb1f3a7565" },
  venue_univ2_peth_weth: { address: "0xb3348b1c358aa118b6304a91c48f3ee5a13f06a8" },
};

test("the headlines are the route's figures, valued at spot and floor at the head", () => {
  const d = fx("cdp");
  const f = pethHeadlines(d);
  assert.equal(f.ethIn, BigInt(d.figures.eth_in.raw));
  assert.equal(f.ethOut, BigInt(0));
  assert.equal(f.curveFees, BigInt(d.figures.curve_fees_paid.raw));
  assert.equal(f.pethHeld, BigInt(d.figures.peth_held.raw));
  // The route's own products at the head agree with the page's.
  assert.equal(f.atSpot, BigInt(d.rollup.wallet_peth.at_spot_raw));
  assert.equal(f.atFloor, BigInt(d.rollup.wallet_peth.at_floor_raw));
  assert.ok(pethHeadRead(d));
  assert.ok(pethLedgerComplete(d));
});

test("no chain read: the head figures are absent and the ledger stands", () => {
  const d = fx("light-unset-trimmed");
  const f = pethHeadlines(d);
  assert.equal(pethHeadRead(d), false);
  assert.equal(f.pethHeld, null);
  assert.equal(f.atSpot, null);
  assert.equal(f.spot, null);
  assert.equal(f.ethIn, BigInt(d.figures.eth_in.raw));
  const p = pethPlaces(d);
  assert.equal(p.wallet, null);
  assert.equal(p.fpeth, null);
  assert.equal(p.cdp.total, BigInt(0));
});

test("ledger still reading: the ledger's figures are absent and the head stands", () => {
  const d = {
    ...fx("cdp"),
    ledger: { complete: false, scanned_to_block: "11600000", deploy_block: "11482700", head_block: "12224512" },
  };
  const f = pethHeadlines(d);
  assert.equal(pethLedgerComplete(d), false);
  assert.equal(f.ethIn, null);
  assert.equal(f.ethOut, null);
  assert.equal(f.curveFees, null);
  assert.equal(f.pethHeld, BigInt(d.figures.peth_held.raw));
});

test("the places carry each item with its link keys", () => {
  const p = pethPlaces(fx("cdp"));
  assert.deepEqual(
    p.cdp.items.map((c) => `${c.market}:${c.id}`),
    ["usdp:194", "usdp:195"],
  );
  assert.equal(
    p.cdp.items.reduce((s, c) => s + c.raw, BigInt(0)),
    p.cdp.total,
  );
  assert.deepEqual(
    p.loans.items.map((l) => l.id),
    ["190"],
  );
  assert.ok(p.fpeth.raw > BigInt(0));
  assert.equal(p.lp.length, 3);
});

test("every kind sits under one effect umbrella, and a row's leg reads back", () => {
  const legs = Object.values(PETH_ACTION_LEGS).flat();
  assert.equal(legs.length, Object.keys(PETH_KINDS).length);
  for (const k of Object.keys(PETH_ACTION_LEGS)) assert.ok(PETH_EFFECT_LABELS[k]);
  for (const r of fx("sp-trimmed").rows) {
    const e = pethTimelineEvent(r, NAMES, VENUES);
    assert.ok(e.actionType.startsWith("peth."));
    const leg = pethActionLegs(e.actionType, e.actionLabel);
    assert.equal(leg?.length, 1);
    assert.ok(
      legs.some((l) => l.key === leg[0]),
      `${leg[0]} is a declared leg`,
    );
  }
});

test("a PSM mint's ETH value is a valuation, never ETH out", () => {
  const r = fx("sp-trimmed").rows.find((x) => x.kind === "psm_mint");
  assert.ok(r);
  assert.equal(r.eth_out_raw, "0");
  const bullets = pethRowBullets(r, NAMES);
  assert.ok(bullets.some((b) => /which ETH out does not count/.test(b)));
  assert.ok(!bullets.some((b) => /counted in ETH out/.test(b)));
});

test("a row's flows name its tokens for the Asset filter", () => {
  const rows = fx("cdp").rows;
  const zap = rows.find((r) => r.kind === "zap_out");
  const e = pethTimelineEvent(zap, NAMES, VENUES);
  assert.deepEqual(
    e.flows.map((f) => f.tokenSymbol),
    ["WETH"],
  );
});

test("a status other than ok withholds the ledger and names why", () => {
  const base = fx("cdp");
  const heavy = { ...base, status: "too_heavy", reason: "too many rows" };
  assert.equal(pethLedgerComplete(heavy), false);
  assert.equal(pethLedgerGap(heavy), "too_heavy");
  assert.equal(pethHeadlines(heavy).ethIn, null);
  assert.equal(pethLedgerGap({ ...base, status: "incomplete" }), "reading");
  assert.equal(pethLedgerGap({ ...base, status: "ok", ledger: { complete: true } }), null);
});

test("an unread head serves the stored ledger, its freshness unchecked", () => {
  const { scanned_to_block: _gone, ...base } = fx("light-unset-trimmed");
  const d = {
    ...base,
    status: "ok",
    ledger: { complete: null, scanned_to_block: "12224000", deploy_block: "11482700", head_block: null },
  };
  assert.equal(pethLedgerComplete(d), true);
  assert.equal(pethLedgerUnchecked(d), true);
  assert.equal(pethScannedTo(d), "12224000");
  assert.equal(pethLedgerUnchecked({ ...d, ledger: { ...d.ledger, complete: true } }), false);
});

test("svpETH is a place with the vpETH it converts to; svpETH moves are changes of place, Morpho rows not decoded", () => {
  const base = fx("cdp");
  const d = {
    ...base,
    rollup: {
      ...base.rollup,
      wallet_svpeth: {
        raw: "2000000000000000000",
        vpeth_raw: "2100000000000000000",
        valued: false,
        block: "1",
        source: "x",
      },
    },
  };
  assert.deepEqual(pethPlaces(d).svpeth, { raw: BigInt("2000000000000000000"), vpeth: BigInt("2100000000000000000") });
  assert.equal(pethPlaces(base).svpeth, null);
  for (const k of ["svpeth_stake", "svpeth_vpeth_in"]) assert.equal(PETH_KINDS[k].effect, "change_of_place");
  // vpETH with Morpho Blue is out of v1: its own effect, never a change of place.
  assert.equal(PETH_KINDS.morpho_vpeth_not_decoded.effect, "not_decoded");
  assert.ok(PETH_EFFECT_LABELS["peth.not_decoded"]);
  const row = {
    ...fx("cdp").rows[0],
    kind: "morpho_vpeth_not_decoded",
    effect: "not_decoded",
    valuation: null,
    peth_delta_raw: "0",
    vpeth_delta_raw: "0",
  };
  const bullets = pethRowBullets(row, NAMES);
  assert.equal(bullets.length, 1);
  assert.equal(bullets[0], "This vpETH move is in no ETH figure or valuation.");
  const e = pethTimelineEvent(row, NAMES, VENUES);
  assert.equal(e.actionType, "peth.not_decoded");
});

test("a pool share received with no deposit is an acquisition with its one bullet", () => {
  assert.deepEqual(PETH_KINDS.lp_received, { effect: "acquisition", label: "Pool share received" });
  const row = {
    ...fx("cdp").rows[0],
    kind: "lp_received",
    effect: "acquisition",
    valuation: null,
    peth_delta_raw: "0",
    fpeth_delta_raw: "0",
    vpeth_delta_raw: "0",
    eth_in_raw: "0",
    eth_out_raw: "0",
    curve_fee_raw: "0",
  };
  assert.deepEqual(pethRowBullets(row, NAMES), [
    "The pool minted this share to the address without a deposit from it in this transaction.",
  ]);
});

test("a pool share sent to another holder is an exit with its one bullet", () => {
  assert.deepEqual(PETH_KINDS.lp_sent, { effect: "exit", label: "Pool share sent" });
  const row = {
    ...fx("cdp").rows[0],
    kind: "lp_sent",
    effect: "exit",
    valuation: null,
    peth_delta_raw: "0",
    fpeth_delta_raw: "0",
    vpeth_delta_raw: "0",
    eth_in_raw: "0",
    eth_out_raw: "0",
    curve_fee_raw: "0",
  };
  assert.deepEqual(pethRowBullets(row, NAMES), ["This address sent its pool share to another address."]);
});

test("a zap line names a catalog token, and ETH for the native address", () => {
  const usdp = "0x899d225d779f41fa1ab422ab1b8a9408296dd5c6";
  const named = { ...NAMES, others: { [usdp]: { symbol: "USDp", address: usdp } } };
  assert.equal(pethLineToken(usdp, named, VENUES).symbol, "USDp");
  assert.equal(pethLineToken("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", named, VENUES).symbol, "ETH");
  // A token the catalog does not name stays a short address.
  assert.match(pethLineToken("0x1111111111111111111111111111111111111111", named, VENUES).symbol, /^0x1111…1111$/);
});

test("a liquidated CDP's row: the wallet's pETH side adds up without the CDP's collateral", () => {
  const line = (rule, direction, amount_raw, log_index, token = "peth") => ({
    rule,
    effect: "exit",
    token,
    direction,
    amount_raw,
    counterparty: "0x1111111111111111111111111111111111111111",
    counterparty_role: null,
    counterparty_code_size: null,
    log_index,
  });
  const row = {
    ...fx("cdp").rows[0],
    kind: "liquidated",
    effect: "exit",
    peth_delta_raw: "0",
    balances: {
      peth: { before_raw: "5000000000000000000", after_raw: "5000000000000000000" },
      fpeth: { before_raw: "0", after_raw: "0" },
      vpeth: { before_raw: "0", after_raw: "0" },
    },
    // The server's liquidated line (no transfer of the wallet's) and a
    // MultiSwap-only zap line (no log of its own).
    lines: [line("liquidated", "out", "3888490000000000000", 41), line("zap_in", "in", "1000", null)],
  };
  const wallet = pethWalletLines(row, "peth");
  assert.deepEqual(wallet, []);
  const moved = wallet.reduce((s, l) => s + (l.direction === "in" ? 1n : -1n) * BigInt(l.amount_raw), 0n);
  assert.equal(BigInt(row.balances.peth.before_raw) + moved, BigInt(row.balances.peth.after_raw));
  // A transfer-backed line stays on the side.
  const withTransfer = { ...row, lines: [...row.lines, line("wallet_send", "out", "1000000000000000000", 7)] };
  assert.deepEqual(
    pethWalletLines(withTransfer, "peth").map((l) => l.rule),
    ["wallet_send"],
  );
});

test("a zap into vpETH or a stablecoin is in no ETH figure; a zap into pETH counts in ETH in", () => {
  const usdp = "0x899d225d779f41fa1ab422ab1b8a9408296dd5c6";
  const named = { ...NAMES, others: { [usdp]: { symbol: "USDp", address: usdp } } };
  // Rows as the server states them once ETH in counts zaps into pETH or fpETH
  // alone: a zap into another token carries no ETH in.
  const base = {
    ...fx("cdp").rows[0],
    kind: "zap_in",
    effect: "acquisition",
    valuation: null,
    peth_delta_raw: "0",
    fpeth_delta_raw: "0",
    vpeth_delta_raw: "0",
    eth_in_raw: "0",
    eth_out_raw: "0",
    curve_fee_raw: "0",
  };
  const zap = (token_out) => ({ token_in: NAMES.weth.address, token_out, amount_in: "1", amount_out: "1" });
  assert.deepEqual(pethRowBullets({ ...base, zap: zap(NAMES.vpeth.address) }, named), [
    "This zap to vpETH is in no ETH figure or valuation.",
  ]);
  assert.deepEqual(pethRowBullets({ ...base, zap: zap(usdp) }, named), [
    "This zap to USDp is in no ETH figure or valuation.",
  ]);
  assert.deepEqual(
    pethRowBullets({ ...base, eth_in_raw: "1000000000000000000", zap: zap(NAMES.peth.address) }, named),
    ["This address paid 1 ETH, counted in ETH in."],
  );
  // A curve buy and an ETH→vpETH zap in one transaction: both bullets.
  assert.deepEqual(
    pethRowBullets(
      { ...base, kind: "curve_buy", eth_in_raw: "3000000000000000000", zap: zap(NAMES.vpeth.address) },
      named,
    ),
    ["This address paid 3 ETH, counted in ETH in.", "This zap to vpETH is in no ETH figure or valuation."],
  );
});

test("each venue's LP token is named by its pool", () => {
  const symbols = ["lp_tripool", "lp_polar_peth", "lp_peth_weth"].map((t) => pethLineToken(t, NAMES, VENUES).symbol);
  assert.deepEqual(symbols, ["pETH/fpETH/vpETH LP", "pETH/POLAR LP", "pETH/WETH LP"]);
});

test("a zap from vpETH or a stablecoin to ETH is in no ETH figure; a zap from pETH counts in ETH out", () => {
  const usdp = "0x899d225d779f41fa1ab422ab1b8a9408296dd5c6";
  const named = { ...NAMES, others: { [usdp]: { symbol: "USDp", address: usdp } } };
  const base = {
    ...fx("cdp").rows[0],
    kind: "zap_out",
    effect: "sale",
    valuation: null,
    peth_delta_raw: "0",
    fpeth_delta_raw: "0",
    vpeth_delta_raw: "0",
    eth_in_raw: "0",
    eth_out_raw: "0",
    curve_fee_raw: "0",
  };
  const zap = (token_in) => ({ token_in, token_out: NAMES.weth.address, amount_in: "1", amount_out: "1" });
  assert.deepEqual(pethRowBullets({ ...base, zap: zap(NAMES.vpeth.address) }, named), [
    "This zap from vpETH is in no ETH figure or valuation.",
  ]);
  assert.deepEqual(pethRowBullets({ ...base, zap: zap(usdp) }, named), [
    "This zap from USDp is in no ETH figure or valuation.",
  ]);
  assert.deepEqual(
    pethRowBullets({ ...base, eth_out_raw: "2000000000000000000", zap: zap(NAMES.peth.address) }, named),
    ["This address received 2 ETH, counted in ETH out."],
  );
});
