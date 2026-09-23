"use client";

// Dolomite protocol view — every listed market and the risk ladder over it,
// in the Aave-V3-family table shape (components/shared/aave-market-views.tsx):
// a summary line, then every market as one sortable row rather than a card.
// ----------------------------------------------------------------------------
// Provenance: the whole view owns ONE <ProvReceiptsScope> (the scoped pilots'
// posture — the figures are one block's reading of one core contract, so they
// belong in one receipts list). Every rendered figure is a live DolomiteMargin
// read, so each carries a <Prov> from lib/dolomite/markets-provenance. The two
// GLOBAL constants in the carve-out sentence (the global minimum and spread)
// are traced; the account-override terms are not asserted here at all — they
// are account-keyed and unreadable on a roster. The `withPremium` / `closing`
// roster COUNTS are aggregations over per-market predicate reads (each leg
// already traced on its own row), not a single chain figure, so they carry
// data-prov-exempt rather than a receipt that would overclaim.
// The claim: Dolomite's own risk engine demands 117.65% minimum
// collateralisation against its zero-premium markets and MATERIALLY more
// against the premium-bearing ones — multiplicatively (Solo semantics:
// adjusted supply = raw ÷ (1+premium), adjusted borrow = raw × (1+premium)),
// so WLFI's 27.5% premium lands its requirement at ≈150.0%, not an additive
// 145.15%. Margin ratio and margin premium genuinely share ONE axis — both
// are minimum-collateralisation requirements — which is what makes the ladder
// legitimate here (where Compound V2's CF-vs-utilization was not).
//
// The rung renders as a mini bar in its own column (the utilisation column's
// grammar, not <RatioBar>'s card-scale one): fill = the market's own minimum
// as collateral, normalized against the roster's highest rung. No risk color.
// DEFAULT order is size (supplied desc), matching the Aave-family table — any
// column sorts on request, which is user agency, not Rails ranking by risk.
// Asset-name sorting keys on the market's NUMERIC id, Dolomite's own key,
// never the symbol: the symbol space collides on purpose (rUSD / srUSD /
// wsrUSD / cUSD / stcUSD).
//
// ⚠️ THE CARVE-OUT is stated, not smoothed: some accounts (observed:
// wstETH/WETH and weETH/WETH pairs) carry the core's own account-level risk
// override — a lower minimum, a narrower spread, premiums SKIPPED — so the
// ladder is the default frame, not a universal one. The override is
// account-keyed (getAccountRiskOverrideByAccount takes an account), so its
// exact terms are unreadable here and render only on each position page,
// which reads it per account.
//
// No animation: framer nodes per row are what froze the listing shells.

import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { shortAddress, DOLOMITE_ADDRESSES } from "@/lib/dolomite/asset-catalog";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { VitalsBand } from "@/components/shared/vitals-band";
import {
  type DolomiteMarketCoords,
  dolRosterCountProv,
  dolMarketValueProv,
  dolMarketPriceProv,
  dolMarginPremiumProv,
  dolMinCollatProv,
  dolMarketSpreadProv,
  dolRateProv,
  dolSummaryValueProv,
  dolGlobalMinProv,
  dolGlobalSpreadProv,
} from "@/lib/dolomite/markets-provenance";
import type { DolomiteMarketRow, DolomiteMarketsResponse } from "@/lib/sources/chain/dolomite-markets";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);

const usd = (v: number | null): string =>
  v == null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;

const tokenAmount = (v: number, symbol: string): string => {
  const n =
    v === 0
      ? "0"
      : Math.abs(v) < 0.001
        ? v.toExponential(2)
        : v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 });
  return `${n} ${symbol}`;
};

// Oracle price — same register as the Aave-family table: the full figure
// above $1k (prices read as exact quotes, not sizes), two decimals below.
function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A compact fill bar — the utilisation column's grammar (h-1 w-10), reused
// for the minimum-collateralisation rung so both risk-shaped columns read the
// same way. Both are decorative renderings of a figure already receipted
// beside them, so both opt out of the coverage tripwire.
function MiniBar({ frac, title }: { frac: number; title: string }) {
  const clamped = Math.max(0, Math.min(1, frac));
  return (
    <span className="inline-flex items-center gap-1.5" data-prov-exempt="" title={title}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-foreground/10">
        <span className="block h-full rounded-full bg-foreground/50" style={{ width: `${clamped * 100}%` }} />
      </span>
    </span>
  );
}

function UtilMini({ m }: { m: DolomiteMarketRow }) {
  if (m.utilisation == null || m.totalBorrowUsd == null || m.totalBorrowUsd <= 0)
    return <span className="text-[12px] text-rb-500">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      data-prov-exempt=""
      title="Utilisation is borrowed ÷ supplied — both already traced in this row (the supplied and borrowed USD receipts). A ratio of two receipted figures, not a distinct chain read."
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-foreground/10">
        <span
          className="block h-full rounded-full bg-foreground/50"
          style={{ width: `${Math.max(0, Math.min(1, m.utilisation)) * 100}%` }}
        />
      </span>
      <span className="tabular-nums text-[11px] text-rb-500">{pctText(m.utilisation, 0)}</span>
    </span>
  );
}

/** One market row — a keyed component (not a `.map` callback) so it can own
 *  its own `useReceiptRegistry()` hook, the same per-row scoping the
 *  Aave-family table uses. */
function MarketRow({ m, axisMax, block }: { m: DolomiteMarketRow; axisMax: number; block: number }) {
  const registry = useReceiptRegistry();
  const coords: DolomiteMarketCoords = { blockNumber: block, marketId: m.marketId, symbol: m.symbol };
  const priceTitle = m.priceAliasOf
    ? `This market's price equals ${m.priceAliasOf.symbol}'s (market ${m.priceAliasOf.marketId}) to the wei — a 1:1 alias through the shared oracle: live, but not an independent feed.`
    : "The market's own oracle price (DolomiteMargin.getMarketPrice)";

  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <tr className="border-t border-rb-200 transition-colors hover:bg-foreground/[0.02] dark:border-rb-800">
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <TokenChipIcon symbol={m.symbol} address={m.token} size={20} filterable={false} />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                {m.symbol}
                {m.isClosing && (
                  <span
                    className="text-[10px] uppercase tracking-wide text-rb-500"
                    title="Closing: no new borrowing; existing debt still runs and the supply still earns"
                  >
                    closing
                  </span>
                )}
              </div>
              <a
                href={explorerUrl(MAINNET_CHAIN_ID, "address", m.token)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-external text-[11px] text-rb-500"
              >
                market {m.marketId} · {shortAddress(m.token)}
              </a>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 tabular-nums text-[13px] text-foreground/80">
          <Prov info={dolMinCollatProv(coords)}>{pctText(m.minCollateralization, 1)}</Prov>
          <div className="mt-1 flex items-center gap-1.5">
            <MiniBar
              frac={m.minCollateralization / axisMax}
              title={`${pctText(m.minCollateralization, 1)} minimum collateralisation, on the roster's shared axis`}
            />
            <span className="whitespace-nowrap text-[10px] font-normal text-rb-500">
              {m.marginPremium > 0 ? (
                <Prov info={dolMarginPremiumProv(coords)}>{pctText(m.marginPremium, 1)} premium</Prov>
              ) : (
                "no premium"
              )}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80" title={priceTitle}>
          {m.priceUsd != null ? (
            <Prov info={dolMarketPriceProv(coords)}>{fmtPrice(m.priceUsd)}</Prov>
          ) : (
            <span className="text-rb-500">—</span>
          )}
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
          title={`${tokenAmount(m.totalSupplyUnderlying, m.symbol)} supplied`}
        >
          <Prov info={dolMarketValueProv("supplied", coords)}>{usd(m.totalSupplyUsd)}</Prov>
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
          title={`${tokenAmount(m.totalBorrowUnderlying, m.symbol)} borrowed`}
        >
          <Prov info={dolMarketValueProv("borrowed", coords)}>{usd(m.totalBorrowUsd)}</Prov>
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
          title="Current borrow APR, read live from the core"
        >
          {m.borrowAprPct != null ? (
            <Prov info={dolRateProv("borrow", coords)}>{m.borrowAprPct.toFixed(2)}%</Prov>
          ) : (
            <span className="text-rb-500">—</span>
          )}
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
          title="Current supply APR, derived from the core's own borrow rate, utilisation and earnings share"
        >
          {m.supplyAprPct != null ? (
            <Prov info={dolRateProv("supply", coords)}>{m.supplyAprPct.toFixed(2)}%</Prov>
          ) : (
            <span className="text-rb-500">—</span>
          )}
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
          title="The collateral premium a liquidator earns seizing this market"
        >
          <Prov info={dolMarketSpreadProv(coords)}>{pctText(m.liquidationSpread, 1)}</Prov>
        </td>
        <td className="px-3 py-2.5">
          <UtilMini m={m} />
        </td>
      </tr>
    </ProvReceiptsScope>
  );
}

type SortKey =
  | "asset"
  | "minCollat"
  | "price"
  | "supplied"
  | "borrowed"
  | "borrowRate"
  | "supplyApy"
  | "spread"
  | "util";

export function DolomiteMarketsStamp({ data }: { data: DolomiteMarketsResponse }) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {data.blockNumber.toLocaleString("en-US")}
      </a>{" "}
      · the market roster and every price from{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", DOLOMITE_ADDRESSES.MARGIN)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        DolomiteMargin
      </a>{" "}
      itself
      {data.risk.overrideSetter && (
        <>
          {" "}
          · override setter{" "}
          <a
            href={explorerUrl(MAINNET_CHAIN_ID, "address", data.risk.overrideSetter)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external"
          >
            {shortAddress(data.risk.overrideSetter)}
          </a>
        </>
      )}
    </p>
  );
}

export function DolomiteMarketsView({ data }: { data: DolomiteMarketsResponse }) {
  // Hook first (before the early return), so the receipts registry is stable
  // across renders regardless of the stale branch — the scoped-pilot order.
  const registry = useReceiptRegistry();
  const [sortKey, setSortKey] = useState<SortKey>("supplied");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "asset" ? "asc" : "desc");
    }
  };

  const baseline = 1 + data.risk.marginRatio;
  const axisMax = Math.max(baseline, ...data.markets.map((m) => m.minCollateralization), 1);
  const aliased = data.markets.filter((m) => m.priceAliasOf != null);
  const summaryCoords: DolomiteMarketCoords = { blockNumber: data.blockNumber };

  const sortedMarkets = useMemo(() => {
    const cmp = (a: DolomiteMarketRow, b: DolomiteMarketRow): number => {
      switch (sortKey) {
        case "asset":
          return a.marketId - b.marketId;
        case "minCollat":
          return a.minCollateralization - b.minCollateralization;
        case "price":
          return (a.priceUsd ?? -1) - (b.priceUsd ?? -1);
        case "supplied":
          return (a.totalSupplyUsd ?? -1) - (b.totalSupplyUsd ?? -1);
        case "borrowed":
          return (a.totalBorrowUsd ?? -1) - (b.totalBorrowUsd ?? -1);
        case "borrowRate":
          return (a.borrowAprPct ?? -1) - (b.borrowAprPct ?? -1);
        case "supplyApy":
          return (a.supplyAprPct ?? -1) - (b.supplyAprPct ?? -1);
        case "spread":
          return a.liquidationSpread - b.liquidationSpread;
        case "util":
          return (a.utilisation ?? -1) - (b.utilisation ?? -1);
      }
    };
    return [...data.markets].sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));
  }, [data.markets, sortKey, sortDir]);

  if (data.chainStale) {
    return <p className="text-sm text-rb-500">The market roster could not be read from chain at this block.</p>;
  }

  const s = data.summary;

  // Sortable header cell — the Aave-family table's render helper, not a
  // component, so it shares the parent's sort state without remounting.
  const th = (label: string, k: SortKey, align: "left" | "right" = "left") => {
    const active = sortKey === k;
    const Caret = sortDir === "asc" ? ChevronUp : ChevronDown;
    return (
      <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wider transition-colors hover:text-foreground ${
            active ? "text-foreground" : "text-rb-500"
          } ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          {label}
          {active ? <Caret className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}
        </button>
      </th>
    );
  };

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The vitals band — the roster's head figures in the shared slots. The
          two condition COUNTS qualify the roster rather than size it, so they
          sit in the band's 11px notes run beneath the rule. */}
      <VitalsBand
        className="mb-4"
        vitals={[
          {
            slot: "roster",
            label: "Markets listed",
            value: <Prov info={dolRosterCountProv(summaryCoords)}>{s.total}</Prov>,
          },
          {
            slot: "sizeIn",
            label: "Supplied",
            value: <Prov info={dolSummaryValueProv("supplied", summaryCoords)}>{usd(s.totalSuppliedUsd)}</Prov>,
          },
          {
            slot: "sizeOut",
            label: "Borrowed",
            value: <Prov info={dolSummaryValueProv("borrowed", summaryCoords)}>{usd(s.totalBorrowedUsd)}</Prov>,
          },
          {
            // Roster utilisation is Σ borrowed value ÷ Σ supplied value — both
            // totals sit receipted beside it in this band, so the ratio
            // restates them.
            slot: "usage",
            label: "Utilisation",
            value: <span data-prov-exempt="">{pctText(s.utilisation)}</span>,
            title:
              "Σ borrowed value ÷ Σ supplied value, both in USD at DolomiteMargin's own price — the two figures beside it in this band. A ratio of two receipted figures, not a distinct chain read.",
          },
        ]}
        notes={
          <>
            {/* A count over each market's own getMarketMarginPremium read (the leg
                traced on every row), not a single chain figure — exempt rather
                than a receipt that would overclaim it as one read. */}
            <span
              data-prov-exempt=""
              title="A count over each market's own getMarketMarginPremium read — the premium is traced per row; this tally over the roster is not itself a single chain read."
            >
              <span className="text-foreground">{s.withPremium}</span> carry a margin premium
            </span>
            {s.closing > 0 && (
              <span
                data-prov-exempt=""
                title="A count over each market's own getMarketIsClosing read — not a single chain figure."
              >
                <span className="text-foreground">{s.closing}</span> closed to new borrowing
              </span>
            )}
          </>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-rb-200 dark:border-rb-800">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="bg-foreground/[0.03]">
              {th("Asset", "asset")}
              {th("Min collateralisation", "minCollat")}
              {th("Price", "price", "right")}
              {th("Supplied", "supplied", "right")}
              {th("Borrowed", "borrowed", "right")}
              {th("Borrow rate", "borrowRate", "right")}
              {th("Supply APY", "supplyApy", "right")}
              {th("Spread", "spread", "right")}
              {th("Utilisation", "util")}
            </tr>
          </thead>
          <tbody>
            {sortedMarkets.map((m) => (
              <MarketRow key={m.marketId} m={m} axisMax={axisMax} block={data.blockNumber} />
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">The account-level carve-out</h2>
        <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
          The ladder above is the DEFAULT frame, not a universal one. The core names a{" "}
          <span className="text-foreground">DefaultAccountRiskOverrideSetter</span>, and its own
          <span className="text-foreground"> getAccountRiskOverrideByAccount</span> gives some accounts — observed on
          wstETH/WETH and weETH/WETH pairs, an e-mode-like category — different terms entirely: a lower minimum
          collateralisation than the global <Prov info={dolGlobalMinProv(summaryCoords)}>{pctText(baseline, 2)}</Prov>,
          a narrower liquidation spread than the global{" "}
          <Prov info={dolGlobalSpreadProv(summaryCoords)}>{pctText(data.risk.liquidationSpread, 0)}</Prov>, and the
          per-market margin premiums <span className="text-foreground">skipped</span> — an overridden account&rsquo;s
          adjusted values equal its raw ones exactly. That override is account-keyed —{" "}
          <span className="text-foreground">getAccountRiskOverrideByAccount</span> takes an account, so it has no answer
          on a market roster with no account in hand. Its exact terms are not asserted here; reading the ladder as
          universal would misstate every such account, which is why each position page reads the override for its own
          account and shows the exact terms it is judged by.
        </p>
      </section>

      {aliased.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-foreground">Shared-oracle price aliases</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
            {aliased.map((m, i) => (
              <span key={m.marketId}>
                {i > 0 ? " " : ""}
                <span className="text-foreground">{m.symbol}</span> (market {m.marketId})&rsquo;s price is exactly{" "}
                <span className="text-foreground">{m.priceAliasOf!.symbol}</span>&rsquo;s, to the wei — a 1:1 alias
                through the shared oracle: live, but not an independent feed.
              </span>
            ))}{" "}
            Every other market&rsquo;s feed moves on its own (anti-pin verified: no stable answers exactly 1e(36 −
            decimals)).
          </p>
        </section>
      )}

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
