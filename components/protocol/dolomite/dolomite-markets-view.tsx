"use client";

// Dolomite protocol view — every listed market and the risk ladder over it,
// in the Aave-V3-family table shape (components/shared/aave-reserve-parts.tsx):
// a summary line, then every market as one sortable row on the house table
// (rails-ops ui-jobs 539: D1, D2, D6 cards below lg, as M1), unlinked: a
// market has no Rails page.
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

import { formatTinyNonZero } from "@/lib/utils/format";
import { useMemo, useState } from "react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  DATA_TABLE_PILL,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { shortAddress, DOLOMITE_ADDRESSES, formatDolomitePrice } from "@/lib/dolomite/asset-catalog";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { serverReadAt, serverReadVia, type ServerRead } from "@/lib/shared/server-head-read";
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
  dolSpreadPremiumProv,
  dolRateProv,
  dolSummaryValueProv,
  dolGlobalMinProv,
  dolGlobalSpreadProv,
} from "@/lib/dolomite/markets-provenance";
import type { DolomiteMarketRow, DolomiteMarketsResponse } from "@/lib/sources/chain/dolomite-markets";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { BlockRef } from "@/components/shared/block-ref";

const NUM = "whitespace-nowrap tabular-nums text-foreground";
const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);
/** A premium as a percentage without trailing zeros ("200%", "27.5%"). */
const premiumText = (f: number) => `${Number((f * 100).toFixed(1))}%`;

const usd = (v: number | null): string =>
  v == null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;

const tokenAmount = (v: number, symbol: string): string => {
  const n =
    v === 0
      ? "0"
      : Math.abs(v) < 0.001
        ? formatTinyNonZero(v)
        : v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 });
  return `${n} ${symbol}`;
};

// Oracle price — the full figure above $1k (prices read as exact quotes, not
// sizes), two decimals from $1, four significant digits below it.
function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${formatDolomitePrice(n)}`;
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
      title="Utilisation is borrowed ÷ supplied: both already traced in this row (the supplied and borrowed USD receipts). A ratio of two receipted figures."
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
function MarketRow({
  m,
  axisMax,
  block,
  readBy,
}: {
  m: DolomiteMarketRow;
  axisMax: number;
  block: number;
  readBy?: ServerRead;
}) {
  const registry = useReceiptRegistry();
  const coords: DolomiteMarketCoords = { blockNumber: block, marketId: m.marketId, symbol: m.symbol, readBy };
  const priceTitle = m.priceAliasOf
    ? `This market's price equals ${m.priceAliasOf.symbol}'s (market ${m.priceAliasOf.marketId}) to the wei. A 1:1 alias through the shared oracle: live, but not an independent feed.`
    : "The market's oracle price (DolomiteMargin.getMarketPrice)";

  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <DataTableRow data-dolomite-market={m.marketId}>
        <DataTableCell rowHeader className="whitespace-nowrap">
          <div className="flex items-center gap-2.5">
            <TokenChipIcon symbol={m.symbol} address={m.token} size={28} filterable={false} />
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                {m.symbol}
                {m.isClosing && (
                  <span
                    className={`${DATA_TABLE_PILL} px-1.5 py-0.5 text-[11px] font-normal`}
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
        </DataTableCell>
        <DataTableCell label="Min collateralisation" className="tabular-nums text-foreground">
          <Prov info={dolMinCollatProv(coords)}>{pctText(m.minCollateralization, 1)}</Prov>
          <div className="mt-1 flex items-center gap-1.5">
            <MiniBar
              frac={m.minCollateralization / axisMax}
              title={`${pctText(m.minCollateralization, 1)} minimum collateralisation, on the roster's shared axis`}
            />
            <span className="whitespace-nowrap text-[11px] text-rb-500">
              {m.marginPremium > 0 ? (
                <Prov info={dolMarginPremiumProv(coords)}>{pctText(m.marginPremium, 1)} margin premium</Prov>
              ) : (
                "no margin premium"
              )}
            </span>
          </div>
        </DataTableCell>
        <DataTableCell label="Price" align="right" className={NUM} title={priceTitle}>
          {m.priceUsd != null ? (
            <Prov info={dolMarketPriceProv(coords)}>{fmtPrice(m.priceUsd)}</Prov>
          ) : (
            <span className="text-rb-500">—</span>
          )}
        </DataTableCell>
        <DataTableCell
          label="Supplied"
          align="right"
          className={NUM}
          title={`${tokenAmount(m.totalSupplyUnderlying, m.symbol)} supplied`}
        >
          <Prov info={dolMarketValueProv("supplied", coords)}>{usd(m.totalSupplyUsd)}</Prov>
        </DataTableCell>
        <DataTableCell
          label="Borrowed"
          align="right"
          className={NUM}
          title={`${tokenAmount(m.totalBorrowUnderlying, m.symbol)} borrowed`}
        >
          <Prov info={dolMarketValueProv("borrowed", coords)}>{usd(m.totalBorrowUsd)}</Prov>
        </DataTableCell>
        <DataTableCell
          label="Borrow rate"
          align="right"
          className={NUM}
          title="Current borrow APR, read live from the core"
        >
          {m.borrowAprPct != null ? (
            <Prov info={dolRateProv("borrow", coords)}>{m.borrowAprPct.toFixed(2)}%</Prov>
          ) : (
            <span className="text-rb-500">—</span>
          )}
        </DataTableCell>
        <DataTableCell
          label="Supply APR"
          align="right"
          className={NUM}
          title="Current supply APR, derived from the core's own borrow rate, utilisation and earnings share"
        >
          {m.supplyAprPct != null ? (
            <Prov info={dolRateProv("supply", coords)}>{m.supplyAprPct.toFixed(2)}%</Prov>
          ) : (
            <span className="text-rb-500">—</span>
          )}
        </DataTableCell>
        <DataTableCell
          label="Spread"
          align="right"
          className={NUM}
          title="The liquidation spread when this market is seized: the collateral a liquidator takes is worth the debt it repays plus this bonus"
        >
          <Prov info={dolMarketSpreadProv(coords)}>{pctText(m.liquidationSpread, 1)}</Prov>
          <div className="mt-1 text-[11px] text-rb-500">
            {m.spreadPremium > 0 ? (
              <Prov info={dolSpreadPremiumProv(coords)}>{premiumText(m.spreadPremium)} spread premium</Prov>
            ) : (
              "no spread premium"
            )}
          </div>
        </DataTableCell>
        <DataTableCell label="Utilisation" wide className="whitespace-nowrap">
          <UtilMini m={m} />
        </DataTableCell>
      </DataTableRow>
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

const SORT_LABEL: Record<SortKey, string> = {
  asset: "Asset",
  minCollat: "Min collateralisation",
  price: "Price",
  supplied: "Supplied",
  borrowed: "Borrowed",
  borrowRate: "Borrow rate",
  supplyApy: "Supply APR",
  spread: "Spread",
  util: "Utilisation",
};

export function DolomiteMarketsStamp({ data }: { data: DolomiteMarketsResponse }) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · <BlockRef block={data.blockNumber} chainId={MAINNET_CHAIN_ID} /> · the market roster and every
      price from{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", DOLOMITE_ADDRESSES.MARGIN)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        DolomiteMargin
      </a>{" "}
      itself
      {serverReadVia(data.head)}
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
  const readBy = serverReadAt(data.head, data.blockNumber);
  const summaryCoords: DolomiteMarketCoords = { blockNumber: data.blockNumber, readBy };

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

  // A sortable header (D2), sharing the parent's sort state.
  const th = (k: SortKey, align: "left" | "right" = "left") => (
    <DataTableHeader
      label={SORT_LABEL[k]}
      align={align}
      sort={{ dir: sortKey === k ? sortDir : null, onSort: () => toggleSort(k), ariaLabel: `Sort by ${SORT_LABEL[k]}` }}
    />
  );
  const pickSort = (k: SortKey) => {
    setSortKey(k);
    setSortDir(k === "asset" ? "asc" : "desc");
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
              "Σ borrowed value ÷ Σ supplied value, both in USD at DolomiteMargin's price. The two figures beside it in this band. A ratio of two receipted figures.",
          },
        ]}
        notes={
          <>
            {/* A count over each market's own getMarketMarginPremium read (the leg
                traced on every row) — exempt rather
                than a receipt that would overclaim it as one read. */}
            <span
              data-prov-exempt=""
              title="A count over each market's getMarketMarginPremium read: the premium is traced per row."
            >
              <span className="text-foreground">{s.withPremium}</span> carry a margin premium
            </span>
            {s.closing > 0 && (
              <span
                data-prov-exempt=""
                title="A count over each market's getMarketIsClosing read: not a single chain figure."
              >
                <span className="text-foreground">{s.closing}</span> closed to new borrowing
              </span>
            )}
          </>
        }
      />

      {/* The two per-market premiums, named together: the reader otherwise
          meets one under Min collateralisation and the other under Spread. */}
      <p className="mb-3 max-w-3xl text-[11px] leading-relaxed text-rb-500" data-dolomite-premiums="">
        Each market can carry two premiums. Its margin premium raises the collateralisation required on it, the global{" "}
        <Prov info={dolGlobalMinProv(summaryCoords)}>{pctText(baseline, 2)}</Prov> × (1 + margin premium); its spread
        premium raises the bonus a liquidator takes on it, the global{" "}
        <Prov info={dolGlobalSpreadProv(summaryCoords)}>{pctText(data.risk.liquidationSpread, 0)}</Prov> spread × (1 +
        spread premium).
      </p>

      {/* Below lg the header row is hidden (D6): a select and a direction
          button drive the same sort. */}
      <div className="mb-2 flex items-center gap-2 lg:hidden" data-mobile-sort="">
        <label className="flex items-center gap-2 text-[12px] text-rb-500">
          Sort by
          <select
            value={sortKey}
            onChange={(e) => pickSort(e.target.value as SortKey)}
            className="rounded-md border border-rb-200 bg-background px-2 py-1 text-base text-foreground sm:text-[12px] dark:border-rb-800"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="rounded-md border border-rb-200 px-2 py-1 text-[12px] text-foreground dark:border-rb-800"
        >
          {sortKey === "asset"
            ? sortDir === "asc"
              ? "A to Z"
              : "Z to A"
            : sortDir === "asc"
              ? "Low first"
              : "High first"}
        </button>
      </div>
      <DataTable
        label="Dolomite markets"
        stacked
        stackBelow="lg"
        rowHeight="two"
        tableClassName="text-sm lg:min-w-[980px]"
      >
        <DataTableHead>
          {th("asset")}
          {th("minCollat")}
          {th("price", "right")}
          {th("supplied", "right")}
          {th("borrowed", "right")}
          {th("borrowRate", "right")}
          {th("supplyApy", "right")}
          {th("spread", "right")}
          {th("util")}
        </DataTableHead>
        <DataTableBody>
          {sortedMarkets.map((m) => (
            <MarketRow key={m.marketId} m={m} axisMax={axisMax} block={data.blockNumber} readBy={readBy} />
          ))}
        </DataTableBody>
      </DataTable>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground">The account-level carve-out</h2>
        <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
          The ladder above is the DEFAULT frame. The core names a{" "}
          <span className="text-foreground">DefaultAccountRiskOverrideSetter</span>, and its own
          <span className="text-foreground"> getAccountRiskOverrideByAccount</span> gives some accounts (observed on
          wstETH/WETH and weETH/WETH pairs, an e-mode-like category) different terms entirely: a lower minimum
          collateralisation than the global <Prov info={dolGlobalMinProv(summaryCoords)}>{pctText(baseline, 2)}</Prov>,
          a narrower liquidation spread than the global{" "}
          <Prov info={dolGlobalSpreadProv(summaryCoords)}>{pctText(data.risk.liquidationSpread, 0)}</Prov>, and the
          per-market margin premiums <span className="text-foreground">skipped</span>: an overridden account&rsquo;s
          adjusted values equal its raw ones. That override is account-keyed:{" "}
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
                <span className="text-foreground">{m.symbol}</span> (market {m.marketId})&rsquo;s price is{" "}
                <span className="text-foreground">{m.priceAliasOf!.symbol}</span>&rsquo;s, to the wei. A 1:1 alias
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
