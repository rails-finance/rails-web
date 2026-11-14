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
import type { ComptrollerApy, ComptrollerRateYear, ComptrollerVocabFamily } from "@/lib/comptroller/markets-provenance";
import {
  COMPOUND_V2_APY_FORMULA,
  COMPOUND_V2_DAYS_PER_YEAR,
  MOONWELL_APY_FORMULA,
  MOONWELL_SECONDS_PER_YEAR,
} from "@/lib/comptroller/apy";
import {
  COMPOUND_V2_BLOCKS_PER_YEAR,
  COMPOUND_V2_YEAR_DOCS,
  COMPOUND_V2_YEAR_SOURCE,
} from "@/lib/compound-v2/rate-year";

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
  /** The year rates are printed over where it is a fixed count (Compound V2's
   *  2,628,000 blocks, lib/compound-v2/rate-year.ts); null where they run on the
   *  rate model's constant (Moonwell's timestampsPerYear()). */
  rateYear: ComptrollerRateYear | null;
  /** The APY's form (lib/comptroller/apy.ts). */
  apy: ComptrollerApy;
  /** The words a family's pause takes: its tag tips and the parameter rows. */
  pause: ComptrollerPauseWords;
  oracleName: string;
  /** The Comptroller keeps supply caps (Moonwell); Compound V2 keeps borrow caps alone. */
  supplyCaps: boolean;
  /** The listing's `?supply=` and `?borrow=` value: the underlying's symbol, or the market token's address. */
  listingFilter: "symbol" | "market";
  docs: { label: string; href: string };
}

/** A pause in the docs' words: Compound V2's Pause Guardian, Moonwell's Mint and Borrow Guardians. */
export interface ComptrollerPauseWords {
  both: string;
  supply: string;
  borrow: string;
}

const COMPOUND_V2_APY: ComptrollerApy = {
  steps: COMPOUND_V2_DAYS_PER_YEAR,
  formula: COMPOUND_V2_APY_FORMULA,
  source: "Compound's docs' APY formula: 7,200 blocks a day, compounded daily over 365 days",
  href: COMPOUND_V2_YEAR_DOCS,
  compounding: "compounded daily, as Compound's docs compute it",
};

const MOONWELL_APY: ComptrollerApy = {
  steps: MOONWELL_SECONDS_PER_YEAR,
  formula: MOONWELL_APY_FORMULA,
  source:
    "compounded every second of a 365-day year. Moonwell's docs say interest accrues per second and give no APY formula, so the form is Rails's",
  href: null,
  compounding: "compounded every second",
};

const COMPOUND_V2_PAUSE: ComptrollerPauseWords = {
  both: "The Pause Guardian has stopped new supply and borrowing here",
  supply: "The Pause Guardian has stopped new supply here",
  borrow: "The Pause Guardian has stopped new borrowing here",
};

const MOONWELL_PAUSE: ComptrollerPauseWords = {
  both: "New supply and borrowing are paused here: the pauses Moonwell's docs give the Mint and Borrow Guardians",
  supply: "New supply is paused here: the pause Moonwell's docs give the Mint Guardian",
  borrow: "New borrowing is paused here: the pause Moonwell's docs give the Borrow Guardian",
};

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
    rateYear: { periods: COMPOUND_V2_BLOCKS_PER_YEAR, source: COMPOUND_V2_YEAR_SOURCE, href: COMPOUND_V2_YEAR_DOCS },
    apy: COMPOUND_V2_APY,
    pause: COMPOUND_V2_PAUSE,
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
    rateYear: null,
    apy: MOONWELL_APY,
    pause: MOONWELL_PAUSE,
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
    rateYear: null,
    apy: MOONWELL_APY,
    pause: MOONWELL_PAUSE,
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
    rateYear: f.rateYear,
    apy: f.apy,
    oracleName: f.oracleName,
    lane: `${f.name} markets`,
  };
}
