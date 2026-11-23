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
// lifecycle pill (OPEN, CLOSED, LIQUIDATED), the spoke as the tag, the
// wallet and hubs as the identity, the counters at the right of the heading row, and no panel. A
// health factor below 1 says so under the figure, since the listing's pill is
// the lifecycle one.

import { ListingTag } from "@/components/shared/listing-tag";
import { notRecordedNote, CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { symbolOnly } from "@/lib/shared/asset-mark";
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
import { isOnChainPriceSource } from "@/lib/aave-v4/position-provenance";
import { aaveV4UsdReceipt, type AaveV4UsdResult } from "@/lib/aave-v4/usd-receipt";
import { aaveV4NoPriceLine, type AaveV4PriceSource as AaveV4OnChainSource } from "@/lib/aave-v4/price-notes";

export function AaveV4PositionListingCard({ row }: { row: AaveV4SpokePositionRow }) {
  // Build the calculation's inputs from the server's chain-state reserves[]. Same inputs the
  // detail page passes to calculateAaveV4Position inside patchSpokeCardWithChain.
  const calc = useMemo(() => {
    const supplies: CalcPositionInputs["supplies"] = [];
    const debts: CalcPositionInputs["debts"] = [];
    const supplyingSymbols: string[] = [];
    const borrowingSymbols: string[] = [];

    for (const r of row.reserves) {
      // Only an on-chain price counts (ui-jobs 743): a DefiLlama or $1-face
      // price leaves the reserve unpriced.
      const price = isOnChainPriceSource(r.priceSource) ? (r.usdPrice ?? 0) : 0;
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
  const supplyOnly = calc.borrowingSymbols.length === 0;
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
  // The wire states no closing date for a row it serves as open; the
  // chain-closed card dates the close by the last act, which emptied it.
  const closedAt = row.closedAt ?? (wireOpen ? row.lastActivityAt : undefined);

  // The balances are the chain read's where it answered, else the index's;
  // the prices only on-chain ones (below).
  const chainBalances = !row.chainHfStale;
  const supplyReserves = row.reserves.filter((r) => scaleChainBalance(r.supplyBalanceRaw, r.decimals) > 0);
  const collateralReserves = supplyOnly ? supplyReserves : supplyReserves.filter((r) => r.isCollateral);
  const debtReserves = row.reserves.filter((r) => scaleChainBalance(r.debtBalanceRaw, r.decimals) > 0);
  // Each side's dollars and receipt: each reserve's balance × its on-chain
  // price as shown, to the cent, summed; where a reserve on the side has no
  // on-chain price, no figure and the reserve named (ui-jobs 743).
  const sideReceipt = (reserves: AaveV4SpokeReserveSummary[], side: "supply" | "debt", what: string) =>
    aaveV4UsdReceipt({
      what,
      rows: reserves.map((r) => ({
        symbol: r.symbol,
        address: r.address,
        amount: scaleChainBalance(side === "debt" ? r.debtBalanceRaw : r.supplyBalanceRaw, r.decimals),
        amountNote: chainBalances
          ? `the spoke's ${side === "debt" ? "getUserTotalDebt" : "getUserSuppliedAssets"}, read when the row was served`
          : "the indexed balance, the live read having failed",
        price:
          isOnChainPriceSource(r.priceSource) && r.usdPrice != null && r.usdPrice > 0
            ? { usd: r.usdPrice, source: r.priceSource as AaveV4OnChainSource }
            : null,
      })),
      face: reserves.length === 1 ? "cents" : "compact",
      via: "the listing's chain read × the oracle map, as served",
    });
  const collR = sideReceipt(collateralReserves, "supply", supplyOnly ? "Supplied in USD" : "Collateral in USD");
  const debtR = sideReceipt(debtReserves, "debt", "Debt in USD");
  const sideValue = (r: AaveV4UsdResult | null) =>
    !r ? null : r.prov == null ? (
      <span className="text-[11px] font-normal text-rb-500" data-prov-exempt="" data-total-unpriced="">
        {aaveV4NoPriceLine(r.missing)}
      </span>
    ) : (
      (() => {
        const v = fmtUsd(r.usd);
        return (
          <RevealTip tip={v.title}>
            <Prov info={r.prov}>{v.display}</Prov>
          </RevealTip>
        );
      })()
    );
  const collateralValue = sideValue(collR);
  const debtValue = sideValue(debtR);

  // The spoke (the market) as the tag after the lifecycle pill, then the
  // wallet and its hubs.
  const identity = (
    <>
      <WalletPill wallet={row.wallet} ensName={row.ensName} filterProtocol={session} bookmark />
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
    // Closed / liquidated: the all-time high-water mark (Peak
    // supply or collateral, Peak debt) as the detail card shows
    // it, with no debt head when the position never carried real debt. The
    // Outcome column's word and date say how it ended.
    const status: PositionCardStatus = closedByLiquidation
      ? { word: "Liquidated", tone: "danger" }
      : { word: "Closed", tone: "muted" };
    // The server's peak figures are no sum of shown products and carry no
    // receipt (ui-jobs 743): the listing asserts none, in the house's
    // not-recorded form, and the position page states the peaks it can rebuild.
    // Both columns, whatever the dollar peaks say (ui-jobs 743): the wire
    // counts no lifetime borrows, and a closed row's debtAssetCount is 0
    // whether or not it ever borrowed, so no count can tell a supply-only
    // position apart.
    const notRecorded = notRecordedNote("position");
    const heads: PositionCardHead[] = [
      {
        id: "peak-collateral",
        label: CARD_VOCAB.peakCollateral,
        value: null,
        sub: notRecorded,
      },
      { id: "peak-debt", label: CARD_VOCAB.peakDebt, value: null, sub: notRecorded },
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
    receipt: AaveV4UsdResult | null,
  ): Pick<PositionCardHead, "value" | "usd"> => {
    const amount = scaleChainBalance(raw, r.decimals);
    return {
      value: (
        <AssetAmount value={amount} symbol={r.symbol} address={r.address} exact={formatUnitsExact(raw, r.decimals)} />
      ),
      usd:
        receipt?.prov == null ? (
          receipt ? (
            <span className="text-[11px] font-normal text-rb-500" data-prov-exempt="" data-total-unpriced="">
              {aaveV4NoPriceLine(receipt.missing)}
            </span>
          ) : null
        ) : (
          <Prov info={receipt.prov}>
            <span className="font-bold text-green-400">{formatUsdValue(receipt.usd)}</span>
          </Prov>
        ),
    };
  };
  const symbols = supplyOnly ? calc.supplyingSymbols : calc.breakdown.collateralSymbols;
  const oneColl = collateralReserves.length === 1 && symbols.length === 1 ? collateralReserves[0] : null;
  const oneDebt = debtReserves.length === 1 ? debtReserves[0] : null;
  const heads: PositionCardHead[] = [
    {
      id: supplyOnly ? "supplied" : "collateral",
      label: supplyOnly ? "Supplied" : CARD_VOCAB.collateral,
      ...(oneColl
        ? oneAsset(oneColl, oneColl.supplyBalanceRaw, collR)
        : {
            assets: symbols.length > 0 ? <InlineAssetCluster assets={symbols.map(symbolOnly)} /> : undefined,
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
              ? oneAsset(oneDebt, oneDebt.debtBalanceRaw, debtR)
              : {
                  assets:
                    calc.borrowingSymbols.length > 0 ? (
                      <InlineAssetCluster assets={calc.borrowingSymbols.map(symbolOnly)} />
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
                title="Approximate: live on-chain source unavailable. Shown value derived from indexed balances × off-chain prices."
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
