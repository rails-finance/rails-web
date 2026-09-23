"use client";

// Fluid protocol view — the vault roster and each vault's own risk ladder, in
// the Aave-V3-family table shape (components/shared/aave-market-views.tsx,
// carried to Dolomite 2026-09-10): one sortable row per vault rather than a
// card grid — the conversion pays off MORE here than it did on Dolomite,
// since this roster runs ~173 rows.
// ----------------------------------------------------------------------------
// The claim: Fluid gives every vault its OWN three rungs on one axis — borrow up
// to collateralFactor, liquidate from liquidationThreshold, and past
// liquidationMaxLimit the vault ABSORBS the position onto its own book. That
// third rung is the protocol-level explanation of the absorb rows the
// liquidation cards show one at a time: past it there is no liquidator and no
// bonus, which is why an absorb answers to no penalty constant.
//
// The bar is <RatioBar> in its own grammar, now living in the table's own
// column rather than under a card header: blue fill = the borrowed share, the
// one red tick = the factual liquidation line. The fill is the VAULT's aggregate
// (total borrow ÷ total collateral value at the vault's own liquidate price),
// which is why the row states plainly that it is not any position's ratio — a
// vault far below its threshold can still hold positions being liquidated.
//
// ⚠️ NO SHARED SIZE UNIT, UNLIKE AAVE/DOLOMITE — Fluid runs no USD feed, and a
// vault's two legs are two different tokens (sometimes DEX-pool shares, not a
// token at all). So Supplied/Borrowed sort on the raw number shown in THAT
// row's own unit, same as any spreadsheet numeric sort — useful within a
// column, but not a claim that 10,000 of one token outranks 3 of another. The
// DEFAULT order is therefore the roster's own vault id, not size — there is no
// size axis common to every row the way Aave's USD or Dolomite's oracle price
// gives one.
//
// No animation: this renders ~173 rows, and a framer node per row is what froze
// the listing shells (see the listing entrance incident).
//
// Provenance: the whole view owns ONE <ProvReceiptsScope> (the six other scoped
// views' posture — the figures are one block's reading of one protocol's roster,
// so they belong in one receipts list). Every rendered figure is a live read of
// the VaultResolver's getVaultsEntireData() at head, so each carries a <Prov>
// from lib/fluid/vaults-provenance — the vaults lane, NOT the position lane that
// live-provenance.ts hardcodes. The vaults-minted count is the length of that
// one enumerator read, so it carries a receipt; the four summary condition
// COUNTS (token-pair / smart / shell / silent-oracle) are a JSX Σ over per-vault
// config reads, not a single figure, so they carry data-prov-exempt rather than
// a receipt that would overclaim.

import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { poolShareLabel, shortAddress, vaultKindLabel } from "@/lib/fluid/asset-catalog";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { VitalsBand } from "@/components/shared/vitals-band";
import {
  type FluidVaultCoords,
  fluidRosterProv,
  fluidVaultConfigProv,
  fluidOraclePriceProv,
  fluidVaultSizeProv,
  fluidSmartLegProv,
  fluidVaultRateProv,
} from "@/lib/fluid/vaults-provenance";
import type { FluidVaultRow, FluidVaultsChainResponse, LegToken } from "@/lib/sources/chain/fluid-vaults";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const pctText = (f: number | null, dp = 0) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);

/** What a leg is called. A token leg is its symbol. A smart leg holds shares of
 *  a Fluid DEX pool — name the pool's pair ("wstETH·ETH shares") rather than say
 *  "DEX shares" and leave the reader with nothing: the vault names both sides
 *  itself. The quantity is still shares; nothing is converted. */
function legLabel(symbol: string | null, pool: [string, string] | null): string {
  if (symbol) return symbol;
  return poolShareLabel(pool) ?? "DEX shares";
}

/** Amounts here are vault totals, not USD — Fluid runs no USD feed. A smart leg
 *  is DEX pool shares, which is a quantity but not a token, so it is labelled as
 *  shares rather than given a symbol it doesn't have. */
function amount(value: number, label: string): string {
  const n =
    value === 0
      ? "0"
      : Math.abs(value) < 0.001
        ? value.toExponential(2)
        : value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 2 });
  return `${n} ${label}`;
}

/** A leg's size. A token leg is a number and a symbol. A smart leg holds DEX
 *  shares, and when the pool states what one share is made of we say THAT — the
 *  composition is what the reader actually wants, and the share count is the
 *  bookkeeping. When the pool states nothing (it holds nothing), the share count
 *  is all there is, so it stands alone rather than becoming a fake "0 + 0". */
function LegSize({
  value,
  symbol,
  pool,
  tokens,
}: {
  value: number;
  symbol: string | null;
  pool: [string, string] | null;
  tokens: LegToken[] | null;
}) {
  if (tokens && tokens.length > 0) {
    return (
      <span
        title={`${value.toLocaleString("en-US", { maximumFractionDigits: 6 })} DEX shares — the pool's own per-share composition at this block, not a price`}
      >
        {tokens.map((t, i) => (
          <span key={i}>
            {i > 0 && " + "}
            {amount(t.amount, t.symbol ?? "?")}
          </span>
        ))}
      </span>
    );
  }
  return <span>{amount(value, legLabel(symbol, pool))}</span>;
}

/** One vault row — a keyed component (not a `.map` callback) so it can own
 *  its own `useReceiptRegistry()` hook, the same per-row scoping the
 *  Aave-family table uses. */
function VaultRow({ v, block }: { v: FluidVaultRow; block: number }) {
  const registry = useReceiptRegistry();
  const coords: FluidVaultCoords = {
    blockNumber: block,
    vault: v.vault,
    vaultId: v.vaultId,
    pair: `${legLabel(v.supplySymbol, v.supplyPool)} / ${legLabel(v.borrowSymbol, v.borrowPool)}`,
    oracle: v.oracle,
    colSym: v.supplySymbol ?? legLabel(v.supplySymbol, v.supplyPool),
    debtSym: v.borrowSymbol ?? legLabel(v.borrowSymbol, v.borrowPool),
  };

  const ticks: RatioBarTick[] = [];
  if (v.collateralFactor != null)
    ticks.push({
      f: v.collateralFactor,
      kind: "neutral",
      title: `Borrow cap · collateralFactor ${pctText(v.collateralFactor)}`,
    });
  if (v.liquidationThreshold != null)
    ticks.push({
      f: v.liquidationThreshold,
      kind: "liquidation",
      title: `Liquidation threshold ${pctText(v.liquidationThreshold)}`,
    });
  if (v.liquidationMaxLimit != null)
    ticks.push({
      f: v.liquidationMaxLimit,
      kind: "neutral",
      title: `Absorption · liquidationMaxLimit ${pctText(v.liquidationMaxLimit)}`,
    });

  const smart = v.isSmartCol || v.isSmartDebt;

  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <tr className="border-t border-rb-200 transition-colors hover:bg-foreground/[0.02] dark:border-rb-800">
        <td className="px-3 py-2.5">
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
              {legLabel(v.supplySymbol, v.supplyPool)} / {legLabel(v.borrowSymbol, v.borrowPool)}
              {smart && (
                <span className="text-[10px] uppercase tracking-wide text-rb-500">{vaultKindLabel(v.vaultType)}</span>
              )}
            </div>
            <a
              href={explorerUrl(MAINNET_CHAIN_ID, "address", v.vault)}
              target="_blank"
              rel="noopener noreferrer"
              className="link-external text-[11px] text-rb-500"
            >
              vault {v.vaultId} · {shortAddress(v.vault)}
            </a>
          </div>
        </td>
        <td className="min-w-[220px] px-3 py-2.5 text-[13px] text-foreground/80">
          {v.configured ? (
            <>
              {v.aggregateRatio != null ? (
                <RatioBar fill={v.aggregateRatio} ticks={ticks} />
              ) : (
                <RatioBar fill={0} ticks={ticks} />
              )}
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] font-normal text-rb-500">
                <span>
                  CF <Prov info={fluidVaultConfigProv("collateralFactor", coords)}>{pctText(v.collateralFactor)}</Prov>
                </span>
                <span>
                  LT{" "}
                  <Prov info={fluidVaultConfigProv("liquidationThreshold", coords)}>
                    {pctText(v.liquidationThreshold)}
                  </Prov>
                </span>
                <span>
                  absorb{" "}
                  <Prov info={fluidVaultConfigProv("liquidationMaxLimit", coords)}>
                    {pctText(v.liquidationMaxLimit)}
                  </Prov>
                </span>
                {v.aggregateRatio != null && (
                  <span
                    data-prov-exempt=""
                    title="The vault's aggregate is total borrow ÷ (total collateral × the vault's liquidate price) — all three inputs already traced in this row. A ratio of receipted figures, not a distinct chain read; and not any one position's ratio."
                  >
                    · {pctText(v.aggregateRatio, 1)} used
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="text-rb-500">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80">
          {v.oraclePriceLiquidate != null ? (
            <Prov info={fluidOraclePriceProv(coords)}>
              {v.oraclePriceLiquidate.toLocaleString("en-US", { maximumFractionDigits: 4 })}{" "}
              {v.borrowSymbol ?? "shares"}/{v.supplySymbol ?? "share"}
            </Prov>
          ) : v.oracle ? (
            <span className="text-rb-500" title="The vault names an oracle, but it answers 0 at this block.">
              silent
            </span>
          ) : (
            <span className="text-rb-500">no oracle</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80">
          <Prov
            info={
              v.supplyLegTokens != null
                ? fluidSmartLegProv("supply", coords)
                : fluidVaultSizeProv("supply", v.isSmartCol, coords)
            }
          >
            <LegSize value={v.totalSupply} symbol={v.supplySymbol} pool={v.supplyPool} tokens={v.supplyLegTokens} />
          </Prov>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80">
          <Prov
            info={
              v.borrowLegTokens != null
                ? fluidSmartLegProv("borrow", coords)
                : fluidVaultSizeProv("borrow", v.isSmartDebt, coords)
            }
          >
            <LegSize value={v.totalBorrow} symbol={v.borrowSymbol} pool={v.borrowPool} tokens={v.borrowLegTokens} />
          </Prov>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80">
          {v.borrowRatePct != null ? (
            <Prov info={fluidVaultRateProv("borrow", coords)}>{v.borrowRatePct.toFixed(2)}%</Prov>
          ) : (
            <span
              className="text-rb-500"
              title="On a smart leg the resolver's rate figure is only the vault's own rewards/fee component, not the full rate — so it is not stated."
            >
              —
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80">
          {v.supplyRatePct != null ? (
            <Prov info={fluidVaultRateProv("supply", coords)}>{v.supplyRatePct.toFixed(2)}%</Prov>
          ) : (
            <span
              className="text-rb-500"
              title="On a smart leg the resolver's rate figure is only the vault's own rewards/fee component, not the full rate — so it is not stated."
            >
              —
            </span>
          )}
        </td>
      </tr>
    </ProvReceiptsScope>
  );
}

export function FluidVaultsStamp({ data }: { data: FluidVaultsChainResponse }) {
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
      · one <span className="text-foreground">getVaultsEntireData()</span> call to the{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", "0xa5c3e16523eeeddcc34706b0e6be88b4c6ea95cc")}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        VaultResolver
      </a>
    </p>
  );
}

type SortKey = "vault" | "ladder" | "price" | "supplied" | "borrowed" | "borrowRate" | "supplyRate";

export function FluidVaultsView({ data }: { data: FluidVaultsChainResponse }) {
  // Hook first (before the early return), so the receipts registry is stable
  // across renders regardless of the stale branch — the compound-markets order.
  const registry = useReceiptRegistry();
  const [sortKey, setSortKey] = useState<SortKey>("vault");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "vault" ? "asc" : "desc");
    }
  };

  const configured = useMemo(() => data.vaults.filter((v) => v.configured), [data.vaults]);
  const shells = useMemo(() => data.vaults.filter((v) => !v.configured), [data.vaults]);

  const sortedVaults = useMemo(() => {
    const cmp = (a: FluidVaultRow, b: FluidVaultRow): number => {
      switch (sortKey) {
        case "vault":
          return a.vaultId - b.vaultId;
        case "ladder":
          return (a.aggregateRatio ?? -1) - (b.aggregateRatio ?? -1);
        case "price":
          return (a.oraclePriceLiquidate ?? -1) - (b.oraclePriceLiquidate ?? -1);
        case "supplied":
          return a.totalSupply - b.totalSupply;
        case "borrowed":
          return a.totalBorrow - b.totalBorrow;
        case "borrowRate":
          return (a.borrowRatePct ?? -1) - (b.borrowRatePct ?? -1);
        case "supplyRate":
          return (a.supplyRatePct ?? -1) - (b.supplyRatePct ?? -1);
      }
    };
    return [...configured].sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));
  }, [configured, sortKey, sortDir]);

  if (data.chainStale) {
    return <p className="text-sm text-rb-500">The vault roster could not be read from chain at this block.</p>;
  }

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
      {/* The vitals band. Fluid fills the roster slot and leaves the two size
          slots empty on purpose: the protocol runs no price feed, and a vault's
          two legs are different tokens (sometimes DEX-pool shares), so there is
          no unit a roster-wide "supplied" could be stated in. The band's rule
          is that a value carries its own unit — with no common unit there is no
          figure, and inventing a USD total here would be a fabrication, not a
          convenience. Sizes live per-row, each in its own token. */}
      <VitalsBand
        className="mb-4"
        vitals={[
          {
            slot: "roster",
            label: "Vaults minted",
            value: <Prov info={fluidRosterProv({ blockNumber: data.blockNumber })}>{data.summary.total}</Prov>,
            title: "Every vault the factory has ever minted, configured or not.",
          },
          {
            slot: "population",
            label: "Configured",
            // A count over each vault's own collateralFactor across the roster
            // — a Σ over per-vault reads, not one chain figure. Exempt, not
            // receipted, like the condition counts beneath it.
            value: <span data-prov-exempt="">{data.summary.total - data.summary.shells}</span>,
            title: "Vaults with a collateral factor set — the ones that can hold a position.",
          },
        ]}
        notes={
          <>
            <span>
              {/* A count over the roster's per-vault config (leg kind), a JSX Σ over
                  reads rather than a single chain figure — exempt, not receipted. */}
              <span
                data-prov-exempt=""
                className="text-foreground"
                title="A count over each vault's own leg kind across the roster — not a single chain read."
              >
                {data.summary.tokenPair}
              </span>{" "}
              token pair ·{" "}
              <span
                data-prov-exempt=""
                className="text-foreground"
                title="A count over each vault's own leg kind across the roster — not a single chain read."
              >
                {data.summary.smart}
              </span>{" "}
              hold DEX shares on a leg
            </span>
            {data.summary.shells > 0 && (
              <span>
                <span
                  data-prov-exempt=""
                  className="text-foreground"
                  title="A count over each vault's collateralFactor across the roster — not a single chain read."
                >
                  {data.summary.shells}
                </span>{" "}
                minted but never configured
              </span>
            )}
            {data.summary.oracleSilent > 0 && (
              <span>
                <span
                  data-prov-exempt=""
                  className="text-foreground"
                  title="A count over each vault's own oracle price across the roster — not a single chain read."
                >
                  {data.summary.oracleSilent}
                </span>{" "}
                configured with a silent oracle
              </span>
            )}
          </>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-rb-200 dark:border-rb-800">
        <table className="w-full min-w-[1080px] border-collapse">
          <thead>
            <tr className="bg-foreground/[0.03]">
              {th("Vault", "vault")}
              {th("Ladder", "ladder")}
              {th("Price", "price", "right")}
              {th("Supplied", "supplied", "right")}
              {th("Borrowed", "borrowed", "right")}
              {th("Borrow rate", "borrowRate", "right")}
              {th("Supply rate", "supplyRate", "right")}
            </tr>
          </thead>
          <tbody>
            {sortedVaults.map((v) => (
              <VaultRow key={v.vault} v={v} block={data.blockNumber} />
            ))}
          </tbody>
        </table>
      </div>

      {shells.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Minted, never configured</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
            The factory minted {shells.length} vaults that governance never gave a ladder or an oracle. They hold
            nothing and can hold nothing: with no collateralFactor there is nothing to borrow against. They are listed
            because the roster is the factory&rsquo;s, not ours — omitting them would state a smaller protocol than the
            one on chain — but they carry no rungs, because a 0% rung would assert a risk parameter the vault does not
            have.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-rb-500">
            {shells.map((v) => (
              <a
                key={v.vault}
                href={explorerUrl(MAINNET_CHAIN_ID, "address", v.vault)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-external"
              >
                vault {v.vaultId} · {shortAddress(v.vault)}
              </a>
            ))}
          </div>
        </section>
      )}

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
