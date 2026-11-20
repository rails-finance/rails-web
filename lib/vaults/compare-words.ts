// Every word of the vault comparison (rails-ops ui-jobs 553 door 3, 779): the
// page (E1), its picker (E1.1), the Differences table (E1.2) and the holder
// donut (E4). The five readout lines keep lib/vaults/health-words.ts's
// words; this module adds Fees, Where the money is lent and Who holds it.
// Each states a reading; nothing here rates, forecasts or recommends.
//
// Pure: type imports, the family table and the steward note from health-words.ts.

import { VAULT_FAMILIES, type VaultFamily } from "./families";
import { STEWARD_ATTESTATION } from "./health-words";

export const COMPARE_TITLE = "Compare vaults";

export const COMPARE_PAGE = {
  /** Said once, under the heading: the readout's line, with the read times
   *  the columns show, and the steward note each column leaves out. */
  lead: `Readings of the past at the times shown. Rails does not forecast, rate or recommend. ${STEWARD_ATTESTATION}`,
  /** The column's read time; the block stays off the surface (decision 0059 point 4). */
  readAt: (iso: string) => `Read ${new Date(iso).toISOString().slice(11, 16)} UTC`,
  unread: "The chain read did not answer",
  caption: "The chosen vaults side by side, a column each",
  fees: "Fees",
  exposure: "Where the money is lent",
  holders: "Who holds it",
  notFound: (keys: readonly string[]) => `Not found in the vault index: ${keys.join(", ")}.`,
  differences: "Differences",
  /** Under Differences where every fact it names is the same. */
  noDifferences: "These vaults agree on every fact in this table.",
  record: "The full record",
};

// ── The picker ─────────────────────────────────────────────────────────────

export const COMPARE_PICKER = {
  label: "Vaults to compare",
  placeholder: "Search a vault by name, symbol or address",
  /** For a screen reader, with the slot's number. */
  slot: (i: number) => `Vault ${i}`,
  vs: "vs",
  add: "Add a vault",
  clear: (name: string) => `Clear ${name}`,
  go: "Compare",
  /** Under the button while fewer than two are picked. */
  needTwo: "Pick two to four vaults.",
  noMatch: "No vault Rails reads matches.",
  loading: "Loading the vaults…",
  failed: "The vault list did not load. Reload the page to try again.",
};

/** The Differences table's facts, in order. */
export const DIFFERENCE_LABELS = {
  asset: "Asset",
  family: "Family",
  chain: "Chain",
  totalAssets: "Total assets",
  sharePrice: "Share price",
  yield: "Yield",
  holders: "Holders",
  steward: "Steward",
  fees: "Fees",
  withdrawals: "Withdrawals",
} as const;

// ── Fees ───────────────────────────────────────────────────────────────────

/** A row's cell: a headline, a sentence, and whether anything was read. */
export interface CompareCell {
  headline: string | null;
  sentence: string;
  read: boolean;
}

const pct = (x: number) =>
  `${(x * 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

export const FEE_WORDS = {
  metamorpho: (fee: number): CompareCell =>
    fee === 0
      ? { headline: "No performance fee", sentence: "The vault's fee was zero at the read block.", read: true }
      : {
          headline: `${pct(fee)} performance fee`,
          sentence: "Taken from the interest the vault earns.",
          read: true,
        },
  yearn: (performance: number, management: number): CompareCell => ({
    headline: performance === 0 ? "No performance fee" : `${pct(performance)} performance fee`,
    sentence: `${management === 0 ? "No management fee" : `A ${pct(management)} yearly management fee`}. The vault's accountant sets both.`,
    read: true,
  }),
  notRead: { headline: null, sentence: "Not read yet.", read: false } as CompareCell,
  unanswered: { headline: null, sentence: "The read did not answer.", read: false } as CompareCell,
};

// ── Where the money is lent ────────────────────────────────────────────────

/** One place the vault's money sits. */
export interface ExposureRow {
  label: string;
  sub: string | null;
  /** Of the vault, 0..1; null where it is the whole by rule. */
  share: number | null;
}

/** How many places are named before "n more". */
export const EXPOSURE_SHOWN = 5;

export const EXPOSURE_WORDS = {
  idleMarket: "Idle market",
  idleMarketSub: "unlent, inside Morpho Blue",
  lltv: (lltv: number) => `LLTV ${pct(lltv)}`,
  yearnIdle: "Idle in the vault",
  yearnIdleSub: "ready for a withdrawal",
  yearnOutside: "Outside the queue",
  yearnOutsideSub: "debt a strategy keeps until the vault pulls it back",
  stataReserve: (symbol: string) => `Aave's ${symbol} reserve`,
  stataSub: "Aave V3 on Ethereum",
  umbrellaReserve: (symbol: string) => `Aave's ${symbol} reserve`,
  umbrellaSub: (wrapper: string | null) =>
    wrapper
      ? `staked as ${wrapper}, which can be slashed to cover the reserve's deficit`
      : "staked, which can be slashed to cover the reserve's deficit",
  sgho: { headline: "GHO, held by the contract", sentence: "It lends nothing out; Aave's governance sets its rate." },
  maple: {
    openTerm: "Open-term loans",
    openTermSub: "no maturity; the pool delegate can call them",
    fixedTerm: "Fixed-term loans",
    fixedTermSub: "each runs to a maturity date",
    strategies: "Other strategies",
    strategiesSub: "on-chain yield strategies",
    cash: "Cash in the pool",
    cashSub: "ready for the withdrawal queue",
  },
  more: (n: number) => `${n.toLocaleString("en-US")} more`,
  none: "Nothing allocated at the read block.",
  unanswered: "The read did not answer.",
};

// ── Who holds it ───────────────────────────────────────────────────────────

export const HOLDER_WORDS = {
  centre: "holders",
  others: "Others",
  /** A slice's title: the address, the shape where the census stores one, the share. */
  slice: (address: string, shape: string | null, share: string) =>
    `${address}${shape ? `, ${shape}` : ""}: ${share} of the vault`,
  othersTitle: (share: string) => `Every other holder: ${share} of the vault`,
  noCensus: (family: VaultFamily) =>
    VAULT_FAMILIES[family].census == null ? "No holder count yet." : "The census did not answer.",
  /** The donut's name for a screen reader. */
  aria: (live: string) => `The largest holders' shares of the vault, of ${live} holders`,
};
