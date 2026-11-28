// lib/polaris/peth-ledger.ts — a pETH account row's place (ui-jobs 872): its
// key (the server's placeKey), its name, which way the row's tokens moved
// with it, the T3 words, and the Place axis the rows file under.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  PETH_NO_PLACE,
  pethPlaceDirection,
  pethPlaceKey,
  pethPlaceName,
  pethPlaceOption,
  pethPlaceWords,
  pethTimelineEvent,
} from "../../lib/polaris/peth-ledger.ts";

const NAMES = {
  stable: { usdp: "USDp", goldp: "GOLDp" },
  venues: {
    venue_curve_tripool: { label: "Curve pETH/fpETH/vpETH pool" },
    venue_univ2_peth_weth: { label: "Uniswap V2 pETH/WETH pair" },
  },
};
const TOKENS = {
  peth: { symbol: "pETH", address: "0x07ea2ff889e6228cded329a09f66e370f12c705e" },
  fpeth: { symbol: "fpETH", address: "0x94220c1c340336527c719bcf06067ca7769ac185" },
  vpeth: { symbol: "vpETH", address: "0x43cc4978e11bc1e1d8cfcd8348cb7e7246c49b6e" },
  weth: { symbol: "WETH", address: "0xf430240a61e0a5bd7a3637d616e0dab5632fbe89" },
};
const line = (rule, token, direction) => ({
  rule,
  effect: "change_of_place",
  token,
  direction,
  amount_raw: "1000",
  counterparty: "0x0",
  counterparty_role: null,
  counterparty_code_size: null,
  log_index: 1,
});
const row = (kind, lines, place = null) => ({
  tx_hash: "0xabc",
  block_number: "11512436",
  block_timestamp: "1787000000",
  kind,
  effect: "change_of_place",
  lines,
  peth_delta_raw: "0",
  fpeth_delta_raw: "0",
  vpeth_delta_raw: "0",
  eth_in_raw: "0",
  eth_out_raw: "0",
  curve_fee_raw: "0",
  event_price_raw: null,
  event_price_source: null,
  valuation: null,
  zap: null,
  place,
});

const CDP = { kind: "cdp", id: "26", market: "usdp" };
const LOAN = { kind: "loan", id: "28" };
const DEPOSIT = { kind: "sp_deposit", id: "3", market: "usdp" };
const POOL = { kind: "venue", market: "venue_curve_tripool", address: "0x28b6f412904834dee78a4fa464f2089f5264770c" };

test("a place's key is the server's: kind, market, then the id or the address", () => {
  assert.equal(pethPlaceKey(CDP), "cdp:usdp:26");
  assert.equal(pethPlaceKey(LOAN), "loan::28");
  assert.equal(pethPlaceKey(POOL), "venue:venue_curve_tripool:0x28b6f412904834dee78a4fa464f2089f5264770c");
});

test("each place is named by the catalog", () => {
  assert.equal(pethPlaceName(CDP, NAMES), "USDp CDP #26");
  assert.equal(pethPlaceName(LOAN, NAMES), "reserve loan #28");
  assert.equal(pethPlaceName(DEPOSIT, NAMES), "USDp deposit #3");
  assert.equal(pethPlaceName(POOL, NAMES), "the Curve pETH/fpETH/vpETH pool");
  assert.equal(pethPlaceName({ kind: "svpeth", address: "0x1" }, NAMES), "the svpETH vault");
  assert.equal(pethPlaceName({ kind: "zap", address: "0x1" }, NAMES), "the zap router");
  assert.equal(pethPlaceOption(LOAN, NAMES), "Reserve loan #28");
  assert.equal(pethPlaceOption({ kind: "svpeth", address: "0x1" }, NAMES), "svpETH vault");
  assert.equal(pethPlaceOption({ kind: "zap", address: "0x1" }, NAMES), "Zap router");
  assert.equal(pethPlaceOption(POOL, NAMES), "Curve pETH/fpETH/vpETH pool");
});

test("the direction follows the row's lines of its kind", () => {
  assert.equal(pethPlaceDirection(row("cdp_deposit", [line("cdp_deposit", "peth", "out")])), "to");
  assert.equal(pethPlaceDirection(row("cdp_withdraw", [line("cdp_withdraw", "peth", "in")])), "from");
  assert.equal(pethPlaceDirection(row("sp_gain", [line("sp_gain", "peth", "in")])), "from");
  assert.equal(pethPlaceDirection(row("liquidated", [line("liquidated", "peth", "out")])), "seized");
  // A liquidity add sends pETH to the pool and takes its LP token back: the pETH line decides.
  const add = row("lp_add", [line("lp_add", "lp_tripool", "in"), line("lp_add", "peth", "out")]);
  assert.equal(pethPlaceDirection(add), "to");
  // A pool share received alone reads by its LP line.
  assert.equal(pethPlaceDirection(row("lp_received", [line("lp_received", "lp_tripool", "in")])), "from");
});

test("the T3 line reads verb and place", () => {
  assert.equal(
    pethPlaceWords(row("cdp_deposit", [line("cdp_deposit", "peth", "out")]), CDP, NAMES),
    "Went to USDp CDP #26",
  );
  assert.equal(
    pethPlaceWords(row("loan_collateral", [line("loan_collateral", "fpeth", "in")]), LOAN, NAMES),
    "Came from reserve loan #28",
  );
  assert.equal(
    pethPlaceWords(row("liquidated", [line("liquidated", "peth", "out")]), CDP, NAMES),
    "Seized from USDp CDP #26",
  );
});

test("every row files under its place on the Place axis, a row with none under Other", () => {
  const venues = { venue_curve_tripool: { address: POOL.address } };
  const withPlace = pethTimelineEvent(
    row("cdp_deposit", [line("cdp_deposit", "peth", "out")], CDP),
    TOKENS,
    venues,
    NAMES,
  );
  assert.deepEqual(withPlace.places, [{ key: "cdp:usdp:26", label: "USDp CDP #26" }]);
  const none = pethTimelineEvent(row("wallet_send", [line("wallet_send", "peth", "out")]), TOKENS, venues, NAMES);
  assert.deepEqual(none.places, [{ key: PETH_NO_PLACE, label: "Other" }]);
  // A zap and a liquidity add in one transaction file under both, in line order.
  const ZAP = { kind: "zap", address: "0xd09416d328dfaa07a422a1df233d1d968b80fbf8" };
  const both = { ...row("zap_in", [line("zap_in", "peth", "in")], ZAP), places: [ZAP, POOL] };
  assert.deepEqual(
    pethTimelineEvent(both, TOKENS, venues, NAMES).places.map((p) => p.label),
    ["Zap router", "Curve pETH/fpETH/vpETH pool"],
  );
  // Without the names the event offers no place, so no page grows the axis by accident.
  assert.equal(pethTimelineEvent(row("cdp_deposit", [], CDP), TOKENS, venues).places, undefined);
});
