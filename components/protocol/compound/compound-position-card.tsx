"use client";

// Compound V3 (Comet) position card: the family's slots for the shared
// position card (components/shared/position-card.tsx, rails-ops
// TO-DO-position-card 322). `useCompoundCardSlots` builds them from the card
// view and the page's live Comet read; `CompoundPositionCard` draws them.
//
// A Comet position is single-base / multi-collateral: ONE signed base balance
// (+ lent, earns the supply rate; − borrowed, pays the borrow rate) plus N
// non-earning collateral assets. The base is decomposed by sign onto the
// ledger's sides: a net lender's base sits on the supply side ("Lent", with
// any collateral), a borrower's on the debt side as a positive magnitude.
//
//   heads   Collateral (or Lent): the side's oracle-USD total with its asset
//           cluster, or the token lines where any leg is unpriced; Debt: the
//           borrowed base with its USD beneath; Borrowing limit used (a
//           borrower, from the Comet read).
//   panel   left: one row per supply line (each collateral asset with its
//           share of the side's value, the lent base); right: room to borrow,
//           the absorb line and the share of it reached, the drop to it, the
//           block the balance was read at.
//   closed  the highest recorded supply and debt, and the Outcome.

import { ListingTag } from "@/components/shared/listing-tag";
import { useState, type ReactNode } from "react";
import { Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardMenu,
  type PositionCardExports,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import type { PositionCardMetaProps } from "@/components/shared/position-card-meta";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import type { AssetBreakdown } from "@/components/shared/asset-donut";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { Icon } from "@/components/icons/icon";
import { WalletPill } from "@/components/shared/wallet-pill";
import { useDustLines } from "@/components/shared/dust-reserves";
import { ExactSpan } from "@/components/shared/amount-text";
import { formatUnitsExact, formatCompact, formatExactDecimal, formatUsdValue } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import {
  compoundUsdProvOnchain,
  peakBaseProv,
  peakCollateralProv,
  type CompoundCoords,
} from "@/lib/compound/event-provenance";
import { COMPOUND_INDEXED_VOCABULARY, type CompoundTowerVocabulary } from "@/lib/compound/economics";
import { compoundPositionModal, type CompoundPositionDeployment } from "@/lib/compound/event-templates";
import { EXPLORERS_WITHOUT_LISTING } from "@/lib/shared/coverage";
import { protocolForSession } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { CARD_VOCAB, notRecordedNote } from "@/lib/shared/card-vocab";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { compoundRiskSlots } from "@/components/protocol/compound/compound-risk-slot";
import type {
  CompoundPositionSummary,
  CompoundAssetAmount,
  CompoundBaseAmount,
  CompoundCurrentBase,
} from "@/lib/sources/api/compound-positions";

/** Highest-recorded amounts over a position's life (closed/liquidated cards). */
interface CompoundPeak {
  collateral: CompoundAssetAmount[];
  lentBase: number;
  borrowedBase: number;
}

export interface CompoundPositionView {
  market: string;
  marketLabel: string;
  comet: string;
  account: string;
  /** "unread" is a listing row whose account has not been read from the
   *  chain yet — no state recorded, never mapped to "closed" (0018). */
  status: "open" | "closed" | "liquidated" | "unread";
  base: CompoundBaseAmount;
  side: "lend" | "borrow" | "flat";
  /** Slice-2 chain overlay: current present-value base WITH interest (or null). */
  current: CompoundCurrentBase | null;
  collateral: CompoundAssetAmount[];
  /** Highest recorded amounts (closed/liquidated cards). */
  peak: CompoundPeak;
  everLiquidated: boolean;
  liquidationCount: number;
  /** Unix seconds of the last absorb, where known. */
  lastLiquidationAt?: number | null;
  /** Non-liquidation transaction count (activity-meta). */
  txCount: number;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number | null;
  atBlock?: number;
  /** §3 USD layer: head prices keyed by lowercased token address, threaded in by
   *  the detail page (the shared `/api/prices` cache). Feeds the valued economics
   *  tower; absent on the listing (the card itself shows no USD). */
  priceByAddress?: Record<string, number>;
  /** Set when the account still holds balances but every one is worth under
   *  a cent at the oracle and nothing is borrowed: the card reads it as
   *  closed, and these are the amounts left behind. */
  dustLeft?: { symbol: string; amount: number }[];
}

/** The base figure to display: the live CURRENT value (incl. interest) when the
 *  chain overlay has it — authoritative for the current state — else the
 *  balance at the last event (Ethereum) or the replayed principal (Base). */
interface EffectiveBase {
  amount: number;
  side: "lend" | "borrow" | "flat";
  isChain: boolean;
  block: number | null;
}

function effectiveBase(v: CompoundPositionView): EffectiveBase {
  if (v.current) return { amount: v.current.amount, side: v.current.side, isChain: true, block: v.current.block };
  return { amount: v.base.amount, side: v.side, isChain: false, block: null };
}

/** The two coordinates that say WHICH lane a figure came from: the chain the
 *  receipt's explorer link opens, and whether the decoded logs were the
 *  rails-server index or a live sweep. Ethereum's index when absent. */
export type CompoundCardLane = Pick<CompoundCoords, "chainId" | "source">;

function baseProv(
  v: CompoundPositionView,
  eff: EffectiveBase,
  side: "lend" | "borrow",
  vocab: CompoundTowerVocabulary,
  lane: CompoundCardLane,
): Provenance {
  const coords: CompoundCoords = { ...lane, comet: v.comet, marketLabel: v.marketLabel, asset: v.base.address };
  return eff.isChain
    ? vocab.currentBase(v.base.symbol, side, coords, eff.block)
    : vocab.positionBase(v.base.symbol, side, coords);
}

/** On-chain oracle USD for one asset; null when this market didn't price it. */
function assetUsd(v: CompoundPositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Total USD across a set of {address, amount} legs, with the STRICT guard from
 *  Aave's on-chain USD: null the moment any contributing leg is unpriced, so a
 *  partial total is never asserted. */
function totalUsd(
  v: CompoundPositionView,
  legs: { address: string; amount: number; decimalsUnread?: true }[],
): number | null {
  let sum = 0;
  let any = false;
  for (const { address, amount, decimalsUnread } of legs) {
    if (decimalsUnread) return null;
    if (amount <= 0) continue;
    const u = assetUsd(v, address, amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

/** The card's oracle-USD side figures (the chain-state balances × Comet's own
 *  getPrice, threaded on the summary's priceByAddress), exported so the
 *  Explanation pane restates the card's figures byte for byte (charter §3
 *  reverse-completeness). A side is null when the card shows no USD for it
 *  (any contributing leg unpriced — the strict guard above). */
export function cardSideUsd(v: CompoundPositionView): { supplyUsd: number | null; borrowUsd: number | null } {
  const eff = effectiveBase(v);
  const supplyLegs = [
    ...(eff.side === "lend" ? [{ address: v.base.address, amount: eff.amount }] : []),
    ...v.collateral.map((c) => ({ address: c.address, amount: c.amount, decimalsUnread: c.decimalsUnread })),
  ];
  return {
    supplyUsd: totalUsd(v, supplyLegs),
    borrowUsd: eff.side === "borrow" ? assetUsd(v, v.base.address, Math.abs(eff.amount)) : null,
  };
}

/** One line on the supply side: the lent base (a net LENDER only) or one
 *  collateral asset. */
interface SupplyLeg {
  key: string;
  symbol: string;
  address: string;
  amount: number;
  /** Set on a collateral line; absent on the lent base. */
  collateral?: CompoundAssetAmount;
}

function supplyLegs(v: CompoundPositionView, eff: EffectiveBase): SupplyLeg[] {
  return [
    ...(eff.side === "lend"
      ? [{ key: `base:${v.base.address}`, symbol: v.base.symbol, address: v.base.address, amount: eff.amount }]
      : []),
    ...v.collateral.map((c) => ({
      key: c.address,
      symbol: c.symbol,
      address: c.address,
      amount: c.amount,
      collateral: c,
    })),
  ];
}

/** A supply line's oracle USD for the dust rule (components/shared/dust-reserves);
 *  null (held) where unpriced or its decimals were not read. */
const legUsdOf =
  (v: CompoundPositionView) =>
  (l: SupplyLeg): number | null =>
    l.collateral?.decimalsUnread ? null : assetUsd(v, l.address, l.amount);

/** A traced token amount at headline size (the asset's glyph after it). */
function TracedAmount({
  info,
  symbol,
  amount,
  address,
  unreadAddress,
}: {
  info: Provenance;
  symbol: string;
  amount: number;
  address?: string;
  /** Set to the token's address when its decimals did not load. */
  unreadAddress?: string;
}) {
  return (
    <div>
      <Prov info={info}>
        {unreadAddress ? (
          <TokenAmountNotLoaded address={unreadAddress} label={symbol} />
        ) : (
          <AssetAmount value={amount} symbol={symbol} address={address} />
        )}
      </Prov>
    </div>
  );
}

/** One oracle-USD figure (the V4 spoke-card grammar: one dollar total leads a
 *  side whatever its leg count). */
function UsdFigure({ usd, info }: { usd: number; info: Provenance }) {
  return (
    <RevealTip tip={formatUsdValue(usd)}>
      <Prov info={info}>{formatUsd(usd)}</Prov>
    </RevealTip>
  );
}

/** Identity cluster (owner + market label). The pill links to the session's
 *  wallet-filtered listing only where the session HAS a listing — the Base
 *  explorer opens on a wallet and has no list to filter. */
function CompoundIdentity({
  v,
  session,
  wallet = true,
  listing = false,
}: {
  v: CompoundPositionView;
  session: SessionProtocol;
  /** False on the detail page, whose wallet row above the card names the
   *  owner (ui-jobs 228). */
  wallet?: boolean;
  listing?: boolean;
}) {
  const entry = protocolForSession(session);
  const hasListing = entry != null && !EXPLORERS_WITHOUT_LISTING.has(entry.id);
  const market = <span className="text-xs font-semibold text-rb-500">{v.marketLabel}</span>;
  // The listing keeps the wallet on the left and the market in the card's `tag`.
  if (listing) {
    return (
      <WalletPill
        wallet={v.account}
        ensName={null}
        filterProtocol={hasListing ? session : undefined}
        bookmarkProtocol={session}
      />
    );
  }
  return (
    <span className="flex items-center gap-2">
      {wallet && (
        <WalletPill
          wallet={v.account}
          ensName={null}
          filterProtocol={hasListing ? session : undefined}
          bookmarkProtocol={session}
        />
      )}
      {market}
    </span>
  );
}

/** The position's row at the head of the card's ⋮: a link to its page. A
 *  Comet position has no ID or NFT of its own; it is (market, wallet). */
function CompoundMenuRows({ pagePath }: { pagePath: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ToolsMenuItem
      icon={copied ? <Icon name="check" size={16} /> : <Link2 size={16} className="-rotate-45" />}
      title="Link to this position"
      subtitle={copied ? "Copied" : "Copy the page's address"}
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}${pagePath}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}

/** What the card's count counts, beside the timeline's event count. */
const COUNT_TIP =
  "Every transaction on this position except absorbs, which another account sends. The timeline counts events, and one transaction can write two or more: an absorb writes one for each seized asset and one for the debt, and one transaction can add collateral and borrow.";

/** What a Compound V3 page or listing hands the card. */
export interface CompoundPositionCardProps {
  v: CompoundPositionView;
  /** `detail` on the position page (receipts, panel, (i), ⋮); `listing` in a
   *  row. */
  surface?: "detail" | "listing";
  /** The page's live Comet read for an open position: null while it is out
   *  (the risk headline waits), absent where the page has none to give (a
   *  stale read, the listing). */
  live?: CompoundMarketChainResponse | null;
  /** The receipts behind the base and collateral figures. The default names
   *  the rails-server index and its replay; the Base explorer passes the
   *  swept-lane vocabulary, whose figures are pinned Comet reads. */
  vocab?: CompoundTowerVocabulary;
  /** Which explorer this card is on — decides where the wallet pill's
   *  bookmark lives and whether it links to a listing. */
  session?: SessionProtocol;
  /** Which chain and which capture the receipts name — Ethereum's index by
   *  default; the Base listing passes { chainId: BASE, source: "sweep" }. */
  lane?: CompoundCardLane;
  /** Whether the row carries highest-recorded amounts (the replay lane does;
   *  the Base listing, a chain read at a block with no replay behind it, does
   *  not — its closed cards say so). */
  peaks?: boolean;
  /** The (i) pane's prose. */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The position page's path, for the ⋮'s link row. */
  pagePath?: string;
  /** The ⋮'s export shapes; `null` leaves the link and provenance rows. */
  exports?: PositionCardExports | null;
}

/** The Compound V3 family's slots for the shared position card. */
export function useCompoundCardSlots({
  v,
  surface = "listing",
  live,
  vocab = COMPOUND_INDEXED_VOCABULARY,
  session = "compound",
  lane = {},
  peaks = true,
  explanation,
  viewHref,
  pagePath,
  exports,
}: CompoundPositionCardProps): PositionCardSlots {
  const detail = surface === "detail";
  const eff = effectiveBase(v);
  const legs = supplyLegs(v, eff);
  const usdOf = legUsdOf(v);
  // Dust lines (under a cent) leave the icon stack and the panel's rows; the
  // panel's last row is the "N dust reserves hidden" control.
  const { lines, control: dustControl } = useDustLines(legs, usdOf);
  const ended = v.status === "closed" || v.status === "liquidated";
  // The "?" every state panel owns — one content function for Ethereum and
  // Base; the deployment named by the card's session changes the prose.
  const deployment: CompoundPositionDeployment = session === "compound-base" ? "compound-base" : "compound";

  const status: PositionCardStatus | null =
    v.status === "liquidated"
      ? { word: "Liquidated", tone: "danger" }
      : v.status === "closed"
        ? { word: "Closed", tone: "muted" }
        : v.status === "unread"
          ? { word: "Not loaded", tone: "muted" }
          : null;
  const identity = <CompoundIdentity v={v} session={session} wallet={!detail} listing={!detail} />;
  const tag = <ListingTag market={v.marketLabel} />;
  const counters: PositionCardMetaProps = {
    lastActivityAt: v.lastActivityAt,
    eventCount: v.txCount,
    countTip: COUNT_TIP,
    liquidationCount: v.liquidationCount,
    liquidated: v.everLiquidated,
    // The foot strip reads transactions, warnings, then the age (ui-jobs 270).
    ...(detail ? { order: "age-last" as const } : {}),
  };

  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  let panel: [PositionPanelRow[], PositionPanelRow[]] = [[], []];

  if (ended) {
    // The position has unwound to ~0, so the headlines are what it held at its
    // height: the highest recorded collateral (per asset, plus the lent base
    // if it was ever a net lender) and the highest recorded borrowed base.
    // Chain-state token amounts only, no USD.
    const peakCoords: CompoundCoords = { ...lane, comet: v.comet, marketLabel: v.marketLabel, account: v.account };
    const noPeaksNote = peaks ? undefined : notRecordedNote("position");
    // On the Base sweep the peak is the base's replayed PRINCIPAL; on Ethereum
    // each row is the chain's balance, interest included.
    const principalNote = vocab.baseAtLastEvent ? undefined : "principal only — accrued interest not included";
    // A wallet that only ever lent the base posted no collateral: its peak is
    // "supply" (the Aave V4 spoke-card grammar).
    const supplyOnly = v.peak.collateral.length === 0 && v.peak.lentBase > 0;
    const lentLine =
      v.peak.lentBase > 0 ? (
        <TracedAmount
          key="lent-base"
          info={peakBaseProv(v.base.symbol, "lend", { ...peakCoords, asset: v.base.address })}
          symbol={v.base.symbol}
          amount={v.peak.lentBase}
          address={v.base.address}
        />
      ) : null;
    const supplyLines: ReactNode[] = [];
    if (supplyOnly && lentLine) supplyLines.push(lentLine);
    for (const c of v.peak.collateral) {
      supplyLines.push(
        <TracedAmount
          key={c.address}
          info={peakCollateralProv(c.symbol, { ...peakCoords, asset: c.address })}
          symbol={c.symbol}
          amount={c.amount}
          address={c.address}
          unreadAddress={c.decimalsUnread ? c.address : undefined}
        />,
      );
    }
    // The lent base is not collateral: under its own caption.
    if (!supplyOnly && lentLine) {
      supplyLines.push(
        <div key="lent-caption" className="mt-1 text-xs font-normal text-rb-500">
          Highest lent {v.base.symbol} (earns interest)
        </div>,
        lentLine,
      );
    }
    heads = [
      {
        id: "peak-collateral",
        label: supplyOnly ? CARD_VOCAB.peakSupply : CARD_VOCAB.peakCollateral,
        value: supplyLines.length > 0 ? <div className="flex flex-col gap-1">{supplyLines}</div> : null,
        sub: noPeaksNote,
      },
    ];
    if (!peaks || v.peak.borrowedBase > 0)
      heads.push({
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        value: peaks ? (
          <TracedAmount
            info={peakBaseProv(v.base.symbol, "borrow", { ...peakCoords, asset: v.base.address })}
            symbol={v.base.symbol}
            amount={v.peak.borrowedBase}
            address={v.base.address}
          />
        ) : null,
        sub: noPeaksNote ?? principalNote,
      });
    outcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: outcomeDates(v) ?? (v.lastActivityAt ? [{ at: v.lastActivityAt }] : undefined),
    };
  } else {
    const coords: CompoundCoords = {
      ...lane,
      comet: v.comet,
      marketLabel: v.marketLabel,
      asset: v.base.address,
      blockNumber: v.atBlock,
    };
    const { supplyUsd, borrowUsd } = cardSideUsd(v);
    // Without the live read, Ethereum shows the balance at the last event and
    // Base the replayed principal; the live read includes interest.
    const lentBasis = eff.isChain ? "incl. interest" : "earns supply rate";
    const borrowBasis = eff.isChain
      ? "incl. interest"
      : vocab.baseAtLastEvent
        ? "at the last event"
        : "principal (ex-interest)";
    const baseExact = formatExactDecimal(
      formatUnitsExact(eff.isChain ? v.current!.amountRaw : v.base.amountRaw, v.base.decimals).replace(/^-/, ""),
    );
    const supplySymbols = lines.filter((l) => !l.collateral?.decimalsUnread).map((l) => l.symbol);
    const lending = eff.side === "lend";

    // Supply side: the oracle-USD total with the asset cluster; where any leg
    // is unpriced, the token lines are the figure (a partial total is never
    // asserted).
    const supplyHead: PositionCardHead = {
      id: "collateral",
      label: lending ? "Lent" : CARD_VOCAB.collateral,
      value:
        legs.length === 0 ? null : supplyUsd != null ? (
          <UsdFigure usd={supplyUsd} info={compoundUsdProvOnchain(lending ? "Lent base" : "Collateral", coords)} />
        ) : (
          <div className="flex flex-col gap-1">
            {lines.map((l) => (
              <TracedAmount
                key={l.key}
                info={
                  l.collateral
                    ? vocab.positionCollateral(l.symbol, { ...coords, asset: l.address })
                    : baseProv(v, eff, "lend", vocab, lane)
                }
                symbol={l.symbol}
                amount={l.amount}
                address={l.address}
                unreadAddress={l.collateral?.decimalsUnread ? l.address : undefined}
              />
            ))}
          </div>
        ),
      assets:
        supplyUsd != null && supplySymbols.length > 0 ? <InlineAssetCluster symbols={supplySymbols} /> : undefined,
      total:
        supplyUsd != null
          ? { usd: supplyUsd, info: compoundUsdProvOnchain(lending ? "Lent base" : "Collateral", coords) }
          : undefined,
      sub: lending ? lentBasis : undefined,
    };
    // One supply line: its amount with its icon, the dollars beneath (the
    // Liquity V2 headline, as the debt side draws it).
    const oneLine = lines.length === 1 && legs.length === 1 && !lines[0].collateral?.decimalsUnread ? lines[0] : null;
    if (oneLine) {
      const c = oneLine.collateral;
      supplyHead.value = (
        <Prov
          info={
            c
              ? vocab.positionCollateral(c.symbol, { ...coords, asset: c.address })
              : baseProv(v, eff, "lend", vocab, lane)
          }
        >
          <AssetAmount
            value={oneLine.amount}
            symbol={oneLine.symbol}
            address={oneLine.address}
            exact={c ? formatUnitsExact(c.amountRaw, c.decimals) : baseExact}
          />
        </Prov>
      );
      supplyHead.assets = undefined;
      supplyHead.usd =
        supplyUsd != null ? (
          <Prov info={compoundUsdProvOnchain(lending ? "Lent base" : "Collateral", coords)}>
            <span className="font-bold text-green-400">{formatUsdValue(supplyUsd)}</span>
          </Prov>
        ) : null;
    }
    // Debt side: the borrowed base as a POSITIVE magnitude, its USD beneath.
    const borrowing = eff.side === "borrow";
    const debtHead: PositionCardHead = {
      id: "debt",
      label: CARD_VOCAB.debt,
      value: borrowing ? (
        <Prov info={baseProv(v, eff, "borrow", vocab, lane)}>
          <AssetAmount value={Math.abs(eff.amount)} symbol={v.base.symbol} address={v.base.address} exact={baseExact} />
        </Prov>
      ) : null,
      usd: borrowing
        ? borrowUsd != null && (
            <Prov info={compoundUsdProvOnchain("Borrowed base", coords)}>
              <span className="font-bold text-green-400">{formatUsdValue(borrowUsd)}</span>
            </Prov>
          )
        : undefined,
      sub: borrowing ? borrowBasis : undefined,
    };
    // The risk headline and its rows from the live read: a borrower only.
    const risk = borrowing && live !== undefined ? compoundRiskSlots(live) : null;
    heads = [supplyHead, debtHead, ...(risk ? [risk.head] : [])];

    // The supply lines, the donut's breakdown (asset-donut.tsx) where the side
    // holds two or more.
    const supplyBreakdown: AssetBreakdown = {
      assets: lines.map((l) => {
        const c = l.collateral;
        const usd = usdOf(l);
        return {
          id: c ? `collateral-${c.symbol.toLowerCase()}` : "lent",
          symbol: l.symbol,
          address: l.address,
          usd,
          amount: c?.decimalsUnread ? (
            <TokenAmountNotLoaded address={c.address} label={c.symbol} />
          ) : (
            <Prov
              info={
                c
                  ? vocab.positionCollateral(c.symbol, { ...coords, asset: c.address })
                  : baseProv(v, eff, "lend", vocab, lane)
              }
            >
              <ExactSpan exact={c ? formatUnitsExact(c.amountRaw, c.decimals) : baseExact} symbol={l.symbol}>
                {formatCompact(l.amount)}
              </ExactSpan>
            </Prov>
          ),
          usdText:
            usd != null ? (
              <Prov info={compoundUsdProvOnchain(c ? `${l.symbol} collateral` : "Lent base", coords)}>
                {formatUsdValue(usd)}
              </Prov>
            ) : undefined,
        };
      }),
      dust: dustControl ?? undefined,
    };
    // Panel, right: the borrower's room and the absorb line, then the block
    // the live balance was read at (interest accrues every block).
    const right: PositionPanelRow[] = [...(risk?.rows ?? [])];
    if (eff.isChain && v.current?.block)
      right.push({
        id: "read-at-block",
        label: "Read at block",
        tip: "The block the Comet's balance was read at. Interest accrues every block, so the balance moves between loads.",
        value: v.current.block.toLocaleString("en-US"),
      });
    if (!oneLine && lines.length > 1) heads[0] = { ...heads[0], breakdown: supplyBreakdown };
    panel = [[], right];
  }

  // The headlines' read-mores on a detail card.
  const HEAD_TIP = {
    collateral: `The collateral supplied to the ${v.base.symbol} market, in dollars at its price feeds. Collateral earns no interest and backs borrowing of ${v.base.symbol}.`,
    debt: `The ${v.base.symbol} borrowed from the market, including the interest accrued at its borrow rate.`,
  };
  const tipped = (h: PositionCardHead): PositionCardHead =>
    h.labelTip || !(h.label === CARD_VOCAB.collateral || h.label === CARD_VOCAB.debt)
      ? h
      : { ...h, labelTip: h.id === "debt" ? HEAD_TIP.debt : HEAD_TIP.collateral };
  const common = { status, heads: detail ? heads.map(tipped) : heads, identity, counters, outcome };
  if (!detail) return { ...common, surface: "listing", menu: null, tag };

  const menu: PositionCardMenu = {
    leading: pagePath ? () => <CompoundMenuRows pagePath={pagePath} /> : undefined,
    exports: exports ?? null,
  };
  const detailCommon = {
    ...common,
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore: compoundPositionModal({ status: v.status, deployment, side: ended ? undefined : eff.side }),
    menu,
  };
  if (outcome) return { ...detailCommon, outcome };
  return { ...detailCommon, outcome: undefined, panel };
}

/** The Compound V3 position card: its slots, drawn by the shared card. */
export function CompoundPositionCard(props: CompoundPositionCardProps) {
  return <PositionCard slots={useCompoundCardSlots(props)} />;
}

/** A liquidated card's dates: the last absorb, then the closing when it
 *  falls on a different day. */
function outcomeDates(v: CompoundPositionView): { label: string; at: number }[] | undefined {
  const last = v.lastLiquidationAt;
  if (v.status !== "liquidated" || last == null) return undefined;
  if (v.lastActivityAt == null) return [{ label: "Liquidated", at: last }];
  if (Math.floor(last / 86400) === Math.floor(v.lastActivityAt / 86400)) return undefined;
  return [
    { label: "Liquidated", at: last },
    { label: "Closed", at: v.lastActivityAt },
  ];
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: CompoundPositionSummary): CompoundPositionView {
  return {
    market: s.market,
    marketLabel: s.marketLabel,
    comet: s.comet,
    account: s.account,
    status: s.status,
    base: s.base,
    side: s.side,
    current: s.current,
    collateral: s.collateral,
    peak: { collateral: s.peak.collateral, lentBase: s.peak.lentBase, borrowedBase: s.peak.borrowedBase },
    everLiquidated: s.everLiquidated,
    liquidationCount: s.liquidationCount,
    lastLiquidationAt: s.lastLiquidationAt,
    txCount: s.txCount,
    lastActivityAt: s.lastActivityAt,
    priceByAddress: s.priceByAddress,
  };
}
