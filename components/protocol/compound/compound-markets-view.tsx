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

import type { ReactNode } from "react";

import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
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

const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);

/** Compact quantity — token units or a quote-unit value, no currency mark. */
const qty = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  if (a > 0 && a < 0.001) return v.toExponential(1);
  return v.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 4 : 2 });
};

/** A value in the market's quote unit — dollars carry the mark, ETH its name. */
const val = (v: number | null, unit: string): string =>
  v == null ? "—" : unit === "USD" ? `$${qty(v)}` : `${qty(v)} ETH`;

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
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1.5 text-[11px] tabular-nums">
      <a
        href={explorerUrl(chainId, "address", c.asset)}
        target="_blank"
        rel="noopener noreferrer"
        className="w-24 shrink-0 truncate text-foreground"
      >
        {c.symbol}
      </a>

      {/* Supplied ÷ supply cap — both in the asset's own units, one axis.
          RatioBar carries the mt-2.5 its card-tier callers want; these are
          rows, so the offset is zeroed rather than the instrument re-drawn. */}
      <div
        className="w-24 shrink-0 [&>div]:mt-0"
        title={
          c.capUsed != null
            ? `Supply cap ${qty(c.supplyCap)} ${c.symbol} — ${pctText(c.capUsed, 0)} used. The bar is supplied ÷ cap, both in the asset's own units.`
            : "The supply cap is zero: nothing more of this asset can enter the market. What is shown supplied entered before the cap was set."
        }
      >
        {c.capUsed != null ? (
          <RatioBar fill={c.capUsed} ticks={[]} />
        ) : (
          <div className="h-2.5 rounded-full bg-rb-200 dark:bg-rb-500/30" />
        )}
      </div>

      <span className="w-28 shrink-0 text-right text-foreground">
        <Prov info={cvCollateralSuppliedProv(cc)}>
          {qty(c.totalSupplied)} {c.symbol}
        </Prov>
      </span>
      <span className="w-20 shrink-0 text-right text-rb-500">
        <Prov info={cvCollateralValueProv(cc)}>{val(c.suppliedValue, unit)}</Prov>
      </span>
      <span className="w-24 shrink-0 text-right text-rb-500">
        {c.capUsed != null ? `${pctText(c.capUsed, 0)} of cap` : "cap set to zero"}
      </span>

      {/* The factors, stated — never drawn on the utilisation bar (different
          axis). A zero borrow factor is governance deprecating the asset for
          NEW borrowing while it stays liquidation-eligible. */}
      <span
        className="min-w-36 flex-1 text-right text-rb-500"
        title={`getAssetInfo — borrowCollateralFactor ${pctText(c.borrowCollateralFactor, 0)} (what new borrowing can be drawn against it) · liquidateCollateralFactor ${pctText(c.liquidateCollateralFactor, 0)} (where a position becomes absorbable) · liquidationFactor ${pctText(c.liquidationFactor, 0)} (the share of its value the absorbed account is credited).`}
      >
        {c.borrowCollateralFactor === 0 ? (
          <span className="text-foreground">borrowing switched off</span>
        ) : (
          <Prov info={cvCollateralFactorProv("borrow", cc)}>CF {pctText(c.borrowCollateralFactor, 0)}</Prov>
        )}
        {" · liq "}
        <Prov info={cvCollateralFactorProv("liquidate", cc)}>{pctText(c.liquidateCollateralFactor, 0)}</Prov>
        {" · factor "}
        <Prov info={cvCollateralFactorProv("liquidation", cc)}>{pctText(c.liquidationFactor, 0)}</Prov>
      </span>
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

  return (
    <div className="rounded-lg border border-rb-200 bg-rb-50 p-3 dark:border-rb-500/30 dark:bg-rb-500/5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[13px] font-semibold text-foreground">{m.baseSymbol}</span>{" "}
          <a
            href={explorerUrl(chainId, "address", m.comet)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external text-[11px] text-rb-500"
          >
            {m.label} · {shortAddress(m.comet)}
          </a>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-foreground">
          <Prov info={cvMarketValueProv("supplied", coords)}>{val(m.totalSupplyValue, m.quoteUnit)}</Prov>
        </span>
      </div>

      <div className="mt-0.5 text-[11px] tabular-nums text-rb-500">
        <Prov info={cvMarketBaseProv("supplied", coords)}>
          {qty(m.totalSupplyBase)} {m.baseSymbol}
        </Prov>{" "}
        supplied · <Prov info={cvMarketBaseProv("borrowed", coords)}>{qty(m.totalBorrowBase)}</Prov> borrowed
        {m.quoteUnit === "ETH" && (
          <span title="This market's price feeds quote in ETH, its base asset's own unit — so its values are stated in ETH, not converted.">
            {" · "}
            <span className="text-foreground">quoted in ETH</span>
          </span>
        )}
      </div>

      <RatioBar fill={m.utilization} ticks={ticks} />

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        <span title="Comet.getUtilization — totalBorrow ÷ totalSupply of the base, the contract's own arithmetic.">
          <Prov info={cvUtilizationProv(coords)}>
            <span className="text-foreground">{pctText(m.utilization)}</span>
          </Prov>{" "}
          utilised
        </span>
        {/* Over 100% is a real reading, not a rendering fault: the borrow index
            outruns the supply index by the spread between the two rates, so
            what borrowers owe can exceed what lenders are owed. The difference
            is the market's own reserve line, stated below. Base's cWETHv3 sits
            here; no Ethereum market does, which is why this says what it means
            rather than leaving a full bar to be read as a shortfall. */}
        {m.utilization > 1 && (
          <span title="What borrowers owe of the base exceeds what lenders are owed. The gap is the spread between the borrow and supply rates, which accrues to the market's reserve line rather than to lenders — so this is a market whose reserves are growing, not one that is short.">
            <span className="text-foreground">borrowed above supplied</span>
          </span>
        )}
        <span>
          kink <Prov info={cvKinkProv("borrow", coords)}>{pctText(m.borrowKink, 0)}</Prov>
          {!sameKink && (
            <>
              {" / supply "}
              <Prov info={cvKinkProv("supply", coords)}>{pctText(m.supplyKink, 0)}</Prov>
            </>
          )}
        </span>
        <span title="Comet.getBorrowRate at the current utilisation, annualized from the contract's per-second rate.">
          borrow <Prov info={cvRateProv("borrow", coords)}>{pctText(m.borrowApr, 2)}</Prov>
        </span>
        <span title="Comet.getSupplyRate at the current utilisation, annualized from the contract's per-second rate.">
          supply <Prov info={cvRateProv("supply", coords)}>{pctText(m.supplyApr, 2)}</Prov>
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        <span
          title={`Comet.getReserves against Comet.targetReserves. Below the target the market sells absorbed collateral at its configured discount to refill the line; at or above it, those sales stop. The reserve line is signed and can run negative.`}
        >
          {/* The reserve line is a quantity of the BASE asset — a signed integer
              of base units, which is what its own receipt says. It is stated
              in that asset, not run through the market's oracle: on a market
              whose base is not its numeraire the two are different numbers,
              and cAEROv3 is that market (539.9k AERO is not $539.9k). */}
          reserves{" "}
          <Prov info={cvReservesProv("line", coords)}>
            <span className="text-foreground">
              {qty(m.reservesBase)} {m.baseSymbol}
            </span>
          </Prov>{" "}
          of{" "}
          <Prov info={cvReservesProv("target", coords)}>
            {qty(m.targetReservesBase)} {m.baseSymbol}
          </Prov>{" "}
          target
          {m.reservesOfTarget != null && <> ({pctText(m.reservesOfTarget, 0)})</>}
        </span>
        <span title="Comet.baseBorrowMin — the smallest borrow the market accepts.">
          min borrow{" "}
          <Prov info={cvBaseBorrowMinProv(coords)}>
            {qty(m.baseBorrowMin)} {m.baseSymbol}
          </Prov>
        </span>
      </div>

      <div className="mt-3">
        <div className="text-[11px] font-medium text-foreground">
          Collateral — {m.collateral.length} assets,{" "}
          <Prov info={cvCollateralBackingProv(coords)}>{val(m.totalCollateralValue, m.quoteUnit)}</Prov> backing{" "}
          <Prov info={cvMarketValueProv("borrowed", coords)}>{val(m.totalBorrowValue, m.quoteUnit)}</Prov> borrowed
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-rb-500">
          The market&rsquo;s own roster (numAssets / getAssetInfo). Each mini-bar is supplied ÷ supply cap — the
          asset&rsquo;s own units, one axis. The factors are stated here because they measure a borrower&rsquo;s debt
          against their collateral, a different axis from the utilisation bar above.
        </p>
        <div className="mt-1 divide-y divide-rb-300/25 dark:divide-rb-700/25">
          {m.collateral.map((c) => (
            <CollateralRow key={c.asset} c={c} coords={coords} chainId={chainId} />
          ))}
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
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(chainId, "block", data.blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {data.blockNumber.toLocaleString("en-US")}
      </a>{" "}
      · each market&rsquo;s state read from its own Comet contract ·{" "}
      {rosterNote ?? (
        <>
          the roster is the{" "}
          <span className="text-foreground">{data.summary.total} Ethereum markets the explorer indexes</span> — Comet
          exposes no call that enumerates its markets, so the roster is stated, not read
        </>
      )}
    </p>
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

      <div className="grid gap-3">
        {data.markets.map((m) => (
          <MarketCard key={m.comet} m={m} block={data.blockNumber} chainId={chainId} />
        ))}
      </div>

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
