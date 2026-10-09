"use client";

// Compound V3 (Comet) position card — the chain-state analog of the Aave /
// Morpho / Spark position cards, through the SAME shared grammar
// (OpenPositionStats + StatValue) so it lines up with the other explorers.
//
// A Comet position is single-base / multi-collateral: ONE signed base balance
// (+ lent / earns supply rate, − borrowed / pays borrow rate) plus N non-earning
// collateral assets. Every headline value is read from the chain — the base is the
// replayed signed sum of Supply/Withdraw/AbsorbDebt amounts; each collateral line
// is the replayed sum of that asset's SupplyCollateral/WithdrawCollateral
// amounts. Interest (the Comet index), borrow capacity, health and USD are
// interpreted figures — deliberately absent from this baseline; they are layers.
//
// The shared two-column grammar is a two-sided ledger — supply/assets on the
// LEFT, debt/liabilities on the RIGHT — the same shape every other chain-state
// explorer uses. Comet stores the base as one SIGNED number, so we decompose it
// by sign onto the correct side rather than showing a confusing signed "Base"
// column: a net LENDER's base sits on the left (supply side, with collateral if
// any); a BORROWER's base sits on the right as a positive "Borrowed" magnitude.
// So a borrower's debt is always the right column and a lender's stake the left,
// exactly as Spark / Aave / Morpho read — never the same slot.

import { Fragment, type ReactNode } from "react";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { StatValue, StatFootnote, StatDash } from "@/components/shared/stat-value";
import { AssetAmount } from "@/components/shared/asset-amount";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { TokenAmountNotLoaded } from "@/components/shared/not-loaded";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { PositionCardDetail, riskColumns, type CardRiskColumn } from "@/components/shared/position-card-disclosure";
import { ShareLine, ShareLines } from "@/components/shared/share-bar";
import { WalletPill } from "@/components/shared/wallet-pill";
import { formatUnitsExact, formatCompact, formatExactDecimal } from "@/lib/utils/format";
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
import { LifecyclePill, UsdHeadline } from "@/components/shared/position-card-pills";
import type {
  CompoundPositionSummary,
  CompoundAssetAmount,
  CompoundBaseAmount,
  CompoundCurrentBase,
} from "@/lib/sources/api/compound-positions";
import { ExactSpan } from "@/components/shared/amount-text";
import { splitDust, useDustLines } from "@/components/shared/dust-reserves";

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

/** Whether the position borrows the base now (the side the card reads). */
export function compoundBorrowing(v: CompoundPositionView): boolean {
  return effectiveBase(v).side === "borrow";
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
 *  partial total is never asserted (it degrades to no footnote). */
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

/** The card's oracle-USD side headlines (the chain-state balances × Comet's own
 *  getPrice, threaded on the summary's priceByAddress), exported so the
 *  Explanation pane can restate the exact chrome figures (charter §3
 *  reverse-completeness — a bold twin must be byte-identical to the headline).
 *  A side is null when the card shows no USD headline for it (any contributing
 *  leg unpriced — the strict guard above). */
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

/** One per-leg token amount, demoted beneath the USD headline — still the strict
 *  chain reads (traced, exact figure on hover), just no longer giving each leg
 *  equal billing with the aggregate. */
function LegFootnoteLine({
  symbol,
  amount,
  exact,
  info,
}: {
  symbol: string;
  amount: number;
  exact: string;
  info: Provenance;
}) {
  return (
    <div>
      <Prov info={info}>
        <ExactSpan exact={exact} symbol={symbol}>
          {formatCompact(amount)} {symbol}
        </ExactSpan>
      </Prov>
    </div>
  );
}

/** A traced reserve line (the lent base or one collateral asset). */
function ReserveLine({
  symbol,
  amount,
  info,
  unreadAddress,
}: {
  symbol: string;
  amount: number;
  info: Provenance;
  /** Set to the token's address when its decimals did not load. */
  unreadAddress?: string;
}) {
  return (
    <StatValue>
      <Prov info={info}>
        {unreadAddress ? (
          <TokenAmountNotLoaded address={unreadAddress} label={symbol} />
        ) : (
          <AssetAmount value={amount} symbol={symbol} />
        )}
      </Prov>
    </StatValue>
  );
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

/** Supply side (left column): the lent base when the position is a net LENDER,
 *  then the non-earning collateral assets. Dash when there's nothing supplied. */
function SuppliedStack({
  v,
  eff,
  vocab,
  lane,
}: {
  v: CompoundPositionView;
  eff: EffectiveBase;
  vocab: CompoundTowerVocabulary;
  lane: CompoundCardLane;
}) {
  const coords: CompoundCoords = { ...lane, comet: v.comet, marketLabel: v.marketLabel, blockNumber: v.atBlock };
  const legs = supplyLegs(v, eff);
  const { lines, control } = useDustLines(legs, legUsdOf(v));
  if (legs.length === 0) return <StatDash />;
  return (
    <div className="flex flex-col gap-1">
      {lines.map((l) =>
        l.collateral ? (
          <ReserveLine
            key={l.key}
            symbol={l.symbol}
            amount={l.amount}
            info={vocab.positionCollateral(l.symbol, { ...coords, asset: l.address })}
            unreadAddress={l.collateral.decimalsUnread ? l.address : undefined}
          />
        ) : (
          <ReserveLine key={l.key} symbol={l.symbol} amount={l.amount} info={baseProv(v, eff, "lend", vocab, lane)} />
        ),
      )}
      {control}
    </div>
  );
}

/** The supply side's per-leg token amounts beneath its USD headline. */
function SuppliedFootnoteLines({
  v,
  eff,
  vocab,
  lane,
  coords,
  baseExact,
  total,
}: {
  v: CompoundPositionView;
  eff: EffectiveBase;
  vocab: CompoundTowerVocabulary;
  lane: CompoundCardLane;
  coords: CompoundCoords;
  baseExact: string;
  /** The side's priced total: each line then carries its share bar (the
   *  opened card, ui-jobs 209). */
  total?: number;
}) {
  const usdOf = legUsdOf(v);
  const { lines, control } = useDustLines(supplyLegs(v, eff), usdOf);
  return (
    <ShareLines total={total} control={control}>
      {lines.map((l) => {
        const c = l.collateral;
        const share = total ? (usdOf(l) ?? 0) / total : null;
        const line = !c ? (
          <LegFootnoteLine
            symbol={l.symbol}
            amount={l.amount}
            exact={baseExact}
            info={baseProv(v, eff, "lend", vocab, lane)}
          />
        ) : c.decimalsUnread ? (
          <TokenAmountNotLoaded address={c.address} label={c.symbol} />
        ) : (
          <LegFootnoteLine
            symbol={c.symbol}
            amount={c.amount}
            exact={formatUnitsExact(c.amountRaw, c.decimals)}
            info={vocab.positionCollateral(c.symbol, { ...coords, asset: c.address })}
          />
        );
        return (
          <ShareLine key={l.key} share={share} side="collateral">
            {line}
          </ShareLine>
        );
      })}
    </ShareLines>
  );
}

/** Debt side (right column): the borrowed base as a POSITIVE magnitude (the
 *  "Borrowed" header carries the liability sense). Dash for a non-borrower. */
function BorrowedValue({
  v,
  eff,
  vocab,
  lane,
}: {
  v: CompoundPositionView;
  eff: EffectiveBase;
  vocab: CompoundTowerVocabulary;
  lane: CompoundCardLane;
}) {
  if (eff.side !== "borrow") return <StatDash />;
  return (
    <StatValue>
      <Prov info={baseProv(v, eff, "borrow", vocab, lane)}>
        <AssetAmount value={Math.abs(eff.amount)} symbol={v.base.symbol} />
      </Prov>
    </StatValue>
  );
}

/** Identity cluster (owner + market label), shared by the open and closed
 *  layouts. The pill links to the session's wallet-filtered listing only where
 *  the session HAS a listing — the Base explorer opens on a wallet and has no
 *  list to filter, and a link there would land on a page that ignores it. */
function CompoundIdentity({
  v,
  session,
  wallet = true,
}: {
  v: CompoundPositionView;
  session: SessionProtocol;
  /** False on the detail page, whose wallet row above the card names the
   *  owner (ui-jobs 228). */
  wallet?: boolean;
}) {
  const entry = protocolForSession(session);
  const hasListing = entry != null && !EXPLORERS_WITHOUT_LISTING.has(entry.id);
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
      <span className="text-xs font-semibold text-rb-500">{v.marketLabel}</span>
    </span>
  );
}

/** What the card's count counts, beside the timeline's event count. */
const COUNT_TIP =
  "Every transaction on this position except absorbs, which another account sends. The timeline counts events, and one transaction can write two or more: an absorb writes one for each seized asset and one for the debt, and one transaction can add collateral and borrow.";

export function CompoundPositionCard({
  v,
  receipts = false,
  rowExtra,
  explanation,
  viewHref,
  vocab = COMPOUND_INDEXED_VOCABULARY,
  session = "compound",
  lane = {},
  peaks = true,
  disclosureKey,
  risk,
  debtDetail,
}: {
  v: CompoundPositionView;
  /** Opt in to the closed/opened card (ui-jobs 209), keyed per position —
   *  forwarded to `PositionCardShell`. */
  disclosureKey?: string;
  /** The risk headline from the page's Comet read, with its opened layer
   *  (compoundRiskColumn). */
  risk?: CardRiskColumn | null;
  /** Opened-layer lines under Debt from the same read (the room to borrow). */
  debtDetail?: React.ReactNode;
  receipts?: boolean;
  /** The receipts behind the base and collateral figures. The default names
   *  the rails-server index and its replay; the Base explorer passes the
   *  swept-lane vocabulary, whose figures are pinned Comet reads. */
  vocab?: CompoundTowerVocabulary;
  /** Which explorer this card is on — decides where the wallet pill's
   *  bookmark lives and whether it links to a listing. */
  session?: SessionProtocol;
  /** Which chain and which capture the receipts name — Ethereum's index by
   *  default; the Base listing passes { chainId: BASE, source: "sweep" } so no
   *  receipt on a Base row points at Etherscan or at the mainnet index. */
  lane?: CompoundCardLane;
  /** Whether the row carries highest-recorded amounts (the replay lane does;
   *  the Base listing, a chain read at a block with no replay behind it, does
   *  not — its closed cards say so instead of showing a dash as if nothing
   *  was ever held). */
  peaks?: boolean;
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
  const eff = effectiveBase(v);
  // The closed/opened card (ui-jobs 209): every line under a headline moves
  // into the opened layer (<PositionCardDetail>).
  const disclosing = receipts && !!disclosureKey;
  // The "?" cell every state panel owns — the same content function serves
  // Compound V3 on Ethereum and on Base; only the deployment named by the
  // card's own session changes the prose.
  const positionDeployment: CompoundPositionDeployment = session === "compound-base" ? "compound-base" : "compound";

  // Closed / liquidated: the position has unwound to ~0, so the headline is what
  // it held at its height — highest recorded collateral (per asset, plus the lent
  // base if it was ever a net lender) and highest recorded borrowed PRINCIPAL
  // (the peak of the signed base). Chain-state token amounts only, no USD.
  if (v.status === "closed" || v.status === "liquidated") {
    const peakCoords: CompoundCoords = { ...lane, comet: v.comet, marketLabel: v.marketLabel, account: v.account };
    const noPeaks = !peaks;
    const noPeaksNote = noPeaks ? (
      <div className="text-xs mt-0.5 text-rb-500">{notRecordedNote("position")}</div>
    ) : undefined;
    // On the Base sweep the peak is the base's replayed PRINCIPAL, and the
    // footnote says so whenever the column shows a figure. On Ethereum each row
    // is the chain's balance, interest included, and no footnote is needed.
    const principalNote = vocab.baseAtLastEvent ? undefined : (
      <div className="text-xs mt-0.5 text-rb-500">principal only — accrued interest not included</div>
    );
    const supplyLines: ReactNode[] = [];
    // A wallet that only ever lent the base posted no collateral — label its peak
    // "supply", not "collateral" (the Aave V4 spoke-card grammar).
    const supplyOnly = v.peak.collateral.length === 0 && v.peak.lentBase > 0;
    const lentLine =
      v.peak.lentBase > 0 ? (
        <StatValue key="lent-base">
          <Prov info={peakBaseProv(v.base.symbol, "lend", { ...peakCoords, asset: v.base.address })}>
            <AssetAmount value={v.peak.lentBase} symbol={v.base.symbol} />
          </Prov>
        </StatValue>
      ) : null;
    if (supplyOnly && lentLine) supplyLines.push(lentLine);
    for (const c of v.peak.collateral) {
      supplyLines.push(
        <StatValue key={c.address}>
          <Prov info={peakCollateralProv(c.symbol, { ...peakCoords, asset: c.address })}>
            {c.decimalsUnread ? (
              <TokenAmountNotLoaded address={c.address} label={c.symbol} />
            ) : (
              <AssetAmount value={c.amount} symbol={c.symbol} />
            )}
          </Prov>
        </StatValue>,
      );
    }
    // The lent base is not collateral: under its own caption.
    if (!supplyOnly && lentLine) {
      supplyLines.push(
        <div key="lent-caption" className="mt-1 text-xs text-rb-500">
          Highest lent {v.base.symbol} (earns interest)
        </div>,
        lentLine,
      );
    }
    return (
      <PositionCardShell
        receipts={receipts}
        explanation={explanation}
        viewHref={viewHref}
        learnMore={compoundPositionModal({ status: v.status, deployment: positionDeployment })}
        disclosureKey={disclosureKey}
      >
        <ClosedPositionStats
          // A disclosing card's closed layer is the header and the outcome;
          // the highest recorded balances are its opened layer.
          detailGate={disclosing ? PositionCardDetail : undefined}
          outcome={v.status}
          leadingIdentity={<CompoundIdentity v={v} session={session} wallet={!receipts} />}
          identity={
            <PositionCardMeta
              lastActivityAt={v.lastActivityAt ?? undefined}
              eventCount={v.txCount}
              countTip={COUNT_TIP}
              liquidationCount={v.liquidationCount}
              liquidated={v.everLiquidated}
            />
          }
          closedAt={v.lastActivityAt ?? undefined}
          outcomeDates={outcomeDates(v)}
          collateralLabel={supplyOnly ? CARD_VOCAB.peakSupply : CARD_VOCAB.peakCollateral}
          collateral={supplyLines.length > 0 ? <div className="flex flex-col gap-1">{supplyLines}</div> : <StatDash />}
          collateralFootnote={noPeaksNote}
          debtLabel={CARD_VOCAB.peakDebt}
          debtFootnote={noPeaksNote ?? (v.peak.borrowedBase > 0 ? principalNote : undefined)}
          debt={
            noPeaks ? (
              <StatDash />
            ) : v.peak.borrowedBase > 0 ? (
              <StatValue>
                <Prov info={peakBaseProv(v.base.symbol, "borrow", { ...peakCoords, asset: v.base.address })}>
                  <AssetAmount value={v.peak.borrowedBase} symbol={v.base.symbol} />
                </Prov>
              </StatValue>
            ) : undefined
          }
        />
      </PositionCardShell>
    );
  }
  // Footnote: chain value already includes interest; without it, Ethereum
  // shows the balance at the last event and Base the replayed principal.
  // A live balance ticks with interest between loads: the block it was read
  // at is stated once, on the base's footnote.
  const liveAt = eff.isChain && v.current?.block ? ` · live at block ${v.current.block.toLocaleString("en-US")}` : "";
  const lentNote = eff.isChain ? `incl. interest${liveAt}` : "earns supply rate";
  const borrowNote = eff.isChain
    ? `incl. interest${liveAt}`
    : vocab.baseAtLastEvent
      ? "at the last event"
      : "principal (ex-interest)";

  // On-chain oracle USD per side (Comet's own getPrice). Supply side = the lent
  // base (net lender) plus the collateral assets; debt side = the borrowed base.
  // Strict per-total guard: a partial total omits rather than mislead.
  const { supplyUsd, borrowUsd } = cardSideUsd(v);
  // Every line under a headline is the opened layer's on a disclosing card.
  const Detail = disclosing ? PositionCardDetail : Fragment;

  // Detail render (receipts): the V4 spoke-card header grammar — a neutral
  // mode-word pill (what the position is doing NOW, not a lifecycle word).
  // The LISTING render keeps the lifecycle pill: status is the listing's
  // filter axis. The wallet pill (facehash + copy + bookmark) renders on both
  // surfaces (buttons, not anchors, so it lives inside the row <Link>).
  const modeWord = eff.side === "borrow" ? "Borrowing" : eff.side === "lend" ? "Lending" : "Supply only";

  // The demoted per-leg footnote lines' exact reveal — the raw integer behind
  // the compact figure. The borrowed base is stored signed; the "Borrowed"
  // column carries the liability sense, so the magnitude is shown.
  const coords: CompoundCoords = {
    ...lane,
    comet: v.comet,
    marketLabel: v.marketLabel,
    asset: v.base.address,
    blockNumber: v.atBlock,
  };
  const baseExact = formatExactDecimal(
    formatUnitsExact(eff.isChain ? v.current!.amountRaw : v.base.amountRaw, v.base.decimals).replace(/^-/, ""),
  );
  // Dust lines (under a cent) leave the icon stack and its "+N"; the lines
  // put them behind the "N dust reserves hidden" control.
  const supplySymbols = splitDust(supplyLegs(v, eff), legUsdOf(v))
    .shown.filter((l) => !l.collateral?.decimalsUnread)
    .map((l) => l.symbol);

  return (
    <PositionCardShell
      receipts={receipts}
      rowExtra={rowExtra}
      explanation={explanation}
      viewHref={viewHref}
      learnMore={compoundPositionModal({ status: v.status, deployment: positionDeployment, side: eff.side })}
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
        // The protocol name is redundant inside the Compound explorer, so the
        // market label leads, the owner wallet pill alongside.
        leadingIdentity={<CompoundIdentity v={v} session={session} wallet={!receipts} />}
        // Right-hand activity-meta cluster: time-ago, transaction count, and the
        // liquidation triangle (Comet has no redemption concept).
        identity={
          <PositionCardMeta
            lastActivityAt={v.lastActivityAt}
            eventCount={v.txCount}
            countTip={COUNT_TIP}
            liquidationCount={v.liquidationCount}
            liquidated={v.everLiquidated}
          />
        }
        columns={[
          // The V4 spoke-card grammar: ONE oracle-USD figure leads each side
          // (the asset cluster carries the identities), the per-leg token
          // amounts demote to traced footnote lines. When any contributing leg
          // is unpriced the token stack stays the headline — a partial USD
          // total is never asserted.
          {
            // Supply side: "Lent" when the base sits here (net lender), else the
            // borrower's posted "Collateral".
            label: eff.side === "lend" ? "Lent" : "Collateral",
            // The token stack below draws its own icons: the cluster only rides a dollar headline.
            assetIcons:
              supplyUsd != null && supplySymbols.length > 0 ? (
                <InlineAssetCluster symbols={supplySymbols} />
              ) : undefined,
            value:
              supplyUsd != null ? (
                <UsdHeadline
                  usd={supplyUsd}
                  info={compoundUsdProvOnchain(eff.side === "lend" ? "Lent base" : "Collateral", coords)}
                />
              ) : (
                <SuppliedStack v={v} eff={eff} vocab={vocab} lane={lane} />
              ),
            footnote: (
              <Detail>
                {supplyUsd != null && (
                  <SuppliedFootnoteLines
                    v={v}
                    eff={eff}
                    vocab={vocab}
                    lane={lane}
                    coords={coords}
                    baseExact={baseExact}
                    total={disclosing ? supplyUsd : undefined}
                  />
                )}
                {eff.side === "lend" && <StatFootnote>{lentNote}</StatFootnote>}
              </Detail>
            ),
          },
          {
            label: CARD_VOCAB.debt,
            assetIcons:
              borrowUsd != null && eff.side === "borrow" ? <InlineAssetCluster symbols={[v.base.symbol]} /> : undefined,
            value:
              borrowUsd != null ? (
                <UsdHeadline usd={borrowUsd} info={compoundUsdProvOnchain("Borrowed base", coords)} />
              ) : (
                <BorrowedValue v={v} eff={eff} vocab={vocab} lane={lane} />
              ),
            footnote: (
              <Detail>
                {borrowUsd != null && (
                  <div className="text-xs mt-0.5 text-rb-500 tabular-nums space-y-0.5">
                    <LegFootnoteLine
                      symbol={v.base.symbol}
                      amount={Math.abs(eff.amount)}
                      exact={baseExact}
                      info={baseProv(v, eff, "borrow", vocab, lane)}
                    />
                  </div>
                )}
                {eff.side === "borrow" && <StatFootnote>{borrowNote}</StatFootnote>}
                {disclosing && debtDetail}
              </Detail>
            ),
          },
          ...riskColumns(risk, disclosing),
        ]}
      />
    </PositionCardShell>
  );
}

/** Build a card view from the listing summary row. */
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
