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
}

/** The figure a supply line asserts: the current value (interest included)
 *  when the chain read landed, the replayed principal otherwise. */
const supplyAmount = (r: MoonwellSupplyAmount): number => r.current ?? r.principal;

/** On-chain oracle USD for one line; null when Moonwell didn't price it. */
function lineUsd(v: MoonwellPositionView, address: string, amount: number): number | null {
  const p = v.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

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
function SupplyFootnoteLines({ v }: { v: MoonwellPositionView }) {
  const { supplyProv, mSymbolOf } = useLineReceipts();
  if (v.supplies.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {v.supplies.map((r) => {
        const exact =
          r.current != null ? `${formatUnitsExact(r.mTokensRaw, 8)} ${mSymbolOf(r)}` : `${r.principal} ${r.symbol}`;
        return (
          <div key={r.address}>
            <Prov info={supplyProv(r)}>
              <span title={exact} data-prov-exact={exact} data-prov-symbol={r.symbol}>
                {formatCompact(supplyAmount(r))} {r.symbol}
              </span>
            </Prov>
          </div>
        );
      })}
    </div>
  );
}

function BorrowFootnoteLines({ v }: { v: MoonwellPositionView }) {
  const { borrowProv } = useLineReceipts();
  if (v.borrows.length === 0) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
      {v.borrows.map((r) => {
        const exact = formatUnitsExact(r.amountRaw, r.decimals);
        return (
          <div key={r.address}>
            <Prov info={borrowProv(r)}>
              <span title={`${exact} ${r.symbol}`} data-prov-exact={exact} data-prov-symbol={r.symbol}>
                {formatCompact(r.amount)} {r.symbol}
              </span>
            </Prov>
          </div>
        );
      })}
    </div>
  );
}

/** "incl. $X interest" — accrued interest already included in the column's
 *  figure above (it grew it), computed with the strict attribution gates
 *  (computeMoonwellCardCaptions). Hidden below a cent. */
function InterestCaption({
  side,
  usd,
  live,
}: {
  side: "supply" | "debt";
  usd: number | null | undefined;
  /** Debt side only: the current figure is the live borrowBalanceStored. */
  live?: boolean;
}) {
  const dep = useMoonwellDeployment();
  if (usd == null || usd < 0.01) return null;
  return (
    <div className="text-xs mt-0.5 text-rb-500">
      incl. <Prov info={dep.card.interest(side, live)}>{formatUsd(usd)}</Prov> interest
    </div>
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
  if (v.supplies.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {v.supplies.map((r) => (
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
    </div>
  );
}

function BorrowStack({ v }: { v: MoonwellPositionView }) {
  const { borrowProv } = useLineReceipts();
  if (v.borrows.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {v.borrows.map((r) => (
        <StatValue key={r.address}>
          <Prov info={borrowProv(r)}>
            <AssetAmount value={r.amount} symbol={r.symbol} exact={formatUnitsExact(r.amountRaw, r.decimals)} />
          </Prov>
        </StatValue>
      ))}
    </div>
  );
}

/** A vertical stack of per-market PEAK amounts (highest recorded), each traced
 *  to its own lane's maximum (principal-after on supply, emitted accountBorrows
 *  on debt); no USD — the replayed token amount only. */
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

export function MoonwellPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  captions,
  peaks = true,
}: {
  v: MoonwellPositionView;
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
  const collUsd = totalUsd(
    v,
    v.supplies.map((r) => ({ address: r.address, amount: supplyAmount(r) })),
  );
  const debtUsd = totalUsd(v, v.borrows);
  // `receipts` is the render-site switch (listing defaults false; only the
  // detail page passes it) — computed here (not just below) because the
  // reserve-list disclosure hooks must run on every render, before the
  // closed/liquidated early return. A priced side's list only exists on the
  // detail page (the footnote lines); an unpriced side's list is the
  // headline itself and collapses on every surface.
  const isDetail = receipts;
  const supplyListCount = collUsd == null ? v.supplies.length : isDetail ? v.supplies.length : 0;
  const debtListCount = debtUsd == null ? v.borrows.length : isDetail ? v.borrows.length : 0;
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
        learnMore={moonwellPositionContent({ status: v.status, deployment: positionDeployment })}
      >
        <ClosedPositionStats
          outcome={v.status}
          leadingIdentity={
            <WalletPill wallet={v.wallet} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
          }
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt}
              eventCount={v.txCount}
              liquidationCount={v.liquidationCount}
            />
          }
          closedAt={v.lastActivityAt}
          collateral={<PeakStack lines={v.peakSupplies} side="supply" />}
          debt={<PeakStack lines={v.peakBorrows} side="debt" />}
          collateralFootnote={noPeaksNote}
          debtFootnote={noPeaksNote}
        />
      </PositionCardShell>
    );
  }

  // Detail render (receipts): a neutral mode-word pill (what the account is
  // doing NOW), plus the wallet pill. The LISTING render keeps the lifecycle
  // pill; the wallet pill (facehash + copy + bookmark) renders on both surfaces.
  const modeWord = v.borrows.length > 0 ? "Borrowing" : "Supply only";
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
    >
      <OpenPositionStats
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
          <WalletPill wallet={v.wallet} ensName={null} filterProtocol={session} bookmarkProtocol={session} />
        }
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
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
              v.supplies.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <InlineAssetCluster symbols={v.supplies.map((r) => r.symbol)} />
                  <ReserveDisclosureToggle disclosure={supplyDisclosure} count={v.supplies.length} />
                </span>
              ) : undefined,
            value:
              collUsd != null ? (
                <UsdHeadline usd={collUsd} info={dep.card.usd("Collateral")} />
              ) : supplyDisclosure.collapsible ? null : (
                <SupplyStack v={v} />
              ),
            footnote: (
              <>
                {collUsd == null && supplyDisclosure.collapsible && (
                  <ReserveDisclosureList disclosure={supplyDisclosure}>
                    <SupplyStack v={v} />
                  </ReserveDisclosureList>
                )}
                {isDetail && collUsd != null && (
                  <ReserveDisclosureList disclosure={supplyDisclosure}>
                    <SupplyFootnoteLines v={v} />
                  </ReserveDisclosureList>
                )}
                <InterestCaption side="supply" usd={captions?.supplyInterestUsd} />
              </>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            assetIcons:
              v.borrows.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <InlineAssetCluster symbols={v.borrows.map((r) => r.symbol)} />
                  <ReserveDisclosureToggle disclosure={debtDisclosure} count={v.borrows.length} />
                </span>
              ) : undefined,
            value:
              debtUsd != null ? (
                <UsdHeadline usd={debtUsd} info={dep.card.usd("Borrowed")} />
              ) : debtDisclosure.collapsible ? null : (
                <BorrowStack v={v} />
              ),
            footnote: (
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
                <InterestCaption
                  side="debt"
                  usd={captions?.debtInterestUsd}
                  live={v.borrows.length > 0 && v.borrows.every((b) => b.live)}
                />
              </>
            ),
          },
          // No health-factor column on the CARD: the health layer rides the
          // detail page's live Comptroller read (runway + capacity + verdict);
          // the listing snapshot carries no HF, so listing cards simply don't
          // assert the layer (never dashed, never staled).
        ]}
      />
    </PositionCardShell>
  );
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
