"use client";

// Aave V4 Hubs (/<chain>/aave-v4/hubs, ui-jobs 548): the money side of V4.
// Bespoke, on the house table (components/shared/data-table/):
//   - one panel per hub in the vitals band's shape (ProductHeadSection): Assets,
//     Supplied, Borrowed, Utilisation, Positions, the spokes it lends to, and
//     under it the hub's assets: Asset · Supplied · Borrowed · Liquidity ·
//     Utilisation · Drawn rate · Supply rate · Liquidity fee, each row unfolding
//     its credit lines (Spoke · Add cap · Supplied · Draw cap · Drawn · Credit
//     used · Status), each spoke linking its reserve page;
//   - the hub by spoke matrix: hubs across, spokes down, a chip per credit line
//     shaded by credit used, scrolling inside its frame on a phone.
// All stored (lib/aave-v4/markets.ts over `/api/aave-v4/hubs` or
// `/api/aave-v4-base/reserves`); receipts lib/aave-v4/market-provenance.ts.
// Present, don't rank: hubs in their canonical order, one neutral shade.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { ProductHeadSection, ToolsFor } from "@/components/shared/product/product-head";
import { ProductFailed } from "@/components/shared/product/market-page";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { PricesProvider } from "@/lib/shared/prices-context";
import { aaveV4Modal } from "@/lib/aave-v4/event-templates";
import { fmtUsd } from "@/lib/aave-v4/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import {
  hubsOf,
  marketsHref,
  pricedSum,
  reserveHref,
  spokeHref,
  V4_HUB_ORDER,
  type V4Deployment,
  type V4Hub,
  type V4HubAsset,
  type V4Line,
  type V4PriceBook,
  type V4Stored,
} from "@/lib/aave-v4/markets";
import {
  hubAssetCountProv,
  hubPositionsProv,
  pricedAmountProv,
  storedAmountProv,
  storedRateProv,
  storedRatioProv,
  storedStampProv,
  storedTermProv,
  storedValueProv,
  type StoredCoords,
} from "@/lib/aave-v4/market-provenance";
import { pctText } from "@/components/protocol/aave-v4/aave-v4-market-parts";
import { PricedTotal, protocolOf, useV4PriceBook, useV4Stored } from "@/lib/aave-v4/product";
import type { HeadFigure, ProductHead } from "@/lib/shared/product/model";

const NUM = "whitespace-nowrap tabular-nums text-[13px]";
const MUTED = "text-rb-500";
type Prices = V4PriceBook;

const priceOf = (l: { underlying: string }, book: Prices) => book(l.underlying)?.usd ?? null;

function usd(tokens: number, price: number | null, symbol: string): { display: string; title: string } {
  if (tokens === 0) return { display: price != null ? "$0" : `0 ${symbol}`, title: "None" };
  if (price != null) return fmtUsd(tokens * price);
  return { display: `${formatCompact(tokens)} ${symbol}`, title: `${tokens.toLocaleString("en-US")} ${symbol}` };
}

const pct1 = (x: number) => pctText(Math.round(x * 1000) / 1000);

/** The stamp over the stored payload. */
function readAtOf(s: V4Stored, what: string) {
  if (s.block == null) return null;
  const c: StoredCoords = { chainId: s.d.chainId, block: s.block };
  return {
    chainId: s.d.chainId,
    block: s.block,
    blockTime: s.readAt ? Math.floor(Date.parse(s.readAt) / 1000) : null,
    receipt: (at: number | null) => storedStampProv(c, what, at),
  };
}

// ── A hub's panel ────────────────────────────────────────────────────────────

function hubHead(s: V4Stored, h: V4Hub, prices: Prices): ProductHead {
  const c: StoredCoords = { chainId: s.d.chainId, block: s.block };
  const sumOf = (side: "supplied" | "borrowed") =>
    pricedSum(
      h.assets.map((x) => ({ underlying: x.underlying, symbol: x.symbol, tokens: x[side] })),
      prices,
    );
  const supSum = sumOf("supplied");
  const borSum = sumOf("borrowed");
  const supplied = supSum.usd;
  const borrowed = borSum.usd;
  const sup = fmtUsd(supplied);
  const bor = fmtUsd(borrowed);
  const partial = supSum.unpriced.length > 0 || borSum.unpriced.length > 0;
  const n = h.spokes.length;
  const figures: HeadFigure[] = [
    {
      slot: "roster",
      label: "Assets",
      value: <Prov info={hubAssetCountProv(h.label, h.assets.length, c)}>{h.assets.length}</Prov>,
    },
    {
      slot: "sizeIn",
      label: "Supplied",
      tip: sup.title,
      value: <PricedTotal sum={supSum} info={storedValueProv("supplied", `The ${h.label} hub`, c, supSum)} />,
    },
    {
      slot: "sizeOut",
      label: "Borrowed",
      tip: bor.title,
      value: <PricedTotal sum={borSum} info={storedValueProv("borrowed", `The ${h.label} hub`, c, borSum)} />,
    },
    ...(supplied > 0 && !partial
      ? [
          {
            slot: "usage" as const,
            label: "Utilisation",
            tip: "Borrowed ÷ supplied in USD: the two figures beside it",
            value: <span data-prov-exempt="">{pct1(borrowed / supplied)}</span>,
          },
        ]
      : []),
    ...(h.positions != null
      ? [
          {
            slot: "population" as const,
            label: "Positions",
            value: <Prov info={hubPositionsProv(h.label, c)}>{h.positions.toLocaleString("en-US")}</Prov>,
          },
        ]
      : []),
  ];
  return {
    scope: `hub-${h.key}`,
    title: `${h.label} hub`,
    subtitle: (
      <p className="mt-1 text-[13px] text-rb-500" data-structure-line="">
        Lends to{" "}
        <Link href={marketsHref(s.d)} className={INLINE_LINK} data-prov-exempt="">
          {n} {n === 1 ? "spoke" : "spokes"}
        </Link>
      </p>
    ),
    figures,
    aside: (
      <div data-prov-exempt="">
        <div className="mb-1.5 text-[11px] uppercase tracking-wider text-rb-500">Lends to</div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          {h.spokes.map((sp) => (
            <li key={sp.key}>
              <Link href={spokeHref(s.d, sp.slug)} className={INLINE_LINK} data-hub-spoke={sp.slug}>
                {sp.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ),
    readAt: readAtOf(s, `Every figure on the ${h.label} hub`),
    tools: {
      links: [
        { item: "markets", title: "Markets", subtitle: "Every Aave V4 spoke", href: marketsHref(s.d), internal: true },
      ],
      exports: {
        csv: {
          filename: `aave-v4-${h.key}-hub-assets.csv`,
          build: () => hubCsv(h),
          subtitle: "Every asset and credit line, figures unrounded",
        },
      },
    },
    explainer: {
      body: null,
      label: "Show hub explanation",
    },
    anatomy: "M5.1",
    bandHooks: { "data-hub-panel": h.key },
  };
}

function hubCsv(h: V4Hub): string {
  const head = [
    "asset",
    "address",
    "spoke",
    "supplied",
    "borrowed",
    "add_cap",
    "draw_cap",
    "drawn_apr",
    "liquidity_fee",
    "active",
    "halted",
  ];
  const rows = h.assets.flatMap((a) =>
    a.lines.map((l) =>
      [
        a.symbol,
        a.underlying,
        l.spokeKey,
        l.supplied,
        l.borrowed,
        l.addCap ?? "",
        l.drawCap ?? "",
        l.drawnApr ?? "",
        l.liquidityFee ?? "",
        l.active ?? "",
        l.halted ?? "",
      ].join(","),
    ),
  );
  return [head.join(","), ...rows].join("\n");
}

// ── The hub's assets and their credit lines ──────────────────────────────────

const capText = (cap: number | null, symbol: string) =>
  cap == null ? "no cap" : cap === 0 ? "closed" : `${formatCompact(cap)} ${symbol}`;

function CreditLines({ s, a, prices }: { s: V4Stored; a: V4HubAsset; prices: Prices }) {
  const c: StoredCoords = { chainId: s.d.chainId, block: s.block };
  const p = prices(a.underlying);
  const price = p?.usd ?? null;
  return (
    <DataTable
      label={`${a.symbol} credit lines`}
      tableClassName="min-w-[640px] text-[12px]"
      data-credit-lines={a.symbol}
      data-anatomy="M5.3"
    >
      <DataTableHead>
        <DataTableHeader label="Spoke" />
        <DataTableHeader label="Add cap" align="right" />
        <DataTableHeader label="Supplied" align="right" />
        <DataTableHeader label="Draw cap" align="right" />
        <DataTableHeader label="Drawn" align="right" />
        <DataTableHeader label="Credit used" align="right" />
        <DataTableHeader label="Status" align="right" />
      </DataTableHead>
      <DataTableBody>
        {a.lines.map((l) => {
          const sp = s.spokes.find((x) => x.key === l.spokeKey)!;
          const scope = `${a.symbol} on ${l.spokeName}`;
          const sup = usd(l.supplied, price, a.symbol);
          const drawn = usd(l.borrowed, price, a.symbol);
          const used = l.drawCap && l.drawCap > 0 ? l.borrowed / l.drawCap : null;
          return (
            <DataTableRow key={l.spokeKey} href={reserveHref(s.d, sp, l)} data-credit-line={l.spokeKey}>
              <DataTableCell rowHeader>
                <Link href={reserveHref(s.d, sp, l)} className={INLINE_LINK} data-row-link="">
                  {l.spokeName}
                </Link>
              </DataTableCell>
              <DataTableCell align="right" className={NUM}>
                <Prov info={storedAmountProv("add cap", scope, c)}>{capText(l.addCap, a.symbol)}</Prov>
              </DataTableCell>
              <DataTableCell align="right" className={NUM}>
                <Prov info={pricedAmountProv(storedAmountProv("supplied", scope, c), a.symbol, p, c)}>
                  <span title={sup.title}>{sup.display}</span>
                </Prov>
              </DataTableCell>
              <DataTableCell align="right" className={NUM}>
                <Prov info={storedAmountProv("draw cap", scope, c)}>{capText(l.drawCap, a.symbol)}</Prov>
              </DataTableCell>
              <DataTableCell align="right" className={NUM}>
                <Prov info={pricedAmountProv(storedAmountProv("borrowed", scope, c), a.symbol, p, c)}>
                  <span title={drawn.title}>{drawn.display}</span>
                </Prov>
              </DataTableCell>
              <DataTableCell align="right" className={NUM}>
                {used != null ? (
                  <Prov info={storedRatioProv("credit used", scope, c)}>{pct1(used)}</Prov>
                ) : (
                  <span className={MUTED} data-prov-exempt="">
                    —
                  </span>
                )}
              </DataTableCell>
              <DataTableCell align="right" className={NUM}>
                <Prov info={storedTermProv("status", scope, c)}>
                  {l.halted ? "halted" : l.active === false ? "inactive" : "active"}
                </Prov>
              </DataTableCell>
            </DataTableRow>
          );
        })}
      </DataTableBody>
    </DataTable>
  );
}

const COLS = ["Supplied", "Borrowed", "Liquidity", "Utilisation", "Drawn rate", "Supply rate", "Liquidity fee"];

function AssetRow({ s, h, a, prices }: { s: V4Stored; h: V4Hub; a: V4HubAsset; prices: Prices }) {
  const [open, setOpen] = useState(false);
  const registry = useReceiptRegistry();
  const c: StoredCoords = { chainId: s.d.chainId, block: s.block };
  const scope = `${a.symbol} on the ${h.label} hub`;
  const p = prices(a.underlying);
  const price = p?.usd ?? null;
  const cell = (node: ReactNode, label: string) => (
    <DataTableCell align="right" className={NUM} label={label}>
      {node}
    </DataTableCell>
  );
  const amount = (what: "supplied" | "borrowed" | "liquidity", tokens: number) => {
    const v = usd(tokens, price, a.symbol);
    return (
      <Prov info={pricedAmountProv(storedAmountProv(what, scope, c), a.symbol, p, c)}>
        <span title={v.title}>{v.display}</span>
      </Prov>
    );
  };
  const none = (
    <span className={MUTED} data-prov-exempt="">
      —
    </span>
  );
  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <DataTableRow data-hub-asset={`${h.key}:${a.underlying}`}>
        <DataTableCell rowHeader>
          <div className="flex items-center gap-2">
            <TokenChipIcon symbol={a.symbol} address={a.underlying} size={20} filterable={false} />
            <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{a.symbol}</span>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${a.symbol} credit lines`}
              className={`focus-ring inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] transition-colors hover:text-foreground ${open ? "text-foreground" : "text-rb-500"}`}
              data-credit-lines-toggle={a.symbol}
            >
              {a.lines.length} {a.lines.length === 1 ? "line" : "lines"}
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
            </button>
          </div>
        </DataTableCell>
        {cell(amount("supplied", a.supplied), COLS[0])}
        {cell(amount("borrowed", a.borrowed), COLS[1])}
        {cell(amount("liquidity", a.liquidity), COLS[2])}
        {cell(
          a.utilisation != null ? (
            <Prov info={storedRatioProv("utilisation", scope, c)}>{pct1(a.utilisation)}</Prov>
          ) : (
            none
          ),
          COLS[3],
        )}
        {cell(
          a.drawnApr != null ? (
            <Prov info={storedRateProv("drawn rate", scope, c)}>{ratePercentText(a.drawnApr)}</Prov>
          ) : (
            none
          ),
          COLS[4],
        )}
        {cell(
          a.supplyApr != null ? (
            <Prov info={storedRateProv("supply rate", scope, c)}>{ratePercentText(a.supplyApr)}</Prov>
          ) : (
            none
          ),
          COLS[5],
        )}
        {cell(
          a.liquidityFee != null ? (
            <Prov info={storedRateProv("liquidity fee", scope, c)}>{pctText(a.liquidityFee)}</Prov>
          ) : (
            none
          ),
          COLS[6],
        )}
      </DataTableRow>
      {open && (
        <DataTableRow data-credit-lines-row={a.symbol}>
          <DataTableCell colSpan={COLS.length + 1} wide className="!py-2">
            <CreditLines s={s} a={a} prices={prices} />
          </DataTableCell>
        </DataTableRow>
      )}
    </ProvReceiptsScope>
  );
}

function HubAssets({ s, h, prices }: { s: V4Stored; h: V4Hub; prices: Prices }) {
  const assets = useMemo(
    () =>
      [...h.assets].sort(
        (x, y) => y.supplied * (priceOf(y.lines[0], prices) ?? 0) - x.supplied * (priceOf(x.lines[0], prices) ?? 0),
      ),
    [h.assets, prices],
  );
  return (
    <DataTable
      label={`${h.label} hub assets`}
      stacked
      stackBelow="lg"
      tableClassName="lg:min-w-[900px]"
      className="mt-4"
      data-hub-assets={h.key}
      data-anatomy="M5.2"
    >
      <DataTableHead>
        <DataTableHeader label="Asset" />
        {COLS.map((col) => (
          <DataTableHeader key={col} label={col} align="right" />
        ))}
      </DataTableHead>
      <DataTableBody>
        {assets.map((a) => (
          <AssetRow key={a.underlying} s={s} h={h} a={a} prices={prices} />
        ))}
      </DataTableBody>
    </DataTable>
  );
}

// ── The matrix ───────────────────────────────────────────────────────────────

function Matrix({ s }: { s: V4Stored }) {
  const c: StoredCoords = { chainId: s.d.chainId, block: s.block };
  const hubs = V4_HUB_ORDER.filter((h) => s.lines.some((l) => l.hub === h));
  const spokes = [...s.spokes].sort((a, b) => a.name.localeCompare(b.name));
  const label = (h: string) => hubsOf(s).find((x) => x.key === h)?.label ?? h;
  const chip = (l: V4Line, slug: string) => {
    const used = l.drawCap && l.drawCap > 0 ? Math.min(1, l.borrowed / l.drawCap) : null;
    const sp = s.spokes.find((x) => x.slug === slug)!;
    return (
      <Link
        key={`${l.underlying}`}
        href={reserveHref(s.d, sp, l)}
        className="inline-flex items-center gap-1 rounded-sm px-1 py-px text-[11px] tabular-nums text-foreground hover:underline"
        style={{
          backgroundColor: `color-mix(in srgb, var(--foreground) ${used == null ? 4 : Math.round(6 + used * 34)}%, transparent)`,
        }}
        title={`${l.symbol}: ${used == null ? "no draw cap" : `${pct1(used)} of the draw cap used`}`}
        data-matrix-line={`${l.hub}:${l.spokeKey}:${l.symbol}`}
      >
        {l.symbol}
        {used != null ? (
          <Prov info={storedRatioProv("credit used", `${l.symbol} on ${l.spokeName}`, c)}>{pct1(used)}</Prov>
        ) : null}
      </Link>
    );
  };
  return (
    <DataTable label="Credit lines by hub and spoke" tableClassName="min-w-[720px]" data-hub-matrix="">
      <DataTableHead>
        <DataTableHeader label="Spoke" />
        {hubs.map((h) => (
          <DataTableHeader key={h} label={label(h)} />
        ))}
      </DataTableHead>
      <DataTableBody>
        {spokes.map((sp) => (
          <DataTableRow key={sp.key} data-matrix-spoke={sp.slug}>
            <DataTableCell rowHeader className="whitespace-nowrap text-[13px]">
              <Link href={spokeHref(s.d, sp.slug)} className={INLINE_LINK}>
                {sp.name}
              </Link>
            </DataTableCell>
            {hubs.map((h) => {
              const ls = sp.lines.filter((l) => l.hub === h);
              return (
                <DataTableCell key={h} data-matrix-cell={`${h}:${sp.slug}`}>
                  {ls.length ? (
                    <div className="flex flex-wrap gap-1">{ls.map((l) => chip(l, sp.slug))}</div>
                  ) : (
                    <span className={MUTED} data-prov-exempt="">
                      —
                    </span>
                  )}
                </DataTableCell>
              );
            })}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

function HubsBody({ d }: { d: V4Deployment }) {
  const stored = useV4Stored(d);
  const s = stored.state === "ok" ? stored.data : null;
  const prices = useV4PriceBook(s);
  const hubs = useMemo(() => (s ? hubsOf(s) : []), [s]);
  let body: ReactNode;
  if (stored.state === "loading" || (stored.state === "ok" && !prices)) body = <SkeletonBlock height={480} />;
  else if (stored.state === "error") body = <ProductFailed what="the hubs" message={stored.message} />;
  else
    body = (
      <>
        {hubs.map((h) => (
          <div key={h.key} id={`hub-${h.key}`} className="mb-10 scroll-mt-20" data-hub={h.key}>
            <ProductHeadSection head={hubHead(stored.data, h, prices!)} className="mb-0" />
            <HubAssets s={stored.data} h={h} prices={prices!} />
          </div>
        ))}
        <ProvSection scope="hub-matrix" className="mb-8" data-anatomy="M5.4" data-hub-matrix-section="">
          <SectionHeading
            title="Credit lines by hub and spoke"
            menu={
              <ToolsFor
                scope="hub-matrix"
                title="Credit lines by hub and spoke"
                tools={{
                  links: [
                    {
                      item: "markets",
                      title: "Markets",
                      subtitle: "Every Aave V4 spoke",
                      href: marketsHref(d),
                      internal: true,
                    },
                  ],
                }}
              />
            }
          >
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
              Hubs across, spokes down: each chip is a credit line, shaded by the share of its draw cap the spoke has
              used. A chip opens its reserve page.
            </p>
          </SectionHeading>
          <div className="mt-3">
            <Matrix s={stored.data} />
          </div>
        </ProvSection>
      </>
    );
  return (
    <div className="min-h-screen" data-anatomy="M5">
      <div className="py-8" data-skel-section="page-table">
        <SubPageHeader
          protocol={protocolOf(d)}
          title="Hubs"
          learnMore={aaveV4Modal(d.chain === "base" ? "base_hub" : d.chain === "arc" ? "arc_hub" : "hubs")}
        />
        {body}
      </div>
      <ProvInspectorLayer />
    </div>
  );
}

/** The Hubs page of one deployment. */
export function AaveV4HubsPage({ d }: { d: V4Deployment }) {
  return (
    <PricesProvider>
      <HubsBody d={d} />
    </PricesProvider>
  );
}
