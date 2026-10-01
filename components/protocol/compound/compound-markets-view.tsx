"use client";

// Compound V3 protocol view — each Comet market's own state at one head block.
// ----------------------------------------------------------------------------
// The claim: each Comet is ONE market. A single base asset is both the lend and
// the borrow side, every collateral asset backs borrowing of that base alone
// (no cross-collateralisation between markets), and the whole rate curve is
// written against one number — utilisation, totalBorrow ÷ totalSupply of the
// base, read from the contract's own getUtilization.
//
// The bar is <RatioBar> on the UTILISATION axis. Its ticks are the market's own
// curve constants — supplyKink and borrowKink, the utilisation each rate curve
// turns steep at — which sit on the SAME axis as the fill, so they may be
// drawn against it. A collateral factor lives on a DIFFERENT axis entirely (a
// borrower's debt against their own collateral, not a market's borrowed
// share): factors are stated per collateral asset, in text, and never drawn on
// the utilisation bar. Same reasoning as the Compound V2 view; the axes did
// not change between versions.
//
// The per-collateral mini-bar is a third, again same-axis pair: supplied ÷
// supply cap, both in the asset's own units — how much of the room governance
// allowed is used.
//
// Values are stated in each market's QUOTE UNIT, because that is the unit the
// market's own oracle answers in — USD for cUSDCv3/cUSDTv3 and ETH for cWETHv3
// on Ethereum, and on Base a cAEROv3 that quotes in dollars despite a volatile
// base. Two units are never summed together.
//
// Serves both deployments (Ethereum and Base). `chainId` decides only which
// explorer the links point at; nothing about a market's arithmetic differs.
//
// No animation: framer nodes per row are what froze the listing shells.
//
// Provenance: the whole view owns ONE <ProvReceiptsScope> (the six other scoped
// views' posture — the figures are one block's reading of one protocol, so they
// belong in one receipts list). Every rendered figure is a live Comet read, so
// each carries a <Prov> from lib/compound/markets-provenance; the two roster
// COUNTS (markets, collateral assets configured) are stated structure, not a
// per-figure read — Comet exposes no market enumerator (the stamp says so) — so
// they carry data-prov-exempt rather than a receipt that would overclaim.

import { formatTinyNonZero } from "@/lib/utils/format";
import type { ReactNode } from "react";

import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { InfoDisclosure } from "@/components/shared/info-disclosure";
import { RevealTip } from "@/components/shared/reveal-tip";
import { shortAddress } from "@/lib/compound/asset-catalog";
import { MAINNET_CHAIN_ID, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { VitalsBand } from "@/components/shared/vitals-band";
import {
  type CompoundMarketCoords,
  cvMarketBaseProv,
  cvMarketValueProv,
  cvUtilizationProv,
  cvKinkProv,
  cvRateProv,
  cvReservesProv,
  cvBaseBorrowMinProv,
  cvCollateralBackingProv,
  cvCollateralSuppliedProv,
  cvCollateralValueProv,
  cvCollateralFactorProv,
  cvSummaryValueProv,
} from "@/lib/compound/markets-provenance";
import type {
  CompoundV3CollateralRow,
  CompoundV3MarketRow,
  CompoundV3MarketsResponse,
} from "@/lib/sources/chain/compound-markets";
import { BlockRef } from "@/components/shared/block-ref";

const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);

/** Compact quantity — token units or a quote-unit value, no currency mark. */
const qty = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  if (a > 0 && a < 0.001) return formatTinyNonZero(v);
  return v.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 4 : 2 });
};

/** A value in the market's quote unit — dollars carry the mark, ETH its name. */
const val = (v: number | null, unit: string): string => {
  if (v == null) return "—";
  if (unit !== "USD") return `${qty(v)} ETH`;
  // The repo's sub-cent dollar floor (fmtPositionUsd, fmtUsdChip): a positive
  // value under a cent reads "< $0.01", never "$<0.000001".
  if (v > 0 && v < 0.01) return "< $0.01";
  return `$${qty(v)}`;
};

/** The bubble sized for a sentence: RevealTip's own is nowrap for numbers. */
const TIP_PROSE = "block w-64 whitespace-normal text-left font-normal normal-nums leading-snug";
/** Marks a figure or heading that carries a tooltip. */
const TIPPED = "cursor-help underline decoration-dotted decoration-rb-500/50 underline-offset-4";

/** A tooltip on the repo's RevealTip, prose-sized. */
function Tip({
  text,
  children,
  align,
  className,
}: {
  text: string;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <RevealTip tip={<span className={TIP_PROSE}>{text}</span>} align={align} className={className}>
      {children}
    </RevealTip>
  );
}

/** The collateral table's columns, shared by the header row and every row so
 *  each header sits over its figures. Below lg the grid is off: rows wrap and
 *  the factors take a line of their own with labels inline. */
const COLLATERAL_GRID =
  "lg:grid lg:grid-cols-[6rem_minmax(15rem,1fr)_5.5rem_5rem_4.75rem_4.75rem_4.75rem] lg:items-center lg:gap-x-3";

const CAP_TIP = "The share of the supply cap in use: amount supplied ÷ cap, both in the asset's own units.";
const BORROW_TIP = "Collateral factor for borrowing: the share of this asset's value that can be borrowed against.";
const LIQUIDATE_TIP =
  "Liquidation collateral factor: the share of this asset's value that counts toward the liquidation line.";
const CREDITED_TIP =
  "Comet's liquidation factor: the share of this asset's value an account is credited at if it is absorbed. The protocol keeps the rest.";

function CollateralHeader() {
  const th = "text-[11px] uppercase tracking-wider text-rb-500";
  return (
    <div className={`hidden border-b border-rb-300/40 px-1 pb-1.5 dark:border-rb-700/40 ${COLLATERAL_GRID} ${th}`}>
      <span>Asset</span>
      <span>Supplied</span>
      <span className="text-right">Value</span>
      <span className="text-right">
        <Tip text={CAP_TIP} align="end">
          <span className={TIPPED}>Cap used</span>
        </Tip>
      </span>
      <span className="text-right">
        <Tip text={BORROW_TIP} align="end">
          <span className={TIPPED}>Borrow</span>
        </Tip>
      </span>
      <span className="text-right">
        <Tip text={LIQUIDATE_TIP} align="end">
          <span className={TIPPED}>Liquidate</span>
        </Tip>
      </span>
      <span className="text-right">
        <Tip text={CREDITED_TIP} align="end">
          <span className={TIPPED}>Credited</span>
        </Tip>
      </span>
    </div>
  );
}

function CollateralRow({
  c,
  coords,
  chainId,
}: {
  c: CompoundV3CollateralRow;
  coords: CompoundMarketCoords;
  chainId: ChainId;
}) {
  const unit = coords.quoteUnit ?? "USD";
  // Collateral-level coordinates: the same Comet proxy + block, this asset's id.
  const cc: CompoundMarketCoords = { ...coords, collateralSymbol: c.symbol, collateralAsset: c.asset };
  const lbl = "text-rb-500 lg:hidden";
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2 text-[13px] tabular-nums ${COLLATERAL_GRID}`}
    >
      <a
        href={explorerUrl(chainId, "address", c.asset)}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate font-medium text-foreground lg:flex-none"
      >
        {c.symbol}
      </a>

      {/* Supplied: the bar (supplied ÷ supply cap, both in the asset's own
          units, one axis) and the amount. RatioBar carries the mt-2.5 its
          card-tier callers want; these are rows, so the offset is zeroed
          rather than the instrument re-drawn. */}
      <div className="order-last flex basis-full items-center gap-3 lg:order-none lg:basis-auto">
        <Tip
          text={
            c.capUsed != null
              ? `Supply cap ${qty(c.supplyCap)} ${c.symbol}, ${pctText(c.capUsed, 0)} used. The bar is supplied ÷ cap.`
              : "The supply cap is zero: no more of this asset can enter the market. What is supplied entered before the cap was set."
          }
          className="min-w-16 flex-1"
        >
          <div className="w-full [&>div]:mt-0">
            {c.capUsed != null ? (
              <RatioBar fill={c.capUsed} ticks={[]} />
            ) : (
              <div className="h-2.5 rounded-full bg-rb-200 dark:bg-rb-500/30" />
            )}
          </div>
        </Tip>
        <span className="shrink-0 whitespace-nowrap text-right text-foreground lg:w-36">
          <Prov info={cvCollateralSuppliedProv(cc)}>
            {qty(c.totalSupplied)} {c.symbol}
          </Prov>
        </span>
      </div>

      <span className="text-right text-rb-500">
        <Prov info={cvCollateralValueProv(cc)}>{val(c.suppliedValue, unit)}</Prov>
      </span>
      {/* A ratio of two receipted figures (supplied, cap): no receipt of its own. */}
      <span className="text-right text-rb-500" data-prov-exempt="">
        {c.capUsed == null ? (
          <Tip text="The supply cap is zero: no more can be added; what is in stays." align="end">
            <span className={TIPPED}>Cap 0</span>
          </Tip>
        ) : c.capUsed > 1 ? (
          <Tip
            text="Governance lowered the supply cap below what is already supplied. Nothing more can enter until supply falls under the cap; what is in stays."
            align="end"
          >
            <span className={TIPPED}>{pctText(c.capUsed, 0)}</span>
          </Tip>
        ) : (
          pctText(c.capUsed, 0)
        )}
      </span>

      {/* The factors, stated and never drawn on the utilisation bar (a different
          axis). A zero borrow factor is governance deprecating the asset for
          NEW borrowing while it stays liquidation-eligible. Below lg the three
          share a line under the row with their labels inline; from lg they are
          columns under the headers. */}
      <div className="order-last flex basis-full flex-wrap gap-x-4 gap-y-0.5 lg:contents">
        <span className="text-foreground/80 lg:text-right">
          <span className={lbl}>Borrow </span>
          {c.borrowCollateralFactor === 0 ? (
            <Tip text="Borrowing against this asset is switched off." align="end">
              <span className={`${TIPPED} text-rb-500`}>Off</span>
            </Tip>
          ) : (
            <Prov info={cvCollateralFactorProv("borrow", cc)}>{pctText(c.borrowCollateralFactor, 0)}</Prov>
          )}
        </span>
        <span className="text-foreground/80 lg:text-right">
          <span className={lbl}>Liquidate </span>
          <Prov info={cvCollateralFactorProv("liquidate", cc)}>{pctText(c.liquidateCollateralFactor, 0)}</Prov>
        </span>
        <span className="text-foreground/80 lg:text-right">
          <span className={lbl}>Credited </span>
          <Prov info={cvCollateralFactorProv("liquidation", cc)}>{pctText(c.liquidationFactor, 0)}</Prov>
        </span>
      </div>
    </div>
  );
}

function MarketCard({ m, block, chainId }: { m: CompoundV3MarketRow; block: number; chainId: ChainId }) {
  const coords: CompoundMarketCoords = {
    blockNumber: block,
    comet: m.comet,
    baseSymbol: m.baseSymbol,
    quoteUnit: m.quoteUnit,
  };
  // Both kinks sit on the utilisation axis. Usually they coincide; when they
  // do, one tick states both rather than drawing two hairlines in one place.
  const sameKink = Math.abs(m.supplyKink - m.borrowKink) < 1e-9;
  const ticks: RatioBarTick[] = sameKink
    ? [
        {
          f: m.borrowKink,
          kind: "neutral",
          title: `Rate-model kink · the utilisation both rate curves turn steep at (${pctText(m.borrowKink, 0)})`,
        },
      ]
    : [
        {
          f: m.supplyKink,
          kind: "neutral",
          title: `Supply-rate kink · the utilisation the supply curve turns steep at (${pctText(m.supplyKink, 0)})`,
        },
        {
          f: m.borrowKink,
          kind: "neutral",
          title: `Borrow-rate kink · the utilisation the borrow curve turns steep at (${pctText(m.borrowKink, 0)})`,
        },
      ];

  const stat = "whitespace-nowrap";
  const k = "text-rb-500";
  return (
    <div className="rounded-lg border border-rb-200 bg-rb-50 p-3 dark:border-rb-500/30 dark:bg-rb-500/5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-base font-semibold text-foreground">{m.baseSymbol}</span>{" "}
          <a
            href={explorerUrl(chainId, "address", m.comet)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external text-[13px] text-rb-500"
          >
            {m.label} · {shortAddress(m.comet)}
          </a>
        </div>
        <span className="shrink-0 text-base tabular-nums text-foreground">
          <Prov info={cvMarketValueProv("supplied", coords)}>{val(m.totalSupplyValue, m.quoteUnit)}</Prov>
        </span>
      </div>

      <div className="mt-0.5 text-[13px] tabular-nums text-rb-500">
        <Prov info={cvMarketBaseProv("supplied", coords)}>
          {qty(m.totalSupplyBase)} {m.baseSymbol}
        </Prov>{" "}
        supplied · <Prov info={cvMarketBaseProv("borrowed", coords)}>{qty(m.totalBorrowBase)}</Prov> borrowed
        {m.quoteUnit === "ETH" && (
          <>
            {" · "}
            <Tip text="This market's price feeds quote in ETH, its base asset's own unit, so its values are stated in ETH and not converted.">
              <span className={`text-foreground ${TIPPED}`}>quoted in ETH</span>
            </Tip>
          </>
        )}
      </div>

      <RatioBar fill={m.utilization} ticks={ticks} />

      {/* Label, then figure: the label muted, the figure in foreground. */}
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] tabular-nums">
        <Tip text="Comet.getUtilization: totalBorrow ÷ totalSupply of the base, the contract's own arithmetic.">
          <span className={stat}>
            <span className={`${k} ${TIPPED}`}>Utilised</span>{" "}
            <Prov info={cvUtilizationProv(coords)}>
              <span className="text-foreground">{pctText(m.utilization)}</span>
            </Prov>
          </span>
        </Tip>
        {/* Over 100% is a real reading, not a rendering fault: the borrow index
            outruns the supply index by the spread between the two rates, so
            what borrowers owe can exceed what lenders are owed. The difference
            is the market's reserve line, stated below. Base's cWETHv3 sits
            here; no Ethereum market does, which is why this says what it means
            rather than leaving a full bar to be read as a shortfall. */}
        {m.utilization > 1 && (
          <Tip text="What borrowers owe of the base exceeds what lenders are owed. The gap is the spread between the borrow and supply rates, which accrues to the market's reserve line rather than to lenders, so the market's reserves are growing.">
            <span className={`text-foreground ${TIPPED}`}>borrowed above supplied</span>
          </Tip>
        )}
        <Tip text="The utilisation where the rate curves turn steep: above it, borrowing costs rise fast to draw lenders in and borrowers out.">
          <span className={stat}>
            <span className={`${k} ${TIPPED}`}>Kink</span>{" "}
            <span className="text-foreground">
              <Prov info={cvKinkProv("borrow", coords)}>{pctText(m.borrowKink, 0)}</Prov>
              {!sameKink && (
                <>
                  {" / supply "}
                  <Prov info={cvKinkProv("supply", coords)}>{pctText(m.supplyKink, 0)}</Prov>
                </>
              )}
            </span>
          </span>
        </Tip>
        <Tip text="Comet.getBorrowRate at the current utilisation, annualized from the contract's per-second rate.">
          <span className={stat}>
            <span className={`${k} ${TIPPED}`}>Borrow rate</span>{" "}
            <span className="text-foreground">
              <Prov info={cvRateProv("borrow", coords)}>{pctText(m.borrowApr, 2)}</Prov>
            </span>
          </span>
        </Tip>
        <Tip text="Comet.getSupplyRate at the current utilisation, annualized from the contract's per-second rate.">
          <span className={stat}>
            <span className={`${k} ${TIPPED}`}>Supply rate</span>{" "}
            <span className="text-foreground">
              <Prov info={cvRateProv("supply", coords)}>{pctText(m.supplyApr, 2)}</Prov>
            </span>
          </span>
        </Tip>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px] tabular-nums">
        <Tip text="Comet.getReserves against Comet.targetReserves. Below the target the market sells absorbed collateral at its configured discount to refill the line; at or above it, those sales stop. The line is signed and can run negative.">
          {/* The reserve line is a quantity of the BASE asset, a signed integer
              of base units, which is what its receipt says. It is stated in
              that asset and not run through the market's oracle: on a market
              whose base is not its numeraire the two are different numbers,
              and cAEROv3 is that market (539.9k AERO is not $539.9k). */}
          <span>
            <span className={`${k} ${TIPPED}`}>Reserves</span>{" "}
            <Prov info={cvReservesProv("line", coords)}>
              <span className="text-foreground">
                {qty(m.reservesBase)} {m.baseSymbol}
              </span>
            </Prov>{" "}
            <span className={k}>of</span>{" "}
            <Prov info={cvReservesProv("target", coords)}>
              <span className="text-foreground">
                {qty(m.targetReservesBase)} {m.baseSymbol}
              </span>
            </Prov>{" "}
            <span className={k}>target</span>
            {m.reservesOfTarget != null && <span className="text-foreground"> ({pctText(m.reservesOfTarget, 0)})</span>}
          </span>
        </Tip>
        <Tip text="The smallest debt a new borrow may leave; repayments may leave less.">
          <span className={stat}>
            <span className={`${k} ${TIPPED}`}>Min borrow</span>{" "}
            <span className="text-foreground">
              <Prov info={cvBaseBorrowMinProv(coords)}>
                {qty(m.baseBorrowMin)} {m.baseSymbol}
              </Prov>
            </span>
            {/* One base unit (1e-6 USDC on Base's cUSDCv3, the deployment's
                borrowMin of 1e0) is a minimum in name only. */}
            {m.baseBorrowMin > 0 && m.baseBorrowMin <= 1e-6 && <span className={k}> (no practical minimum)</span>}
          </span>
        </Tip>
      </div>

      <div className="mt-4">
        <div className="text-[13px] font-medium text-foreground">
          Collateral — {m.collateral.length} assets,{" "}
          <Prov info={cvCollateralBackingProv(coords)}>{val(m.totalCollateralValue, m.quoteUnit)}</Prov> backing{" "}
          <Prov info={cvMarketValueProv("borrowed", coords)}>{val(m.totalBorrowValue, m.quoteUnit)}</Prov> borrowed
        </div>
        <p className="mt-0.5 text-[13px] text-rb-500">Each bar is supplied against the asset&rsquo;s supply cap.</p>
        <InfoDisclosure className="mt-1" label="how to read the collateral table">
          <div className="space-y-2 text-[13px] leading-relaxed text-rb-500">
            <p>
              The collateral the market accepts, as its contract lists it. Each bar is the amount supplied against the
              asset&rsquo;s supply cap, in the asset&rsquo;s own units.
            </p>
            <p>
              <span className="text-foreground">Borrow</span> is the share of an asset&rsquo;s value that can be
              borrowed against. <span className="text-foreground">Liquidate</span> is the share that counts toward the
              liquidation line. <span className="text-foreground">Credited</span> is Comet&rsquo;s liquidation factor:
              the share of its value an account is credited at if it is absorbed; the protocol keeps the rest.
            </p>
            <p>
              <span className="text-foreground">Cap 0</span> means the cap is zero, and a cap lowered below what is
              supplied shows over 100%. Either way no more of that asset can be added; what is in stays.{" "}
              <span className="text-foreground">Off</span> under Borrow means borrowing against the asset is switched
              off.
            </p>
          </div>
        </InfoDisclosure>
        <div className="mt-2">
          <CollateralHeader />
          <div className="divide-y divide-rb-300/25 dark:divide-rb-700/25">
            {m.collateral.map((c) => (
              <CollateralRow key={c.asset} c={c} coords={coords} chainId={chainId} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompoundMarketsStamp({
  data,
  chainId = MAINNET_CHAIN_ID,
  rosterNote,
}: {
  data: CompoundV3MarketsResponse;
  chainId?: ChainId;
  /** How this deployment's roster came to be stated. Comet enumerates nothing
   *  on either chain, so the sentence is always about a stated roster — but
   *  WHY it is stated differs, and the stamp should not borrow Ethereum's
   *  answer for Base. */
  rosterNote?: ReactNode;
}) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[13px] text-rb-500">
        Chain snapshot · <BlockRef block={data.blockNumber} chainId={chainId} /> · each market&rsquo;s state read from
        its contract
      </p>
      <InfoDisclosure className="mt-1" label="where the market roster comes from" surface="raised">
        <p className="text-[13px] leading-relaxed text-rb-500">
          Compound calls each market a Comet.{" "}
          {rosterNote ?? (
            <>
              The roster is the{" "}
              <span className="text-foreground">{data.summary.total} Ethereum markets the explorer indexes</span>; no
              contract lists the markets, so the roster is stated and not read.
            </>
          )}
        </p>
      </InfoDisclosure>
    </div>
  );
}

export function CompoundMarketsView({
  data,
  chainId = MAINNET_CHAIN_ID,
}: {
  data: CompoundV3MarketsResponse;
  chainId?: ChainId;
}) {
  // Hook first (before the early return), so the receipts registry is stable
  // across renders regardless of the stale branch — the maple-pools-view order.
  const registry = useReceiptRegistry();
  if (data.chainStale) {
    return <p className="text-sm text-rb-500">The markets could not be read from chain at this block.</p>;
  }

  const s = data.summary;
  const summaryCoords: CompoundMarketCoords = { blockNumber: data.blockNumber };

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The vitals band. This roster carries TWO numeraires — cUSDCv3 and
          cUSDTv3 quote in dollars, cWETHv3 in ETH — and the band's rule is that
          a value carries its own unit, so each size slot states both lines
          rather than summing units that do not add. The usage slot is the
          dollar markets alone: Comet publishes no combined ratio across
          numeraires and the view invents none. */}
      <VitalsBand
        className="mb-4"
        vitals={[
          {
            slot: "roster",
            label: "Markets",
            // Stated from the catalog (Comet has no market enumerator; the
            // stamp says so), not a per-figure read.
            value: <span data-prov-exempt="">{s.total}</span>,
            title:
              "The roster the explorer indexes — Comet exposes no on-chain call that enumerates its markets, so this count is stated from the catalog, not read.",
          },
          {
            slot: "sizeIn",
            label: "Supplied",
            value: (
              <>
                {s.suppliedUsd != null && (
                  <div>
                    <Prov info={cvSummaryValueProv("supplied", "USD", summaryCoords)}>{val(s.suppliedUsd, "USD")}</Prov>
                  </div>
                )}
                {s.suppliedEth != null && (
                  <div className="text-[11px] font-normal text-rb-500">
                    <Prov info={cvSummaryValueProv("supplied", "ETH", summaryCoords)}>{val(s.suppliedEth, "ETH")}</Prov>
                  </div>
                )}
              </>
            ),
          },
          {
            slot: "sizeOut",
            label: "Borrowed",
            value: (
              <>
                {s.borrowedUsd != null && (
                  <div>
                    <Prov info={cvSummaryValueProv("borrowed", "USD", summaryCoords)}>{val(s.borrowedUsd, "USD")}</Prov>
                  </div>
                )}
                {s.borrowedEth != null && (
                  <div className="text-[11px] font-normal text-rb-500">
                    <Prov info={cvSummaryValueProv("borrowed", "ETH", summaryCoords)}>{val(s.borrowedEth, "ETH")}</Prov>
                  </div>
                )}
              </>
            ),
          },
          s.utilisationUsd != null && {
            slot: "usage" as const,
            label: "Utilisation",
            // The scope is in the figure itself, not only in the hover: the
            // WETH market is outside this ratio and the reader should see that
            // without asking.
            value: (
              <>
                <span data-prov-exempt="">{pctText(s.utilisationUsd)}</span>{" "}
                <span className="text-[11px] text-rb-500">dollar markets</span>
              </>
            ),
            title:
              "Σ borrowed ÷ Σ supplied across the dollar-quoted markets only, both in USD — the WETH market is a separate numeraire and Comet publishes no combined ratio, so none is stated. A ratio of two receipted figures, not a distinct chain read.",
          },
        ]}
        notes={
          // Distinct collateral assets across the roster — a config count over
          // the markets' own rosters, not a single chain figure.
          <span
            data-prov-exempt=""
            title="Distinct collateral assets configured across the roster — a count over each market's own getAssetInfo roster, not a single chain read."
          >
            <span className="text-foreground">{s.collateralAssets}</span> collateral assets configured
          </span>
        }
      />

      <InfoDisclosure className="mb-3" label="how to read a market" surface="raised">
        <p className="text-[13px] leading-relaxed text-rb-500" data-markets-glossary="">
          <span className="text-foreground">Utilised</span> is the share of the lent base that is borrowed. The{" "}
          <span className="text-foreground">kink</span> is the utilisation where the rate curves turn steep, so rates
          climb fast above it. <span className="text-foreground">Reserves</span> are the base the protocol holds in the
          market; below the <span className="text-foreground">target</span> it sells seized collateral to refill them.{" "}
          <span className="text-foreground">Min borrow</span> is the smallest debt a new borrow may leave. A market{" "}
          <span className="text-foreground">quoted in ETH</span> prices its assets in ETH, so its values are in ETH.
        </p>
      </InfoDisclosure>
      <div className="grid gap-3">
        {data.markets.map((m) => (
          <MarketCard key={m.comet} m={m} block={data.blockNumber} chainId={chainId} />
        ))}
      </div>

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
