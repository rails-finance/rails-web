// Every word of the vault comparison (rails-ops ui-jobs 553, door 3): the
// page (E1), its tick and bar on the asset step and /vaults (E2, E3), and the
// holder donut (E4). The five readout lines keep lib/vaults/health-words.ts's
// words; this module adds Fees, Where the money is lent and Who holds it.
// Each states a reading; nothing here rates, forecasts or recommends.
//
// Pure, with type imports only.

import type { CompareSort } from "./compare";
import type { VaultFamily } from "./families";

export const COMPARE_TITLE = "Compare vaults";

export const COMPARE_PAGE = {
  sortLabel: "Sort by",
  sorts: {
    size: "Size",
    yield: "30-day yield",
    range: "Narrowest 90-day yield range",
    withdrawable: "Share withdrawable",
  } as Record<CompareSort, string>,
  /** Under the sort, where it needs saying. */
  sortNote: {
    range: "Vaults whose share price grew over the 30 days come first; the others follow.",
    mixed: "Vaults in different assets sort by asset first, then by size within each.",
  },
  readAt: (block: number) => `Read at block ${block.toLocaleString("en-US")}`,
  unread: "The chain read did not answer",
  rowsLabel: "Rows",
  fees: "Fees",
  exposure: "Where the money is lent",
  holders: "Who holds it",
  /** Fewer than two vaults the index knows. */
  tooFew: "Choose two to four vaults to compare: tick them on the vault index or on an asset's step.",
  toIndex: "Vaults",
  notFound: (keys: readonly string[]) => `Not found in the vault index: ${keys.join(", ")}.`,
};

// ── The tick and the bar ───────────────────────────────────────────────────

export const COMPARE_TICK = {
  label: "Compare",
  /** For a screen reader, with the vault's name. */
  aria: (name: string) => `Compare ${name}`,
};

export const COMPARE_BAR = {
  go: (n: number) => `Compare ${n} vaults`,
  clear: "Clear",
  refused: "Four vaults is the most one comparison holds.",
  label: "Vaults chosen to compare",
};

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
    sentence: `${management === 0 ? "No management fee" : `A ${pct(management)} yearly management fee`}. Both are set by the vault's accountant.`,
    read: true,
  }),
  yearnNoAccountant: {
    headline: "None stated",
    sentence: "The vault names no accountant, the contract that charges its fees.",
    read: true,
  } as CompareCell,
  stata: {
    headline: "None stated",
    sentence:
      "The wrapper sets no fee. Aave keeps its reserve factor's part of the interest before it reaches the reserve's suppliers.",
    read: true,
  } as CompareCell,
  umbrella: { headline: "None stated", sentence: "The stake token sets no fee.", read: true } as CompareCell,
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
  strategy: "Strategy",
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
    family === "yearn-v3" || family === "maple-pool" ? "No holder count yet." : "The census did not answer.",
  /** The donut's name for a screen reader. */
  aria: (live: string) => `The largest holders' shares of the vault, of ${live} holders`,
};
