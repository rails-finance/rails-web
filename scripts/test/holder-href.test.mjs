// A position holder's address links inside Rails (ui-jobs 704): the wallet
// page for the families it reads, else the family's listing filtered to the
// wallet; prose marks such a placeholder with the `wallet` rounding.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { addressTone, holderHref } from "../../lib/shared/holder-href.ts";

const MIXED = "0x5ED4f245FBACd9dccb233241cd97fcca54bfd88b";
const LOWER = MIXED.toLowerCase();
// The listing resolver's stand-in (listingHrefForWallet reads the roster through @/).
const listing = (session, address) =>
  ({ polaris: `/sepolia/polaris?q=${address}`, frankencoin: `/ethereum/frankencoin?q=${address}` })[session] ?? null;

test("Liquity V2 and MakerDAO holders open the wallet page, lowercased", () => {
  assert.equal(holderHref("liquity-v2", MIXED, listing), `/wallet/${LOWER}`);
  assert.equal(holderHref("makerdao", MIXED, listing), `/wallet/${LOWER}`);
});

test("the wallet page link carries the page it was opened from", () => {
  assert.equal(
    holderHref("liquity-v2", MIXED, listing, "/ethereum/liquity-v2/trove/wstETH/1"),
    `/wallet/${LOWER}?from=%2Fethereum%2Fliquity-v2%2Ftrove%2FwstETH%2F1`,
  );
});

test("Polaris and Frankencoin holders open the family's listing searched by the wallet", () => {
  assert.equal(holderHref("polaris", MIXED, listing, "/x"), `/sepolia/polaris?q=${MIXED}`);
  assert.equal(holderHref("frankencoin", MIXED, listing), `/ethereum/frankencoin?q=${MIXED}`);
});

test("a family with no listing leaves the explorer link", () => {
  assert.equal(holderHref("aave-v3", MIXED, listing), null);
});

test("the prose engine's address tones", () => {
  assert.equal(addressTone("wallet"), "wallet");
  assert.equal(addressTone("address"), "address");
  assert.equal(addressTone("manager"), "manager");
  assert.equal(addressTone("text"), null);
});

test("the holder placeholders are written with the wallet rounding", () => {
  const rounding = (family, name) =>
    parse(readFileSync(`content/${family}/event-prose.yaml`, "utf8")).placeholders[name].rounding;
  assert.equal(rounding("liquity-v2", "from_address"), "wallet");
  assert.equal(rounding("liquity-v2", "to_address"), "wallet");
  assert.equal(rounding("polaris", "from_addr"), "wallet");
  assert.equal(rounding("polaris", "to_addr"), "wallet");
  assert.equal(rounding("makerdao", "owner"), "wallet");
  assert.equal(rounding("frankencoin", "final"), "wallet");
  // A contract keeps the explorer.
  assert.equal(rounding("liquity-v2", "former_manager"), "address");
});
