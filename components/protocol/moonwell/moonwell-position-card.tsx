"use client";

// Moonwell position card — the Compound-v2-family analog of the Spark /
// Compound position cards, through the SAME shared grammar (OpenPositionStats +
// StatValue) so it lines up with the other explorers.
//
// A Moonwell account is cross-collateralised through the Comptroller: one
// wallet supplies and borrows across the four mToken markets. The two sides
// carry DIFFERENT bases, and the provenance names each: supply is the exact
// mToken balance (slot-verified Transfer replay) × the market's exchange rate
// when the chain read landed — balanceOfUnderlying, interest included — else
// the replayed deposit principal; debt is the emitted accountBorrows at the
// last borrow/repay event, UPGRADED to the live borrowBalanceStored on the
// detail page when its chain lane lands (each borrow row's `live` flag names
// the basis). The health layer (runway / capacity / verdict) rides the detail
// page's live Comptroller read — the listing card still asserts no health
// column (the listing snapshot carries none).

import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { useMoonwellDeployment } from "@/lib/moonwell/deployment-context";
import { moonwellPositionContent, type MoonwellPositionDeployment } from "@/lib/moonwell/position-content";
import type { MoonwellCardCaptions } from "@/lib/moonwell/economics";
import { formatUsd } from "@/lib/shared/format-event";
import { CARD_VOCAB, notRecordedNote } from "@/lib/shared/card-vocab";
import { LifecyclePill, UsdHeadline } from "@/components/shared/position-card-pills";
import {
  useReserveDisclosure,
  ReserveDisclosureToggle,
  ReserveDisclosureList,
} from "@/components/shared/reserve-disclosure";
import type {
  MoonwellPositionSummary,
  MoonwellSupplyAmount,
  MoonwellBorrowAmount,
  MoonwellPeakAmount,
} from "@/lib/sources/api/moonwell-positions";
import { ExactSpan } from "@/components/shared/amount-text";
import { TipLabel } from "@/components/shared/tip-label";
import { PositionCardDetail, riskColumns, type CardRiskColumn } from "@/components/shared/position-card-disclosure";
import { ShareLine, ShareLines } from "@/components/shared/share-bar";
import type { LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";
import { splitDust, useDustLines } from "@/components/shared/dust-reserves";

export interface MoonwellPositionView {
  wallet: string;
  /** "unread" is a listing row whose account has not been read from the
   *  chain yet — no state recorded, never mapped to "closed" (0018). */
  status: "open" | "closed" | "liquidated" | "unread";
  supplies: MoonwellSupplyAmount[];
  borrows: MoonwellBorrowAmount[];
  /** Highest recorded per-market supply / debt (closed/liquidated cards). */
  peakSupplies: MoonwellPeakAmount[];
  peakBorrows: MoonwellPeakAmount[];
  liquidationCount: number;
  /** Non-liquidation transaction count (activity-meta). */
  txCount: number;
  /** Unix seconds of the most recent event (activity-meta). */
  lastActivityAt: number;
  /** On-chain oracle USD (getUnderlyingPrice, chain-derived) per market's
   *  underlying, keyed by lowercased token address. Feeds the card's USD
   *  footnotes; a market the oracle didn't price is simply absent. */
  priceByAddress?: Record<string, number>;
  /** Annualized per-timestamp rates per market key (from the same multicall). */
  ratesByMarket?: Record<string, { borrowApr: number | null; supplyApr: number | null }>;
  /** Each liquidation as the rows tell it, where the page holds them. */
  liquidations?: LiquidationStory[];
  /** Every row of the history, beside the transaction count (the detail page). */
  eventTotal?: number;
  /** The markets the account has entered as collateral (Comptroller
   *  getAssetsIn at head), each with its live collateral factor. Absent where
   *  no chain read stands behind the card (the listing). */
  entered?: { underlying: string; symbol: string; collateralFactor: number }[];
}

/** The figure a supply line asserts: the current value (interest included)
 *  when the chain read landed, the replayed principal otherwise. */
const supplyAmount = (r: MoonwellSupplyAmount): number => r.current ?? r.principal;

/** On-chain oracle USD for one line; null when Moonwell didn't price it. */
function lineUsd(v: MoonwellPositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Each line's oracle USD for the dust rule (components/shared/dust-reserves);
 *  null (held) where the oracle didn't price it. */
const supplyLineUsd = (v: MoonwellPositionView) => (r: MoonwellPositionView["supplies"][number]) =>
  lineUsd(v, r.address, supplyAmount(r));
const borrowLineUsd = (v: MoonwellPositionView) => (r: MoonwellPositionView["borrows"][number]) =>
  lineUsd(v, r.address, r.amount);

/** Total USD across one side, with the STRICT guard: null the moment any
 *  contributing market is unpriced, so a partial total is never asserted (it
 *  degrades to no headline). */
function totalUsd(v: MoonwellPositionView, lines: { address: string; amount: number }[]): number | null {
  let sum = 0;
  let any = false;
  for (const l of lines) {
    if (l.amount <= 0) continue;
    const u = lineUsd(v, l.address, l.amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

/** The receipts behind each supply / debt line, and the market's receipt-token
 *  label — all resolved through the surrounding page's deployment, so a Base
 *  row never cites Ethereum's catalog or index (Ethereum's is the default). */
function useLineReceipts() {
  const dep = useMoonwellDeployment();
  return {
    supplyProv: (r: MoonwellSupplyAmount) => dep.card.supply(r, dep.market(r.market, r.symbol)),
    /** Debt-line provenance: the live borrowBalanceStored lane when the detail
     *  page's chain read upgraded this row, the emitted-accountBorrows lane
     *  otherwise. */
    borrowProv: (r: MoonwellBorrowAmount) => dep.card.debt(r, dep.market(r.market, r.symbol)),
    mSymbolOf: (r: MoonwellSupplyAmount) => dep.market(r.market, r.symbol).mSymbol,
  };
}

/** Per-market token amounts, demoted beneath the USD headline — still the
 *  strict chain reads (each line traced, exact figure on hover). The exact hover
 *  figure is the lane the line's provenance asserts: the raw mToken balance on
 *  a current-value line, the raw principal on a principal line. */
function SupplyFootnoteLines({ v, total }: { v: MoonwellPositionView; total?: number }) {
  const { supplyProv, mSymbolOf } = useLineReceipts();
  const usdOf = supplyLineUsd(v);
  const { lines, control } = useDustLines(v.supplies, usdOf);
  if (v.supplies.length === 0) return null;
  return (
    <ShareLines total={total} control={control}>
      {lines.map((r) => {
        const exact =
          r.current != null ? `${formatUnitsExact(r.mTokensRaw, 8)} ${mSymbolOf(r)}` : `${r.principal} ${r.symbol}`;
        return (
          <ShareLine key={r.address} share={total ? (usdOf(r) ?? 0) / total : null} side="collateral">
            <Prov info={supplyProv(r)}>
              <ExactSpan exact={exact} symbol={r.symbol}>
                {formatCompact(supplyAmount(r))} {r.symbol}
              </ExactSpan>
            </Prov>
          </ShareLine>
        );
      })}
    </ShareLines>
  );
}

function BorrowFootnoteLines({ v, total }: { v: MoonwellPositionView; total?: number }) {
  const { borrowProv } = useLineReceipts();
  const usdOf = borrowLineUsd(v);
  const { lines, control } = useDustLines(v.borrows, usdOf);
  if (v.borrows.length === 0) return null;
  return (
    <ShareLines total={total} control={control}>
      {lines.map((r) => {
        const exact = formatUnitsExact(r.amountRaw, r.decimals);
        return (
          <ShareLine key={r.address} share={total ? (usdOf(r) ?? 0) / total : null} side="debt">
            <Prov info={borrowProv(r)}>
              <ExactSpan exact={exact} symbol={r.symbol}>
                {formatCompact(r.amount)} {r.symbol}
              </ExactSpan>
            </Prov>
          </ShareLine>
        );
      })}
    </ShareLines>
  );
}

/** "X% borrow rate" — the live per-timestamp rate on the single borrowed
 *  market, or the debt-USD-weighted average across several. */
function BorrowRateCaption({ rate }: { rate: MoonwellCardCaptions["borrowRate"] | undefined }) {
  const dep = useMoonwellDeployment();
  if (!rate) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      <Prov info={rate.avg ? dep.card.avgBorrowRate() : dep.card.borrowRate(rate.symbol)}>{rate.pct.toFixed(2)}%</Prov>{" "}
      {rate.avg ? "avg borrow rate" : "borrow rate"}
    </div>
  );
}

/** A vertical stack of the wallet's supplied markets, each traced. */
function SupplyStack({ v }: { v: MoonwellPositionView }) {
  const { supplyProv, mSymbolOf } = useLineReceipts();
  const { lines, control } = useDustLines(v.supplies, supplyLineUsd(v));
  if (v.supplies.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((r) => (
        <StatValue key={r.address}>
          <Prov info={supplyProv(r)}>
            <AssetAmount
              value={supplyAmount(r)}
              symbol={r.symbol}
              exact={r.current != null ? `${formatUnitsExact(r.mTokensRaw, 8)} ${mSymbolOf(r)}` : String(r.principal)}
            />
          </Prov>
        </StatValue>
      ))}
      {control}
    </div>
  );
}

function BorrowStack({ v }: { v: MoonwellPositionView }) {
  const { borrowProv } = useLineReceipts();
  const { lines, control } = useDustLines(v.borrows, borrowLineUsd(v));
  if (v.borrows.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((r) => (
        <StatValue key={r.address}>
          <Prov info={borrowProv(r)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
      {control}
    </div>
  );
}

/** A vertical stack of per-market PEAK amounts (highest recorded), each traced
 *  to its own lane's maximum (the supply balance at a row on supply, emitted
 *  accountBorrows on debt); no USD — the token amount only. */
function PeakStack({ lines, side }: { lines: MoonwellPeakAmount[]; side: "supply" | "debt" }) {
  const dep = useMoonwellDeployment();
  if (lines.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((r) => (
        <StatValue key={r.address}>
          <Prov info={side === "supply" ? dep.card.peakSupply(r.symbol) : dep.card.peakDebt(r.symbol)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

const NOT_COLLATERAL_TIP =
  "Supplied and earning the supply rate, but not entered as collateral (the Comptroller's market membership, read now), so it backs no borrowing. A liquidation can still seize it.";

/** Whether a line's market is entered as collateral; true where membership
 *  is unknown, so nothing is split without a read behind it. */
const isEntered = (v: MoonwellPositionView, address: string) =>
  !v.entered || v.entered.some((e) => e.underlying === address.toLowerCase());

/** "Collateral factor WETH 84% · USDC 88%": the entered markets the card
 *  lists, each at the factor the Comptroller applies to it now. */
function FactorCaption({ v, addresses }: { v: MoonwellPositionView; addresses: string[] }) {
  const rows = (v.entered ?? []).filter((e) => addresses.some((a) => a.toLowerCase() === e.underlying));
  if (rows.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500" data-moonwell-collateral-factors="">
      <TipLabel
        text={rows.length > 1 ? "collateral factors" : "collateral factor"}
        tip="The share of each entered market's value that counts toward the borrow limit, as the Comptroller sets it now."
      />{" "}
      {rows.map((e, i) => (
        <span key={e.underlying}>
          {i > 0 ? " · " : ""}
          {e.symbol} {+(e.collateralFactor * 100).toFixed(1)}%
        </span>
      ))}
    </div>
  );
}

function NotCollateralBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2" data-moonwell-not-collateral="">
      <div className="text-rb-500 text-xs font-semibold">
        <TipLabel text="Supplied, not collateral" tip={NOT_COLLATERAL_TIP} />
      </div>
      {children}
    </div>
  );
}

export function MoonwellPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
  peaks = true,
  disclosureKey,
  risk,
  debtDetail,
}: {
  v: MoonwellPositionView;
  /** Opt in to the closed/opened card (ui-jobs 209), keyed per position —
   *  forwarded to `PositionCardShell`. */
  disclosureKey?: string;
  /** The risk headline from the page's Comptroller read, with its opened
   *  layer (moonwellRiskColumn). */
  risk?: CardRiskColumn | null;
  /** Opened-layer lines under Debt from the same read (the room to borrow). */
  debtDetail?: React.ReactNode;
  receipts?: boolean;
  /** Whether the row carries highest-recorded amounts (the index's replay and
   *  a whole sweep do; the Base listing, a chain read at a block with no
   *  replay behind it, does not — its closed cards say so instead of showing
   *  a dash as if nothing was ever held). */
  peaks?: boolean;
  /** Context content riding the shell's heading-button row. */
  rowExtra?: React.ReactNode;
  /** The card's Explanation section (narration describing the position NOW). */
  explanation?: React.ReactNode;
  /** Copy-this-view control, forwarded straight through to `PositionCardShell`
   *  — the page's `useTimelineEvents().viewHref`. */
  viewHref?: () => string;
  /** Detail-page stat captions (accrued interest, borrow rate) — computed from
   *  the event stream + the per-market chain read (computeMoonwellCardCaptions).
   *  Listing cards omit them. */
  captions?: MoonwellCardCaptions;
}) {
  // The page's deployment — the session the wallet pill filters and bookmarks
  // under (so a Base wallet never lands in Ethereum's bookmarks) and the USD
  // headline's receipts.
  const dep = useMoonwellDeployment();
  const session = dep.session;
  // The "?" cell every state panel owns — the same content function serves
  // Moonwell on Ethereum and on Base; only the deployment named by the
  // card's own session changes the prose (roster size, separate-deployment note).
  const positionDeployment: MoonwellPositionDeployment = session === "moonwell-base" ? "base" : "ethereum";
  // The collateral column holds the entered markets; a supply the account
  // never entered is shown apart ("Supplied, not collateral").
  const vc: MoonwellPositionView = { ...v, supplies: v.supplies.filter((r) => isEntered(v, r.address)) };
  const vo: MoonwellPositionView = { ...v, supplies: v.supplies.filter((r) => !isEntered(v, r.address)) };
  const collUsd = totalUsd(
    vc,
    vc.supplies.map((r) => ({ address: r.address, amount: supplyAmount(r) })),
  );
  const otherUsd = totalUsd(
    vo,
    vo.supplies.map((r) => ({ address: r.address, amount: supplyAmount(r) })),
  );
  const debtUsd = totalUsd(v, v.borrows);
  // `receipts` is the render-site switch (listing defaults false; only the
  // detail page passes it) — computed here (not just below) because the
  // reserve-list disclosure hooks must run on every render, before the
  // closed/liquidated early return. A priced side's list only exists on the
  // detail page (the footnote lines); an unpriced side's list is the
  // headline itself and collapses on every surface.
  const isDetail = receipts;
  // The closed/opened card (ui-jobs 209): the per-side market chevrons give
  // way to the card's one header chevron, and every line under a headline
  // moves into the opened layer (<PositionCardDetail>).
  const disclosing = receipts && !!disclosureKey;
  // Dust lines (under a cent) leave the icon stack, its "+N" and the list
  // count; the lines put them behind the "N dust reserves hidden" control.
  const suppliesShown = splitDust(vc.supplies, supplyLineUsd(v)).shown;
  const borrowsShown = splitDust(v.borrows, borrowLineUsd(v)).shown;
  const supplyListCount = collUsd == null ? suppliesShown.length : isDetail ? suppliesShown.length : 0;
  const debtListCount = debtUsd == null ? borrowsShown.length : isDetail ? borrowsShown.length : 0;
  const supplyDisclosure = useReserveDisclosure(supplyListCount);
  const debtDisclosure = useReserveDisclosure(debtListCount);

  // Closed / liquidated: the wallet holds no open markets, so the headline is
  // what each asset held at its height — highest recorded per-market supply +
  // debt (replayed MAX over the wallet's life, per asset; no USD).
  if (v.status === "closed" || v.status === "liquidated") {
    const noPeaksNote = !peaks ? (
      <div className="text-xs mt-0.5 text-rb-500">{notRecordedNote("position")}</div>
    ) : undefined;
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={moonwellPositionContent({
          status: v.status,
          deployment: positionDeployment,
          liquidations: v.liquidations,
          liquidationCount: v.liquidationCount,
        })}
        disclosureKey={disclosureKey}
      >
        <ClosedPositionStats
          // A disclosing card's closed layer is the header and the outcome;
          // the highest recorded balances are its opened layer.
          detailGate={disclosing ? PositionCardDetail : undefined}
          outcome={v.status}
          leadingIdentity={
            receipts ? undefined : (
              <WalletPill wallet={v.wallet} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
            )
          }
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              eventTotal={v.eventTotal}
              countNote={txCountNote(v.liquidationCount)}
              liquidationCount={v.liquidationCount}
            />
          }
          closedAt={v.lastActivityAt}
          outcomeDates={outcomeDates(v)}
          collateral={<PeakStack lines={v.peakSupplies.filter((r) => isEntered(v, r.address))} side="supply" />}
          debt={<PeakStack lines={v.peakBorrows} side="debt" />}
          collateralFootnote={
            noPeaksNote ??
            (receipts ? (
              <>
                <FactorCaption
                  v={v}
                  addresses={v.peakSupplies.filter((r) => isEntered(v, r.address)).map((r) => r.address)}
                />
                {v.peakSupplies.some((r) => !isEntered(v, r.address)) && (
                  <NotCollateralBlock>
                    <PeakStack lines={v.peakSupplies.filter((r) => !isEntered(v, r.address))} side="supply" />
                  </NotCollateralBlock>
                )}
              </>
            ) : undefined)
          }
          debtFootnote={noPeaksNote}
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): a neutral mode-word pill (what the account is
  // doing NOW), plus the wallet pill. The LISTING render keeps the lifecycle
  // pill; the wallet pill (facehash + copy + bookmark) renders on both surfaces.
  const modeWord = v.borrows.length > 0 ? "Borrowing" : "Supply only";
  // Supplied but never entered as collateral: listed apart beneath Collateral
  // (in the opened layer on a disclosing card).
  const notCollateral =
    vo.supplies.length > 0 ? (
      <NotCollateralBlock>
        {otherUsd != null ? (
          <>
            <div className="text-sm font-semibold tabular-nums">
              <Prov info={dep.card.usd("Supplied, not collateral")}>{formatUsd(otherUsd)}</Prov>
            </div>
            {isDetail && <SupplyFootnoteLines v={vo} />}
          </>
        ) : (
          <SupplyStack v={vo} />
        )}
      </NotCollateralBlock>
    ) : null;
  // `isDetail` (== `receipts`) doubles as the surface discriminator: the
  // listing omits the per-leg lines (V4 spoke-card parity — USD headline +
  // capped cluster only), the detail page keeps the full traced list.

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={moonwellPositionContent({
        status: v.status,
        deployment: positionDeployment,
        hasDebt: v.borrows.length > 0,
      })}
      disclosureKey={disclosureKey}
    >
      <OpenPositionStats
        stackOnPhone={disclosing}
        statusPill={
          receipts ? (
            <span className="font-bold px-2 py-0.5 rounded-sm text-xs bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60">
              {modeWord}
            </span>
          ) : (
            <LifecyclePill status={v.status} />
          )
        }
        leadingIdentity={
          receipts ? undefined : (
            <WalletPill wallet={v.wallet} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
          )
        }
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            eventTotal={v.eventTotal}
            countNote={txCountNote(v.liquidationCount)}
            liquidationCount={v.liquidationCount}
          />
        }
        columns={[
          // ONE oracle-USD figure leads each side (the asset cluster carries
          // the identities), the per-market token amounts demote to traced
          // footnote lines. When any contributing market is unpriced the token
          // stack stays the headline — a partial USD total is never asserted.
          {
            label: CARD_VOCAB.collateral,
            assetIcons:
              vc.supplies.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <InlineAssetCluster symbols={suppliesShown.map((r) => r.symbol)} />
                  {disclosing ? null : (
                    <ReserveDisclosureToggle disclosure={supplyDisclosure} count={suppliesShown.length} />
                  )}
                </span>
              ) : undefined,
            value:
              collUsd != null ? (
                <UsdHeadline usd={collUsd} info={dep.card.usd("Collateral")} />
              ) : supplyDisclosure.collapsible && !disclosing ? null : (
                <SupplyStack v={vc} />
              ),
            footnote: disclosing ? (
              <PositionCardDetail>
                {collUsd != null && <SupplyFootnoteLines v={vc} total={collUsd} />}
                <FactorCaption v={v} addresses={vc.supplies.map((r) => r.address)} />
                {notCollateral}
              </PositionCardDetail>
            ) : (
              <>
                {collUsd == null && supplyDisclosure.collapsible && (
                  <ReserveDisclosureList disclosure={supplyDisclosure}>
                    <SupplyStack v={vc} />
                  </ReserveDisclosureList>
                )}
                {isDetail && collUsd != null && (
                  <ReserveDisclosureList disclosure={supplyDisclosure}>
                    <SupplyFootnoteLines v={vc} />
                  </ReserveDisclosureList>
                )}
                {isDetail && <FactorCaption v={v} addresses={vc.supplies.map((r) => r.address)} />}
                {notCollateral}
              </>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            assetIcons:
              v.borrows.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <InlineAssetCluster symbols={borrowsShown.map((r) => r.symbol)} />
                  {disclosing ? null : (
                    <ReserveDisclosureToggle disclosure={debtDisclosure} count={borrowsShown.length} />
                  )}
                </span>
              ) : undefined,
            value:
              debtUsd != null ? (
                <UsdHeadline usd={debtUsd} info={dep.card.usd("Borrowed")} />
              ) : debtDisclosure.collapsible && !disclosing ? null : (
                <BorrowStack v={v} />
              ),
            footnote: disclosing ? (
              <PositionCardDetail>
                {debtUsd != null && <BorrowFootnoteLines v={v} total={debtUsd} />}
                <BorrowRateCaption rate={captions?.borrowRate} />
                {debtDetail}
              </PositionCardDetail>
            ) : (
              <>
                {debtUsd == null && debtDisclosure.collapsible && (
                  <ReserveDisclosureList disclosure={debtDisclosure}>
                    <BorrowStack v={v} />
                  </ReserveDisclosureList>
                )}
                {isDetail && debtUsd != null && (
                  <ReserveDisclosureList disclosure={debtDisclosure}>
                    <BorrowFootnoteLines v={v} />
                  </ReserveDisclosureList>
                )}
                <BorrowRateCaption rate={captions?.borrowRate} />
              </>
            ),
          },
          // The health factor rides the detail page's live Comptroller read
          // (moonwellRiskColumn); the listing snapshot carries none, so a
          // listing card asserts no risk column (never dashed, never staled).
          ...riskColumns(risk, disclosing),
        ]}
      />
    </PositionCardShell>
  );
}

/** Why the transaction count and the event count differ. */
const txCountNote = (liquidations: number) =>
  liquidations > 0
    ? "the count leaves out each liquidation, which is the liquidator's transaction, and one transaction can hold several rows (a liquidation and its seizure, or a repayment and a withdrawal)"
    : "one transaction can hold several rows (a repayment and a withdrawal)";

/** A liquidated card's two dates: the last liquidation, then the closing,
 *  when they fall on different days. */
function outcomeDates(v: MoonwellPositionView): { label: string; at: number }[] | undefined {
  const last = v.liquidations?.at(-1)?.at;
  if (v.status !== "liquidated" || last == null) return undefined;
  if (Math.floor(last / 86400) === Math.floor(v.lastActivityAt / 86400)) return undefined;
  return [
    { label: "Liquidated", at: last },
    { label: "Closed", at: v.lastActivityAt },
  ];
}

/** Build a card view from the listing summary row. */
export function viewFromSummary(s: MoonwellPositionSummary): MoonwellPositionView {
  return {
    wallet: s.wallet,
    status: s.status,
    supplies: s.supplies,
    borrows: s.borrows,
    peakSupplies: s.peakSupplies,
    peakBorrows: s.peakBorrows,
    liquidationCount: s.liquidationCount,
    txCount: s.txCount,
    lastActivityAt: s.lastActivityAt,
    priceByAddress: s.priceByAddress,
    ratesByMarket: s.ratesByMarket,
  };
}
