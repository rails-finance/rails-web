// The Comptroller family's deployments (rails-ops ui-jobs 549 step 3): Compound
// V2 on Ethereum and its fork Moonwell on Ethereum and Base. One Comptroller
// each, so each explorer is one market: its Markets tab is the market page
// (R2) and each cToken or mToken a market page of its own (R3). What differs
// between them is data: the chain, the Comptroller, the token's noun, the
// period rates accrue over, whether the Comptroller keeps supply caps, and the
// listing filter a figure links into. Pure: the routes, the info pages and the
// client adapter (lib/comptroller/product.tsx) read it.

import { COMPOUND_V2_ADDRESSES } from "@/lib/compound-v2/asset-catalog";
import { MOONWELL_ADDRESSES } from "@/lib/moonwell/asset-catalog";
import { MOONWELL_BASE_COMPTROLLER } from "@/lib/moonwell-base/asset-catalog";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { ComptrollerVocabFamily } from "@/lib/comptroller/markets-provenance";

export type ComptrollerFamilyKey = "compound-v2" | "moonwell" | "moonwell-base";

export interface ComptrollerFamily {
  key: ComptrollerFamilyKey;
  /** The protocol's name: "Compound V2", "Moonwell". */
  name: string;
  chainId: ChainId;
  /** The explorer's root: "/ethereum/compound-v2". */
  root: string;
  comptroller: string;
  /** The oracle the Comptroller names (`oracle()`, read 9 Nov 2026); the page reads it live. */
  oracle: string;
  /** The market token's noun. */
  token: "cToken" | "mToken";
  period: "block" | "second";
  oracleName: string;
  /** The Comptroller keeps supply caps (Moonwell); Compound V2 keeps borrow caps alone. */
  supplyCaps: boolean;
  /** The listing's `?supply=` and `?borrow=` value: the underlying's symbol, or the market token's address. */
  listingFilter: "symbol" | "market";
  docs: { label: string; href: string };
}

export const COMPTROLLER_FAMILIES: Record<ComptrollerFamilyKey, ComptrollerFamily> = {
  "compound-v2": {
    key: "compound-v2",
    name: "Compound V2",
    chainId: MAINNET_CHAIN_ID,
    root: "/ethereum/compound-v2",
    comptroller: COMPOUND_V2_ADDRESSES.COMPTROLLER,
    oracle: "0x8CF42B08AD13761345531b839487aA4d113955d9",
    token: "cToken",
    period: "block",
    oracleName: "Price oracle",
    supplyCaps: false,
    listingFilter: "symbol",
    docs: { label: "Compound V2's docs", href: "https://docs.compound.xyz/v2" },
  },
  moonwell: {
    key: "moonwell",
    name: "Moonwell",
    chainId: MAINNET_CHAIN_ID,
    root: "/ethereum/moonwell",
    comptroller: MOONWELL_ADDRESSES.COMPTROLLER,
    oracle: MOONWELL_ADDRESSES.ORACLE,
    token: "mToken",
    period: "second",
    oracleName: "Chainlink oracle",
    supplyCaps: true,
    listingFilter: "symbol",
    docs: { label: "Moonwell's docs", href: "https://docs.moonwell.fi/moonwell" },
  },
  "moonwell-base": {
    key: "moonwell-base",
    name: "Moonwell",
    chainId: BASE_CHAIN_ID,
    root: "/base/moonwell",
    comptroller: MOONWELL_BASE_COMPTROLLER,
    oracle: "0xEC942bE8A8114bFD0396A5052c36027f2cA6a9d0",
    token: "mToken",
    period: "second",
    oracleName: "Chainlink oracle",
    supplyCaps: true,
    listingFilter: "market",
    docs: { label: "Moonwell's docs", href: "https://docs.moonwell.fi/moonwell" },
  },
};

/** The receipts' view of a family. */
export function vocabFamily(f: ComptrollerFamily): ComptrollerVocabFamily {
  return {
    name: f.name,
    chainId: f.chainId,
    comptroller: f.comptroller,
    token: f.token,
    period: f.period,
    oracleName: f.oracleName,
    lane: `${f.name} markets`,
  };
}
