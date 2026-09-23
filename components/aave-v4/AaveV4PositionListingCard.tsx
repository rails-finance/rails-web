"use client";

// Aave V4 spoke-position listing card. Visual + numeric analog of the
// detail page's position card (components/protocol/aave-v4/aave-v4-spoke-card.tsx).
//
// How parity is enforced:
//   - Layout shell: both surfaces render through `OpenPositionStats`, so
//     grid, label/value spacing, footnote handling, and asset-cluster
//     alignment are byte-identical.
//   - Numbers: the server ships per-reserve chain-state (`reserves[]`:
//     chain balances, LTs, isCollateral, on-chain oracle prices) on every listing
//     row, mirroring the detail page's chain-state endpoint. The card runs
//     the same `simulateAaveV4Position` the detail's `patchSpokeCardWithChain`
//     runs, so totals, liq prices, and borrowing power are derived from
//     identical inputs.
//   - Formatting: shared `fmtUsd` / `hfLabel` / `fmtLiqPrice` (`lib/aave-v4/format.ts`).
//
// Listing-only additions (not on the detail card):
//   - Wallet identity pill (facehash + short addr + copy) sits alongside
//     the spoke identity, since the listing shows many wallets and the
//     detail is already scoped to one.
//   - Time-ago in the `identity` slot.
//   - Renders through the shared <PositionCardShell> (roster grammar): the
//     listing's status pill is the LIFECYCLE word (open/closed/liquidated,
//     `LifecyclePill`), not the detail card's mode word (Borrowing / Supply
//     only / Liquidatable) — the two-axis rule. The mode word's one load-
//     bearing state, Liquidatable, still needs to be readable off a listing
//     row, so it rides as a footnote under Health Factor instead of the pill.

import { ratioLabel } from "@/lib/shared/card-vocab";
import { InlineAssetCluster } from "@/components/shared/inline-asset-cluster";
import { Icon } from "@/components/icons/icon";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
import { ClosedPositionStats } from "@/components/shared/closed-position-stats";
import { StatValue, StatDash } from "@/components/shared/stat-value";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { useMemo } from "react";
import type { AaveV4SpokePositionRow } from "@/lib/api/fetch-aave-v4-spoke-positions";
import { scaleChainBalance } from "@/lib/api/fetch-aave-v4-spoke-position";
import { SPOKE_HUB, HUB_TIER_LABEL } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";
import { PositionCardMeta } from "@/components/shared/position-card-meta";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { LifecyclePill } from "@/components/shared/position-card-pills";
import { WalletPill } from "@/components/shared/wallet-pill";
import { fmtUsd, hfLabel } from "@/lib/aave-v4/format";
import { simulateAaveV4Position, computeSupplyBreakdown, type SimPositionInputs } from "@/lib/aave-v4/utils/simulate";
import { liquidationBufferFrom } from "@/lib/aave-v4/spoke-cards";
import { AaveV4LiquidationFootnote } from "@/components/protocol/aave-v4/aave-v4-liquidation-footnote";
import { Prov } from "@/components/shared/provenance";
import { usdProvOnchain, usdProv, isOnChainPriceSource } from "@/lib/aave-v4/position-provenance";

export function AaveV4PositionListingCard({ row }: { row: AaveV4SpokePositionRow }) {
  // Build sim inputs from the server's chain-state reserves[]. Same inputs the
  // detail page passes to simulateAaveV4Position inside patchSpokeCardWithChain.
  const sim = useMemo(() => {
    const supplies: SimPositionInputs["supplies"] = [];
    const debts: SimPositionInputs["debts"] = [];
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

    const result = simulateAaveV4Position({ supplies, debts });

    return {
      ...result,
      supplyingSymbols,
      borrowingSymbols,
      breakdown: computeSupplyBreakdown(supplies),
    };
  }, [row.reserves]);

  // Liquidation read — identical helper to the detail card. Single collateral
  // asset → its price; two or more → the 1 − 1/HF buffer. Uses the chain HF the
  // server shipped (row.healthFactor), not the sim's derived HF.
  const buf = liquidationBufferFrom(row.healthFactor, sim.totalDebtUsd, sim.assetLiqPrices);

  // Prefer the chain HF the server already shipped (matches Aave UI by
  // construction) over the sim's derived HF. They agree when LTs are fresh;
  // chain wins when they don't (premium-shares, recently-changed LT).
  const healthFactor = row.healthFactor;
  const hasDebt = healthFactor != null;
  // Hard on-chain fact (HF < 1), not an editorialized "at risk" judgment — the
  // ratio-column footnote below names it the same way the detail spoke card's
  // mode-word pill would, since a listing row carries no such pill.
  const isLiquidatable = hasDebt && healthFactor < 1;
  // Live view: ANY live debt counts as borrowing — no dust floor. A sub-dollar
  // leftover borrow still shows its full Debt / HF readout so the headline
  // agrees with the "Borrowing" pill (both key off debt > 0). Past borrows or
  // liquidations on an otherwise debt-free position stay carried by the
  // LiquidatedBadge + timeline, since debt is genuinely 0 there.
  const supplyOnly = sim.totalDebtUsd <= 0;
  // Chain overlay failed for this row → balances are MV-indexed (potentially
  // drifted from on-chain). The card still renders; the indicator warns.
  const hfStale = hasDebt && row.chainHfStale;
  const hubTier = SPOKE_HUB[row.spokeName] ?? "Core";

  // Lifecycle (two-axis model). Status is structural: open vs closed (no live
  // balance). A closed position renders through the shared terminal frame
  // (ClosedPositionStats), grey CLOSED badge / "Closed" outcome for an
  // owner-driven wind-down, red CLOSED badge / "Liquidated" outcome when the
  // wire status carries that terminal cause (closedByLiquidation below) — the
  // Outcome column names it, so no separate qualifier text is needed.
  // Liquidation *history* (any liquidation over the position's life, open or
  // closed) is the orthogonal LiquidatedBadge, not this pill. A zeroed position
  // has no live balances, so in place of the live stat grid it shows the all-time
  // high-water mark — Peak Supplied / Peak Debt — matching the detail card.
  // Null-safe against a pre-057 API that omits `status`: that API only ever
  // returned open positions (closed ones were pruned), so absent ⇒ open.
  const isOpen = row.status == null || row.status === "open";
  const closedByLiquidation = row.status === "liquidated";
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
    // collateral. Supply-only positions have no collateral concept yet, so show
    // the full deposited value; once there's debt, non-collateral supplies are
    // excluded (shown as a footnote). The LT weighting lives in HF + borrowing
    // power, not in this number.
    const usd = supplyOnly ? sim.totalCollateralUsd : sim.breakdown.collateralUsd;
    const v = fmtUsd(usd);
    const label = supplyOnly ? "Supplied" : "Collateral";
    const info = collateralOnChain
      ? usdProvOnchain(label)
      : usdProv(label, { amountLabel: "supply balance", amountKind: "chain" });
    // Supply-only positions are still live — render the value bright like any
    // active position. The muted (text-rb-500) tone is reserved for genuinely
    // closed positions, so using it here would falsely read as "closed."
    return (
      <StatValue color="text-foreground/80" title={v.title}>
        <Prov info={info}>{v.display}</Prov>
      </StatValue>
    );
  })();

  // Debt / HF values for positions carrying real (non-dust) debt. Supply-only
  // rows never reach these — their columns are `null`ed out below so the grid
  // slot stays open without asserting an empty Debt/HF (matches the detail
  // card and the closed-Liquity precedent: an absent dimension shows nothing,
  // not a placeholder dash).
  const debtValue = (() => {
    const v = fmtUsd(sim.totalDebtUsd);
    const info = debtOnChain
      ? usdProvOnchain("Debt")
      : usdProv("Debt", { amountLabel: "debt balance", amountKind: "chain" });
    return (
      <StatValue color="text-foreground/80" title={v.title}>
        <Prov info={info}>{v.display}</Prov>
      </StatValue>
    );
  })();

  const hfValue = (() => {
    if (!hasDebt) return <StatDash>{"∞"}</StatDash>;
    return (
      <StatValue color="text-foreground/80">
        {hfStale ? "~" : ""}
        {hfLabel(healthFactor)}
      </StatValue>
    );
  })();

  // Shared identity nodes — both the open (OpenPositionStats) and closed
  // (ClosedPositionStats) frames carry the same wallet + spoke lead and the
  // same right-hand activity-meta cluster: time-ago, the owner transaction
  // count, then the red liquidation triangle. txCount is distinct
  // non-liquidation transactions — liquidations stay on the triangle, not in
  // this tally.
  const leadingIdentity = (
    <>
      <WalletPill wallet={row.wallet} ensName={row.ensName} filterProtocol="aave-v4" bookmarkProtocol="aave-v4" />
      <span className="flex items-center gap-1.5 leading-none text-foreground">
        <span className="text-xs font-semibold">{row.spokeName}</span>
        <span className="text-xs font-bold uppercase tracking-wide">{HUB_TIER_LABEL[hubTier]}</span>
      </span>
    </>
  );
  const metaIdentity = (
    <PositionCardMeta
      lastActivityAt={row.lastActivityAt}
      eventCount={row.txCount}
      liquidationCount={row.liquidationCount}
    />
  );

  // ⇒ A LISTING ROW, so its <Prov> figures deliberately trace nothing — same
  // contract as every other listing render. <PositionCardShell> makes that
  // declaration (via <ProvUnscoped>) once both branches render through it.
  if (!isOpen) {
    // Closed / liquidated: no live balances to show, so the shared terminal
    // frame surfaces the all-time high-water mark (Peak Supplied / Peak Debt)
    // the same way the detail card does — no debt column when the position
    // never carried real debt. The Outcome column's own word ("Closed" /
    // "Liquidated") plus its closedAt date now carry what the old "by
    // liquidation" caption said, so that caption is retired.
    return (
      <PositionCardShell>
        <ClosedPositionStats
          outcome={closedByLiquidation ? "liquidated" : "closed"}
          leadingIdentity={leadingIdentity}
          identity={metaIdentity}
          closedAt={row.closedAt ?? undefined}
          collateralLabel={peakSupplyOnly ? CARD_VOCAB.peakSupply : CARD_VOCAB.peakCollateral}
          collateral={(() => {
            const v = fmtUsd(row.peakSupplyUsd ?? 0);
            return (
              <StatValue color="text-rb-500" title={v.title}>
                {v.display}
              </StatValue>
            );
          })()}
          debt={
            peakSupplyOnly
              ? undefined
              : (() => {
                  const v = fmtUsd(row.peakDebtUsd ?? 0);
                  return (
                    <StatValue color="text-rb-500" title={v.title}>
                      {v.display}
                    </StatValue>
                  );
                })()
          }
        />
      </PositionCardShell>
    );
  }

  return (
    <PositionCardShell>
      <OpenPositionStats
        statusPill={<LifecyclePill status="open" />}
        leadingIdentity={leadingIdentity}
        identity={metaIdentity}
        columns={[
          {
            label: supplyOnly ? "Supplied" : "Collateral",
            assetIcons: (() => {
              const symbols = supplyOnly ? sim.supplyingSymbols : sim.breakdown.collateralSymbols;
              return symbols.length > 0 ? <InlineAssetCluster symbols={symbols} /> : undefined;
            })(),
            value: collateralValue,
            footnote:
              !supplyOnly && sim.breakdown.nonCollateralUsd > 0 ? (
                <div className="text-xs mt-0.5 text-rb-500">
                  + {fmtUsd(sim.breakdown.nonCollateralUsd).display} supplied · not collateral
                </div>
              ) : undefined,
          },
          // Supply-only → null both columns. The grid slot stays open (so the
          // card lines up with sibling borrowing cards) but renders nothing —
          // no "Debt"/"Health Factor" label, no dash, no footnote.
          supplyOnly
            ? null
            : {
                label: "Debt",
                assetIcons:
                  sim.borrowingSymbols.length > 0 ? <InlineAssetCluster symbols={sim.borrowingSymbols} /> : undefined,
                value: debtValue,
              },
          supplyOnly
            ? null
            : {
                label: ratioLabel("pooled"),
                headerIcon: hfStale ? (
                  // Approximate-value flag, NOT an adverse-event warning — the
                  // caution triangle is reserved for liquidations/redemptions, so
                  // a derived HF uses the neutral calculator glyph ("computed, not
                  // read live") and no valence colour. The leading `~` on the value
                  // carries "approximate"; this says why (source unavailable).
                  <span
                    className="text-rb-500"
                    title="Approximate — live on-chain source unavailable. Shown value derived from indexed balances × off-chain prices."
                    aria-label="Health factor is approximate; live on-chain source unavailable"
                  >
                    <Icon name="calculator" size={11} />
                  </span>
                ) : undefined,
                value: hfValue,
                // Liquidation read sits beneath HF as its tangible restatement (single
                // collateral → price, multi → 1 − 1/HF buffer), mirroring the detail
                // card. Borrowing power stays omitted (misreads as safe-to-borrow).
                // The detail spoke card names this state with a mode-word pill
                // ("Liquidatable"); a listing row's pill is the lifecycle one
                // (open/closed), so this line carries the hard on-chain fact in
                // its place — AaveV4LiquidationFootnote itself renders nothing
                // once already-liquidatable (its price/drop read stops applying).
                footnote: (
                  <>
                    {isLiquidatable && <div className="text-xs mt-0.5 text-rb-500">liquidatable at this block</div>}
                    <AaveV4LiquidationFootnote buf={buf} />
                  </>
                ),
              },
        ]}
      />
    </PositionCardShell>
  );
}
