"use client";

// The shared Aave-V3-family market-overview surface — Aave V3 Core and Aave V3
// on Base, SparkLend and Seamless (/ethereum/aave-v3/market, /base/aave-v3/market,
// /ethereum/spark/market, /base/seamless/market). Two sections:
//   1. The vitals band — identity, size, supply composition, and a sentence
//      counting the reserves closed to new business.
//   2. The reserve list — every reserve on the Pool, sortable, filterable by
//      asset class. From 1024px it is a table (min-w-[980px]):
//        ASSET · PRICE · SUPPLIED · BORROWED · RATES S/B · RF · CAPS USED ·
//        UTILISATION & RISK
//      Below that each reserve is a block in the same order, with a sort
//      select in place of the headers, and nothing scrolls sideways.
//
// The risk context is Moonwell's (components/protocol/moonwell/
// moonwell-markets-view.tsx) brought into this table (rails-ops TO-DO-ui-jobs
// §9). The bar is <RatioBar> on the UTILISATION axis: fill = borrowed ÷
// supplied, and the one tick is the reserve's rate-model kink. Caps are stated
// as text in their own column and never drawn on the bar: a cap is a ceiling on
// what may arrive, which is a different axis. Under the bar sit the collateral
// parameters: loan-to-value, liquidation threshold, the eMode threshold where
// it differs, the liquidation bonus and the kink.
//
// Caps read their sentinels (lib/shared/aave-market-view.ts capSide): one
// whole token is "closed", the field's largest value is "no cap", and on
// SparkLend the share is measured against the CapAutomator's maximum. A
// reserve closed to new business says so on its row — the frozen / paused
// tags, "closed" or "off" in the caps column, "backs no new borrowing" under
// the bar — and the band's sentence counts them.
//
// No-opinionated-colour rule: asset classes are distinguished by label +
// grouping colour, the only interaction chroma is the link blue, and the one
// caution tint marks a closed door (Moonwell's convention). Present, don't
// rank: default order is size, no score anywhere.
//
// Provenance: one scope for the band, one per reserve row, so the inspector
// pins a row's receipts to that row. Every figure on a row carries a <Prov>
// from lib/shared/aave-market-provenance; utilisation (a ratio of the row's two
// receipted sizes) is exempt from the coverage tripwire.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, ChevronUp, ChevronDown } from "lucide-react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { fmtUsd } from "@/lib/aave-v4/format";
import { type AssetClass, ASSET_CLASS_TITLE, ASSET_CLASS_COLOR } from "@/lib/aave-v4/asset-class";
import {
  marketSummaryText,
  type AaveMarketView,
  type CapState,
  type MarketReserveRow,
} from "@/lib/shared/aave-market-view";
import { EXPLORERS_WITHOUT_LISTING } from "@/lib/shared/coverage";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { aaveMarketVocab, type AaveMarketVocab } from "@/lib/shared/aave-market-provenance";
import { VitalsBand } from "@/components/shared/vitals-band";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { useSkeletonSizes } from "@/hooks/useSkeletonSizes";

const LINK = "text-blue-500 hover:underline";
const CLOSED = "text-caution-600 dark:text-caution-400";
const TAG = "text-[10px] uppercase tracking-wide text-rb-500";

// Display order for the class filter — stablecoin first, "other" last.
const CLASS_ORDER: AssetClass[] = ["stablecoin", "eth", "btc", "gold", "other"];

// The table needs ~980px; below the `lg` breakpoint the rows become blocks.
const WIDE_QUERY = "(min-width: 1024px)";

/** Whether the table layout applies. Read synchronously on first render: this
 *  view mounts only after the client fetch resolves, so `window` is there and
 *  a phone never paints the table first. */
function useWide(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(WIDE_QUERY).matches : true,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return wide;
}

// A class grouping-color dot — shared by the filter chips and the rows.
function ClassDot({ cls }: { cls: AssetClass }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ASSET_CLASS_COLOR[cls] }} />;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function ratePct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}
/** A basis-point integer as a percentage number with no trailing zeros:
 *  8050 → "80.5", 10 → "0.1", 5 → "0.05". Epsilon values (Spark's 1-bp DAI
 *  threshold, 0.1% Pendle thresholds) stay visible. */
function bpsText(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}
/** A 0..1 fraction as a percentage number, same trimming. */
function fracText(f: number): string {
  return bpsText(Math.round(f * 1e4));
}
/** Share of a cap in use: one decimal under 10%, whole numbers above. */
function usedText(f: number): string {
  const p = f * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p).toLocaleString("en-US")}%`;
}
// Oracle price — full figure above $1k (prices read as exact quotes, not
// sizes), two decimals below so stables show "$1.00", not "$1".
function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const tokens = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// Filter chip — quiet at rest, interaction-blue when engaged (minimal filter UX).
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
        active
          ? "border-teal-500 bg-teal-500/10 text-foreground"
          : "border-raised bg-raised text-rb-500 hover:border-teal-500/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// Composition: one row per asset class — label · proportional bar · share.
// Same row-chart treatment as the hub cards (small classes stay legible).
function CompositionBar({ composition }: { composition: AaveMarketView["composition"] }) {
  if (composition.length === 0) return null;
  return (
    // Supply-mix chart — each row's share is a proportion of the traced
    // supplied-USD total, drawn as a bar. A visualization, not a per-figure
    // read, so it opts out of the coverage tripwire (the receipts already carry
    // the supplied totals the shares are computed from).
    <div className="space-y-1.5" data-prov-exempt="">
      {composition.map((c) => (
        <div key={c.cls} className="flex items-center gap-2" title={`${c.pct}% ${c.label}`}>
          <span className="w-28 shrink-0 truncate text-[12px] text-rb-500">{c.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${c.pct}%`, backgroundColor: ASSET_CLASS_COLOR[c.cls] }}
            />
          </div>
          <span className="w-8 shrink-0 text-right tabular-nums text-[12px] text-rb-500">{c.pct}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Row pieces, shared by the table row and the narrow block ─────────────────

/** The lifecycle and mode tags beside the symbol — states, not judgements. */
function StateTags({ r, vocab }: { r: MarketReserveRow; vocab: AaveMarketVocab }) {
  return (
    <>
      {r.frozen && (
        <span className={TAG} title="Frozen: no new supply or borrowing; existing positions unwind">
          <Prov info={vocab.flagProv("frozen", r.symbol)}>frozen</Prov>
        </span>
      )}
      {r.paused && (
        <span className={TAG} title="Paused: every action suspended, liquidation included">
          <Prov info={vocab.flagProv("paused", r.symbol)}>paused</Prov>
        </span>
      )}
      {r.debtCeiling != null && (
        <span className={TAG} title={`Isolation mode: debt ceiling $${r.debtCeiling.toLocaleString("en-US")}`}>
          <Prov info={vocab.isolatedProv(r.symbol, r.debtCeiling)}>isolated</Prov>
        </span>
      )}
      {r.siloed && (
        <span className={TAG} title="Siloed borrowing: a wallet borrowing this can borrow nothing else">
          <Prov info={vocab.siloedProv(r.symbol)}>siloed</Prov>
        </span>
      )}
    </>
  );
}

/** One side of the caps figure: a share in use, or the state that replaces it. */
function CapText({
  side,
  c,
  r,
  vocab,
}: {
  side: "supply" | "borrow";
  c: CapState;
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
}) {
  switch (c.state) {
    case "off":
      return (
        <span className={CLOSED} title="Borrowing is switched off for this reserve">
          <Prov info={vocab.borrowOffProv(r.symbol)}>off</Prov>
        </span>
      );
    case "closed":
      return (
        <span
          className={CLOSED}
          title={`A ${side} cap of one whole ${r.symbol}: governance closes a side this way, so no share is quoted.`}
        >
          <Prov info={vocab.capClosedProv(side, r.symbol, c.basis)}>closed</Prov>
        </span>
      );
    case "none":
      return (
        <span className="text-rb-500">
          <Prov info={vocab.capNoneProv(side, r.symbol, c.why, c.basis, side === "supply" ? r.supplyCap : r.borrowCap)}>
            no cap
          </Prov>
        </span>
      );
    case "used":
      return (
        <span
          title={
            c.basis === "automator"
              ? `${tokens(c.amount)} of a ${tokens(c.cap)} ${r.symbol} maximum (CapAutomator); live cap ${c.liveCap != null ? tokens(c.liveCap) : "—"}`
              : `${tokens(c.amount)} of a ${tokens(c.cap)} ${r.symbol} cap`
          }
        >
          <Prov
            info={vocab.capUsedProv(side, r.symbol, {
              amount: c.amount,
              cap: c.cap,
              basis: c.basis,
              liveCap: c.liveCap,
              treasury: side === "supply" ? (r.accruedToTreasury ?? 0) : undefined,
            })}
          >
            {usedText(c.used)}
          </Prov>
        </span>
      );
  }
}

/** The eMode thresholds this reserve can be judged at instead of its own. A
 *  category matching the reserve's own number says nothing new, so only
 *  differences survive, stated as a span: sUSDe belongs to ten categories on
 *  Aave V3 Core, and ten numbers in a cell would bury the one fact the reader
 *  needs — that a wallet in eMode is judged by its category's figure. Every
 *  category and its exact figures are in the title and the receipt. */
function emodeOf(r: MarketReserveRow) {
  const cats = r.emodeCategories ?? [];
  const alt = cats.map((c) => c.lt).filter((lt) => lt !== r.lt);
  const span =
    alt.length === 0
      ? null
      : [fracText(Math.min(...alt)), fracText(Math.max(...alt))].filter((v, i, a) => a.indexOf(v) === i).join("–");
  const title = cats
    .map((c) => `${c.label}: ${c.ltv != null ? `LTV ${fracText(c.ltv)}% · ` : ""}LT ${fracText(c.lt)}%`)
    .join("\n");
  const lendsLtv = cats.some((c) => (c.ltv ?? 0) > 0);
  return { cats, span, title, lendsLtv };
}

/** The collateral parameters: LTV · LT · eMode · bonus · kink. `narrow`
 *  writes the eMode figure as "LT 83 (95 eMode)". */
function RiskLine({ r, vocab, narrow }: { r: MarketReserveRow; vocab: AaveMarketVocab; narrow?: boolean }) {
  const ltvBps = r.bps?.ltv ?? Math.round((r.ltv ?? 0) * 1e4);
  const ltBps = r.bps?.lt ?? Math.round((r.lt ?? 0) * 1e4);
  const bonusBps = r.bps?.bonus ?? 0;
  const em = emodeOf(r);
  const emode = em.span && (
    <span title={em.title}>
      <Prov info={vocab.reserveEModeLtProv(r.symbol, em.cats)}>
        {narrow ? `(${em.span} eMode)` : `eMode ${em.span}`}
      </Prov>
    </span>
  );
  const kink = r.kink != null && r.rateStrategy && (
    <span title="The utilisation at which the borrow rate starts to climb steeply — the tick on the bar">
      kink{" "}
      <Prov
        info={vocab.kinkProv(r.symbol, {
          strategy: r.rateStrategy,
          method: r.kinkMethod ?? "",
          raw: r.kinkRaw ?? null,
        })}
      >
        {fracText(r.kink)}%
      </Prov>
    </span>
  );
  const sep = <span aria-hidden>·</span>;

  // Never collateral on its own: say that, and let eMode say where it is.
  if (ltvBps === 0 && ltBps === 0) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span>
          <Prov info={vocab.reserveLtProv(r.symbol)}>
            {em.span ? "not collateral outside eMode" : "not collateral"}
          </Prov>
        </span>
        {emode && (
          <>
            {sep}
            {emode}
          </>
        )}
        {!narrow && kink && (
          <>
            {sep}
            {kink}
          </>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span title="Loan-to-value: the most a wallet can borrow against this reserve">
        LTV <Prov info={vocab.reserveLtvProv(r.symbol, ltvBps)}>{bpsText(ltvBps)}</Prov>
        {ltvBps === 0 && em.lendsLtv && " outside eMode"}
      </span>
      {sep}
      <span title="Liquidation threshold">
        LT <Prov info={vocab.reserveLtProv(r.symbol)}>{bpsText(ltBps)}</Prov>
        {narrow && emode && <> {emode}</>}
      </span>
      {!narrow && emode && (
        <>
          {sep}
          {emode}
        </>
      )}
      {bonusBps > 10000 && (
        <>
          {sep}
          <span title="Liquidation bonus: the extra collateral a liquidator receives">
            bonus <Prov info={vocab.reserveBonusProv(r.symbol, bonusBps)}>{bpsText(bonusBps - 10000)}%</Prov>
          </span>
        </>
      )}
      {!narrow && kink && (
        <>
          {sep}
          {kink}
        </>
      )}
      {r.closed.includes("ltvZero") && (
        <span className={`basis-full ${CLOSED}`}>
          <Prov info={vocab.ltvZeroProv(r.symbol)}>backs no new borrowing</Prov>
        </span>
      )}
    </span>
  );
}

/** The utilisation bar with the kink tick. Utilisation is borrowed ÷ supplied,
 *  both traced in the same row, so its percentage is exempt from the coverage
 *  tripwire. */
function UtilBar({ r, suffix }: { r: MarketReserveRow; suffix?: React.ReactNode }) {
  const ticks: RatioBarTick[] = [];
  if (r.kink != null)
    ticks.push({
      f: r.kink,
      kind: "neutral",
      title: `Rate model kink · the utilisation this reserve's curve turns at (${fracText(r.kink)}%)`,
    });
  const u = r.utilization != null && r.borrowed > 0 ? r.utilization : null;
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 [&>div]:mt-0">
        <RatioBar fill={u ?? 0} ticks={ticks} />
      </div>
      <span
        className="shrink-0 tabular-nums text-[12px] text-foreground/80"
        data-prov-exempt=""
        title="Utilisation: borrowed ÷ supplied — both traced in this row"
      >
        {u != null ? pct(u) : "—"}
        {suffix}
      </span>
    </div>
  );
}

type RowProps = {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  assetHref?: (symbol: string, side: "supply" | "borrow") => string;
};

function sizes({ r, vocab, assetHref }: RowProps) {
  const sUsd = fmtUsd(r.suppliedUsd);
  const bUsd = fmtUsd(r.borrowedUsd);
  const hasBorrow = r.borrowedUsd >= 0.01 || r.borrowed > 0;
  const supplyLink = assetHref && r.suppliedUsd > 0 ? assetHref(r.symbol, "supply") : null;
  const borrowLink = assetHref && hasBorrow ? assetHref(r.symbol, "borrow") : null;
  const supplied = supplyLink ? (
    <Link href={supplyLink} className={LINK}>
      <Prov info={vocab.reserveValueProv("supplied", r.symbol)}>{sUsd.display}</Prov>
    </Link>
  ) : (
    <span className={r.suppliedUsd > 0 ? "text-foreground/80" : "text-rb-500"}>
      <Prov info={vocab.reserveValueProv("supplied", r.symbol)}>{sUsd.display}</Prov>
    </span>
  );
  const borrowed = hasBorrow ? (
    borrowLink ? (
      <Link href={borrowLink} className={LINK}>
        <Prov info={vocab.reserveValueProv("borrowed", r.symbol)}>{bUsd.display}</Prov>
      </Link>
    ) : (
      <span className="text-foreground/80">
        <Prov info={vocab.reserveValueProv("borrowed", r.symbol)}>{bUsd.display}</Prov>
      </span>
    )
  ) : null;
  const rates = (
    <>
      {r.supplied > 0 ? (
        <Prov info={vocab.reserveRateProv("supply", r.symbol)}>{ratePct(r.supplyApr)}</Prov>
      ) : (
        <span className="text-rb-500">—</span>
      )}
      <span className="text-rb-500"> / </span>
      {hasBorrow ? (
        <Prov info={vocab.reserveRateProv("borrow", r.symbol)}>{ratePct(r.borrowApr)}</Prov>
      ) : (
        <span className="text-rb-500">—</span>
      )}
    </>
  );
  const price =
    r.priceUsd != null ? (
      <Prov info={vocab.reservePriceProv(r.symbol)}>{fmtPrice(r.priceUsd)}</Prov>
    ) : (
      <span className="text-rb-500">—</span>
    );
  const rf = <Prov info={vocab.reserveFactorProv(r.symbol)}>{pct(r.reserveFactor)}</Prov>;
  return { hasBorrow, supplied, borrowed, rates, price, rf };
}

/** One reserve as a table row. A keyed component so it can own its
 *  `useReceiptRegistry()`: each row is its own bounds-free receipts scope. */
function ReserveRow(props: RowProps) {
  const { r, vocab } = props;
  const registry = useReceiptRegistry();
  const z = sizes(props);

  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <tr
        className="border-t border-rb-200 align-top transition-colors hover:bg-foreground/[0.02] dark:border-rb-800"
        data-reserve-row={r.address}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <TokenChipIcon symbol={r.symbol} address={r.address} size={20} filterable={false} />
            <div className="leading-tight">
              <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-foreground">
                {r.symbol}
                <StateTags r={r} vocab={vocab} />
              </div>
              <div className="flex items-center gap-1 text-[11px] text-rb-500">
                <ClassDot cls={r.cls} />
                {r.classLabel}
              </div>
            </div>
          </div>
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
          title="The market's oracle price (IAaveOracle getAssetPrice)"
        >
          {z.price}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[13px]">{z.supplied}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[13px]">
          {z.borrowed ??
            (!r.borrowEnabled ? (
              // Structurally not borrowable — a no-entry mark, distinct
              // from a borrowable reserve that has no draws.
              <span
                className="inline-flex items-center justify-end gap-1 text-rb-500/70"
                title="Not borrowable in this market"
              >
                <Ban className="h-3.5 w-3.5" aria-label="Not borrowable" />
              </span>
            ) : (
              <span className="text-rb-500">no borrows</span>
            ))}
        </td>
        <td
          className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
          title="Supply rate / variable borrow rate, read live from the Pool"
        >
          {z.rates}
        </td>
        <td
          className="px-3 py-2.5 text-right tabular-nums text-[13px] text-foreground/80"
          title="Reserve factor — the protocol's cut of borrow interest"
        >
          {z.rf}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[12px] text-foreground/80" data-caps="">
          <span className="text-rb-500">S</span> <CapText side="supply" c={r.supplyCapState} r={r} vocab={vocab} />
          <span className="text-rb-500"> · B</span> <CapText side="borrow" c={r.borrowCapState} r={r} vocab={vocab} />
        </td>
        <td className="w-[270px] min-w-[220px] px-3 py-2.5">
          <UtilBar r={r} />
          <div className="mt-1.5 text-[10px] tabular-nums text-rb-500">
            <RiskLine r={r} vocab={vocab} />
          </div>
        </td>
      </tr>
    </ProvReceiptsScope>
  );
}

/** One reserve as a block, for widths below the table's. Same figures, same
 *  receipts, in four lines:
 *    WETH · ETH                          $5.75B supplied
 *    [bar] 83% utilised · $4.77B borrowed
 *    LTV 80.5 · LT 83 (95 eMode) · bonus 5% · 1.44% / 2.04% · RF 15%
 *    caps: supply 78% · borrow 73% · $2,740 */
function ReserveBlock(props: RowProps) {
  const { r, vocab } = props;
  const registry = useReceiptRegistry();
  const z = sizes(props);

  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <li className="border-t border-rb-200 px-3 py-3 first:border-t-0 dark:border-rb-800" data-reserve-row={r.address}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <TokenChipIcon symbol={r.symbol} address={r.address} size={18} filterable={false} />
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] font-medium leading-tight text-foreground">
              {r.symbol}
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-rb-500">
                · <ClassDot cls={r.cls} />
                {r.classLabel}
              </span>
              <StateTags r={r} vocab={vocab} />
            </div>
          </div>
          <div className="shrink-0 text-right text-[13px] tabular-nums">
            {z.supplied} <span className="text-[11px] text-rb-500">supplied</span>
          </div>
        </div>

        <div className="mt-2">
          <UtilBar r={r} suffix={<span className="text-rb-500"> utilised</span>} />
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[11px] tabular-nums text-rb-500">
          {z.borrowed ? (
            <span>{z.borrowed} borrowed</span>
          ) : !r.borrowEnabled ? (
            <span>not borrowable</span>
          ) : (
            <span>no borrows</span>
          )}
          {r.kink != null && r.rateStrategy && (
            <span>
              · kink{" "}
              <Prov
                info={vocab.kinkProv(r.symbol, {
                  strategy: r.rateStrategy,
                  method: r.kinkMethod ?? "",
                  raw: r.kinkRaw ?? null,
                })}
              >
                {fracText(r.kink)}%
              </Prov>
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
          <RiskLine r={r} vocab={vocab} narrow />
          <span aria-hidden>·</span>
          <span className="text-foreground/80">{z.rates}</span>
          <span aria-hidden>·</span>
          <span>RF {z.rf}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11px] tabular-nums text-rb-500">
          <span data-caps="">
            caps: supply <CapText side="supply" c={r.supplyCapState} r={r} vocab={vocab} /> · borrow{" "}
            <CapText side="borrow" c={r.borrowCapState} r={r} vocab={vocab} />
          </span>
          <span aria-hidden>·</span>
          <span className="text-foreground/80">{z.price}</span>
        </div>
      </li>
    </ProvReceiptsScope>
  );
}

export interface AaveMarketViewsProps {
  view: AaveMarketView;
  /** The protocol's listing route ("/ethereum/aave-v3", "/ethereum/spark"). */
  listingHref: string;
  /** Listing URL filtered to one asset on one side, when the listing's param
   *  space supports it (SparkLend's ?supply=/&borrow=); omit → plain cells. */
  assetHref?: (symbol: string, side: "supply" | "borrow") => string;
}

type SortKey = "asset" | "price" | "supplied" | "borrowed" | "supplyApy" | "rate" | "reserveFactor" | "caps" | "util";

const SORT_LABEL: Record<SortKey, string> = {
  asset: "Asset",
  price: "Price",
  supplied: "Supplied",
  borrowed: "Borrowed",
  supplyApy: "Supply rate",
  rate: "Borrow rate",
  reserveFactor: "Reserve factor",
  caps: "Caps used",
  util: "Utilisation",
};

/** A cap side as one sortable number: a closed side sorts above any share, a
 *  side with no cap or no borrowing below every share. */
function capRank(c: CapState): number {
  switch (c.state) {
    case "closed":
      return 1e9;
    case "used":
      return c.used;
    case "none":
      return -1;
    case "off":
      return -2;
  }
}

export function AaveMarketViews({ view, listingHref, assetHref }: AaveMarketViewsProps) {
  // Not every explorer on this surface HAS a listing behind it. The Base ones
  // open on a wallet because the open-position set is not enumerable there, and
  // a "View all positions" link that lands back on this same page is a promise
  // the explorer cannot keep — decision 0014's point, applied to a control
  // rather than to prose. The registry already knows which explorers those are,
  // so nothing has to be remembered at the call site.
  const hasListing = !EXPLORERS_WITHOUT_LISTING.has(view.protocol);
  const wide = useWide();
  // One receipts scope for the band — the figures are one block's reading of
  // one Pool. The vocabulary is protocol-parameterised (each market sits on
  // different Pool/oracle contracts), bound here to the live addresses + block
  // the payload was read at.
  const registry = useReceiptRegistry();
  const vocab = aaveMarketVocab(view.protocol, {
    blockNumber: view.blockNumber,
    pool: view.pool,
    oracle: view.oracle,
    capAutomator: view.capAutomator,
  });
  const [classes, setClasses] = useState<Set<AssetClass>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("supplied");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleClass = (c: AssetClass) =>
    setClasses((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const pickSort = (k: SortKey) => {
    setSortKey(k);
    setSortDir(k === "asset" ? "asc" : "desc");
  };
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else pickSort(k);
  };

  const presentClasses = useMemo(() => {
    const s = new Set(view.rows.map((r) => r.cls));
    return CLASS_ORDER.filter((c) => s.has(c));
  }, [view.rows]);

  // The band is static — it describes the market, not the filtered slice.
  // Filters scope the list only.
  const filteredRows = useMemo(
    () => view.rows.filter((r) => classes.size === 0 || classes.has(r.cls)),
    [view.rows, classes],
  );

  const sortedRows = useMemo(() => {
    const cmp = (a: MarketReserveRow, b: MarketReserveRow): number => {
      switch (sortKey) {
        case "asset":
          return a.symbol.localeCompare(b.symbol);
        case "price":
          return (a.priceUsd ?? -1) - (b.priceUsd ?? -1);
        case "supplied":
          return a.suppliedUsd - b.suppliedUsd || a.supplied - b.supplied;
        case "borrowed":
          return a.borrowedUsd - b.borrowedUsd || a.borrowed - b.borrowed;
        case "rate":
          return a.borrowApr - b.borrowApr;
        case "supplyApy":
          return a.supplyApr - b.supplyApr;
        case "reserveFactor":
          return a.reserveFactor - b.reserveFactor;
        case "caps":
          return (
            Math.max(capRank(a.supplyCapState), capRank(a.borrowCapState)) -
            Math.max(capRank(b.supplyCapState), capRank(b.borrowCapState))
          );
        case "util":
          return (a.utilization ?? -1) - (b.utilization ?? -1);
      }
    };
    return [...filteredRows].sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));
  }, [filteredRows, sortKey, sortDir]);

  const supplied = fmtUsd(view.suppliedUsd);
  const borrowed = fmtUsd(view.borrowedUsd);
  const summary = marketSummaryText(view);
  // Market-level utilisation — the same quotient the rows show, taken over the
  // whole Pool. Absent (rather than 0%) when nothing is supplied to measure
  // against, so an unread oracle never renders as an idle market.
  const marketUtilization = view.suppliedUsd > 0 ? view.borrowedUsd / view.suppliedUsd : null;

  // A sort button. A render helper, not a component, so it shares the parent's
  // sort state without remounting.
  const sortButton = (label: string, k: SortKey, align: "left" | "right" = "left") => {
    const active = sortKey === k;
    const Caret = sortDir === "asc" ? ChevronUp : ChevronDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        aria-label={`Sort by ${SORT_LABEL[k]}`}
        className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wider transition-colors hover:text-foreground ${
          active ? "text-foreground" : "text-rb-500"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        {active ? <Caret className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </button>
    );
  };
  const th = (label: string, k: SortKey, align: "left" | "right" = "left") => (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{sortButton(label, k, align)}</th>
  );

  return (
    <ProvReceiptsScope registry={registry}>
      <div>
        {/* Section 1 — the vitals band: identity · head figures · supply mix.
            The figures sit in the shared slots (roster · size in · size out ·
            usage) under this market's words for them. */}
        <VitalsBand
          className="mb-8"
          lead={
            <>
              {hasListing ? (
                <Link
                  href={listingHref}
                  className="text-base font-semibold text-foreground transition-colors hover:text-blue-500"
                  title={`View ${view.label} positions`}
                >
                  {view.label}
                </Link>
              ) : (
                <span className="text-base font-semibold text-foreground">{view.label}</span>
              )}
              <p className="mt-2 text-[13px] leading-relaxed text-rb-500">{view.purpose}</p>
              {summary && (
                <p className="mt-3 text-[12px] leading-relaxed text-rb-500" data-market-summary="">
                  {summary}
                </p>
              )}
            </>
          }
          vitals={[
            {
              slot: "roster",
              label: "Reserves",
              value: <Prov info={vocab.reserveCountProv()}>{view.reserveCount}</Prov>,
            },
            {
              slot: "sizeIn",
              label: "Supplied",
              value: <Prov info={vocab.marketTotalProv("supplied")}>{supplied.display}</Prov>,
              title: supplied.title,
            },
            {
              slot: "sizeOut",
              label: "Borrowed",
              value: <Prov info={vocab.marketTotalProv("borrowed")}>{borrowed.display}</Prov>,
              title: borrowed.title,
            },
            marketUtilization != null && {
              slot: "usage" as const,
              label: "Utilisation",
              // Borrowed ÷ supplied, both traced in this same band. A ratio of
              // two receipted figures — exempt from the coverage tripwire, like
              // the per-row utilisation.
              value: <span data-prov-exempt="">{pct(marketUtilization)}</span>,
              title:
                "Borrowed ÷ supplied, both in USD at the market's oracle price — the two figures beside it in this band.",
            },
          ]}
          aside={
            <>
              {view.composition.length > 0 && (
                <>
                  <div className="mb-1.5 text-[11px] uppercase tracking-wider text-rb-500">Supply mix</div>
                  <CompositionBar composition={view.composition} />
                </>
              )}
              {hasListing && (
                <Link
                  href={listingHref}
                  className={`mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-medium ${LINK}`}
                >
                  View all {view.label} positions
                  <span aria-hidden>→</span>
                </Link>
              )}
            </>
          }
        />

        {/* Section 2 — the reserve list */}
        <div className="mb-3">
          <h2 className="text-[11px] uppercase tracking-wider text-rb-500">Reserves</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
            Every reserve on the Pool — filter by class, sort any column. Rates, caps and risk parameters decode from
            the configuration the Pool enforces; USD is the market&apos;s oracle price. The bar is utilisation, and its
            tick is the rate model&apos;s kink.
          </p>
        </div>

        {/* Filters: asset class. Quiet chips; "All" clears. */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] uppercase tracking-wider text-rb-500">Class</span>
          <Chip active={classes.size === 0} onClick={() => setClasses(new Set())}>
            All
          </Chip>
          {presentClasses.map((c) => (
            <Chip key={c} active={classes.has(c)} onClick={() => toggleClass(c)}>
              <ClassDot cls={c} />
              {ASSET_CLASS_TITLE[c]}
            </Chip>
          ))}
        </div>

        {filteredRows.length === 0 ? (
          <div className="rounded-lg border border-rb-200 py-12 text-center text-rb-500 dark:border-rb-800">
            <p className="mb-1">No reserves match this filter.</p>
            <button type="button" onClick={() => setClasses(new Set())} className={`text-[13px] ${LINK}`}>
              Clear filter
            </button>
          </div>
        ) : wide ? (
          <div className="overflow-x-auto rounded-lg border border-rb-200 dark:border-rb-800">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-foreground/[0.03]">
                  {th("Asset", "asset")}
                  {th("Price", "price", "right")}
                  {th("Supplied", "supplied", "right")}
                  {th("Borrowed", "borrowed", "right")}
                  <th className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-wider text-rb-500">Rates</span>
                      {sortButton("S", "supplyApy", "right")}
                      <span className="text-[11px] text-rb-500">/</span>
                      {sortButton("B", "rate", "right")}
                    </span>
                  </th>
                  {th("RF", "reserveFactor", "right")}
                  {th("Caps used", "caps")}
                  {th("Utilisation & risk", "util")}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <ReserveRow key={r.address} r={r} vocab={vocab} assetHref={assetHref} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-rb-500">
                Sort by
                <select
                  value={sortKey}
                  onChange={(e) => pickSort(e.target.value as SortKey)}
                  className="rounded-md border border-rb-200 bg-background px-2 py-1 text-[12px] normal-case tracking-normal text-foreground dark:border-rb-800"
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
                aria-label={sortDir === "asc" ? "Ascending; switch to descending" : "Descending; switch to ascending"}
                className="inline-flex items-center gap-1 rounded-md border border-rb-200 px-2 py-1 text-[12px] text-foreground dark:border-rb-800"
              >
                {sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {sortDir === "asc" ? "Low first" : "High first"}
              </button>
            </div>
            <ul className="rounded-lg border border-rb-200 dark:border-rb-800">
              {sortedRows.map((r) => (
                <ReserveBlock key={r.address} r={r} vocab={vocab} assetHref={assetHref} />
              ))}
            </ul>
          </>
        )}
      </div>
    </ProvReceiptsScope>
  );
}

// Loading placeholder for the market data region (the page renders its real
// header above): one solid block — no inner anatomy (see
// components/shared/skeleton-card.tsx for the block grammar) — sized from the
// measured `page-table` default and this route's remembered height.
export function AaveMarketLoadingSkeleton() {
  const { sizes } = useSkeletonSizes();
  return (
    <div className="animate-pulse">
      <SkeletonBlock height={sizes["page-table"]} />
    </div>
  );
}
