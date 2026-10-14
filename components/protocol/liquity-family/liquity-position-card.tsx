"use client";

// The Liquity-family Trove card — ONE card for every explorer built on the
// Liquity V2 architecture: the reference deployment itself plus its forks
// (Asymmetry, Ebisu, Basedollar). Consolidated from two prior cards —
// components/trove/{Open,Closed,Liquidated}SummaryCard.tsx (V2) and
// components/protocol/liquity-fork/liquity-fork-position-card.tsx (the three
// forks) — into this one, on the settled rule: where the two differed, V2's
// grammar won. The forks gained V2's features (the liquidation-price
// footnote, the delegate glyph + deprecation banner, FadeNumber animation,
// the compact/full debt-precision split, StatValue); V2 lost nothing.
//
// The card is a slot builder (rails-ops TO-DO-position-card 322, ui-jobs
// 307): `useLiquityCardSlots` turns the Trove's view and the page's live read
// into one `PositionCardSlots` object, and the shared `PositionCard`
// (components/shared/position-card.tsx) draws it. All four deployments take
// the same face: the tag, the four headlines with USD under the two asset
// figures, the panel, the ⋮ and the counters in the foot.
//
// Every headline value is read from the chain — the Trove's latest emitted
// coll/debt (batched debt derived from batch shares) on the listing, or the
// detail page's live branch read (`live`) when it has landed on an open
// Trove. Each deployment's own branch PriceFeed prices the row, so the card
// states oracle-USD footnotes, the collateral ratio, and a liquidation price
// — chain-derived, and simply absent when the branch is unpriced.
//
// The four deployments differ only in name, debt symbol, docs link, and (V2
// only) a delegate-deprecation announcement — plain data in
// lib/shared/liquity-fork-card-config.ts — plus the per-protocol chain
// helpers (provenance factories, branch resolution, id formatting) kept out
// of that table on purpose: the `protocol` prop selects both the config row
// and the OPS lookup below.

import { RevealTip } from "@/components/shared/reveal-tip";
import type { ReactNode } from "react";
import { AlertTriangle, Users } from "lucide-react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardMenu,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelColumns,
} from "@/components/shared/position-card";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { AssetPopover } from "@/components/shared/asset-popover";
import { UsersGlyph } from "@/components/shared/rate-pill";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { FadeNumber } from "@/components/ui/FadeNumber";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { formatMonthDayYear } from "@/lib/date";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { troveCardTips } from "@/lib/liquity/trove-card-tips";
import type { PositionPanelRow } from "@/components/shared/position-card-panel";
import {
  formatApproximate,
  formatExactFromString,
  formatPrice,
  formatUnitsExact,
  formatUsdValue,
} from "@/lib/utils/format";
import { getTokenAddress } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { getLiquidationThreshold, formatLiquidationPrice } from "@/lib/utils/liquidation-utils";
import { LIQUITY_FORK_CARD_CONFIGS, type LiquityForkCardConfig } from "@/lib/shared/liquity-fork-card-config";
import { liquityTroveFaceProv, trovePeakCollProv, trovePeakDebtProv } from "@/lib/liquity/trove-card-provenance";
import { liquityPositionContent } from "@/lib/shared/learn-more-content";
import { liquityForkPositionContent } from "@/lib/shared/liquity-fork-position-content";
import { forkMcrAt, type ForkMcrStep } from "@/lib/shared/liquity-fork-ops";
import { forkLiveScaling, forkLiveVocab } from "@/lib/shared/liquity-fork-live-provenance";
import { forkCollAmount } from "@/lib/shared/liquity-fork-ops";
import type { LiquityForkCoords } from "@/lib/shared/liquity-fork-provenance";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";
import {
  positionCollateralProv as asymmetryPositionCollateralProv,
  positionDebtProv as asymmetryPositionDebtProv,
  positionRateProv as asymmetryPositionRateProv,
  peakCollateralProv as asymmetryPeakCollateralProv,
  peakDebtProv as asymmetryPeakDebtProv,
} from "@/lib/asymmetry/event-provenance";
import {
  positionCollateralProv as ebisuPositionCollateralProv,
  positionDebtProv as ebisuPositionDebtProv,
  positionRateProv as ebisuPositionRateProv,
  peakCollateralProv as ebisuPeakCollateralProv,
  peakDebtProv as ebisuPeakDebtProv,
} from "@/lib/ebisu/event-provenance";
import {
  positionCollateralProv as basedollarPositionCollateralProv,
  positionDebtProv as basedollarPositionDebtProv,
  positionRateProv as basedollarPositionRateProv,
  peakCollateralProv as basedollarPeakCollateralProv,
  peakDebtProv as basedollarPeakDebtProv,
} from "@/lib/basedollar/event-provenance";
import {
  indexZombie as asymmetryIndexZombie,
  shortId as asymmetryShortId,
  resolveBranch as asymmetryResolveBranch,
  getAsymmetryTroveNftUrl,
  ASYMMETRY_BRANCHES,
  DEBT_ADDRESS as ASYMMETRY_DEBT_ADDRESS,
} from "@/lib/asymmetry/asset-catalog";
import {
  indexZombie as ebisuIndexZombie,
  shortId as ebisuShortId,
  resolveBranch as ebisuResolveBranch,
  getEbisuTroveNftUrl,
  EBISU_BRANCHES,
  DEBT_ADDRESS as EBISU_DEBT_ADDRESS,
} from "@/lib/ebisu/asset-catalog";
import {
  indexZombie as basedollarIndexZombie,
  shortId as basedollarShortId,
  resolveBranch as basedollarResolveBranch,
  getBasedollarTroveNftUrl,
  BASEDOLLAR_BRANCHES,
  DEBT_ADDRESS as BASEDOLLAR_DEBT_ADDRESS,
} from "@/lib/basedollar/asset-catalog";
import { TroveIdentityRow } from "./trove-identity-row";
import { TroveMenuRows } from "./trove-menu-rows";
import {
  CLAIMABLE_BY_OWNER,
  collSurplusClaimableProv,
  collSurplusUsdProv,
} from "@/lib/shared/liquity-coll-surplus-provenance";
import type {
  LiquityFamilyId,
  LiquityFaceProvContext,
  LiquityTroveLive,
  LiquityTroveSurplus,
  LiquityTroveView,
} from "./types";

// The shared card renders inside Link-wrapped rows on
// listing/umbrella pages, so an inner <a> would nest anchors (invalid HTML,
// React hydration error). Render the announcement as a focusable span that
// opens the URL via click/keypress and stops propagation so the card's outer
// Link doesn't fire.
function AnnouncementLink({ url }: { url: string }) {
  const open = () => {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          open();
        }
      }}
      className="underline hover:no-underline cursor-pointer"
    >
      Official announcement
    </span>
  );
}

/** The per-protocol face-receipt + learn-more OPS lookup — the React/logic
 *  bearing bits kept OUT of the plain-data config table on purpose (mirrors
 *  the fork card's prior split). */
interface LiquityFamilyCardOps {
  shortId: (id: string) => string;
  /** Branch MCR as a PERCENT (110), when resolvable. */
  mcrPct: (collateralType: string) => number | undefined;
  faceProv: (ctx: LiquityFaceProvContext) => {
    coll: Provenance;
    debt: Provenance;
    rate: Provenance;
    collUsd: Provenance;
    cr: Provenance;
    liq: Provenance;
  };
  peakCollateralProv: (v: LiquityTroveView) => Provenance;
  peakDebtProv: (v: LiquityTroveView) => Provenance;
  positionContent: (v: LiquityTroveView) => LearnMoreContent;
  /** The branch's collateral token, for the headline icon's popover. */
  collateralAddress: (collateralType: string) => string | undefined;
  /** The deployment's stablecoin. */
  debtAddress: string | undefined;
}

// ── V2 (the reference deployment) ────────────────────────────────────────
const v2Ops: LiquityFamilyCardOps = {
  shortId: (id) => `${id.slice(0, 6)}…${id.slice(-4)}`,
  mcrPct: (ct) => getLiquidationThreshold(ct),
  faceProv: liquityTroveFaceProv,
  peakCollateralProv: () => trovePeakCollProv,
  peakDebtProv: () => trovePeakDebtProv,
  collateralAddress: (ct) => LIQUITY_V2_BRANCHES[ct.toLowerCase()]?.collateralAddr,
  debtAddress: getTokenAddress("BOLD") ?? undefined,
  positionContent: (v) =>
    liquityPositionContent({ collateralType: v.collateralType, status: v.status, isBatched: v.isBatched }),
};

// ── The fork trio (Asymmetry / Ebisu / Basedollar) ──────────────────────
type ForkProtocol = "asymmetry" | "ebisu" | "basedollar";

interface ForkCardDeps {
  shortId: (id: string) => string;
  resolveBranch: (
    collateralType: string | undefined | null,
  ) => { priceFeed: string; collateralAddr: string; mcr: number; mcrBefore?: readonly ForkMcrStep[] } | undefined;
  /** The deployment's stablecoin. */
  debtAddress: string;
  /** Fallback PriceFeed address for the receipt's contract identity when the
   *  branch can't be resolved (mirrors each card's prior `?? BRANCHES.<default>`). */
  defaultPriceFeed: string;
  positionCollateralProv: (coords: LiquityForkCoords) => Provenance;
  positionDebtProv: (coords: LiquityForkCoords) => Provenance;
  positionRateProv: (coords: LiquityForkCoords) => Provenance;
  peakCollateralProv: (coords: { collateralType: string; troveId: string }) => Provenance;
  peakDebtProv: (coords: { collateralType: string; troveId: string }) => Provenance;
}

/** Listing-row collateral ratio — indexed amounts × the branch's own live
 *  PriceFeed price. Mirrors the contract's ICR formula (the identity is
 *  verified BigInt-exact by scripts/verify-liquity-forks-chain.mjs), but the
 *  legs here are the replayed row + the resolved price, not getCurrentICR. */
function listingCrProv(
  cfg: LiquityForkCardConfig,
  deps: Pick<ForkCardDeps, "resolveBranch" | "defaultPriceFeed">,
  symbol: string,
  stale: boolean,
): Provenance {
  return {
    kind: "chain-derived",
    pclass: "oracle",
    summary: `Collateral ratio — the Trove's replayed collateral × the ${symbol} branch's own PriceFeed price${stale ? " (lastGoodPrice — the live fetch failed, so it may lag)" : " (fetchPrice simulated at head)"} ÷ its ${cfg.debtSymbol} debt. The same formula the TroveManager's getCurrentICR computes (identity verified BigInt-exact); the branch liquidates below its MCR.`,
    contract: {
      name: `${cfg.name} ${symbol} PriceFeed`,
      address: deps.resolveBranch(symbol)?.priceFeed ?? deps.defaultPriceFeed,
    },
    via: "collateral × branch PriceFeed price ÷ debt",
    formula: "coll × price ÷ debt",
    inputs: [
      { label: "collateral", kind: "chain", pclass: "emitted", note: "latest emitted coll" },
      { label: "oracle price", kind: "chain", pclass: "oracle", note: "PriceFeed.fetchPrice (simulated)" },
      { label: "debt", kind: "chain", pclass: "emitted", note: "latest emitted debt" },
    ],
  };
}

function makeForkCardOps(protocol: ForkProtocol, deps: ForkCardDeps): LiquityFamilyCardOps {
  const vocab = forkLiveVocab(protocol);
  const cfg = LIQUITY_FORK_CARD_CONFIGS[protocol];
  return {
    shortId: deps.shortId,
    collateralAddress: (ct) => deps.resolveBranch(ct)?.collateralAddr,
    debtAddress: deps.debtAddress,
    mcrPct: (ct) => {
      const mcr = deps.resolveBranch(ct)?.mcr;
      return mcr != null ? mcr * 100 : undefined;
    },
    faceProv: (ctx) => {
      const { v, live, mcrPct } = ctx;
      const ct = v.collateralType;
      if (live) {
        const sc = forkLiveScaling(live, ct, cfg.debtSymbol);
        return {
          coll: vocab.troveStateProv("Collateral", "entire collateral", ct, sc.coll),
          debt: vocab.troveStateProv("Debt", "entire debt", ct, sc.debt),
          rate: vocab.liveRateProv(ct, v.isBatched, sc.rate),
          collUsd: vocab.forkUsdProv("Collateral", ct),
          cr: vocab.contractIcrProv(ct),
          liq: vocab.liqPriceProv(ct),
        };
      }
      const coords: LiquityForkCoords = {
        collateralType: ct,
        blockNumber: v.atBlock,
        troveId: v.id,
        isBatched: v.isBatched,
      };
      return {
        coll: deps.positionCollateralProv(coords),
        debt: deps.positionDebtProv(coords),
        rate: deps.positionRateProv(coords),
        collUsd: vocab.forkUsdProv("Collateral", ct),
        cr: listingCrProv(cfg, deps, ct, v.priceStale ?? false),
        liq: {
          kind: "derived",
          summary:
            "Liquidation price — the collateral price at which this Trove would hit its branch's minimum " +
            "collateral ratio (MCR); below it the Trove becomes eligible for liquidation. Computed from the " +
            "Trove's own replayed debt and collateral against the branch's MCR constant.",
          formula: "debt × MCR ÷ collateral",
          inputs: [
            { label: "debt", kind: "chain", pclass: "emitted", note: "latest emitted debt" },
            { label: "MCR", value: `${mcrPct ?? "—"}%`, kind: "chain", pclass: "indexed", note: "branch constant" },
            { label: "collateral", kind: "chain", pclass: "emitted", note: "latest emitted coll" },
          ],
        },
      };
    },
    peakCollateralProv: (v) => deps.peakCollateralProv({ collateralType: v.collateralType, troveId: v.id }),
    peakDebtProv: (v) => deps.peakDebtProv({ collateralType: v.collateralType, troveId: v.id }),
    positionContent: (v) =>
      liquityForkPositionContent({
        name: cfg.name,
        debtSymbol: cfg.debtSymbol,
        status: v.status,
        isBatched: v.isBatched,
        isZombie: v.isZombie,
        // A liquidated Trove is described against the minimum in force when
        // it was liquidated (its last event); governance can have moved it since.
        minCR: (() => {
          const branch = deps.resolveBranch(v.collateralType);
          if (!branch) return undefined;
          const mcr = v.status === "liquidated" ? forkMcrAt(branch, { timestamp: v.lastActivityAt }) : branch.mcr;
          return `${Math.round(mcr * 100)}%`;
        })(),
        docsLinks: cfg.positionDocsLinks ?? [cfg.docsLink],
      }),
  };
}

/** The debt's dollar value at its $1 face: each family stablecoin is
 *  redeemable for $1 of collateral, and the card states no market price for
 *  it (ui-jobs 270: USD under every asset figure, the stablecoin's included). */
function debtUsdProv(symbol: string, debt: number): Provenance {
  return {
    kind: "derived",
    summary: `Debt value in USD — the ${symbol} debt at its $1 face: the protocol redeems ${symbol} for $1 of collateral.`,
    formula: "debt × $1",
    inputs: [
      { label: "debt", value: `${formatPrice(debt)} ${symbol}`, kind: "chain", pclass: "state" },
      { label: "face", value: "$1", kind: "derived", note: `${symbol} redeems at $1` },
    ],
  };
}

/** A fork's collateral on the card face. The forks run BTC branches, where two
 *  decimals move the amount by up to a quarter (0.016237 tBTC reads 0.02), so an
 *  amount below one keeps five significant digits; one and above keeps two
 *  decimals, as Liquity V2's face does. */
const forkCollateralFace = (value: number): string =>
  Math.abs(value) > 0 && Math.abs(value) < 1
    ? value.toLocaleString("en-US", { maximumSignificantDigits: 5 })
    : value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const OPS: Record<LiquityFamilyId, LiquityFamilyCardOps> = {
  "liquity-v2": v2Ops,
  asymmetry: makeForkCardOps("asymmetry", {
    shortId: asymmetryShortId,
    resolveBranch: asymmetryResolveBranch,
    debtAddress: ASYMMETRY_DEBT_ADDRESS,
    defaultPriceFeed: ASYMMETRY_BRANCHES.ysybold.priceFeed,
    positionCollateralProv: asymmetryPositionCollateralProv,
    positionDebtProv: asymmetryPositionDebtProv,
    positionRateProv: asymmetryPositionRateProv,
    peakCollateralProv: asymmetryPeakCollateralProv,
    peakDebtProv: asymmetryPeakDebtProv,
  }),
  ebisu: makeForkCardOps("ebisu", {
    shortId: ebisuShortId,
    resolveBranch: ebisuResolveBranch,
    debtAddress: EBISU_DEBT_ADDRESS,
    defaultPriceFeed: EBISU_BRANCHES.weeth.priceFeed,
    positionCollateralProv: ebisuPositionCollateralProv,
    positionDebtProv: ebisuPositionDebtProv,
    positionRateProv: ebisuPositionRateProv,
    peakCollateralProv: ebisuPeakCollateralProv,
    peakDebtProv: ebisuPeakDebtProv,
  }),
  basedollar: makeForkCardOps("basedollar", {
    shortId: basedollarShortId,
    resolveBranch: basedollarResolveBranch,
    debtAddress: BASEDOLLAR_DEBT_ADDRESS,
    defaultPriceFeed: BASEDOLLAR_BRANCHES.weth.priceFeed,
    positionCollateralProv: basedollarPositionCollateralProv,
    positionDebtProv: basedollarPositionDebtProv,
    positionRateProv: basedollarPositionRateProv,
    peakCollateralProv: basedollarPeakCollateralProv,
    peakDebtProv: basedollarPeakDebtProv,
  }),
};

const FORK_INDEX_ZOMBIE: Record<ForkProtocol, (status: string, debt: number) => boolean> = {
  asymmetry: asymmetryIndexZombie,
  ebisu: ebisuIndexZombie,
  basedollar: basedollarIndexZombie,
};

/** Each fork's OpenSea link for a Trove NFT, built from that fork's own
 *  per-branch TroveNFT address. Ebisu and Asymmetry are mainnet, Basedollar
 *  is Base — each builder carries its own chain slug. */
const FORK_TROVE_NFT_URL: Record<ForkProtocol, (collateralType: string, troveId: string) => string | null> = {
  asymmetry: getAsymmetryTroveNftUrl,
  ebisu: getEbisuTroveNftUrl,
  basedollar: getBasedollarTroveNftUrl,
};

/** The subset of a fork's TroveSummary row `viewFromForkSummary` reads —
 *  every fork's summary type is structurally this shape. */
interface LiquityForkTroveSummaryLike {
  id: string;
  status: "open" | "closed" | "liquidated";
  collateralType: string;
  collateral: number;
  debt: number;
  peakCollateral: number;
  peakDebt: number;
  interestRate: number;
  isBatched: boolean;
  lastActivityAt: number;
  txCount: number;
  liquidationCount: number;
  redemptionCount: number;
  owner: string | null;
  lastOwner: string | null;
  ownerEns: string | null;
  priceUsd: number | null;
  priceStale: boolean;
  collateralUsd: number | null;
  collateralRatio: number | null;
}

/** Build a card view from a fork's listing summary row. */
export function viewFromForkSummary(protocol: ForkProtocol, s: LiquityForkTroveSummaryLike): LiquityTroveView {
  return {
    id: s.id,
    status: s.status,
    isZombie: FORK_INDEX_ZOMBIE[protocol](s.status, s.debt),
    collateralType: s.collateralType,
    collateral: s.collateral,
    debt: s.debt,
    peakCollateral: s.peakCollateral,
    peakDebt: s.peakDebt,
    interestRate: s.interestRate,
    isBatched: s.isBatched,
    batch: null,
    lastActivityAt: s.lastActivityAt,
    txCount: s.txCount,
    liquidationCount: s.liquidationCount,
    redemptionCount: s.redemptionCount,
    owner: s.owner,
    lastOwner: s.lastOwner,
    ownerEns: s.ownerEns,
    // Every fork now records its per-branch TroveNFT addresses in its own
    // catalog, so all three link the Trove's NFT.
    nftUrl: FORK_TROVE_NFT_URL[protocol](s.collateralType, s.id),
    priceUsd: s.priceUsd,
    priceStale: s.priceStale,
    collateralUsd: s.collateralUsd,
    collateralRatioPct: s.collateralRatio != null ? s.collateralRatio * 100 : null,
  };
}

/** Normalise the detail page's live branch read into the shared live shape.
 *  Null when the read is stale — the card then simply shows the indexed
 *  (listing-basis) figures instead, same as no live read landing at all. */
export function liveFromForkChain(c: LiquityForkTroveChainResponse): LiquityTroveLive | null {
  if (c.chainStale) return null;
  return {
    entireColl: c.entireColl,
    entireDebt: c.entireDebt,
    annualInterestRatePct: c.annualInterestRatePct,
    entireCollRaw: c.entireCollRaw,
    entireDebtRaw: c.entireDebtRaw,
    annualInterestRateRaw: c.annualInterestRateRaw,
    collDecimals: c.collDecimals,
    priceUsd: c.priceUsd,
    icrPct: c.icr != null ? c.icr * 100 : null,
    status: c.status,
  };
}

/** What a Liquity-family page or listing hands the card. */
export interface LiquityPositionCardProps {
  protocol: LiquityFamilyId;
  v: LiquityTroveView;
  /** `detail` on the Trove page (receipts, panel, (i)); `listing` in a row. */
  surface: "detail" | "listing";
  /** The detail page's live branch read (open Trove only). */
  live?: LiquityTroveLive | null;
  /** Listing: debt in approximate notation ("48.1k"); detail: full precision. */
  compact?: boolean;
  /** The (i) pane's prose. */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  explanationDefaultOpen?: boolean;
  onExplanationToggle?: (open: boolean) => void;
  /** A liquidated Trove's collateral surplus, read at the head. */
  surplus?: LiquityTroveSurplus | null;
  /** The panel's two columns from the page's live read (the queue on the
   *  left, the yearly cost on the right); the card adds Liquidates at to the
   *  right one. */
  panel?: PositionPanelColumns;
  /** The ⋮'s export shapes. `null`: the ⋮ holds the Trove's rows and the
   *  provenance row alone. Absent: no ⋮ (the home hero's inert embed). */
  exports?: PositionCardExports | null;
  /** The listing row's ⋮ (Liquity V2's `TroveListingMenu`). */
  listingMenu?: ReactNode;
  /** A line at the foot (V2's snapshot and loading status). */
  foot?: ReactNode;
}

/** The Liquity family's slots for the shared position card: the four
 *  headlines, the panel, the tag, the ⋮ and the counters, from the Trove's
 *  view and the page's live read. */
export function useLiquityCardSlots({
  protocol,
  v,
  surface,
  live,
  compact = false,
  explanation,
  viewHref,
  explanationDefaultOpen,
  onExplanationToggle,
  surplus,
  panel,
  exports,
  listingMenu,
  foot,
}: LiquityPositionCardProps): PositionCardSlots {
  const cfg = LIQUITY_FORK_CARD_CONFIGS[protocol];
  const ops = OPS[protocol];
  const ct = v.collateralType;
  const detail = surface === "detail";

  // Live override (detail page only, open Trove only): value and receipt
  // travel together. `liveFromForkChain` already returns null on a stale read.
  const lv = live && v.status === "open" ? live : null;
  // V2-family zombie: a redemption left the Trove below the branch's MIN_DEBT
  // floor — the only path below it, since owner operations enforce the floor.
  // The live read's own status wins once it lands; the index-derived flag
  // covers the listing, where per-row chain reads are off the table.
  const zombie = lv ? lv.status === "zombie" : v.isZombie;
  const coll = lv?.entireColl ?? v.collateral;
  const debt = lv?.entireDebt ?? v.debt;
  const rate = lv?.annualInterestRatePct ?? v.interestRate;
  const priceUsd = lv ? lv.priceUsd : (v.priceUsd ?? null);
  const collUsd = lv ? (lv.priceUsd != null ? lv.entireColl * lv.priceUsd : null) : (v.collateralUsd ?? null);
  const crPct = lv ? lv.icrPct : (v.collateralRatioPct ?? null);

  // A headline's asset icon opens the asset's popover (ui-jobs 248): the exact
  // figure, the contract, and for the collateral the branch's price where the
  // card states one. A click on the figure stays the provenance inspector's.
  const collAddress = ops.collateralAddress(ct);
  const collPrice = priceUsd != null && priceUsd > 0 ? priceUsd : null;
  // The exact figure: the contract's integer where the live read carries it
  // (the float behind the face holds fewer digits), else the float's digits.
  // A fork's collateral integer is read at the decimals its lane reports;
  // Liquity V2's branches are all 18.
  const collDecimals = lv?.collDecimals ?? (protocol === "liquity-v2" ? 18 : undefined);
  const exactOf = (value: number, raw: string | undefined, decimals: number | undefined) =>
    formatExactFromString(raw && decimals != null ? formatUnitsExact(raw, decimals) : null, value);
  const collIcon = (value: number, withPrice: boolean, raw?: string) => (
    <AssetPopover
      symbol={ct}
      address={collAddress}
      figure={`${exactOf(value, raw, collDecimals)} ${ct}`}
      price={withPrice && collPrice != null ? formatUsdValue(collPrice) : undefined}
      priceSource={withPrice && collPrice != null ? `The ${ct} branch's PriceFeed` : undefined}
    >
      <TokenChipIcon symbol={ct} address={collAddress} size={28} filterable={false} untitled />
    </AssetPopover>
  );
  const debtIcon = (value: number, raw?: string) => (
    <AssetPopover
      symbol={cfg.debtSymbol}
      address={ops.debtAddress}
      figure={`${exactOf(value, raw, 18)} ${cfg.debtSymbol}`}
    >
      <TokenChipIcon symbol={cfg.debtSymbol} address={ops.debtAddress} size={28} filterable={false} untitled />
    </AssetPopover>
  );
  const mcrPct = ops.mcrPct(ct);
  const liqPrice = debt > 0 && coll > 0 && mcrPct != null ? (debt * (mcrPct / 100)) / coll : null;
  const animate = detail; // FadeNumber animateOnMount
  const pending = detail && !!v.pricePending; // skeleton slots while a detail-page price is expected

  const fp = ops.faceProv({ v, live: lv, coll, debt, rate, priceUsd, collUsd, crPct, liqPrice, mcrPct });
  const learnMore = ops.positionContent({ ...v, isZombie: zombie });

  // The owner deep-links to its wallet-filtered listing; lastOwner stands in
  // on a burned/closed trove so a closed row still names who held it.
  const ownerAddr = v.owner ?? v.lastOwner ?? null;
  // Reverse-resolve the owner's primary ENS name web-side (a lane that
  // doesn't carry one, e.g. the forks, leaves ownerEns null), so the card and
  // the identity row's WalletPill agree on one resolved name.
  const resolvedEns = useEnsName(ownerAddr);
  const ownerEns = v.ownerEns ?? resolvedEns;

  const deprecationBanner = v.batch?.deprecation && cfg.delegateDeprecationAnnouncement && (
    <div className="notice-caution flex items-start gap-2 p-3 mb-2 text-sm text-caution-700 dark:text-caution-400">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <p>
        {v.batch.deprecation.isPast ? (
          <>
            The {v.batch.managerName} delegate is no longer maintained and has been removed from the frontend. This
            position should be moved to a new delegate. <AnnouncementLink url={cfg.delegateDeprecationAnnouncement} />
          </>
        ) : (
          <>
            The {v.batch.managerName} delegate will no longer be maintained after{" "}
            {formatMonthDayYear(v.batch.deprecation.deprecatedDate + "T00:00:00Z")}. This position should be moved to a
            new delegate before this date. <AnnouncementLink url={cfg.delegateDeprecationAnnouncement} />
          </>
        )}
      </p>
    </div>
  );

  const ended = v.status === "closed" || v.status === "liquidated";
  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : v.status === "closed"
        ? { word: "Closed", tone: "muted" }
        : zombie
          ? { word: "Zombie", tone: "muted" }
          : null;

  // The listing names the owner as text and, on a live Trove, flags a
  // delegate; the Trove page states both in its Explanation and under
  // Interest rate.
  const identity = detail ? undefined : (
    <>
      <TroveIdentityRow
        protocol={protocol}
        troveId={v.id}
        owner={v.owner}
        lastOwner={v.lastOwner}
        ownerEns={ownerEns}
        shortId={ops.shortId}
        inert
      />
      {v.isBatched && v.status === "open" && (
        // Delegate marker: the name is in the Explanation; pink marks an outside party.
        <RevealTip
          tip={v.batch?.managerName ? `Delegate: ${v.batch.managerName}` : "Delegate-managed"}
          label={v.batch?.managerName ? `Delegate: ${v.batch.managerName}` : "Delegate-managed"}
          className="text-pink-500/90"
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
        </RevealTip>
      )}
    </>
  );

  const counters = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    liquidationCount: v.liquidationCount,
    redemptionCount: v.redemptionCount,
    // The foot strip reads transactions, warnings, then the age (ui-jobs 270).
    ...(detail ? { order: "age-last" as const } : {}),
  };

  // Closed / liquidated: the Trove reads 0/0 on chain, so the headline is
  // what it held at its height — the route's real per-life peaks. Each peak
  // is its own lifetime maximum. A liquidated trove's last event IS its
  // close, so lastActivityAt doubles as the closing date.
  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  if (ended) {
    // A surplus the owner can still claim takes a line under Outcome, in
    // view while there is something to claim; once claimed it goes, and the
    // claim stays on the timeline.
    const claimable = surplus && surplus.claimable > 1e-9 ? surplus : null;
    const claimableUsd = claimable && priceUsd != null && priceUsd > 0 ? claimable.claimable * priceUsd : null;
    heads = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        labelIcon: collIcon(v.peakCollateral, claimableUsd != null),
        value:
          v.peakCollateral > 0 ? (
            <Prov info={ops.peakCollateralProv(v)}>
              <HighlightableValue
                type="peakCollateral"
                state="after"
                value={v.peakCollateral}
                variant="card"
                className="text-rb-500"
              >
                {formatPrice(v.peakCollateral)}
              </HighlightableValue>
            </Prov>
          ) : null,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        labelIcon: debtIcon(v.peakDebt),
        value:
          v.peakDebt > 0 ? (
            <Prov info={ops.peakDebtProv(v)}>
              <HighlightableValue
                type="peakDebt"
                state="after"
                value={v.peakDebt}
                variant="card"
                className="text-rb-500"
              >
                {formatApproximate(v.peakDebt)}
              </HighlightableValue>
            </Prov>
          ) : null,
      },
    ];
    outcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined,
      footnote: claimable ? (
        <div className="text-xs mt-0.5 text-rb-500">
          <Prov info={collSurplusClaimableProv(claimable, ct)}>
            <span className="font-semibold text-foreground/80 tabular-nums">{forkCollAmount(claimable.claimable)}</span>
          </Prov>{" "}
          {ct}
          {claimableUsd != null && (
            <>
              {" "}
              (<Prov info={collSurplusUsdProv(claimable, ct, priceUsd as number)}>{formatUsdValue(claimableUsd)}</Prov>)
            </>
          )}{" "}
          {CLAIMABLE_BY_OWNER}
        </div>
      ) : undefined,
    };
  } else {
    const managerName =
      v.batch?.managerName ?? (v.batch?.managerAddress ? ops.shortId(v.batch.managerAddress) : "Batch manager");
    const manager = (
      <span className="inline-flex items-center gap-1">
        <span className="text-pink-500/90" aria-hidden="true">
          <UsersGlyph />
        </span>
        {managerName}
      </span>
    );
    heads = [
      {
        id: "collateral",
        label: CARD_VOCAB.collateral,
        value: (
          <Prov info={fp.coll}>
            <HighlightableValue type="collateral" state="after" value={coll} className="text-foreground/80">
              <FadeNumber
                value={coll}
                formatFn={protocol === "liquity-v2" ? undefined : forkCollateralFace}
                animateOnMount={animate}
              />
            </HighlightableValue>
          </Prov>
        ),
        assets: collIcon(coll, true, lv?.entireCollRaw),
        usd:
          collUsd !== null && collUsd > 0 ? (
            <Prov info={fp.collUsd}>
              <HighlightableValue type="collateralUsd" state="after" value={collUsd} className="text-green-400">
                <FadeNumber value={collUsd} formatFn={formatUsdValue} animateOnMount={animate} />
              </HighlightableValue>
            </Prov>
          ) : pending && coll > 0 ? (
            <span className="inline-block h-3 w-16 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
          ) : null,
      },
      {
        id: "debt",
        label: CARD_VOCAB.debt,
        value: (
          <Prov info={fp.debt} value={exactOf(debt, lv?.entireDebtRaw, 18)}>
            <HighlightableValue type="debt" state="after" value={debt} className="text-foreground/80">
              <FadeNumber value={debt} formatFn={formatApproximate} animateOnMount={animate} />
            </HighlightableValue>
          </Prov>
        ),
        assets: debtIcon(debt, lv?.entireDebtRaw),
        usd:
          debt > 0 ? (
            <Prov info={debtUsdProv(cfg.debtSymbol, debt)}>
              <span className="font-bold text-green-400">{formatUsdValue(debt)}</span>
            </Prov>
          ) : null,
      },
      {
        id: "collateral-ratio",
        label: ratioLabel("cdp"),
        value:
          crPct != null && crPct > 0 ? (
            <Prov info={fp.cr}>
              <HighlightableValue
                type="collRatio"
                state="after"
                value={parseFloat(crPct.toFixed(1))}
                className="text-foreground/80"
              >
                <FadeNumber value={crPct} decimals={1} animateOnMount={animate} />%
              </HighlightableValue>
            </Prov>
          ) : null,
        pending: !(crPct != null && crPct > 0) && pending && debt > 0,
      },
      {
        id: "interest-rate",
        label: "Interest rate",
        value: (
          <Prov info={fp.rate}>
            <HighlightableValue type="interestRate" state="after" value={rate} className="text-foreground/80">
              <FadeNumber value={rate} decimals={2} animateOnMount={animate} />%
            </HighlightableValue>
          </Prov>
        ),
        // A rate a batch manager sets: who sets it, in the slot the USD line
        // takes under the asset figures.
        sub: v.isBatched ? (
          v.batch?.managerAddress ? (
            <RevealTip
              tip={`Batch manager ${v.batch.managerAddress}`}
              label={`${managerName}, batch manager ${v.batch.managerAddress}`}
              focusable={detail}
              className="focus-ring rounded-sm"
            >
              {manager}
            </RevealTip>
          ) : (
            manager
          )
        ) : undefined,
      },
    ];
  }

  const common = { status, heads, identity, notice: deprecationBanner || undefined, counters, outcome };
  if (!detail) return { ...common, surface: "listing", menu: listingMenu ?? null };

  const menu: PositionCardMenu | null =
    exports === undefined
      ? null
      : {
          leading: () => (
            <TroveMenuRows
              troveId={v.id}
              nftUrl={v.nftUrl ?? null}
              pagePath={`${cfg.trovePath}/${ct}/${v.id}`}
              shortId={ops.shortId}
            />
          ),
          exports,
        };
  const detailCommon = {
    ...common,
    surface: "detail" as const,
    explainer: {
      body: explanation ?? null,
      defaultOpen: explanationDefaultOpen,
      onToggle: onExplanationToggle,
      viewHref,
    },
    learnMore,
    menu,
    foot,
  };
  if (outcome) return { ...detailCommon, outcome };

  // The panel: the page's left column, and its right with Liquidates at last.
  const liqValue =
    liqPrice !== null ? (
      <span className="inline-flex items-center gap-1">
        <TokenChipIcon symbol={ct} size={14} filterable={false} />
        <Prov info={fp.liq}>{formatLiquidationPrice(liqPrice)}</Prov>
      </span>
    ) : pending && debt > 0 && coll > 0 ? (
      <span className="inline-block h-3 w-20 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
    ) : null;
  // Each heading's read-more (decision 0038), in the branch's symbols.
  const tips = troveCardTips(ct, cfg.debtSymbol, ratioLabel("cdp") !== "Collateral ratio");
  const HEAD_TIP = tips.heads;
  const ROW_TIP = tips.rows;
  const tipRow = (r: PositionPanelRow): PositionPanelRow =>
    r.tip || !ROW_TIP[r.id] ? r : { ...r, tip: ROW_TIP[r.id] };
  return {
    ...detailCommon,
    heads: detailCommon.heads.map((h) => (h.labelTip || !HEAD_TIP[h.id] ? h : { ...h, labelTip: HEAD_TIP[h.id] })),
    outcome: undefined,
    panel: [
      (panel?.[0] ?? []).map(tipRow),
      [
        ...(panel?.[1] ?? []),
        ...(liqValue ? [{ id: "liquidates-at", label: "Liquidates at", value: liqValue }] : []),
      ].map(tipRow),
    ],
  };
}

/** The Liquity-family Trove card: its slots, drawn by the shared card. */
export function LiquityPositionCard(props: LiquityPositionCardProps) {
  return <PositionCard slots={useLiquityCardSlots(props)} />;
}
