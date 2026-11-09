// The product-page model (rails-ops ui-jobs 549, survey §3.2; decisions 0043
// and 0059): what a family hands the shared shells in
// components/shared/product/ to draw a market roster (A1), a market page (A2),
// a reserve page (A3) and the way into the positions (A6).
// ----------------------------------------------------------------------------
// The shells own the order of the sections, the heading rows (title, read
// stamp, "?", ⋮), the (i) slot, the vitals band, the house table, sorting,
// the loading and failure states and the receipts scopes. A family supplies
// figures and words: every figure arrives drawn, carrying its own <Prov>, so
// the receipts stay in the family's vocabulary (Aave's `AaveMarketVocab`).
// A slot the family cannot fill says why (`Missing`), and the shell draws the
// label with the reason. No slot here is a per-family switch.
//
// Trimmed to what the Aave family and Aave V4 (548) need now: the survey's
// `Figure` with a unit and `CollateralTerms` arrive with the first family whose
// cells the shell has to format itself.

import type { ReactNode } from "react";
import type { Provenance } from "@/components/shared/provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { SectionMenuExports, SectionMenuLink } from "@/components/shared/section-menu";
import type { VitalSlot } from "@/components/shared/vitals-band";
import type { ChainId } from "@/lib/shared/chains";
import type { ServerRead } from "@/lib/shared/server-head-read";

/** `data-*` hooks a family puts on a shell's element, for its verifiers. */
export type Hooks = Record<`data-${string}`, string | undefined>;

/** What the protocol calls a thing, one and many: "reserve", "spoke". */
export interface Noun {
  one: string;
  many: string;
}

/** The protocol's nouns; the shells write headings, empty states and the
 *  position entry from them. */
export interface ProductTerms {
  market: Noun;
  reserve: Noun;
  position: Noun;
}

/** A slot the family cannot fill, and why. */
export interface Missing {
  missing: string;
}

export const isMissing = (x: unknown): x is Missing =>
  typeof x === "object" && x != null && "missing" in x && typeof (x as Missing).missing === "string";

/** A read that is still out, failed, or answered. */
export type Loadable<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ok"; data: T };

/** The read behind a section's figures: `SectionReadStamp`'s props. */
export interface ReadAt {
  chainId: ChainId;
  block: number;
  /** The block's time, seconds, where the family has it. */
  blockTime?: number | null;
  readBy?: ServerRead | null;
  /** The stamp's receipt (`readStampProv`). */
  receipt: (at: number | null) => Provenance;
}

/** A section ⋮'s rows above Inspect provenance. */
export interface SectionTools {
  links?: SectionMenuLink[];
  exports?: SectionMenuExports;
  /** The armed hint: "Click a value in this section to trace it". */
  hint?: string;
}

/** A link at the foot of a head: "View Aave V3 Core reserves →", the
 *  position entry (A6). */
export interface EntryLink {
  label: string;
  href: string;
  hooks?: Hooks;
}

/** One head figure in the vitals band. */
export interface HeadFigure {
  slot: VitalSlot;
  /** The house's word where the measure is the same (decision 0059 point 9). */
  label: string;
  /** Drawn, with its <Prov>. */
  value: ReactNode;
  /** Hover text; required on `usage` (its quotient), and on a rate its basis
   *  (APR or APY). */
  tip?: string;
  /** Which side of a layered market the figure comes from: "This spoke",
   *  "Hub: Core" (548). */
  side?: string;
}

/** One term of a protocol's structure: its label in the protocol's words, the
 *  value drawn with its <Prov>. */
export interface StructureFigure {
  label: string;
  value: ReactNode;
  tip?: string;
  hooks?: Hooks;
}

/** The slot where a protocol adds what is its own (survey §3.2's
 *  `MarketStructure`): one variant per structure, named for what it is. The
 *  head draws its terms under the band; a page section can draw the rest. */
export type MarketStructure = {
  /** f(x): a pool's ticks, the two debt ratios its keepers act from, and the
   *  oracle's three prices. */
  kind: "ticks";
  ticks: StructureFigure;
  rebalance: StructureFigure;
  liquidation: StructureFigure;
  oracle: {
    /** What each price is per: "USD per stETH". */
    unit: string;
    min: StructureFigure;
    anchor: StructureFigure;
    max: StructureFigure;
  };
};

/** The (i) slot of a head: a status lead and grouped bullets
 *  (standards/explanation-copy-charter.md §3, §4). */
export interface HeadExplainer {
  body: ReactNode | null;
  /** The (i) button's noun, after "Show" or "Hide": "market explanation". */
  label: string;
}

/** The head of an A1 panel, an A2 page or an A3 page: the heading row, an
 *  optional subtitle, the vitals band and its (i). */
export interface ProductHead {
  /** The section's receipts scope; its ⋮ arms it alone. */
  scope: string;
  /** The heading: a market's name; the ⋮'s name. On A3 the page's h1 is the
   *  heading and this names the ⋮. */
  title: string;
  /** The heading links here: the listing of the market's positions. */
  titleHref?: string;
  /** A line under the heading: a V4 spoke's structure line (the hubs it
   *  draws from), or the reserve page's market link. */
  subtitle?: ReactNode;
  /** The band's identity column: what this is, in one line. */
  purpose?: ReactNode;
  /** A muted line under the purpose. */
  summary?: ReactNode;
  figures: HeadFigure[];
  /** The band's third column: a composition chart. */
  aside?: ReactNode;
  /** Links at the foot of the aside (or under the band where there is none). */
  entries?: EntryLink[];
  /** The protocol's structure: its terms drawn under the band. */
  structure?: MarketStructure;
  /** Lines under a figure that qualify it are part of the figure's value;
   *  qualifications of the whole band go here. */
  notes?: ReactNode;
  /** Null while the read has not answered. */
  readAt: ReadAt | null;
  tools: SectionTools;
  explainer: HeadExplainer;
  /** The "?" at the right of the heading row. */
  learnMore?: LearnMoreContent | null;
  anatomy?: string;
  hooks?: Hooks;
  /** Hooks on the vitals band's wrapper (`data-market-panel`, `data-reserve-vitals`). */
  bandHooks?: Hooks;
}

/** A column of the reserves table. */
export interface ReserveColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  /** What the column stands for: the header's tip, and the card label's. */
  tip?: string;
  /** Classes on every cell of the column. */
  className?: string;
  /** A full-width cell on a stacked card. */
  wide?: boolean;
  /** Hooks on every cell of the column. */
  hooks?: Hooks;
}

/** A cell's sort key: numbers compare in order, a string alphabetically. */
export type SortKey = number | string | readonly number[];

export interface ReserveCell {
  node: ReactNode;
  sort?: SortKey;
  title?: string;
}

/** One row of the reserves table. */
export interface ReserveRowModel {
  /** Unique in the table: an asset address, or asset and hub ("0xabc:core"). */
  key: string;
  /** The row's page (D4); absent, the row is unlinked. */
  href?: string;
  asset: {
    symbol: string;
    address: string;
    /** State tags beside the symbol. */
    tags?: ReactNode;
    /** Chips beside the tags: the hubs a spoke reserve draws from (548). */
    chips?: ReactNode;
    /** The line under the symbol. */
    sub?: ReactNode;
    /** The symbol's receipt: the row's identity (Dolomite's market id and
     *  token address), linking the token. */
    receipt?: Provenance;
    /** A control at the cell's right: the Details panel. */
    details?: ReactNode;
    sort?: SortKey;
  };
  cells: Record<string, ReserveCell>;
  /** The row's group, for the table's chips (an asset class). */
  group?: string;
  hooks?: Hooks;
}

/** The reserves section of an A2 page. */
export interface ReserveTableModel {
  scope: string;
  title: string;
  /** The line under the heading. */
  line?: ReactNode;
  /** The table's accessible name. */
  label: string;
  anatomy: string;
  /** The asset column's heading. */
  assetLabel: string;
  columns: ReserveColumn[];
  rows: ReserveRowModel[];
  /** Chips over the table that narrow it to a group, in order. */
  groups?: { key: string; label: string; color: string }[];
  groupLabel?: string;
  defaultSort: { key: string; dir: "asc" | "desc" };
  /** "No reserves match this filter." */
  emptyFiltered: string;
  tools: SectionTools;
  tableClassName?: string;
}

/** One A2 page: its head, then its reserves, then the family's sections (an
 *  f(x) pool, which has no reserves, has sections alone). */
export interface MarketModel {
  head: ProductHead;
  reserves?: ReserveTableModel;
  sections?: ProductSection[];
}

/** The rate model of a reserve, fed to the curve (M3.3) by value: rates and
 *  usage as fractions a year, the two-slope shape every Aave-family strategy
 *  shares. */
export interface RateCurveModel {
  optimal: number;
  base: number;
  slope1: number;
  slope2: number;
  /** The share of borrow interest the protocol keeps (Aave V4: the liquidity fee). */
  reserveFactor: number;
  /** Interest borrowers pay above the drawn rate, as a share of it (Aave V4: the
   *  premium owed over the drawn owed on the hub). Suppliers earn it too. 0 when
   *  absent. */
  premium?: number;
  /** Where the reserve sits now; utilisation null where nothing is supplied. */
  now: { utilisation: number | null; borrow: number; supply: number };
  symbol: string;
  /** The curve's receipt: the strategy, its reads, the formula. */
  receipt: Provenance;
}

/** A section of an A3 page under its head: rate curve, history, parameters,
 *  changes, holders. */
export interface ProductSection {
  scope: string;
  anatomy: string;
  title: string;
  tools: SectionTools;
  learnMore?: LearnMoreContent | null;
  body: ReactNode;
  /** Draw the body on a raised panel. */
  raised?: boolean | "narrow";
  hooks?: Hooks;
}

/** The identity of an A3 page: the asset's mark, its name as the h1, its
 *  state tags. */
export interface ReserveIdentity {
  symbol: string;
  address: string;
  tags?: ReactNode;
}
