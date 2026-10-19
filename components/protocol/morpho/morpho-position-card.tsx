"use client";

// The Morpho position card, Morpho Blue on Ethereum and on Base. The card is a
// slot builder (rails-ops TO-DO-position-card 322, 323): `useMorphoCardSlots`
// turns the position's view and the page's live market read into one
// `PositionCardSlots` object, and the shared `PositionCard`
// (components/shared/position-card.tsx) draws it. The lender cards in
// components/protocol/morpho-base/position-section.tsx take the identity and
// the ⋮ rows from here.
//
// Headline values are read from the chain: collateral and the borrowed PRINCIPAL are
// sums of the events' own `assets` fields (replay). The current debt WITH
// accrued interest is the borrow shares through the live market index (chain
// reads both sides); on the detail page it is upgraded to the head-block read
// from the chain lane when that agrees with the index wei-exact.
//
// Morpho Blue states no USD price: a market's oracle prices the collateral in
// its loan token, so no headline carries a USD line, and the collateral's
// value at the oracle is a panel row in the loan token.

import { ListingTag } from "@/components/shared/listing-tag";
import { useState, type ReactNode } from "react";
import { Check, Hash, Link2 } from "lucide-react";
import {
  PositionCard,
  type PositionCardExports,
  type PositionCardHead,
  type PositionCardMenu,
  type PositionCardOutcome,
  type PositionCardSlots,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import type { PositionCardMetaProps } from "@/components/shared/position-card-meta";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { AssetAmount } from "@/components/shared/asset-amount";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { Prov } from "@/components/shared/provenance";
import { WalletPill } from "@/components/shared/wallet-pill";
import { MorphoMarketPair } from "@/components/protocol/morpho/morpho-market-link";
import {
  positionCollateralProv,
  positionBorrowedProv,
  morphoCurrentDebtProv,
  morphoPeakCollateralProv,
  morphoPeakBorrowedProv,
  morphoPeakOwedProv,
  morphoBorrowRateNowProv,
} from "@/lib/morpho/event-provenance";
import { capacityProv, lltvProv, type MorphoChainCoords } from "@/lib/morpho/position-provenance";
import { formatNumber, formatExact } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { CARD_VOCAB, notRecordedNote } from "@/lib/shared/card-vocab";
import { capacityShare } from "@/lib/shared/capacity-share";
import { pct } from "@/components/shared/ratio-bar";
import type { MorphoCurrentDebt, MorphoListedRead, MorphoPositionSummary } from "@/lib/sources/api/morpho-positions";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import type { ListedMorphoReceipts } from "@/lib/morpho/listed-card-provenance";
import type { MorphoCoords } from "@/lib/morpho/event-provenance";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { morphoPositionModal, type MorphoPositionModalOpts } from "@/lib/morpho/event-templates";
import { morphoBasePositionHref } from "@/lib/morpho-base/routes";
import { isPendlePt } from "@/lib/morpho/pendle-pt";
import { morphoHasDebt } from "@/lib/morpho/position-legs";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { PanelFigure } from "@/components/shared/position-card-panel";

export interface MorphoPositionView {
  positionId: string;
  marketId: string;
  marketLabel: string;
  loanSymbol: string;
  collateralSymbol: string | null;
  /** The two tokens' own addresses, where the source carried them.
   *
   *  Morpho Blue is permissionless: anyone can open a market on any ERC-20, so
   *  the hand-kept symbol → address table in lib/shared/token-addresses.ts
   *  knows only a fraction of what appears here, and a symbol identifies
   *  nothing in particular anyway — two markets can name two different
   *  contracts "USDC". The chip needs the address to ask an icon CDN at all;
   *  without one it draws the initial letter. Every source behind this view
   *  has both (the market params ARE two addresses), so they are carried. */
  loanToken?: string;
  collateralToken?: string;
  isIdle: boolean;
  owner: string;
  /** "unread" is a listing row whose account has not been read from the
   *  chain yet — no state recorded, never mapped to "closed" (0018). */
  status: "open" | "closed" | "liquidated" | "unread";
  /** The loan / collateral token's decimals did not load, so every figure in
   *  that token reads "Not loaded" (MorphoPositionSummary.loanDecimalsUnread). */
  loanDecimalsUnread?: true;
  collateralDecimalsUnread?: true;
  collateral: number;
  borrowed: number;
  /** Highest recorded collateral / borrowed principal over the life (closed cards). */
  peakCollateral: number;
  peakBorrowed: number;
  /** The highest debt OWED at any event, interest included (the share-derived
   *  debt the events show). Set on the detail page when its whole history is
   *  loaded; the card then states it in place of the principal peak. */
  peakDebtOwed?: number;
  /** Set where the lane replayed the position from a seed rather than from
   *  every row (a vault's history is sent as its newest rows plus the state
   *  behind them), so a running peak is not among the figures it recorded. The
   *  closed card states the peaks as not recorded rather than drawing a floor
   *  as a lifetime high. */
  peaksPartial?: boolean;
  /** Borrow shares (raw integer string) — the input to the current-debt index. */
  borrowSharesRaw: string;
  /** Current debt WITH accrued interest, from the live market index; null when
   *  the position has no open debt / index. */
  currentDebt: MorphoCurrentDebt | null;
  lltv: number;
  /** The market's borrow rate now (APR), from the live chain read; set on the
   *  detail page only. */
  borrowApr?: number;
  /** Activity-meta: event count, own-transaction count (DISTINCT txs excluding
   *  liquidation rows — what the chip's title claims), last-event unix seconds,
   *  ever-liquidated flag. */
  eventCount: number;
  txCount: number;
  lastTs: number | null;
  everLiquidated: boolean;
  /** Exact liquidation count, set only where the page holds the whole history
   *  (detail page, whole window). Absent, the badge is the bare triangle. */
  liquidationCount?: number;
  /** Σ bad debt written off across the position's liquidations, loan units. */
  badDebt: number;
  atBlock?: number;
  /** Set on a LISTED row (the Base listing): the pinned block every figure was
   *  read at and the oracle-valued borrow limit / health at it. With it, the
   *  card renders the chain-read grammar — collateral, debt, health — rather
   *  than the replay's principal / current-debt split, which a row with no
   *  history behind it cannot draw. */
  listed?: MorphoListedRead;
  /** Set when `owner` is a catalogued MetaMorpho vault (Base only) — its name
   *  at census and its own exposure page. Resolved by the CALLER
   *  (lib/morpho-base/vault-catalog.ts is 505 rows and must not be imported
   *  into this shared card, which Ethereum Morpho also renders) and threaded
   *  through to the wallet pill. Undefined on Ethereum, always. */
  vaultOwner?: { name: string; href: string } | null;
}

// The card asks the same two questions the index filtered on, the same way —
// `lib/morpho/position-legs.ts` states them. It asked three different ones until
// 2026-09-20 (TO-DO §46): collateral at 1e-6 DISPLAY tokens, debt at 1e-6 on the
// principal in one branch and `> 0` on it in another, so a listed row read
// "Collateral only" where the replayed row read "Borrowing" on one position.

const shortHex = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;

/** The position's rows at the head of the card's ⋮ (ui-jobs 308 point 2):
 *  its ID with a copy (Ethereum names a position by market and wallet in one
 *  ID; Base by the wallet and the market), the market's ID, and a link to its
 *  page. */
export function MorphoMenuRows({
  marketId,
  positionId,
  pagePath,
}: {
  marketId: string;
  /** The Ethereum position ID (`<marketId>-<user>`), absent on Base. */
  positionId?: string;
  pagePath: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const icon = (key: string, glyph: ReactNode) => (copied === key ? <Check size={16} /> : glyph);
  return (
    <>
      {positionId && (
        <ToolsMenuItem
          icon={icon("position", <Hash size={16} />)}
          title={`Position ${shortHex(positionId)}`}
          subtitle={copied === "position" ? "Copied" : "Copy the position ID"}
          onClick={() => copy("position", positionId)}
        />
      )}
      <ToolsMenuItem
        icon={icon("market", <Hash size={16} />)}
        title={`Market ${shortHex(marketId)}`}
        subtitle={copied === "market" ? "Copied" : "Copy the market ID"}
        onClick={() => copy("market", marketId)}
      />
      <ToolsMenuItem
        icon={icon("link", <Link2 size={16} className="-rotate-45" />)}
        title="Link to this position"
        subtitle={copied === "link" ? "Copied" : "Copy the page's address"}
        onClick={() => copy("link", `${window.location.origin}${pagePath}`)}
      />
    </>
  );
}

/** The labels a Morpho card carries in its heading row: the market and its
 *  LLTV, with the owner's wallet pill first on a listing. */
export function morphoCardIdentity({
  market,
  lltv,
  listingOwner,
}: {
  market: ReactNode;
  lltv: number;
  /** The listing's owner pill; the position page names the owner in its wallet row. */
  listingOwner?: { wallet: string; session: SessionProtocol; vault?: { name: string; href: string } | null };
}): ReactNode {
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-rb-500">
      {listingOwner && (
        <WalletPill
          wallet={listingOwner.wallet}
          ensName={null}
          filterProtocol={listingOwner.session}
          bookmarkProtocol={listingOwner.session}
          vault={listingOwner.vault ?? null}
        />
      )}
      {listingOwner ? (
        // The listing's market goes to the card's right-end `tag`.
        lltv > 0 && <span className="text-rb-400">LLTV {(lltv * 100).toFixed(1)}%</span>
      ) : (
        <span>
          {market}
          {lltv > 0 && <span className="ml-2 text-rb-400">LLTV {(lltv * 100).toFixed(1)}%</span>}
        </span>
      )}
    </span>
  );
}

/** The listing's right-end `tag`: the market (the collateral / loan pair). */
export function morphoCardTag(market: ReactNode): ReactNode {
  return <ListingTag market={market} />;
}

/** A Morpho position's page, for the ⋮'s link row. */
export function morphoPagePath(
  session: SessionProtocol,
  v: Pick<MorphoPositionView, "positionId" | "owner" | "marketId">,
) {
  return session === "morpho-base"
    ? morphoBasePositionHref(v.owner, v.marketId)
    : `/ethereum/morpho/${encodeURIComponent(v.positionId)}`;
}

const STATUS: Record<"closed" | "liquidated" | "unread", PositionCardStatus> = {
  closed: { word: "Closed", tone: "muted" },
  liquidated: { word: "Liquidated", tone: "danger" },
  unread: { word: "Not loaded", tone: "muted" },
};

/** What a Morpho page or listing hands the card. */
export interface MorphoPositionCardProps {
  v: MorphoPositionView;
  /** `detail` on the position page (receipts, panel, (i), ⋮); `listing` in a row. */
  surface?: "detail" | "listing";
  /** The receipts a LISTED row's figures cite (lib/morpho/listed-card-
   *  provenance.ts) — required alongside `v.listed` for the listed render;
   *  without it the card falls back to the replay grammar. */
  listedReceipts?: ListedMorphoReceipts;
  /** The explorer the wallet pill's filter link and bookmark belong to —
   *  the Ethereum listing by default; the Base page passes its own. */
  session?: SessionProtocol;
  /** The detail page's live read of the market: the LTV headline and the
   *  panel's rate, room and liquidation rows. `null` while it is out (the LTV
   *  pulses); absent where the page makes no live read. */
  live?: MorphoChainPositionResponse | null;
  /** The (i) Explanation: narration bullets describing the position NOW. */
  explanation?: ReactNode;
  /** The pane's copy-this-view link: the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** The ⋮'s export shapes; `null` or absent: the ⋮ holds the position's rows
   *  and the provenance row. */
  exports?: PositionCardExports | null;
}

/** Morpho's slots for the shared position card. */
export function useMorphoCardSlots({
  v,
  surface = "listing",
  listedReceipts,
  session = "morpho",
  live,
  explanation,
  viewHref,
  exports,
}: MorphoPositionCardProps): PositionCardSlots {
  // The chain and the capture lane are route facts: on a Base page the
  // receipts must name the sweep and link to Basescan, not the index and
  // Etherscan. Read from context, as the event cards do.
  const coords: MorphoCoords = { marketId: v.marketId, chainId: useChainId(), source: useCaptureSource() };
  const detail = surface === "detail";
  const collSym = v.collateralSymbol ?? "—";
  const hasColl = v.collateral > 0;
  const hasDebt = morphoHasDebt(v.borrowSharesRaw);
  const ended = v.status === "closed" || v.status === "liquidated";
  const listed = v.listed && listedReceipts ? { L: v.listed, R: listedReceipts } : null;
  // A token whose decimals did not load has no known scale: its figures name
  // the token and state no amount.
  const collFigure = (value: number) =>
    v.collateralDecimalsUnread ? (
      <TokenAmountNotLoaded address={v.collateralToken ?? ""} label={collSym} />
    ) : (
      <AssetAmount value={value} symbol={collSym} address={v.collateralToken} />
    );
  const loanFigure = (value: number) =>
    v.loanDecimalsUnread ? (
      <TokenAmountNotLoaded address={v.loanToken ?? ""} label={v.loanSymbol} />
    ) : (
      <AssetAmount value={value} symbol={v.loanSymbol} address={v.loanToken} />
    );
  // The "?" the same modals serve Morpho on Ethereum and Morpho Blue on Base;
  // only the deployment the card's session names, and a Pendle principal token
  // as collateral, change the prose.
  const positionModal = (o: Pick<MorphoPositionModalOpts, "status" | "hasDebt" | "peakDebt">) =>
    morphoPositionModal({ ...o, base: session === "morpho-base", pt: isPendlePt(v.collateralSymbol) });

  const status: PositionCardStatus | null = v.status === "open" ? null : STATUS[v.status];
  const marketPair = <MorphoMarketPair label={v.marketLabel} marketId={v.marketId} loanToken={v.loanToken} />;
  const identity = morphoCardIdentity({
    market: marketPair,
    lltv: v.lltv,
    listingOwner: detail ? undefined : { wallet: v.owner, session, vault: v.vaultOwner },
  });
  const counters: PositionCardMetaProps = {
    lastActivityAt: v.lastTs,
    eventCount: v.txCount,
    liquidated: v.everLiquidated,
    liquidationCount: v.liquidationCount,
    // The foot strip reads transactions, warnings, then the age (ui-jobs 270).
    ...(detail ? { order: "age-last" as const } : {}),
  };

  let heads: PositionCardHead[];
  let outcome: PositionCardOutcome | undefined;
  const left: PositionPanelRow[] = [];
  const right: PositionPanelRow[] = [];
  let learnMore: LearnMoreContent;

  if (ended) {
    // Closed / liquidated: collateral and borrowed have unwound to 0, so the
    // headline is what the position held at its height — highest recorded
    // collateral + debt (chain-state MAX over its life; token amounts only).
    // A LISTED row has no history behind it, and a seeded replay recorded no
    // running high: both say the peaks are not recorded here.
    const unrecorded = listed != null || !!v.peaksPartial;
    const owed = !unrecorded && v.peakDebtOwed != null && v.peakDebtOwed > 0;
    learnMore = positionModal({
      status: v.status,
      peakDebt: unrecorded ? "unrecorded" : owed ? "owed" : "principal",
    });
    const dash = <span className="text-rb-500">{"—"}</span>;
    heads = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        value: listed ? (
          <Prov info={listed.R.notRecorded(`The highest ${collSym} collateral this position ever held`)}>{dash}</Prov>
        ) : !unrecorded && v.peakCollateral > 0 ? (
          <Prov info={morphoPeakCollateralProv(collSym, coords)}>{collFigure(v.peakCollateral)}</Prov>
        ) : null,
        sub: unrecorded ? notRecordedNote("wallet") : undefined,
      },
      {
        id: "peak-debt",
        label: CARD_VOCAB.peakDebt,
        value: listed ? (
          <Prov info={listed.R.notRecorded(`The highest ${v.loanSymbol} debt this position ever owed`)}>{dash}</Prov>
        ) : owed ? (
          <Prov info={morphoPeakOwedProv(v.loanSymbol, coords)}>{loanFigure(v.peakDebtOwed as number)}</Prov>
        ) : !unrecorded && v.peakBorrowed > 0 ? (
          <Prov info={morphoPeakBorrowedProv(v.loanSymbol, coords)}>{loanFigure(v.peakBorrowed)}</Prov>
        ) : null,
        sub: unrecorded
          ? notRecordedNote("wallet")
          : owed
            ? "owed at its events, interest included"
            : v.peakBorrowed > 0
              ? "principal only — accrued interest not included"
              : undefined,
      },
    ];
    outcome = {
      word: v.status === "liquidated" ? "Liquidated" : "Closed",
      dates: v.lastTs ? [{ at: v.lastTs }] : undefined,
    };
  } else {
    learnMore = positionModal({ status: v.status, hasDebt });
    // The live read counts only when it is fresh.
    const chain = live && !live.chainStale ? live : null;
    const chainCoords: MorphoChainCoords | undefined = live
      ? { marketId: live.marketId, marketLabel: `${live.loanSymbol} / ${live.collateralSymbol}` }
      : undefined;
    const collateral: PositionCardHead = {
      id: "collateral",
      label: CARD_VOCAB.collateral,
      value: hasColl ? (
        <Prov
          info={
            listed ? listed.R.collateral(collSym, listed.L.block) : positionCollateralProv(collSym, v.atBlock, coords)
          }
        >
          {collFigure(v.collateral)}
        </Prov>
      ) : null,
    };
    // One debt figure: what is owed now, interest included (the borrow
    // shares at the market's totals, accrued to the read). The
    // borrowed-minus-repaid principal stands only where the index was not read.
    const debtValue = listed ? (
      hasDebt ? (
        <Prov
          info={listed.R.debt(
            v.loanSymbol,
            formatNumber(Number(v.borrowSharesRaw)),
            listed.L.totalBorrowAssets ?? "—",
            listed.L.totalBorrowShares ?? "—",
            listed.L.block,
          )}
        >
          {loanFigure(v.borrowed)}
        </Prov>
      ) : null
    ) : v.currentDebt ? (
      <Prov
        info={morphoCurrentDebtProv(
          v.loanSymbol,
          formatNumber(Number(v.borrowSharesRaw)),
          v.currentDebt.totalBorrowAssets,
          v.currentDebt.totalBorrowShares,
          coords,
          v.currentDebt.index,
        )}
      >
        {loanFigure(v.currentDebt.amount)}
      </Prov>
    ) : hasDebt ? (
      <Prov info={positionBorrowedProv(v.loanSymbol, v.atBlock, coords)}>{loanFigure(v.borrowed)}</Prov>
    ) : null;
    heads = [collateral, { id: "debt", label: CARD_VOCAB.debt, value: debtValue }];

    // The LTV headline, from the page's live read: debt over the collateral's
    // value at the market's oracle. A listing reads no market (decision 0018).
    const ltvUsable =
      chain && chain.currentDebt > 0 && chain.maxBorrow > 0 && chain.ltv != null && chain.ltv > 0 ? chain : null;
    if (detail && live !== undefined && hasDebt) {
      heads.push({
        id: "ltv",
        label: "LTV",
        labelTip: `Loan-to-value: the debt over the collateral's value at the market's oracle. The market liquidates at its LLTV, ${pct(live?.lltv ?? v.lltv)}.`,
        pending: live === null,
        value: ltvUsable ? (
          <Prov info={capacityProv("Loan-to-value", "live debt ÷ collateral value", chainCoords)}>
            {pct(ltvUsable.ltv as number)}
          </Prov>
        ) : null,
      });
    }

    if (detail) {
      // A panel figure in the loan token draws its icon after it (anatomy C18).
      const loanAsset = { symbol: v.loanSymbol, address: v.loanToken };
      // The left column: what the debt costs and how much more it can take.
      const debtNow = listed ? v.borrowed : v.currentDebt?.amount;
      const apr = v.borrowApr ?? chain?.borrowApr;
      if (hasDebt && apr != null && debtNow != null && !v.loanDecimalsUnread) {
        left.push(
          {
            id: "borrow-rate",
            label: "Borrow rate",
            value: (
              <Prov info={morphoBorrowRateNowProv(apr)}>
                <PanelFigure>{(apr * 100).toFixed(2)}%</PanelFigure> APR
              </Prov>
            ),
            tip: "The market's borrow rate now, read from its interest rate model at the head block. It moves with how much of the market is lent out.",
          },
          {
            id: "yearly-cost",
            label: "Costs per year",
            value: (
              <>
                ~<AmountText value={debtNow * apr} format="compact" />
              </>
            ),
            asset: loanAsset,
            tip: "The debt now times the borrow rate: what a year costs while the rate holds.",
          },
        );
      }
      if (listed && hasDebt) {
        left.push({
          id: "interest-to",
          label: "Interest to block",
          value: <BlockRef block={listed.L.block} />,
          tip: "The debt includes interest accrued to this block, the block every figure on the card was read at.",
        });
      } else if (v.currentDebt?.index?.stale) {
        left.push({
          id: "interest-to",
          label: "Interest to",
          value: (
            <>
              <PanelFigure>{formatDate(v.currentDebt.index.readAt)}</PanelFigure> (
              <BlockRef block={v.currentDebt.index.block} />)
            </>
          ),
          tip: "The market's interest index was last read at this block, so the debt includes interest to that date.",
        });
      } else if (!listed && !v.currentDebt && hasDebt) {
        left.push({
          id: "debt-basis",
          label: "Debt basis",
          value: "borrowed less repaid; interest not read",
          tip: "The market's index was not read, so the debt is what was borrowed less what was repaid, without interest.",
        });
      }
      if (chain && chain.currentDebt > 0 && chain.maxBorrow > 0) {
        left.push({
          id: "room-to-borrow",
          label: "Room to borrow",
          value: (
            <Prov
              info={capacityProv("Available to borrow", "collateral value × lltv − live debt", chainCoords)}
              value={formatExact(Math.max(0, chain.maxBorrow - chain.currentDebt))}
            >
              <AmountText value={Math.max(0, chain.maxBorrow - chain.currentDebt)} format="compact" />
            </Prov>
          ),
          asset: loanAsset,
          tip: "How much more the position can borrow: the collateral's value at the market's oracle times the LLTV, less the debt.",
        });
      }

      // The right column: the collateral at the oracle and the distance to
      // liquidation.
      if (hasColl && !v.loanDecimalsUnread) {
        const collValue = listed ? listed.L.collateralValue : chain ? chain.collateralValue : undefined;
        if (collValue != null) {
          right.push({
            id: "collateral-value",
            label: "Collateral value",
            value: (
              <Prov
                info={
                  listed
                    ? listed.R.collateralValue(collSym, v.loanSymbol, listed.L.block)
                    : capacityProv("Collateral value", "collateral × oracle price", chainCoords)
                }
              >
                <AmountText value={collValue} format="compact" />
              </Prov>
            ),
            asset: loanAsset,
            tip: "The collateral valued in the loan token at the market's oracle, the price Morpho's liquidation test uses.",
          });
        } else if (listed) {
          right.push({
            id: "collateral-value",
            label: "Collateral value",
            value: "no oracle price at that block",
            tip: "The market's oracle gave no price at the block the card was read at.",
          });
        }
      }
      if (ltvUsable) {
        const share = capacityShare(ltvUsable.currentDebt, ltvUsable.maxBorrow);
        right.push({
          id: "lltv-share",
          label: "Share of the LLTV line",
          value: (
            <>
              <Prov
                info={capacityProv(
                  "Debt share of the liquidation line",
                  "debt ÷ (collateral value × lltv)",
                  chainCoords,
                )}
              >
                <PanelFigure>{share.text}</PanelFigure>
              </Prov>{" "}
              (LLTV{" "}
              <Prov info={lltvProv(chainCoords)}>
                <PanelFigure>{pct(ltvUsable.lltv)}</PanelFigure>
              </Prov>
              )
            </>
          ),
          tip: "The debt as a share of the most the collateral supports at the market's LLTV. At 100% the position can be liquidated.",
        });
        const hf = ltvUsable.healthFactor;
        if (hf != null && hf > 1) {
          right.push({
            id: "liquidation-drop",
            label: "Liquidates on a drop of",
            value: (
              <Prov info={capacityProv("Collateral price drop to liquidation", "1 − 1 ÷ health factor", chainCoords)}>
                {Math.round((1 - 1 / hf) * 100)}%
              </Prov>
            ),
            tip: `How far the ${collSym} price at the market's oracle can fall before the debt reaches the LLTV line and the position can be liquidated.`,
          });
        }
      }
    }
  }

  // The headlines' read-mores on a detail card.
  const HEAD_TIP = {
    collateral: `The ${collSym} supplied to this market as collateral. It earns no interest and backs the loan up to the market's LLTV.`,
    debt: `The ${v.loanSymbol} the position owes this market, including the interest accrued at the market's borrow rate.`,
  };
  const tipped = (h: PositionCardHead): PositionCardHead =>
    h.labelTip || !(h.label === CARD_VOCAB.collateral || h.label === CARD_VOCAB.debt)
      ? h
      : { ...h, labelTip: h.id === "debt" ? HEAD_TIP.debt : HEAD_TIP.collateral };
  const common = { status, heads: detail ? heads.map(tipped) : heads, identity, counters, outcome };
  if (!detail) return { ...common, surface: "listing", menu: null, tag: morphoCardTag(marketPair) };

  const menu: PositionCardMenu = {
    leading: () => (
      <MorphoMenuRows
        marketId={v.marketId}
        positionId={session === "morpho-base" ? undefined : v.positionId}
        pagePath={morphoPagePath(session, v)}
      />
    ),
    exports: exports ?? null,
  };
  const detailCommon = {
    ...common,
    surface: "detail" as const,
    explainer: { body: explanation ?? null, viewHref },
    learnMore,
    menu,
  };
  if (outcome) return { ...detailCommon, outcome };
  return { ...detailCommon, outcome: undefined, panel: [left, right] };
}

/** The Morpho position card: its slots, drawn by the shared card. */
export function MorphoPositionCard(props: MorphoPositionCardProps) {
  return <PositionCard slots={useMorphoCardSlots(props)} />;
}

/** Build a card view from a listing row (MorphoPositionSummary, the api builder's presentation shape). */
export function viewFromSummary(s: MorphoPositionSummary): MorphoPositionView {
  return {
    positionId: s.positionId,
    marketId: s.marketId,
    marketLabel: s.marketLabel,
    loanSymbol: s.loanSymbol,
    collateralSymbol: s.collateralSymbol,
    loanToken: s.loanToken,
    collateralToken: s.collateralToken,
    isIdle: s.isIdle,
    owner: s.owner,
    status: s.status,
    ...(s.loanDecimalsUnread ? { loanDecimalsUnread: true as const } : {}),
    ...(s.collateralDecimalsUnread ? { collateralDecimalsUnread: true as const } : {}),
    collateral: s.collateral.amount,
    borrowed: s.borrowed.amount,
    peakCollateral: s.peak.collateral,
    peakBorrowed: s.peak.borrowed,
    borrowSharesRaw: s.borrowSharesRaw,
    currentDebt: s.currentDebt,
    lltv: s.lltv,
    eventCount: s.activity.eventCount,
    txCount: s.activity.txCount,
    lastTs: s.activity.lastTs,
    everLiquidated: s.everLiquidated,
    badDebt: s.badDebt,
    listed: s.listed,
  };
}
