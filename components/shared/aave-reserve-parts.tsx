"use client";

// The Aave family's reserve parts (rails-ops ui-jobs 541 and 549): the pieces
// the family adapter (lib/aave-family/product.tsx) hands the shared product
// shells (components/shared/product/) as drawn figures, each with its receipt
// from AaveMarketVocab (lib/shared/aave-market-provenance.ts):
//   - the asset cell's state tags (`StateTags`), class line (`ClassDot`) and
//     Details control (`ReserveDetails`: the parameters in a panel, a bottom
//     sheet on a phone; the control and the receipts stand above the row's
//     cover);
//   - the figures (`reserveFigures`), the cap pills shown only near binding
//     (`CapPill`: 90% or more in use, or closed by a cap of one whole token;
//     lib/shared/aave-market-view.ts capShows), the Collateral cell ("LTV /
//     LT", "Not collateral", "eMode only") and the utilisation bar with the
//     kink tick (`UtilBar`);
//   - the reserve's parameters (`ReserveParameters`, M1's Details panel and
//     the reserve page's M3.5);
//   - the supply mix (`CompositionBar`).
// Available is the Pool's virtual balance on a v3.3+ Pool, else supplied less
// borrowed. No-opinionated-colour rule: asset classes are distinguished by
// label and grouping colour, and the one caution tint marks a closed door.

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AssetUnit } from "@/components/shared/asset-unit";
import { RevealTip } from "@/components/shared/reveal-tip";
import { HeadingTip } from "@/components/shared/tip-label";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { AnchoredPanel } from "@/components/shared/asset-popover";
import { fmtUsd } from "@/lib/aave-v4/format";
import { type AssetClass, ASSET_CLASS_COLOR } from "@/lib/aave-v4/asset-class";
import { capShows, type AaveMarketView, type CapState, type MarketReserveRow } from "@/lib/shared/aave-market-view";
import { Prov } from "@/components/shared/provenance";
import type { AaveMarketVocab } from "@/lib/shared/aave-market-provenance";
import { formatCompact } from "@/lib/shared/format-compact";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { DATA_TABLE_PILL } from "@/components/shared/data-table/data-table";

const CLOSED = "text-tone-caution";
const TAG = `${DATA_TABLE_PILL} px-1 py-px text-[10px] uppercase tracking-wide`;
const CAP_PILL = `${DATA_TABLE_PILL} inline-block whitespace-nowrap px-1 py-px text-[10px] leading-tight`;
/** A closed side's pill: D1's pill ground, the caution tint in both schemes. */
const CAP_PILL_CLOSED = `${CAP_PILL} ${CLOSED} dark:text-tone-caution`;

// Display order for the class filter — stablecoin first, "other" last.
export const CLASS_ORDER: AssetClass[] = ["stablecoin", "eth", "btc", "gold", "other"];

// A class grouping-color dot — shared by the filter chips and the rows.
export function ClassDot({ cls }: { cls: AssetClass }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ASSET_CLASS_COLOR[cls] }} />;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
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
/** Share of a cap in use, whole numbers (the pill shows from 90%). */
function usedText(f: number): string {
  return `${Math.round(f * 100).toLocaleString("en-US")}%`;
}
// Oracle price — full figure above $1k (prices read as exact quotes, not
// sizes), two decimals below so stables show "$1.00", not "$1".
function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const tokens = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// Composition: one row per asset class — label · proportional bar · share.
// Same row-chart treatment as the hub cards (small classes stay legible).
export function CompositionBar({ composition }: { composition: AaveMarketView["composition"] }) {
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

// ── Row pieces ───────────────────────────────────────────────────────────────

/** The lifecycle and mode tags beside the symbol — states, not judgements. */
export function StateTags({ r, vocab }: { r: MarketReserveRow; vocab: AaveMarketVocab }) {
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

/** One side's cap, where it shows (capShows): "cap 94%" near binding, "cap
 *  closed" at a cap of one whole token. Borrowing switched off on a reserve
 *  that still carries borrows reads "borrowing off". Otherwise nothing. */
export function CapPill({
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
  if (c.state === "off")
    return (
      <span className={CAP_PILL_CLOSED} title="Borrowing is switched off for this reserve" data-caps={side}>
        <Prov info={vocab.borrowOffProv(r.symbol)}>borrowing off</Prov>
      </span>
    );
  if (!capShows(c)) return null;
  if (c.state === "closed")
    return (
      <span
        className={CAP_PILL_CLOSED}
        title={`A ${side} cap of one whole ${r.symbol}: governance closes a side this way, so no share is quoted.`}
        data-caps={side}
      >
        cap <Prov info={vocab.capClosedProv(side, r.symbol, c.basis)}>closed</Prov>
      </span>
    );
  if (c.state !== "used") return null;
  return (
    <span
      className={CAP_PILL}
      title={
        c.basis === "automator"
          ? `${tokens(c.amount)} of a ${tokens(c.cap)} ${r.symbol} maximum, which SparkLend's live cap steps up to; live cap ${c.liveCap != null ? tokens(c.liveCap) : "—"}`
          : `${tokens(c.amount)} of a ${tokens(c.cap)} ${r.symbol} ${side} cap`
      }
      data-caps={side}
    >
      cap{" "}
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

/** The eMode categories this reserve belongs to, and whether any lends it a
 *  loan-to-value. */
function emodeOf(r: MarketReserveRow) {
  const cats = r.emodeCategories ?? [];
  const lendsLtv = cats.some((c) => (c.ltv ?? 0) > 0);
  return { cats, lendsLtv };
}

const ltvBpsOf = (r: MarketReserveRow) => r.bps?.ltv ?? Math.round((r.ltv ?? 0) * 1e4);
const ltBpsOf = (r: MarketReserveRow) => r.bps?.lt ?? Math.round((r.lt ?? 0) * 1e4);

/** The Collateral cell: "LTV / LT", or "Not collateral" at a loan-to-value of
 *  0, "eMode only" where an eMode category lends one. */
export function Collateral({ r, vocab }: { r: MarketReserveRow; vocab: AaveMarketVocab }) {
  const ltvBps = ltvBpsOf(r);
  const ltBps = ltBpsOf(r);
  const em = emodeOf(r);
  if (ltvBps === 0) {
    if (em.lendsLtv)
      return (
        <span className="text-rb-500" title="Collateral only for a wallet in one of its eMode categories (Details)">
          <Prov info={vocab.reserveEModeLtProv(r.symbol, em.cats)}>eMode only</Prov>
        </span>
      );
    return (
      <span className="text-rb-500" title="A loan-to-value of 0: holding it adds nothing to what a wallet can borrow">
        <Prov info={ltBps > 0 ? vocab.ltvZeroProv(r.symbol) : vocab.reserveLtProv(r.symbol)}>Not collateral</Prov>
      </span>
    );
  }
  return (
    <span title="Loan-to-value / liquidation threshold">
      <Prov info={vocab.reserveLtvProv(r.symbol, ltvBps)}>{bpsText(ltvBps)}%</Prov>
      <span className="text-rb-500"> / </span>
      <Prov info={vocab.reserveLtProv(r.symbol)}>{bpsText(ltBps)}%</Prov>
    </span>
  );
}

/** The utilisation bar with the kink tick. Utilisation is borrowed ÷ supplied,
 *  both traced in the same row, so its percentage is exempt from the coverage
 *  tripwire. */
export function UtilBar({ r }: { r: MarketReserveRow }) {
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
        className="w-9 shrink-0 text-right tabular-nums text-[12px] text-foreground/80"
        data-prov-exempt=""
        title="Utilisation: borrowed ÷ supplied, both traced in this row"
      >
        {u != null ? pct(u) : "—"}
      </span>
    </div>
  );
}

/** A reserve's available underlying, token units: the Pool's virtual balance
 *  where it has one, else supplied less borrowed. */
export const availableTokens = (r: MarketReserveRow) => r.virtualBalance ?? Math.max(0, r.supplied - r.borrowed);

type RowProps = {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  assetHref?: (symbol: string, side: "supply" | "borrow") => string;
};

export function reserveFigures({ r, vocab, assetHref }: RowProps) {
  const sUsd = fmtUsd(r.suppliedUsd);
  const bUsd = fmtUsd(r.borrowedUsd);
  const hasBorrow = r.borrowedUsd >= 0.01 || r.borrowed > 0;
  const supplyLink = assetHref && r.suppliedUsd > 0 ? assetHref(r.symbol, "supply") : null;
  const borrowLink = assetHref && hasBorrow ? assetHref(r.symbol, "borrow") : null;
  // A reserve with no market price states its size in tokens.
  const fixed = r.fixedOraclePrice;
  const inTokens = (n: number) => (
    <span className="inline-flex items-center gap-1.5 text-foreground/80">
      {formatCompact(n)}
      <AssetUnit symbol={r.symbol} address={r.address} />
    </span>
  );
  const supplied =
    fixed && r.supplied > 0 ? (
      inTokens(r.supplied)
    ) : supplyLink ? (
      <Link href={supplyLink} className={INLINE_LINK}>
        <Prov info={vocab.reserveValueProv("supplied", r.symbol)}>{sUsd.display}</Prov>
      </Link>
    ) : (
      <span className={r.suppliedUsd > 0 ? "text-foreground/80" : "text-rb-500"}>
        <Prov info={vocab.reserveValueProv("supplied", r.symbol)}>{sUsd.display}</Prov>
      </span>
    );
  const borrowed = hasBorrow ? (
    borrowLink ? (
      <Link href={borrowLink} className={INLINE_LINK}>
        <Prov info={vocab.reserveValueProv("borrowed", r.symbol)}>{bUsd.display}</Prov>
      </Link>
    ) : (
      <span className="text-foreground/80">
        <Prov info={vocab.reserveValueProv("borrowed", r.symbol)}>{bUsd.display}</Prov>
      </span>
    )
  ) : null;
  // Available: the Pool's virtual balance where it has one (v3.3+), else
  // supplied less borrowed, in the unit the row's sizes are in.
  const availTokens = availableTokens(r);
  const basis = r.virtualBalance != null ? "virtual" : "difference";
  const availUsd = r.priceUsd != null ? availTokens * r.priceUsd : 0;
  const available =
    fixed && r.supplied > 0 ? (
      <span data-available-basis={basis}>
        <Prov info={vocab.reserveAvailableProv(r.symbol, { priced: false, basis, deficit: r.deficit })}>
          {inTokens(availTokens)}
        </Prov>
      </span>
    ) : (
      <span className={availUsd > 0 ? "text-foreground/80" : "text-rb-500"} data-available-basis={basis}>
        <Prov info={vocab.reserveAvailableProv(r.symbol, { priced: true, basis, deficit: r.deficit })}>
          {fmtUsd(availUsd).display}
        </Prov>
      </span>
    );
  const supplyRate =
    r.supplied > 0 ? (
      <Prov info={vocab.reserveRateProv("supply", r.symbol)}>{ratePercentText(r.supplyApr)}</Prov>
    ) : (
      <span className="text-rb-500">—</span>
    );
  const borrowRate = hasBorrow ? (
    <Prov info={vocab.reserveRateProv("borrow", r.symbol)}>{ratePercentText(r.borrowApr)}</Prov>
  ) : (
    <span className="text-rb-500">—</span>
  );
  // The feed the oracle reads for this asset is an input of the price's
  // receipt (decision 0059: no raw address on the surface).
  const priceProv = vocab.reservePriceProv(r.symbol);
  const priceInfo = r.oracleSource
    ? {
        ...priceProv,
        inputs: [
          ...(priceProv.inputs ?? []),
          {
            label: "price source",
            value: r.oracleSource,
            kind: "chain" as const,
            pclass: "oracle" as const,
            note: "the feed the oracle reads for this asset",
          },
        ],
      }
    : priceProv;
  const price =
    r.priceUsd != null ? (
      <Prov info={priceInfo}>{fmtPrice(r.priceUsd)}</Prov>
    ) : fixed ? (
      <RevealTip
        tip={`No market price. The oracle returns a fixed ${fmtPrice(fixed.usd)} for ${r.symbol}, so ${r.symbol} is left out of the dollar totals. It is not collateral, so the figure moves no health factor.`}
        label={`No market price for ${r.symbol}`}
        focusable
        wrap
        align="end"
        className="focus-ring rounded-sm text-rb-500 underline decoration-dotted"
      >
        no price
      </RevealTip>
    ) : (
      <span className="text-rb-500">—</span>
    );
  return { supplied, borrowed, available, supplyRate, borrowRate, price };
}

/** One line of the details panel. */
function DetailLine({ term, children, title }: { term: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="contents">
      <dt className="text-rb-500" data-parameter-term={term}>
        <HeadingTip text={term} tip={title} />
      </dt>
      <dd className="text-right tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

/** One cap side as a parameter line: the share in use and the ceiling, or
 *  the state that replaces them, with its receipt. */
function CapLine({
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
      return <Prov info={vocab.borrowOffProv(r.symbol)}>borrowing off</Prov>;
    case "closed":
      return <Prov info={vocab.capClosedProv(side, r.symbol, c.basis)}>closed</Prov>;
    case "none":
      return (
        <Prov info={vocab.capNoneProv(side, r.symbol, c.why, c.basis, side === "supply" ? r.supplyCap : r.borrowCap)}>
          no cap
        </Prov>
      );
    case "used":
      return (
        <span title={`${tokens(c.amount)} of ${tokens(c.cap)} ${r.symbol}`}>
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
          </Prov>{" "}
          <span className="text-rb-500">of {formatCompact(c.cap)}</span>
        </span>
      );
  }
}

/** A reserve's parameters: oracle price and its source, loan-to-value,
 *  liquidation threshold and bonus, reserve factor, the two caps with their
 *  use, the debt ceiling where set, the kink and the eMode categories, each
 *  with its receipt. M1's Details panel and the reserve page's M3.5 draw it. */
export function ReserveParameters({
  r,
  vocab,
  price,
}: {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  price: React.ReactNode;
}) {
  const ltvBps = ltvBpsOf(r);
  const ltBps = ltBpsOf(r);
  const bonusBps = r.bps?.bonus ?? 0;
  const em = emodeOf(r);
  return (
    <div data-reserve-parameters="">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
        <DetailLine
          term="Oracle price"
          title={`The USD price the market's oracle gives ${r.symbol}, used for every collateral and debt figure in the market.`}
        >
          {price}
        </DetailLine>
        <DetailLine
          term="Loan-to-value"
          title={`The most a wallet can borrow against supplied ${r.symbol}, as a share of its value. At 0% it backs no new borrowing.`}
        >
          <Prov info={vocab.reserveLtvProv(r.symbol, ltvBps)}>{bpsText(ltvBps)}%</Prov>
        </DetailLine>
        <DetailLine
          term="Liquidation threshold"
          title={`The share of supplied ${r.symbol}'s value that counts toward covering debt. A position can be liquidated once its debt passes its collateral counted at these shares.`}
        >
          <Prov info={vocab.reserveLtProv(r.symbol)}>{bpsText(ltBps)}%</Prov>
        </DetailLine>
        {bonusBps > 10000 && (
          <DetailLine
            term="Liquidation bonus"
            title={`The extra ${r.symbol}, over the value of the debt repaid, that a liquidator receives when it takes this collateral.`}
          >
            <Prov info={vocab.reserveBonusProv(r.symbol, bonusBps)}>{bpsText(bonusBps - 10000)}%</Prov>
          </DetailLine>
        )}
        <DetailLine
          term="Reserve factor"
          title={`The share of the interest ${r.symbol} borrowers pay that the protocol keeps. Suppliers earn the rest.`}
        >
          <Prov info={vocab.reserveFactorProv(r.symbol)}>{pct(r.reserveFactor)}</Prov>
        </DetailLine>
        <DetailLine
          term="Supply cap"
          title={`The most ${r.symbol} that can be supplied to the reserve in total, and the share of it in use. Supplies stop when it is reached.`}
        >
          <CapLine side="supply" c={r.supplyCapState} r={r} vocab={vocab} />
        </DetailLine>
        <DetailLine
          term="Borrow cap"
          title={`The most ${r.symbol} that can be borrowed from the reserve in total, and the share of it in use. Borrows stop when it is reached.`}
        >
          <CapLine side="borrow" c={r.borrowCapState} r={r} vocab={vocab} />
        </DetailLine>
        {r.debtCeiling != null && (
          <DetailLine
            term="Debt ceiling"
            title={`${r.symbol} is isolated: a wallet using it as collateral can borrow only the assets the market allows in isolation, and all such wallets together up to this many dollars.`}
          >
            <Prov info={vocab.isolatedProv(r.symbol, r.debtCeiling)}>
              ${r.debtCeiling.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </Prov>
          </DetailLine>
        )}
        {r.kink != null && r.rateStrategy && (
          <DetailLine
            term="Kink"
            title={`The share of the reserve's ${r.symbol} lent out at which the borrow rate starts to climb steeply.`}
          >
            <Prov
              info={vocab.kinkProv(r.symbol, {
                strategy: r.rateStrategy,
                method: r.kinkMethod ?? "",
                raw: r.kinkRaw ?? null,
              })}
            >
              {fracText(r.kink)}%
            </Prov>
          </DetailLine>
        )}
      </dl>
      {em.cats.length > 0 && (
        <div className="mt-3 border-t border-rb-200 pt-2 dark:border-rb-700" data-reserve-emode="">
          <p className="mb-1.5 text-[11px] text-rb-500">eMode categories (LTV / LT)</p>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[12px]">
            {em.cats.map((c) => (
              <div key={c.label} className="contents">
                <dt className="truncate text-rb-500" title={c.label}>
                  {c.label}
                </dt>
                <dd className="text-right tabular-nums text-foreground">
                  <Prov info={vocab.reserveEModeLtProv(r.symbol, [c])}>
                    {c.ltv != null ? `${fracText(c.ltv)}% / ` : ""}
                    {fracText(c.lt)}%
                  </Prov>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** The "Details" control in the asset cell: it opens ReserveParameters in a
 *  panel (a bottom sheet on a phone). */
export function ReserveDetails({
  r,
  vocab,
  price,
}: {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  price: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const label = `${r.symbol} reserve`;
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${r.symbol} details`}
        className={`focus-ring relative z-30 inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] transition-colors hover:text-foreground ${open ? "text-foreground" : "text-rb-500"}`}
        data-reserve-details-toggle={r.address}
      >
        Details
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        // The panel renders in a portal; its events still pass through the
        // row's React handlers, so they stop here.
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <AnchoredPanel
            id={panelId}
            label={label}
            anchor={() => button.current}
            onClose={close}
            fit={320}
            drop
            name="reserve-details"
            surface="overlay"
          >
            <p className="mb-3 pr-8 text-[13px] font-semibold text-foreground sm:pr-0">{label}</p>
            <ReserveParameters r={r} vocab={vocab} price={price} />
          </AnchoredPanel>
        </span>
      )}
    </>
  );
}

/** What a column header stands for, in its tip. */
export const HEADER_TIP: Record<string, string> = {
  available:
    "Available: the underlying the Pool holds for this reserve, what suppliers can withdraw and borrowers can still take (supplied less borrowed on a Pool before v3.3)",
  collateral:
    "Collateral: loan-to-value / liquidation threshold, the most a wallet can borrow against this reserve and the ratio past which a position holding it can be liquidated",
  supplyRate: "Supply rate: what suppliers earn a year, as an APR",
  borrowRate: "Borrow rate: the variable rate borrowers pay a year, as an APR",
  util: "Utilisation: the share of the reserve's supply that is on loan; the tick is the rate model's kink",
};

/** A reserve's collateral standing as one sortable number: loan-to-value,
 *  then liquidation threshold. */
export const collateralRank = (r: MarketReserveRow) => ltvBpsOf(r) * 1e5 + ltBpsOf(r);
