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

import { type ReactNode } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { HighlightableValue } from "@/components/transaction-timeline/explanation/HighlightableValue";
import { FadeNumber } from "@/components/ui/FadeNumber";
import { Prov, type Provenance } from "@/components/shared/provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatApproximate, formatPrice, formatUsdValue } from "@/lib/utils/format";
import { getLiquidationThreshold, formatLiquidationPrice } from "@/lib/utils/liquidation-utils";
import { LIQUITY_FORK_CARD_CONFIGS, type LiquityForkCardConfig } from "@/lib/shared/liquity-fork-card-config";
import { liquityTroveFaceProv, trovePeakCollProv, trovePeakDebtProv } from "@/lib/liquity/trove-card-provenance";
import { liquityPositionContent } from "@/lib/shared/learn-more-content";
import { liquityForkPositionContent } from "@/lib/shared/liquity-fork-position-content";
import { forkLiveVocab } from "@/lib/shared/liquity-fork-live-provenance";
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
} from "@/lib/asymmetry/asset-catalog";
import {
  indexZombie as ebisuIndexZombie,
  shortId as ebisuShortId,
  resolveBranch as ebisuResolveBranch,
  getEbisuTroveNftUrl,
  EBISU_BRANCHES,
} from "@/lib/ebisu/asset-catalog";
import {
  indexZombie as basedollarIndexZombie,
  shortId as basedollarShortId,
  resolveBranch as basedollarResolveBranch,
  getBasedollarTroveNftUrl,
  BASEDOLLAR_BRANCHES,
} from "@/lib/basedollar/asset-catalog";
import { TroveIdentityRow } from "./trove-identity-row";
import type { LiquityFamilyId, LiquityFaceProvContext, LiquityTroveLive, LiquityTroveView } from "./types";

// PositionCardShell renders this card inside Link-wrapped rows on
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
}

// ── V2 (the reference deployment) ────────────────────────────────────────
const v2Ops: LiquityFamilyCardOps = {
  shortId: (id) => `${id.slice(0, 6)}…${id.slice(-4)}`,
  mcrPct: (ct) => getLiquidationThreshold(ct),
  faceProv: liquityTroveFaceProv,
  peakCollateralProv: () => trovePeakCollProv,
  peakDebtProv: () => trovePeakDebtProv,
  positionContent: (v) =>
    liquityPositionContent({ collateralType: v.collateralType, status: v.status, isBatched: v.isBatched }),
};

// ── The fork trio (Asymmetry / Ebisu / Basedollar) ──────────────────────
type ForkProtocol = "asymmetry" | "ebisu" | "basedollar";

interface ForkCardDeps {
  shortId: (id: string) => string;
  resolveBranch: (collateralType: string | undefined | null) => { priceFeed: string; mcr: number } | undefined;
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
    mcrPct: (ct) => {
      const mcr = deps.resolveBranch(ct)?.mcr;
      return mcr != null ? mcr * 100 : undefined;
    },
    faceProv: (ctx) => {
      const { v, live, mcrPct } = ctx;
      const ct = v.collateralType;
      if (live) {
        return {
          coll: vocab.troveStateProv("Collateral", "entireColl", ct),
          debt: vocab.troveStateProv("Debt", "entireDebt", ct),
          rate: vocab.liveRateProv(ct, v.isBatched),
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
        minCR: (() => {
          const mcr = deps.resolveBranch(v.collateralType)?.mcr;
          return mcr != null ? `${Math.round(mcr * 100)}%` : undefined;
        })(),
        docsLink: cfg.docsLink,
      }),
  };
}

const OPS: Record<LiquityFamilyId, LiquityFamilyCardOps> = {
  "liquity-v2": v2Ops,
  asymmetry: makeForkCardOps("asymmetry", {
    shortId: asymmetryShortId,
    resolveBranch: asymmetryResolveBranch,
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
    priceUsd: c.priceUsd,
    icrPct: c.icr != null ? c.icr * 100 : null,
    status: c.status,
  };
}

export function LiquityPositionCard({
  protocol,
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  live,
  compact = false,
  showActivityMeta = true,
  footer,
  explanationDefaultOpen,
  onExplanationToggle,
}: {
  protocol: LiquityFamilyId;
  v: LiquityTroveView;
  /** Detail render: receipts scope + the Explanation heading-button
   *  (PositionCardShell). Listing omits it. */
  receipts?: boolean;
  rowExtra?: ReactNode;
  explanation?: ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  live?: LiquityTroveLive | null;
  /** Listing passes true: debt headline in approximate notation ("48.1k");
   *  detail = full precision ("48,148.74"). */
  compact?: boolean;
  /** true = time-ago + counters; "counts" = counters only (detail page — the
   *  timeline header already says "X ago"); false = none. Default true. */
  showActivityMeta?: boolean | "counts";
  /** Content under the stats grid (V2's detail-page snapshot/enhancement status line). */
  footer?: ReactNode;
  explanationDefaultOpen?: boolean;
  onExplanationToggle?: (open: boolean) => void;
}) {
  const cfg = LIQUITY_FORK_CARD_CONFIGS[protocol];
  const ops = OPS[protocol];
  const ct = v.collateralType;

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
  const mcrPct = ops.mcrPct(ct);
  const liqPrice = debt > 0 && coll > 0 && mcrPct != null ? (debt * (mcrPct / 100)) / coll : null;
  const animate = !!receipts; // FadeNumber animateOnMount
  const pending = !!receipts && !!v.pricePending; // skeleton slots while a detail-page price is expected

  const fp = ops.faceProv({ v, live: lv, coll, debt, rate, priceUsd, collUsd, crPct, liqPrice, mcrPct });
  const learnMore = ops.positionContent(v);

  // The owner deep-links to its wallet-filtered listing; lastOwner stands in
  // on a burned/closed trove so a closed row still names who held it.
  const ownerAddr = v.owner ?? v.lastOwner ?? null;
  // Reverse-resolve the owner's primary ENS name web-side (a lane that
  // doesn't carry one, e.g. the forks, leaves ownerEns null). Batched across
  // the page's pills; WalletPill itself would fall back to the same hook,
  // but resolving here means the card and any other reader of `ownerEns`
  // (the identity row's WalletPill included) agree on one resolved name.
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
            {new Date(v.batch.deprecation.deprecatedDate + "T00:00:00Z").toLocaleDateString("en-US", {
              timeZone: "UTC",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            . This position should be moved to a new delegate before this date.{" "}
            <AnnouncementLink url={cfg.delegateDeprecationAnnouncement} />
          </>
        )}
      </p>
    </div>
  );

  const meta =
    showActivityMeta !== false ? (
      <PositionCardMeta
        lastActivityAt={showActivityMeta !== "counts" ? v.lastActivityAt : null}
        eventCount={v.txCount}
        liquidationCount={v.liquidationCount}
        redemptionCount={v.redemptionCount}
      />
    ) : undefined;

  // Closed / liquidated: the Trove reads 0/0 on chain, so the headline is
  // what it held at its height — the route's real per-life peaks. Each peak
  // is its own lifetime maximum. A liquidated trove's last event IS its
  // close — there is no separate closure timestamp, so lastActivityAt
  // doubles as closedAt. explanation threads through (past-tense closed-life
  // narration); rowExtra deliberately does not — the live risk strips
  // describe the chain NOW and never ride a past life.
  if (v.status === "closed" || v.status === "liquidated") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={learnMore}
        explanationDefaultOpen={explanationDefaultOpen}
        onExplanationToggle={onExplanationToggle}
      >
        {deprecationBanner}
        <ClosedPositionStats
          outcome={v.status}
          closedAt={v.lastActivityAt}
          leadingIdentity={
            <>
              <span className="text-xs font-bold uppercase tracking-wide text-foreground/80">{ct}</span>
              <TroveIdentityRow
                protocol={protocol}
                troveId={v.id}
                owner={v.owner}
                lastOwner={v.lastOwner}
                ownerEns={ownerEns}
                // A closed life keeps its NFT link in the header on both
                // surfaces — the terminal Explanation pane carries no NFT
                // bullet to hand it to.
                nftUrl={v.nftUrl}
                shortId={ops.shortId}
              />
            </>
          }
          identity={meta}
          collateralIcon={<TokenChipIcon symbol={ct} size={28} filterable={false} />}
          debtIcon={<TokenChipIcon symbol={cfg.debtSymbol} size={28} filterable={false} />}
          collateral={
            v.peakCollateral > 0 ? (
              <StatValue>
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
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          debt={
            v.peakDebt > 0 ? (
              <StatValue>
                <Prov info={ops.peakDebtProv(v)}>
                  <HighlightableValue
                    type="peakDebt"
                    state="after"
                    value={v.peakDebt}
                    variant="card"
                    className="text-rb-500"
                  >
                    {compact ? formatApproximate(v.peakDebt) : formatPrice(v.peakDebt)}
                  </HighlightableValue>
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
        />
        {footer}
      </PositionCardShell>
    );
  }

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={learnMore}
      explanationDefaultOpen={explanationDefaultOpen}
      onExplanationToggle={onExplanationToggle}
    >
      {deprecationBanner}
      <OpenPositionStats
        // Detail render (receipts): the house grammar's neutral mode-word
        // pill — "Borrowing", or "Zombie" once redeemed below the floor. The
        // LISTING render keeps the lifecycle pill, with ZOMBIE standing in
        // for OPEN on a redeemed-down Trove.
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {zombie ? "Zombie" : "Borrowing"}
            </span>
          ) : zombie ? (
            <span className="font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs bg-rb-300 dark:bg-rb-700 text-foreground/70">
              ZOMBIE
            </span>
          ) : (
            <LifecyclePill status="open" />
          )
        }
        leadingIdentity={
          <>
            <span className="text-xs font-bold uppercase tracking-wide text-foreground/80">{ct}</span>
            <TroveIdentityRow
              protocol={protocol}
              troveId={v.id}
              owner={v.owner}
              lastOwner={v.lastOwner}
              ownerEns={ownerEns}
              nftUrl={v.nftUrl}
              // V2's detail page (receipts) carries the OpenSea link in its
              // footnote NFT bullet, so drop the redundant header chip
              // there. Listing cards have no footnote, and the forks'
              // Explanation pane states the Trove NFT without linking it
              // (lib/shared/liquity-fork-position-content.ts) — both keep
              // the header chip as the only way to reach the NFT.
              showNftLink={!receipts || protocol !== "liquity-v2"}
              shortId={ops.shortId}
            />
            {/* Delegate marker — name lives in the row below the card, the
                pink icon here is just a status flag (pink = external party). */}
            {v.isBatched && (
              <span
                className="inline-flex items-center text-pink-500/90"
                title={v.batch?.managerName ? `Delegate: ${v.batch.managerName}` : "Delegate-managed"}
              >
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            )}
          </>
        }
        identity={meta}
        columns={[
          {
            label: CARD_VOCAB.collateral,
            value: (
              <StatValue>
                <span className="flex items-center gap-1.5">
                  <Prov info={fp.coll}>
                    <HighlightableValue type="collateral" state="after" value={coll} className="text-foreground/80">
                      <FadeNumber value={coll} animateOnMount={animate} />
                    </HighlightableValue>
                  </Prov>
                  <TokenChipIcon symbol={ct} size={28} filterable={false} />
                </span>
              </StatValue>
            ),
            footnote: (
              <div className="text-xs mt-0.5 min-h-[1rem]">
                {collUsd !== null && collUsd > 0 ? (
                  <span className="inline-flex items-center font-bold text-green-400 border-l-2 border-r-2 border-green-400 rounded-sm px-1 py-0">
                    <Prov info={fp.collUsd}>
                      <HighlightableValue type="collateralUsd" state="after" value={collUsd} className="text-green-400">
                        <FadeNumber value={collUsd} formatFn={formatUsdValue} animateOnMount={animate} />
                      </HighlightableValue>
                    </Prov>
                  </span>
                ) : pending && coll > 0 ? (
                  <span className="inline-block h-3 w-16 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
                ) : null}
              </div>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            value: (
              <StatValue>
                <span className="flex items-center gap-1.5">
                  <Prov info={fp.debt}>
                    <HighlightableValue type="debt" state="after" value={debt} className="text-foreground/80">
                      <FadeNumber
                        value={debt}
                        formatFn={compact ? formatApproximate : formatPrice}
                        animateOnMount={animate}
                      />
                    </HighlightableValue>
                  </Prov>
                  <TokenChipIcon symbol={cfg.debtSymbol} size={28} filterable={false} />
                </span>
              </StatValue>
            ),
            footnote: (
              <div className="text-xs mt-0.5 text-rb-500">
                <Prov info={fp.rate}>
                  <HighlightableValue type="interestRate" state="after" value={rate} className="text-rb-500">
                    <FadeNumber value={rate} decimals={2} animateOnMount={animate} />%
                  </HighlightableValue>
                </Prov>{" "}
                interest rate
              </div>
            ),
          },
          {
            label: ratioLabel("cdp"),
            value:
              crPct != null && crPct > 0 ? (
                <StatValue>
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
                </StatValue>
              ) : pending && debt > 0 ? (
                <div className="h-9 w-20 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse mt-2" />
              ) : (
                <StatDash />
              ),
            // Liquidation price sits beneath the ratio as its tangible
            // restatement (Liquity is always single-collateral, so a
            // concrete price is the clearest read — no headroom % needed).
            footnote: (
              <div className="text-xs mt-0.5 text-rb-500 min-h-[1rem]">
                {liqPrice !== null ? (
                  <span className="inline-flex items-center gap-1">
                    Liquidates at
                    <TokenChipIcon symbol={ct} size={14} filterable={false} />
                    <Prov info={fp.liq}>{formatLiquidationPrice(liqPrice)}</Prov>
                  </span>
                ) : pending && debt > 0 && coll > 0 ? (
                  <span className="inline-block h-3 w-20 rounded-md bg-rb-200 dark:bg-rb-700 animate-pulse" />
                ) : null}
              </div>
            ),
          },
        ]}
      />
      {footer}
    </PositionCardShell>
  );
}
