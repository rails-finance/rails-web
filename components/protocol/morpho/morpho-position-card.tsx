"use client";

// Morpho position card — the chain-state analog of the Aave / Maker position
// cards, through the SAME shared grammar (OpenPositionStats + StatValue) so it
// lines up with the other explorers.
//
// Headline values are read from the chain: collateral and the borrowed PRINCIPAL are
// sums of the events' own `assets` fields (replay). The current debt WITH
// accrued interest is the borrow shares through the live market index (chain
// reads both sides); on the detail page it is upgraded to the head-block read
// from the chain lane when that agrees with the index wei-exact.

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { WalletPill } from "@/components/shared/wallet-pill";
import { MorphoMarketPair } from "@/components/protocol/morpho/morpho-market-link";
import {
  positionCollateralProv,
  positionBorrowedProv,
  morphoCurrentDebtProv,
  morphoAccruedProv,
  morphoPeakCollateralProv,
  morphoPeakBorrowedProv,
} from "@/lib/morpho/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { CARD_VOCAB, notRecordedNote } from "@/lib/shared/card-vocab";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import type { MorphoCurrentDebt, MorphoListedRead, MorphoPositionSummary } from "@/lib/sources/api/morpho-positions";
import type { ListedMorphoReceipts } from "@/lib/morpho/listed-card-provenance";
import type { MorphoCoords } from "@/lib/morpho/event-provenance";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { morphoPositionContent, type MorphoPositionDeployment } from "@/lib/morpho/position-content";
import { morphoHasDebt } from "@/lib/morpho/position-legs";

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
  collateral: number;
  borrowed: number;
  /** Highest recorded collateral / borrowed principal over the life (closed cards). */
  peakCollateral: number;
  peakBorrowed: number;
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
  /** Activity-meta: event count, own-transaction count (DISTINCT txs excluding
   *  liquidation rows — what the chip's title claims), last-event unix seconds,
   *  ever-liquidated flag. */
  eventCount: number;
  txCount: number;
  lastTs: number | null;
  everLiquidated: boolean;
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
   *  straight through to the wallet pill. Undefined on Ethereum, always. */
  vaultOwner?: { name: string; href: string } | null;
}

// The card asks the same two questions the index filtered on, the same way —
// `lib/morpho/position-legs.ts` states them. It asked three different ones until
// 2026-09-20 (TO-DO §46): collateral at 1e-6 DISPLAY tokens, debt at 1e-6 on the
// principal in one branch and `> 0` on it in another, so a listed row read
// "Collateral only" where the replayed row read "Borrowing" on one position.

/** The peak columns' footnote where the lane replayed the position from a seed
 *  and so recorded balances but no running high (`peaksPartial`). One sentence,
 *  the vocabulary's own (lib/shared/card-vocab.ts) — the same one the listing
 *  row shows for the same absence. */
function PeakNotRecorded() {
  return <div className="text-xs mt-0.5 text-rb-500">{notRecordedNote("wallet")}</div>;
}

export function MorphoPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  session = "morpho",
  listedReceipts,
}: {
  v: MorphoPositionView;
  receipts?: boolean;
  /** The receipts a LISTED row's figures cite (lib/morpho/listed-card-
   *  provenance.ts) — required alongside `v.listed` for the listed render;
   *  without it the card falls back to the replay grammar. */
  listedReceipts?: ListedMorphoReceipts;
  /** The explorer the wallet pill's filter link and bookmark belong to —
   *  the Ethereum listing by default; the Base page passes its own. */
  session?: SessionProtocol;
  /** Context content riding the shell's heading-button row (the detail page
   *  passes the compact liquidation runway). */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (the V4/trove "About this position" home) —
   *  narration bullets + the risk strips describing the position NOW. */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
}) {
  // The chain and the capture lane are route facts: on a Base page the
  // receipts must name the sweep and link to Basescan, not the index and
  // Etherscan. Read from context, as the event cards do.
  const coords: MorphoCoords = { marketId: v.marketId, chainId: useChainId(), source: useCaptureSource() };
  const hasColl = v.collateral > 0;
  const collSym = v.collateralSymbol ?? "—";
  // The "?" cell every state panel owns — the same content function serves
  // Morpho on Ethereum and Morpho Blue on Base; only the deployment named by
  // the card's own session changes the prose.
  const positionDeployment: MorphoPositionDeployment = session === "morpho-base" ? "morpho-base" : "morpho";

  const leadingIdentity = (
    <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
      <WalletPill
        wallet={v.owner}
        ensName={null}
        filterProtocol={session}
        bookmarkProtocol={session}
        vault={v.vaultOwner}
      />
      <span>
        <MorphoMarketPair label={v.marketLabel} marketId={v.marketId} loanToken={v.loanToken} />
        {v.lltv > 0 && <span className="ml-2 text-rb-400">LLTV {(v.lltv * 100).toFixed(1)}%</span>}
      </span>
    </span>
  );

  // A LISTED row: the Base listing's chain read of the slots at one block. No
  // history stands behind it, so the closed card says the peaks are not
  // recorded here, and the open card shows the debt as one figure (interest
  // included — there is no principal for a split to stand above). No health
  // column: a listing exists to find a position, and risk is read live on
  // the position page (rails-ops decision 0018).
  if (v.listed && listedReceipts) {
    const L = v.listed;
    const R = listedReceipts;
    if (v.status === "closed" || v.status === "liquidated") {
      const note = <div className="text-xs mt-0.5 text-rb-500">{notRecordedNote("wallet")}</div>;
      return (
        <PositionCardShell
          receipts={receipts}
          explanation={explanation}
          viewHref={viewHref}
          learnMore={morphoPositionContent({ status: v.status, deployment: positionDeployment })}
        >
          <ClosedPositionStats
            outcome={v.status}
            leadingIdentity={leadingIdentity}
            identity={
              <PositionCardMeta lastActivityAt={v.lastTs} eventCount={v.txCount} liquidated={v.everLiquidated} />
            }
            closedAt={v.lastTs ?? undefined}
            collateral={
              <StatValue>
                <Prov info={R.notRecorded(`The highest ${collSym} collateral this position ever held`)}>
                  <StatDash />
                </Prov>
              </StatValue>
            }
            debt={
              <StatValue>
                <Prov info={R.notRecorded(`The highest ${v.loanSymbol} debt this position ever owed`)}>
                  <StatDash />
                </Prov>
              </StatValue>
            }
            collateralFootnote={note}
            debtFootnote={note}
          />
        </PositionCardShell>
      );
    }
    const hasDebt = morphoHasDebt(v.borrowSharesRaw);
    return (
      <PositionCardShell
        receipts={receipts}
        rowExtra={rowExtra}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={morphoPositionContent({ status: v.status, deployment: positionDeployment, hasDebt })}
      >
        <OpenPositionStats
          statusPill={
            receipts ? (
              <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
                {hasDebt ? "Borrowing" : "Collateral only"}
              </span>
            ) : (
              <LifecyclePill status={v.status} />
            )
          }
          leadingIdentity={leadingIdentity}
          identity={<PositionCardMeta lastActivityAt={v.lastTs} eventCount={v.txCount} liquidated={v.everLiquidated} />}
          columns={[
            {
              label: CARD_VOCAB.collateral,
              value: hasColl ? (
                <StatValue>
                  <Prov info={R.collateral(collSym, L.block)}>
                    <AssetAmount value={v.collateral} symbol={collSym} address={v.collateralToken} />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
              footnote:
                hasColl && L.collateralValue != null ? (
                  <StatFootnote>
                    <Prov info={R.collateralValue(collSym, v.loanSymbol, L.block)}>
                      worth {formatNumber(L.collateralValue)} {v.loanSymbol} at the market&rsquo;s oracle
                    </Prov>
                  </StatFootnote>
                ) : hasColl ? (
                  <StatFootnote>the market&rsquo;s oracle gave no price at that block</StatFootnote>
                ) : undefined,
            },
            {
              label: CARD_VOCAB.debt,
              value: hasDebt ? (
                <StatValue>
                  <Prov
                    info={R.debt(
                      v.loanSymbol,
                      formatNumber(Number(v.borrowSharesRaw)),
                      L.totalBorrowAssets ?? "—",
                      L.totalBorrowShares ?? "—",
                      L.block,
                    )}
                  >
                    <AssetAmount value={v.borrowed} symbol={v.loanSymbol} address={v.loanToken} />
                  </Prov>
                </StatValue>
              ) : (
                <StatDash />
              ),
              footnote: hasDebt ? (
                <StatFootnote>interest included, to block {L.block.toLocaleString("en-US")}</StatFootnote>
              ) : undefined,
            },
          ]}
        />
      </PositionCardShell>
    );
  }

  // Closed / liquidated: collateral and borrowed have unwound to 0, so the headline
  // is what the position held at its height — highest recorded collateral + borrowed
  // PRINCIPAL (chain-state MAX over its life; token amounts only, no interest/USD).
  // The shell threads explanation exactly like the open branch — a terminal
  // record narrates from the replay — but never rowExtra: the live risk strip
  // describes the chain NOW and never rides a past life's card.
  if (v.status === "closed" || v.status === "liquidated") {
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={morphoPositionContent({ status: v.status, deployment: positionDeployment })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={
            <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
              <WalletPill
                wallet={v.owner}
                ensName={null}
                filterProtocol={session}
                bookmarkProtocol={session}
                vault={v.vaultOwner}
              />
              <span>
                <MorphoMarketPair label={v.marketLabel} marketId={v.marketId} loanToken={v.loanToken} />
                {v.lltv > 0 && <span className="ml-2 text-rb-400">LLTV {(v.lltv * 100).toFixed(1)}%</span>}
              </span>
            </span>
          }
          identity={<PositionCardMeta lastActivityAt={v.lastTs} eventCount={v.txCount} liquidated={v.everLiquidated} />}
          closedAt={v.lastTs ?? undefined}
          collateral={
            v.peaksPartial ? (
              <StatDash />
            ) : v.peakCollateral > 0 ? (
              <StatValue>
                <Prov info={morphoPeakCollateralProv(collSym, coords)}>
                  <AssetAmount value={v.peakCollateral} symbol={collSym} address={v.collateralToken} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
          collateralFootnote={v.peaksPartial ? <PeakNotRecorded /> : undefined}
          debtLabel={CARD_VOCAB.peakDebt}
          debtFootnote={
            v.peaksPartial ? (
              <PeakNotRecorded />
            ) : v.peakBorrowed > 0 ? (
              <div className="text-xs mt-0.5 text-rb-500">principal only — accrued interest not included</div>
            ) : undefined
          }
          debt={
            v.peaksPartial ? (
              <StatDash />
            ) : v.peakBorrowed > 0 ? (
              <StatValue>
                <Prov info={morphoPeakBorrowedProv(v.loanSymbol, coords)}>
                  <AssetAmount value={v.peakBorrowed} symbol={v.loanSymbol} address={v.loanToken} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            )
          }
        />
      </PositionCardShell>
    );
  }

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={morphoPositionContent({
        status: v.status,
        deployment: positionDeployment,
        hasDebt: morphoHasDebt(v.borrowSharesRaw),
      })}
    >
      <OpenPositionStats
        // Detail render (receipts): the V4 spoke-card header grammar — a
        // neutral mode-word pill (what the position is doing NOW, not a
        // lifecycle word) plus the wallet pill (facehash + copyable address).
        // The LISTING render keeps the lifecycle pill.
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {morphoHasDebt(v.borrowSharesRaw) ? "Borrowing" : "Collateral only"}
            </span>
          ) : (
            <LifecyclePill status={v.status} />
          )
        }
        // The wallet pill (facehash + copy + bookmark) leads; market pair + LLTV
        // ride alongside on both surfaces, the pair opening the market's own
        // page (buttons, not anchors, so both live safely inside the listing
        // card's <Link>).
        leadingIdentity={
          <span className="flex items-center gap-2 text-xs font-semibold text-rb-500">
            <WalletPill
              wallet={v.owner}
              ensName={null}
              filterProtocol={session}
              bookmarkProtocol={session}
              vault={v.vaultOwner}
            />
            <span>
              <MorphoMarketPair label={v.marketLabel} marketId={v.marketId} loanToken={v.loanToken} />
              {v.lltv > 0 && <span className="ml-2 text-rb-400">LLTV {(v.lltv * 100).toFixed(1)}%</span>}
            </span>
          </span>
        }
        // Right-hand activity-meta cluster: time-ago, event count, and the
        // liquidation flag (Morpho carries a boolean, not a count).
        identity={<PositionCardMeta lastActivityAt={v.lastTs} eventCount={v.txCount} liquidated={v.everLiquidated} />}
        columns={[
          {
            label: CARD_VOCAB.collateral,
            value: hasColl ? (
              <StatValue>
                <Prov info={positionCollateralProv(collSym, v.atBlock, coords)}>
                  <AssetAmount value={v.collateral} symbol={collSym} address={v.collateralToken} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            ),
          },
          {
            label: CARD_VOCAB.debt,
            value: (
              <StatValue>
                <Prov info={positionBorrowedProv(v.loanSymbol, v.atBlock, coords)}>
                  <AssetAmount value={v.borrowed} symbol={v.loanSymbol} address={v.loanToken} />
                </Prov>
              </StatValue>
            ),
            footnote: <StatFootnote>principal (ex-interest)</StatFootnote>,
          },
          {
            label: "Current debt",
            value: v.currentDebt ? (
              <StatValue>
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
                  <AssetAmount value={v.currentDebt.amount} symbol={v.loanSymbol} address={v.loanToken} />
                </Prov>
              </StatValue>
            ) : (
              <StatDash />
            ),
            footnote: v.currentDebt ? (
              <StatFootnote>
                <Prov info={morphoAccruedProv(v.loanSymbol)}>+{formatNumber(v.currentDebt.accruedAmount)} accrued</Prov>
                {v.currentDebt.index?.stale && (
                  <div>
                    interest to {formatDate(v.currentDebt.index.readAt)} (block{" "}
                    {v.currentDebt.index.block.toLocaleString("en-US")})
                  </div>
                )}
              </StatFootnote>
            ) : undefined,
          },
        ]}
      />
    </PositionCardShell>
  );
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
