// The wallet heading's positions menu (H13.2; Miles 17 Nov 2026, rails-ops ui-jobs 701):
// lib/wallet/summary-counts.ts walletPositionsMenu (the trigger, the open rows, "+N more", the
// closed count) and lib/wallet/position-label.ts positionLabel (each row's name, less the
// protocol).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  MENU_OPEN_MAX,
  MENU_TESTNETS,
  WALLET_COUNTS_SCOPE,
  rowIsPage,
  walletPositionsMenu,
} from "../../lib/wallet/summary-counts.ts";
import { positionLabel } from "../../lib/wallet/position-label.ts";

const row = (status, i, family = "aave-v3", chain = "ethereum") => ({
  chain,
  family,
  positionId: String(i),
  status,
  href: `/${chain}/${family}/${i}`,
});
const onPage = (path) => (p) => rowIsPage(p.href, path, "");

test("the trigger counts every position, singular at one", () => {
  const rows = [row("open", 1), row("closed", 2), row("liquidated", 3)];
  assert.equal(walletPositionsMenu(rows, onPage("/ethereum/aave-v3/1")).trigger, "3 positions");
  assert.equal(walletPositionsMenu([row("closed", 2)], onPage("/elsewhere")).trigger, "1 position");
});

test("nothing besides the page's position draws nothing", () => {
  assert.equal(walletPositionsMenu([], onPage("/x")), null);
  assert.equal(walletPositionsMenu([row("open", 1)], onPage("/ethereum/aave-v3/1")), null);
});

test("the open rows: the page's own first and marked", () => {
  const rows = [row("open", 1), row("open", 2, "liquity-v2"), row("closed", 3)];
  const m = walletPositionsMenu(rows, onPage("/ethereum/liquity-v2/2"));
  assert.equal(m.openHeading, "Open positions (2)");
  assert.deepEqual(
    m.open.map((r) => [r.position.positionId, r.page]),
    [
      ["2", true],
      ["1", false],
    ],
  );
  assert.equal(m.pageCounted, true);
  assert.equal(walletPositionsMenu(rows, onPage("/sepolia/polaris/20")).pageCounted, false);
});

test("past six open positions: six and +N more", () => {
  const rows = Array.from({ length: 9 }, (_, i) => row("open", i));
  const m = walletPositionsMenu(rows, onPage("/sepolia/polaris/20"));
  assert.equal(MENU_OPEN_MAX, 6);
  assert.equal(m.open.length, 6);
  assert.equal(m.more, "+3 more on wallet dashboard");
  assert.equal(walletPositionsMenu(rows.slice(0, 6), onPage("/x")).more, null);
});

test("the closed line counts closed, liquidated and redeemed; omitted at none", () => {
  const rows = [row("open", 1), row("closed", 2), row("liquidated", 3), row("redeemed", 4)];
  assert.equal(walletPositionsMenu(rows, onPage("/x")).closed, "3 closed positions on wallet dashboard");
  assert.equal(walletPositionsMenu(rows.slice(0, 2), onPage("/x")).closed, "1 closed position on wallet dashboard");
  assert.equal(walletPositionsMenu([row("open", 1), row("open", 2)], onPage("/x")).closed, null);
});

test("the footer and the wallet view's tip", () => {
  assert.equal(MENU_TESTNETS, "Testnets not included");
  assert.equal(WALLET_COUNTS_SCOPE, "Counts mainnet positions; the Sepolia testnet is not counted.");
});

test("labels: a Trove is its branch and short id", () => {
  assert.equal(
    positionLabel({
      family: "liquity-v2",
      positionId: "WETH:16571955497228114735373687436766714226146657997938228625903174546598933916943",
      market: "WETH",
    }),
    "WETH #165719…6943",
  );
  assert.equal(positionLabel({ family: "ebisu", positionId: "sUSDe:42" }), "sUSDe #42");
});

test("labels: a market by its page's name", () => {
  assert.equal(positionLabel({ family: "aave-v3", positionId: "0xabc:core", market: "Core" }), "Core");
  assert.equal(positionLabel({ family: "compound-v3", positionId: "usdc:0xabc", market: "cUSDCv3" }), "cUSDCv3");
});

test("labels: Morpho's pair where the row carries it, else the market's id", () => {
  assert.equal(
    positionLabel({ family: "morpho", positionId: "x", market: "x", collateral: "WBTC", debt: "USDC" }),
    "WBTC/USDC",
  );
  assert.equal(
    positionLabel({
      family: "morpho",
      positionId: "3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49-0xc5cd",
      market: "3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
    }),
    "Market 0x3a85…ee49",
  );
});

test("labels: a Fluid NFT and a Maker vault carry their ids", () => {
  assert.equal(positionLabel({ family: "fluid", positionId: "19526", market: "USDC / ETH" }), "USDC / ETH #19526");
  assert.equal(positionLabel({ family: "makerdao", positionId: "2028", market: "ETH-A" }), "ETH-A #2028");
  assert.equal(
    positionLabel({
      family: "makerdao",
      positionId: "0x3d25235b7c414cb67bf09561a33fd6ce62c11dcf",
      market: "LSEV2-SKY-A",
    }),
    "LSEV2-SKY-A 0x3d25…1dcf",
  );
});

test("labels: a row naming nothing but the wallet reads Account", () => {
  assert.equal(
    positionLabel({ family: "aave-v3", positionId: "0x3df83ec9d2b62bb9bb83eba1218a202564bb67da" }),
    "Account",
  );
  assert.equal(positionLabel({ family: "spark", positionId: "0xabc" }), "Account");
});
