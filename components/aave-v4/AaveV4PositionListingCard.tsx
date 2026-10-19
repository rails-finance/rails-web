"use client";

// Aave V4 spoke-position listing card. Visual + numeric analog of the
// detail page's position card (components/protocol/aave-v4/aave-v4-spoke-card.tsx).
//
// How parity is enforced:
//   - Layout: both surfaces render through the shared `PositionCard`.
//   - Numbers: the server ships per-reserve chain-state (`reserves[]`:
//     chain balances, LTs, isCollateral, on-chain oracle prices) on every listing
//     row, mirroring the detail page's chain-state endpoint. The card runs
//     the same `calculateAaveV4Position` the detail's `patchSpokeCardWithChain`
//     runs, so totals, liq prices, and borrowing power are derived from
//     identical inputs.
//   - Formatting: shared `fmtUsd` / `hfLabelV4` (`lib/aave-v4/format.ts`).
//
// It renders through the shared position card (components/shared/position-card.tsx,
// rails-ops TO-DO-position-card 322 and 324): the detail card's heads, the
// lifecycle pill (OPEN, CLOSED, LIQUIDATED), the wallet and spoke as the
// identity, the counters at the right of the heading row, and no panel. A
// health factor below 1 says so under the figure, since the listing's pill is
// the lifecycle one.

import { ListingTag } from "@/components/shared/listing-tag";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { Icon } from "@/components/icons/icon";
import { RevealTip } from "@/components/shared/reveal-tip";
import { useMemo } from "react";
import type { AaveV4SpokePositionRow, AaveV4SpokeReserveSummary } from "@/lib/api/fetch-aave-v4-spoke-positions";
import { holdsNothingOnChain, scaleChainBalance } from "@/lib/api/fetch-aave-v4-spoke-position";
import { SPOKE_HUB, debtHubsOf, hubChipLabel } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";
import { useAaveV4Deployment } from "@/lib/aave-v4/deployment";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardListingSlots,
  type PositionCardStatus,
} from "@/components/shared/position-card";
import { WalletPill } from "@/components/shared/wallet-pill";
import { fmtUsd, hfLabelV4 } from "@/lib/aave-v4/format";
import { formatUnitsExact, formatUsdValue } from "@/lib/utils/format";
import { AssetAmount } from "@/components/shared/asset-amount";

import {
  calculateAaveV4Position,
  computeSupplyBreakdown,
  type CalcPositionInputs,
} from "@/lib/aave-v4/utils/position-calculation";
import { Prov } from "@/components/shared/provenance";
import { usdProvOnchain, usdProv, isOnChainPriceSource } from "@/lib/aave-v4/position-provenance";

export function AaveV4PositionListingCard({ row }: { row: AaveV4SpokePositionRow }) {
  // Build the calculation's inputs from the server's chain-state reserves[]. Same inputs the
  // detail page passes to calculateAaveV4Position inside patchSpokeCardWithChain.
  const calc = useMemo(() => {
    const supplies: CalcPositionInputs["supplies"] = [];
    const debts: CalcPositionInputs["debts"] = [];
    const supplyingSymbols: string[] = [];
    const borrowingSymbols: string[] = [];

    for (const r of row.reserves) {
      const price = r.usdPrice ?? 0;
      const supply = scaleChainBalance(r.supplyBalanceRaw, r.decimals);
      const debt = scaleChainBalance(r.debtBalanceRaw, r.decimals);
      if (supply > 0) {
        supplies.push({
          symbol: r.symbol,
          amount: supply,
          price,
          lt: r.lt ?? 0,
          collateralEnabled: r.isCollateral,
        });
        supplyingSymbols.push(r.symbol);
      }
      if (debt > 0) {
        debts.push({ symbol: r.symbol, amount: debt, price });
        borrowingSymbols.push(r.symbol);
      }
    }

    const result = calculateAaveV4Position({ supplies, debts });

    return {
      ...result,
      supplyingSymbols,
      borrowingSymbols,
      breakdown: computeSupplyBreakdown(supplies),
    };
  }, [row.reserves]);

  // Prefer the chain HF the server already shipped (matches Aave UI by
  // construction) over the calculation's derived HF. They agree when LTs are fresh;
  // chain wins when they don't (premium-shares, recently-changed LT).
  const healthFactor = row.healthFactor;
  const hasDebt = healthFactor != null;
  // Hard on-chain fact (HF < 1): the health factor head's sub line names it.
  const isLiquidatable = hasDebt && healthFactor < 1;
  // Live view: ANY live debt counts as borrowing, no dust floor, so a
  // sub-dollar leftover borrow still shows its Debt and Health factor heads, as
  // on the detail card.
  const supplyOnly = calc.totalDebtUsd <= 0;
  // Chain overlay failed for this row → balances are MV-indexed (potentially
  // drifted from on-chain). The card still renders; the indicator warns.
  const hfStale = hasDebt && row.chainHfStale;
  const { session } = useAaveV4Deployment();
  const hubTier = SPOKE_HUB[row.spokeName] ?? "Core";
  const debtHubs = debtHubsOf(
    row.reserves.map((r) => ({ hub: r.hub, hasDebt: scaleChainBalance(r.debtBalanceRaw, r.decimals) > 0 })),
  );

  // Lifecycle (two-axis model). Status is structural: open vs closed (no live
  // balance). A closed position shows the muted CLOSED pill and "Closed"
  // outcome for a life never liquidated, the red LIQUIDATED pill and
  // "Liquidated" for one that was (closedByLiquidation below).
  // A zeroed position has no live balances, so in place of the live heads it
  // shows the all-time high-water mark, matching the detail card.
  // Null-safe against a pre-057 API that omits `status`: that API only ever
  // returned open positions (closed ones were pruned), so absent ⇒ open.
  //
  // Where the row's reserves are the chain's own read (the overlay answered),
  // the detail card's rule decides instead of the wire status: closed when the
  // chain holds nothing on either side (holdsNothingOnChain). The wire status
  // can disagree with the chain both ways (a zeroed Base position served as
  // open; an Ethereum position under $1 served as closed), and the reader
  // opening the card must see the lifecycle word the card showed.
  const wireOpen = row.status == null || row.status === "open";
  const isOpen = row.chainHfStale ? wireOpen : !holdsNothingOnChain(row.reserves);
  // Liquidated is a HISTORY fact, not a terminal-event fact (rails-ops
  // TO-DO-ui-jobs.md item 97, Miles 2026-09-28): any liquidation on the
  // spoke's record marks the outcome, whether or not a later owner
  // transaction (e.g. withdrawing what the seizure left) is what actually
  // zeroed the position — matches Aave V3's `everLiquidated` rule.
  const closedByLiquidation = (row.liquidationCount ?? 0) > 0;
  // The wire states no peak or closing date for a row it serves as open; the
  // chain-closed card then leaves the peak figure out and dates the close by
  // the last act, which is the one that emptied the position.
  const peakKnown = row.peakSupplyUsd != null;
  const closedAt = row.closedAt ?? (wireOpen ? row.lastActivityAt : undefined);
  // Peak-based supply-only test for the closed card: a position that never
  // carried real debt (peak debt < $1) drops the Peak Debt column, mirroring the
  // detail card's `spoke.peakDebtUsd < 1` rule. Distinct from the live
  // `supplyOnly` (which reads the now-zero current balances and is always true
  // once closed).
  const peakSupplyOnly = (row.peakDebtUsd ?? 0) < 1;

  // Per-total price provenance. The listing's USD is oracle-priced at the backend
  // (chain-derived) with a DefiLlama fallback only for reserves the oracle
  // registry omits. A total is chain-derived iff the balances are read from the chain
  // (not the MV-indexed fallback) AND every reserve contributing to it was
  // oracle-priced; if either fails, tag the DefiLlama-priced `usdProv` instead of
  // over-asserting an on-chain figure — the same strictness the detail card uses.
  const chainBalances = !row.chainHfStale;
  const supplyReserves = row.reserves.filter((r) => scaleChainBalance(r.supplyBalanceRaw, r.decimals) > 0);
  const collateralReserves = supplyOnly ? supplyReserves : supplyReserves.filter((r) => r.isCollateral);
  const debtReserves = row.reserves.filter((r) => scaleChainBalance(r.debtBalanceRaw, r.decimals) > 0);
  const collateralOnChain =
    chainBalances &&
    collateralReserves.length > 0 &&
    collateralReserves.every((r) => isOnChainPriceSource(r.priceSource));
  const debtOnChain =
    chainBalances && debtReserves.length > 0 && debtReserves.every((r) => isOnChainPriceSource(r.priceSource));

  const collateralValue = (() => {
    // "Collateral" is the full (un-LT-weighted) value of the supplies enabled as
    // collateral. Supply-only positions show the full deposited value. The LT
    // weighting lives in HF and borrowing power.
    const usd = supplyOnly ? calc.totalCollateralUsd : calc.breakdown.collateralUsd;
    const v = fmtUsd(usd);
    const label = supplyOnly ? "Supplied" : "Collateral";
    const info = collateralOnChain
      ? usdProvOnchain(label)
      : usdProv(label, { amountLabel: "supply balance", amountKind: "chain" });
    return (
      <RevealTip tip={v.title}>
        <Prov info={info}>{v.display}</Prov>
      </RevealTip>
    );
  })();

  const debtValue = (() => {
    const v = fmtUsd(calc.totalDebtUsd);
    const info = debtOnChain
      ? usdProvOnchain("Debt")
      : usdProv("Debt", { amountLabel: "debt balance", amountKind: "chain" });
    return (
      <RevealTip tip={v.title}>
        <Prov info={info}>{v.display}</Prov>
      </RevealTip>
    );
  })();

  // The wallet and its hubs after the lifecycle pill; the spoke (the market) at
  // the right end.
  const identity = (
    <>
      <WalletPill wallet={row.wallet} ensName={row.ensName} filterProtocol={session} bookmarkProtocol={session} />
      <span className="text-xs font-bold uppercase tracking-wide leading-none text-rb-500">
        {hubChipLabel(hubTier, debtHubs)}
      </span>
    </>
  );
  const tag = <ListingTag market={row.spokeName} />;
  // Time-ago, the owner transaction count (distinct non-liquidation
  // transactions), then the red liquidation triangle.
  const counters = {
    lastActivityAt: row.lastActivityAt,
    eventCount: row.txCount,
    liquidationCount: row.liquidationCount,
  };

  // ⇒ A LISTING ROW: the shell declares its <Prov> figures unscoped, so they
  // trace nothing, the contract of every listing render.
  if (!isOpen) {
    // Closed / liquidated: the all-time high-water mark (Highest recorded
    // supply or collateral, Highest recorded debt) as the detail card shows
    // it, with no debt head when the position never carried real debt. The
    // Outcome column's word and date say how it ended.
    const status: PositionCardStatus = closedByLiquidation
      ? { word: "Liquidated", tone: "danger" }
      : { word: "Closed", tone: "muted" };
    const peak = (usd: number) => {
      const v = fmtUsd(usd);
      return (
        <span className="text-rb-500">
          <RevealTip tip={v.title}>{v.display}</RevealTip>
        </span>
      );
    };
    const heads: PositionCardHead[] = [
      {
        id: "peak-collateral",
        label: peakSupplyOnly ? CARD_VOCAB.peakSupply : CARD_VOCAB.peakCollateral,
        value: peakKnown ? peak(row.peakSupplyUsd ?? 0) : null,
      },
      ...(peakSupplyOnly ? [] : [{ id: "peak-debt", label: CARD_VOCAB.peakDebt, value: peak(row.peakDebtUsd ?? 0) }]),
    ];
    const slots: PositionCardListingSlots = {
      surface: "listing",
      status,
      heads,
      identity,
      tag,
      counters,
      menu: null,
      outcome: {
        word: closedByLiquidation ? "Liquidated" : "Closed",
        dates: closedAt ? [{ at: closedAt }] : undefined,
      },
    };
    return <PositionCard slots={slots} />;
  }

  // A side of one asset states its amount with its icon and the dollars
  // beneath in cents; a side of several, compact dollars with the icons.
  const oneAsset = (
    r: AaveV4SpokeReserveSummary,
    raw: string,
    usd: number,
    label: string,
    onChain: boolean,
  ): Pick<PositionCardHead, "value" | "usd"> => {
    const amount = scaleChainBalance(raw, r.decimals);
    const info = onChain
      ? usdProvOnchain(label)
      : usdProv(label, { amountLabel: `${label.toLowerCase()} balance`, amountKind: "chain" });
    return {
      value: (
        <AssetAmount value={amount} symbol={r.symbol} address={r.address} exact={formatUnitsExact(raw, r.decimals)} />
      ),
      usd:
        r.usdPrice != null && r.usdPrice > 0 ? (
          <Prov info={info}>
            <span className="font-bold text-green-400">{formatUsdValue(usd)}</span>
          </Prov>
        ) : null,
    };
  };
  const symbols = supplyOnly ? calc.supplyingSymbols : calc.breakdown.collateralSymbols;
  const oneColl = collateralReserves.length === 1 && symbols.length === 1 ? collateralReserves[0] : null;
  const oneDebt = debtReserves.length === 1 ? debtReserves[0] : null;
  const collUsd = supplyOnly ? calc.totalCollateralUsd : calc.breakdown.collateralUsd;
  const heads: PositionCardHead[] = [
    {
      id: supplyOnly ? "supplied" : "collateral",
      label: supplyOnly ? "Supplied" : CARD_VOCAB.collateral,
      ...(oneColl
        ? oneAsset(
            oneColl,
            oneColl.supplyBalanceRaw,
            collUsd,
            supplyOnly ? "Supplied" : "Collateral",
            collateralOnChain,
          )
        : {
            assets: symbols.length > 0 ? <InlineAssetCluster symbols={symbols} /> : undefined,
            value: collateralValue,
          }),
    },
    // Supply-only draws the one head: no Debt or Health factor to assert.
    ...(supplyOnly
      ? []
      : [
          {
            id: "debt",
            label: CARD_VOCAB.debt,
            ...(oneDebt
              ? oneAsset(oneDebt, oneDebt.debtBalanceRaw, calc.totalDebtUsd, "Debt", debtOnChain)
              : {
                  assets:
                    calc.borrowingSymbols.length > 0 ? (
                      <InlineAssetCluster symbols={calc.borrowingSymbols} />
                    ) : undefined,
                  value: debtValue,
                }),
          },
          {
            id: "health-factor",
            label: ratioLabel("pooled"),
            // Approximate-value flag: the calculator glyph says the figure is
            // computed from indexed balances because the live read was
            // unavailable; the leading "~" on the value says approximate.
            labelIcon: hfStale ? (
              <span
                className="text-rb-500"
                title="Approximate — live on-chain source unavailable. Shown value derived from indexed balances × off-chain prices."
                aria-label="Health factor is approximate; live on-chain source unavailable"
              >
                <Icon name="calculator" size={11} />
              </span>
            ) : undefined,
            value: hasDebt ? (
              <>
                {hfStale ? "~" : ""}
                {hfLabelV4(healthFactor)}
              </>
            ) : (
              <span className="text-rb-500">∞</span>
            ),
            // The hard on-chain fact the detail card's panel states; a listing
            // row's pill is the lifecycle one.
            sub: isLiquidatable ? "liquidatable at this block" : undefined,
          },
        ]),
  ];
  const slots: PositionCardListingSlots = {
    surface: "listing",
    status: null,
    heads,
    identity,
    tag,
    counters,
    menu: null,
  };
  return <PositionCard slots={slots} />;
}
