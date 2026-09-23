// Compound V3 on Base — which Comets are the deployment, and how that was
// settled.
// ----------------------------------------------------------------------------
// Comet enumerates nothing. There is no `getAllMarkets()` the way Compound V2's
// Comptroller has one, and a Comet proxy will not name its siblings — so a
// roster is stated on every chain, Ethereum included. What differs here is that
// on Base a stated roster is genuinely hard to state safely, and the reason is
// worth writing down:
//
//   **A Comet's own name does not identify it.** Whole-life, eight distinct
//   proxies have been deployed on Base through the `CometDeployed` event, and
//   FOUR of them answer `symbol()` = "cUSDCv3" and `name()` = "Compound USDC".
//   Only five are Compound's. The other three are somebody else's Comets, each
//   holding dust (0.07–0.15 USDC) and each with its own governor.
//
// So the roster below is not "the contracts that look like Compound" — it is
// the set the protocol's OWN Configurator deployed, which is a fact with a
// receipt. Every entry was resolved this way, and the check reproduces:
//
//   1. `eth_getLogs` for `CometDeployed(address,address)` over Base's whole
//      life — 90 logs, 8 distinct proxies. (Each proxy appears once per
//      implementation upgrade, so the FIRST log for a proxy is its deployment
//      and the count is its upgrade history: cWETHv3 has been redeployed 36
//      times.)
//   2. Keep only the logs emitted by the Compound Configurator,
//      `0x45939657d1ca34a8fa39a924b71d28fe8431e581` — five proxies.
//   3. Confirm all five answer `governor()` =
//      `0xCC3E7c85Bb0EE4f09380e041fee95a0caeDD4a02`, Compound governance's
//      Base bridge receiver. The three excluded proxies each answer a
//      different governor, which is the whole of what makes them not this
//      protocol.
//
// Read 2026-08-23 at head 50,354,764. The base symbol, decimals and quote unit
// below are each contract's own answers (`baseToken()` → the ERC20's
// `symbol()`/`decimals()`; `baseTokenPriceFeed()` → the feed's
// `description()`). Everything INSIDE a market — its collateral roster,
// factors, caps, rates and prices — is read live and never written here.

import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { CometDeployment, CometMarket } from "@/lib/compound/asset-catalog";

/** The five Compound-governed Comets on Base, largest book first (measured at
 *  the census head; the order is presentation, nothing reads it as rank).
 *
 *  Each entry's `deployBlock` is the proxy's first `CometDeployed` log — the
 *  floor of the whole-life event sweep (lib/sources/chain/compound-v3-events),
 *  and what lets the timeline claim COMPLETENESS from the market's first block
 *  rather than a horizon. The sweep floors at the EARLIEST of them
 *  (COMPOUND_BASE_DEPLOY_BLOCK), because it asks all five Comets in one query.
 *
 *  The `key` is a slug, unique within THIS roster (the five base assets are
 *  distinct). It is not a claim of global uniqueness — see the header on what
 *  `symbol()` is worth on Base — and nothing keys on it across deployments;
 *  only the proxy address identifies a Comet. */
const BASE_MARKETS: CometMarket[] = [
  {
    key: "usdc",
    label: "cUSDCv3",
    comet: "0xb125e6687d4313864e53df431d5425969c15eb2f",
    baseSymbol: "USDC",
    baseToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    baseDecimals: 6,
    quoteUnit: "USD",
    deployBlock: 12_043_828,
  },
  {
    key: "weth",
    label: "cWETHv3",
    comet: "0x46e6b214b524310239732d51387075e0e70970bf",
    baseSymbol: "WETH",
    baseToken: "0x4200000000000000000000000000000000000006",
    baseDecimals: 18,
    // "Constant price feed" — a base priced in itself, so every figure in this
    // market is in ETH. The same convention cWETHv3 uses on Ethereum.
    quoteUnit: "ETH",
    // Bisected on getCode (2026-08-25): no code at 2,495,302, code at 2,495,303.
    deployBlock: 2_495_303,
  },
  {
    key: "usds",
    label: "cUSDSv3",
    comet: "0x2c776041ccfe903071af44aa147368a9c8eea518",
    baseSymbol: "USDS",
    baseToken: "0x820c137fa70c8691f0e44dc420a5e53c168921dc",
    baseDecimals: 18,
    quoteUnit: "USD",
    deployBlock: 26_511_378,
  },
  {
    key: "aero",
    label: "cAEROv3",
    comet: "0x784efeb622244d2348d4f2522f8860b96fbece89",
    baseSymbol: "AERO",
    baseToken: "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
    baseDecimals: 18,
    // AERO is the base asset and the market still quotes in DOLLARS: its base
    // feed answers "AERO / USD" and reads $0.475, not 1.0. So a market's
    // numeraire is not "the base asset unless the base is WETH" — it is
    // whatever the feed says, which is why quoteUnit is a stated field.
    quoteUnit: "USD",
    deployBlock: 21_219_146,
  },
  {
    key: "usdbc",
    label: "cUSDbCv3",
    comet: "0x9c4ec768c28520b50860ea7a15bd7213a9ff58bf",
    baseSymbol: "USDbC",
    baseToken: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
    baseDecimals: 6,
    quoteUnit: "USD",
    deployBlock: 2_197_607,
  },
];

/** The chain every address here lives on. */
export const COMPOUND_BASE_CHAIN_ID = BASE_CHAIN_ID;

export const COMPOUND_BASE_DEPLOYMENT: CometDeployment = {
  chainId: BASE_CHAIN_ID,
  markets: BASE_MARKETS,
};

/** The earliest Comet's first block (cUSDbCv3, 2,197,607) — where the
 *  whole-life sweep starts, so that no Compound V3 activity on Base predates it. */
export const COMPOUND_BASE_DEPLOY_BLOCK = Math.min(...BASE_MARKETS.map((m) => m.deployBlock ?? Infinity));
