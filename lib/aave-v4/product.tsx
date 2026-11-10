"use client";

// Aave V4's product adapter (ui-jobs 548): the spokes as markets, mapped into the
// shared product model (lib/shared/product/model.ts) for the shells in
// components/shared/product/.
//   /<chain>/aave-v4/markets          the roster (A1, M4): a head-only panel per
//                                     spoke, ordered by supplied value, from the
//                                     stored lines (lib/aave-v4/markets.ts);
//   /<chain>/aave-v4/markets/<spoke>  the spoke (A2, M1): its head, a line of
//                                     liquidation settings, then its reserves, one
//                                     row per (asset, hub), each from a head read.
// The reserve page is lib/aave-v4/reserve.tsx; Hubs is
// components/protocol/aave-v4/aave-v4-hubs-page.tsx. Receipts:
// lib/aave-v4/market-provenance.ts.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Ban } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { readStampProv } from "@/components/shared/read-stamp";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { CLASS_ORDER } from "@/components/shared/aave-reserve-parts";
import { MarketPage } from "@/components/shared/product/market-page";
import { MarketRoster } from "@/components/shared/product/market-roster";
import { positionEntry } from "@/components/shared/product/position-entry";
import { PricesProvider, usePrices, useRequestPrices } from "@/lib/shared/prices-context";
import { listSymbols, NO_PRICE_HINT } from "@/lib/aave-v4/unpriced";
import { fetchAaveV4Hubs } from "@/lib/api/fetch-aave-v4-hubs";
import { useV4Heads, type V4Read, type V4ReserveHead } from "@/lib/api/fetch-aave-v4-reserve";
import { AAVE_V4_BASE_API_ROOT, AAVE_V4_ORACLE_ROUTE } from "@/lib/aave-v4/deployment-routes";
import { aaveV4Modal, aaveV4PositionModal } from "@/lib/aave-v4/event-templates";
import { fmtUsd } from "@/lib/aave-v4/format";
import { ASSET_CLASS_COLOR, ASSET_CLASS_TITLE } from "@/lib/aave-v4/asset-class";
import {
  andList,
  hubsHref,
  marketsHref,
  priceBook,
  pricedSum,
  reserveHref,
  settleHead,
  spokeHref,
  spokePositionsHref,
  storedFromBase,
  storedFromHubs,
  V4_HUB_LABEL,
  type PricedSum,
  type V4BaseReserves,
  type V4Price,
  type V4PriceBook,
  type V4Deployment,
  type V4HubKey,
  type V4Line,
  type V4ReserveFigures,
  type V4Spoke,
  type V4Stored,
} from "@/lib/aave-v4/markets";
import {
  availableProv,
  creditUsedProv,
  drawnRateProv,
  headValueProv,
  liquidationConfigProv,
  positionsProv,
  pricedAmountProv,
  reserveCountProv,
  spokeValueProv,
  storedAmountProv,
  storedStampProv,
  storedTermProv,
  storedValueProv,
  supplyRateProv,
  type StoredCoords,
} from "@/lib/aave-v4/market-provenance";
import {
  amountText,
  HubChip,
  pctText,
  V4Details,
  V4StateTags,
  type V4Names,
} from "@/components/protocol/aave-v4/aave-v4-market-parts";
import { protocolForHref } from "@/lib/shared/protocols";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { formatCompact, formatCompactTitled } from "@/lib/shared/format-compact";
import { DataTableAmount } from "@/components/shared/data-table/data-table";
import { AssetUnit } from "@/components/shared/asset-unit";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import type {
  EntryLink,
  HeadFigure,
  Loadable,
  MarketModel,
  ProductHead,
  ReserveRowModel,
  ReserveTableModel,
  SectionTools,
} from "@/lib/shared/product/model";
import type { SectionMenuLink } from "@/components/shared/section-menu";

export const V4_TERMS = {
  spoke: { one: "spoke", many: "spokes" },
  reserve: { one: "reserve", many: "reserves" },
  position: { one: "position", many: "positions" },
} as const;

export const RATE_TIP = {
  supply: "What suppliers earn a year, as an APR: the drawn rate and the premium borrowers pay, less the hub's fee",
  borrow: "The hub's drawn rate a year, as an APR; each borrower pays a premium by collateral risk on top",
} as const;

export const PREMIUM_LINE = "plus a premium by collateral risk";

export const protocolOf = (d: V4Deployment) => {
  const p = protocolForHref(d.root);
  if (!p) throw new Error(`aave-v4 product: no roster entry for ${d.root}`);
  return p;
};

// ── The stored read ──────────────────────────────────────────────────────────

/** The deployment's stored lines: `/api/aave-v4/hubs` or `/api/aave-v4-base/reserves`. */
export function useV4Stored(d: V4Deployment): Loadable<V4Stored> {
  const [out, setOut] = useState<Loadable<V4Stored>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    const read =
      d.chain === "base"
        ? fetch(`${AAVE_V4_BASE_API_ROOT}/reserves`, { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<V4BaseReserves>) : Promise.reject(new Error(`${r.status}`))))
            .then(storedFromBase)
        : fetchAaveV4Hubs().then(storedFromHubs);
    read
      .then((s) => live && setOut({ state: "ok", data: s }))
      .catch((e) => live && setOut({ state: "error", message: e instanceof Error ? e.message : "The read failed." }));
    return () => {
      live = false;
    };
  }, [d.chain]);
  return out;
}

const coordsOf = (s: V4Stored): StoredCoords => ({ chainId: s.d.chainId, block: s.block });

/** The stamp over the stored lines: the time the store read them. */
function storedReadAt(s: V4Stored, what: string) {
  if (s.block == null) return null;
  const c = coordsOf(s);
  const t = s.readAt ? Math.floor(Date.parse(s.readAt) / 1000) : null;
  return {
    chainId: s.d.chainId,
    block: s.block,
    blockTime: t,
    receipt: (at: number | null) => storedStampProv(c, what, at),
  };
}

/** The deployment's price book: the spoke oracle's prices (Ethereum: `/api/oracle/aave-v4`;
 *  Base: stored with each row), the market feed (DefiLlama) only for an asset the oracle
 *  holds none for. Null until the oracle read settles, so no figure shows at a feed price
 *  first and moves to the oracle's after. Call under a `PricesProvider`. */
export function useV4PriceBook(s: V4Stored | null): V4PriceBook | null {
  const eth = s?.d.chain === "ethereum";
  const [oracle, setOracle] = useState<
    { prices: Record<string, { usd: number }>; block: number | null } | null | "failed"
  >(null);
  useEffect(() => {
    if (!eth) return;
    let live = true;
    fetch(AAVE_V4_ORACLE_ROUTE)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { success?: boolean; prices?: Record<string, { usd: number }>; blockNumber?: number } | null) => {
        if (!live) return;
        setOracle(b?.success && b.prices ? { prices: b.prices, block: b.blockNumber ?? null } : "failed");
      })
      .catch(() => live && setOracle("failed"));
    return () => {
      live = false;
    };
  }, [eth]);
  const held = oracle && oracle !== "failed" ? oracle : null;
  const missing = useMemo(
    () => (s && eth && oracle ? [...new Set(s.lines.map((l) => l.underlying))].filter((a) => !held?.prices[a]) : []),
    [s, eth, oracle, held],
  );
  useRequestPrices(missing);
  const market = usePrices();
  return useMemo(() => {
    if (!s) return null;
    if (eth && oracle == null) return null;
    return priceBook(s, held, market);
  }, [s, eth, oracle, held, market]);
}

/** A USD total, with what it leaves out under it. */
export function PricedTotal({ sum, info }: { sum: PricedSum; info: Provenance }) {
  const t = fmtUsd(sum.usd);
  return (
    <>
      <Prov info={info}>
        <span title={t.title}>{t.display}</span>
      </Prov>
      {sum.unpriced.length > 0 && (
        <span className="block text-[11px] font-normal text-rb-500" data-prov-exempt="" data-total-partial="">
          leaves out {listSymbols(sum.unpriced)}: {NO_PRICE_HINT}
        </span>
      )}
    </>
  );
}

/** "Draws from the Core and Prime hubs", each hub linking the Hubs page. */
export function StructureLine({ d, hubs }: { d: V4Deployment; hubs: V4HubKey[] }) {
  const links: ReactNode[] = hubs.map((h) => (
    <Link key={h} href={`${hubsHref(d)}#hub-${h}`} className={INLINE_LINK} data-structure-hub={h}>
      {V4_HUB_LABEL[h]}
    </Link>
  ));
  const joined = links.flatMap((l, i) => (i === 0 ? [l] : [i === links.length - 1 ? " and " : ", ", l]));
  return (
    <p className="mt-1 text-[13px] text-rb-500" data-structure-line="">
      Draws from the {joined} {hubs.length === 1 ? "hub" : "hubs"}
    </p>
  );
}

/** What the spoke is, in one line: its "?" intro, where the file words this spoke. */
const purposeOf = (name: string): string | undefined => {
  const intro = aaveV4PositionModal(name).intro;
  return intro === aaveV4PositionModal("").intro ? undefined : intro;
};

function spokeLinks(d: V4Deployment, sp: V4Spoke, roster: boolean): SectionMenuLink[] {
  return [
    roster
      ? {
          item: "reserves",
          title: "Reserves",
          subtitle: `Every ${sp.name} reserve`,
          href: spokeHref(d, sp.slug),
          internal: true,
        }
      : { item: "markets", title: "Markets", subtitle: "Every Aave V4 spoke", href: marketsHref(d), internal: true },
    {
      item: "positions",
      title: "Positions",
      subtitle: `Every ${sp.name} position`,
      href: spokePositionsHref(d, sp.key),
      internal: true,
    },
    { item: "hubs", title: "Hubs", subtitle: "The liquidity this spoke draws", href: hubsHref(d), internal: true },
  ];
}

// ── The roster (A1) ──────────────────────────────────────────────────────────

interface RosterSpoke {
  sp: V4Spoke;
  supplied: PricedSum;
  borrowed: PricedSum;
}

function rosterOf(s: V4Stored, book: V4PriceBook): RosterSpoke[] {
  const sum = (sp: V4Spoke, side: "supplied" | "borrowed") =>
    pricedSum(
      sp.lines.map((l) => ({ underlying: l.underlying, symbol: l.symbol, tokens: l[side] })),
      book,
    );
  return s.spokes
    .map((sp) => ({ sp, supplied: sum(sp, "supplied"), borrowed: sum(sp, "borrowed") }))
    .sort((a, b) => b.supplied.usd - a.supplied.usd);
}

function rosterMarkdown(r: RosterSpoke, s: V4Stored): string {
  return [
    `# ${r.sp.name}`,
    "",
    ...(purposeOf(r.sp.name) ? [purposeOf(r.sp.name)!, ""] : []),
    `- Draws from: ${andList(r.sp.hubs.map((h) => V4_HUB_LABEL[h]))}`,
    `- Reserves: ${r.sp.lines.length}`,
    `- Supplied: ${fmtUsd(r.supplied.usd).display}${r.supplied.unpriced.length ? ` (leaves out ${listSymbols(r.supplied.unpriced)})` : ""}`,
    `- Borrowed: ${fmtUsd(r.borrowed.usd).display}${r.borrowed.unpriced.length ? ` (leaves out ${listSymbols(r.borrowed.unpriced)})` : ""}`,
    ...(r.sp.positions != null ? [`- Positions: ${r.sp.positions.toLocaleString("en-US")}`] : []),
    "",
    s.block != null ? `Stored from the hub contracts at block ${s.block.toLocaleString("en-US")}.` : "",
  ].join("\n");
}

function rosterHead(s: V4Stored, r: RosterSpoke): ProductHead {
  const { sp } = r;
  const d = s.d;
  const c = coordsOf(s);
  const sup = fmtUsd(r.supplied.usd);
  const bor = fmtUsd(r.borrowed.usd);
  const listing = spokePositionsHref(d, sp.key);
  const entries = [
    { label: `View ${sp.name} reserves`, href: spokeHref(d, sp.slug), hooks: { "data-market-reserves-link": "" } },
    positionEntry({ href: listing, name: sp.name, noun: V4_TERMS.position, count: sp.positions ?? undefined }),
  ].filter((e): e is EntryLink => e != null);
  const figures: HeadFigure[] = [
    {
      slot: "roster",
      label: "Reserves",
      value: <Prov info={reserveCountProv(sp.name, sp.lines.length, c)}>{sp.lines.length}</Prov>,
    },
    {
      slot: "sizeIn",
      label: "Supplied",
      tip: sup.title,
      value: <PricedTotal sum={r.supplied} info={storedValueProv("supplied", sp.name, c, r.supplied)} />,
    },
    {
      slot: "sizeOut",
      label: "Borrowed",
      tip: bor.title,
      value: <PricedTotal sum={r.borrowed} info={storedValueProv("borrowed", sp.name, c, r.borrowed)} />,
    },
    ...(sp.positions != null
      ? [
          {
            slot: "population" as const,
            label: "Positions",
            value: <Prov info={positionsProv(sp.name, c)}>{sp.positions.toLocaleString("en-US")}</Prov>,
          },
        ]
      : []),
  ];
  return {
    scope: `spoke-${sp.slug}`,
    title: sp.name,
    titleHref: listing,
    subtitle: <StructureLine d={d} hubs={sp.hubs} />,
    purpose: purposeOf(sp.name),
    figures,
    entries,
    readAt: storedReadAt(s, `Every figure on ${sp.name}`),
    tools: {
      links: spokeLinks(d, sp, true),
      exports: {
        markdown: { build: () => rosterMarkdown(r, s), copySubtitle: "This spoke as Markdown, for an LLM" },
      },
    },
    explainer: {
      body: (
        <ExplainGroup title="This spoke">
          <ExplainBullet>
            {sp.name} lists <Fig bold>{sp.lines.length}</Fig> reserves and draws from the{" "}
            {andList(sp.hubs.map((h) => V4_HUB_LABEL[h]))} {sp.hubs.length === 1 ? "hub" : "hubs"}.
          </ExplainBullet>
          <ExplainBullet>
            Suppliers have added <Fig bold>{sup.display}</Fig> and borrowers owe <Fig bold>{bor.display}</Fig>.
          </ExplainBullet>
          <ExplainBullet>
            A hub holds the money and sets the rates; the spoke holds the terms and the positions.
          </ExplainBullet>
        </ExplainGroup>
      ),
      label: "Show spoke explanation",
    },
    learnMore: aaveV4PositionModal(sp.name),
    bandHooks: { "data-market-panel": sp.slug },
  };
}

function RosterBody({ d }: { d: V4Deployment }) {
  const stored = useV4Stored(d);
  const s = stored.state === "ok" ? stored.data : null;
  const book = useV4PriceBook(s);
  const roster = useMemo(() => (s && book ? rosterOf(s, book) : []), [s, book]);
  const byKey = new Map(roster.map((r) => [r.sp.slug, r]));
  const useMarket = (k: string): Loadable<MarketModel> => {
    if (stored.state !== "ok") return stored.state === "loading" ? stored : { state: "error", message: stored.message };
    const r = byKey.get(k);
    if (!r) return { state: "loading" };
    return { state: "ok", data: { head: rosterHead(stored.data, r), reserves: EMPTY_TABLE } };
  };
  const markets =
    s && book ? roster.map((r) => ({ key: r.sp.slug, name: r.sp.name })) : [{ key: "spokes", name: "Spokes" }];
  return (
    <MarketRoster
      header={{ protocol: protocolOf(d), title: "Markets", learnMore: aaveV4Modal("hubs") }}
      markets={markets}
      useMarket={useMarket}
    />
  );
}

/** The roster leaves the reserves off; the model asks for a table all the same. */
const EMPTY_TABLE: ReserveTableModel = {
  scope: "reserves",
  title: "Reserves",
  label: "Reserves",
  anatomy: "M1",
  assetLabel: "Asset",
  columns: [],
  rows: [],
  defaultSort: { key: "asset", dir: "asc" },
  emptyFiltered: "",
  tools: {},
};

/** The markets roster: every spoke on the deployment. */
export function AaveV4Markets({ d }: { d: V4Deployment }) {
  return (
    <PricesProvider>
      <RosterBody d={d} />
    </PricesProvider>
  );
}

// ── One spoke (A2) ───────────────────────────────────────────────────────────

/** A spoke reserve: its stored line, and its head read where it answered. */
export interface V4Row {
  line: V4Line;
  f: V4ReserveFigures | null;
  names: V4Names;
  /** This spoke's oracle price from the head read, else the deployment's price book. */
  price: V4Price | null;
}

/** The rows' prices as a book, for their USD totals. */
const rowBook =
  (rows: V4Row[]): V4PriceBook =>
  (a) =>
    rows.find((r) => r.line.underlying === a.toLowerCase())?.price ?? null;

/** A row's token amounts: the head read's, else the stored line's. */
const rowTokens = (r: V4Row, side: "supplied" | "borrowed") =>
  side === "supplied" ? (r.f?.spokeSupplied ?? r.line.supplied) : (r.f?.spokeBorrowed ?? r.line.borrowed);

export const namesOf = (sp: V4Spoke, l: V4Line): V4Names => ({
  symbol: l.symbol,
  spoke: sp.name,
  hub: V4_HUB_LABEL[l.hub],
});

/** The head read's question for a line: always naming the hub. */
export const headQuery = (sp: V4Spoke, l: V4Line) => ({ spoke: sp.key, asset: l.underlying, hub: l.hub });

const NUM = "tabular-nums text-[13px]";
const RATE = "whitespace-nowrap tabular-nums text-[13px] text-foreground/80";
const MUTED = "text-rb-500";

function rowOf(d: V4Deployment, sp: V4Spoke, x: V4Row, c: StoredCoords): ReserveRowModel {
  const { line: l, f, names } = x;
  const key = `${l.underlying}:${l.hub}`;
  const usd = x.price?.usd ?? null;
  /** A head amount's receipt, revalued at the book's price where this spoke's oracle gave none. */
  const valued = (info: Provenance) => (f?.price == null ? pricedAmountProv(info, l.symbol, x.price) : info);
  const tok = (n: number) => {
    const t = formatCompactTitled(n);
    return `${t.display} ${l.symbol}`;
  };
  // The stored figures stand in where the head read did not answer.
  const supplied = f ? (
    (() => {
      const a = amountText(f.spokeSupplied, usd, l.symbol);
      return (
        <Prov info={valued(headValueProv(f, "spoke", "supplied", names))}>
          <span title={a.title}>{a.display}</span>
        </Prov>
      );
    })()
  ) : (
    <Prov info={storedAmountProv("supplied", `${l.symbol} on ${sp.name}`, c)}>{tok(l.supplied)}</Prov>
  );
  const borrowable = f?.borrowable ?? l.borrowable;
  const borrowedTokens = f?.spokeBorrowed ?? l.borrowed;
  const borrowed =
    borrowedTokens > 0 ? (
      f ? (
        (() => {
          const a = amountText(f.spokeBorrowed, usd, l.symbol);
          return (
            <Prov info={valued(headValueProv(f, "spoke", "borrowed", names))}>
              <span title={a.title}>{a.display}</span>
            </Prov>
          );
        })()
      ) : (
        <Prov info={storedAmountProv("borrowed", `${l.symbol} on ${sp.name}`, c)}>{tok(l.borrowed)}</Prov>
      )
    ) : borrowable === false ? (
      <span
        className="inline-flex items-center justify-end gap-1 text-rb-500/70"
        title="Not borrowable on this spoke"
        data-prov-exempt=""
      >
        <Ban className="h-3.5 w-3.5" aria-label="Not borrowable" />
      </span>
    ) : (
      <span className={MUTED} data-prov-exempt="">
        no borrows
      </span>
    );
  const dash = (
    <span className={MUTED} data-prov-exempt="">
      —
    </span>
  );
  const avail = f ? amountText(f.available, usd, l.symbol) : null;
  // The table's amount cells (D1, decision 0047): the token amount over its
  // oracle dollar value, the amount an echo of the dollar figure's receipt.
  // Null where the cell keeps one line: no head read (stored tokens), a price
  // from the off-chain market feed, or a side at zero.
  const oracle = f != null && x.price?.via === "oracle" && usd != null;
  const pair = (n: number, info: Provenance) => {
    if (!oracle || n <= 0) return null;
    const a = amountText(n, usd, l.symbol);
    return {
      amount: (
        <Prov info={info} echo>
          <span className="inline-flex items-center gap-1.5">
            {formatCompact(n)}
            <AssetUnit symbol={l.symbol} address={l.underlying} />
          </span>
        </Prov>
      ),
      value: (
        <Prov info={info}>
          <span title={a.title}>{a.display}</span>
        </Prov>
      ),
    };
  };
  const amounts = f
    ? {
        supplied: pair(f.spokeSupplied, valued(headValueProv(f, "spoke", "supplied", names))),
        borrowed: pair(f.spokeBorrowed, valued(headValueProv(f, "spoke", "borrowed", names))),
        available: borrowable !== false ? pair(f.available, valued(availableProv(f, names))) : null,
      }
    : { supplied: null, borrowed: null, available: null };
  const cf = f?.collateralFactor ?? l.collateralFactor;
  return {
    key,
    href: reserveHref(d, sp, l),
    group: l.cls,
    asset: {
      symbol: l.symbol,
      address: l.underlying,
      tags: <V4StateTags f={f} line={l} names={names} />,
      chips: <HubChip label={names.hub} />,
      sub: (
        <div className="flex items-center gap-1 text-[12px] text-rb-500" title={ASSET_CLASS_TITLE[l.cls]}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ASSET_CLASS_COLOR[l.cls] }} />
          <span className="truncate">{ASSET_CLASS_TITLE[l.cls]}</span>
        </div>
      ),
      details: f ? <V4Details f={f} line={l} names={names} rowKey={key} /> : undefined,
      sort: `${l.symbol} ${l.hub}`,
    },
    hooks: { "data-reserve-hub": l.hub },
    cells: {
      supplied: {
        sort: rowTokens(x, "supplied") * (usd ?? 0),
        node: amounts.supplied ? <DataTableAmount {...amounts.supplied} /> : supplied,
      },
      borrowed: {
        sort: rowTokens(x, "borrowed") * (usd ?? 0),
        node: amounts.borrowed ? <DataTableAmount {...amounts.borrowed} /> : borrowed,
      },
      available: {
        sort: f ? f.available * (usd ?? 0) : -1,
        title: "The hub's liquidity, capped by what the draw cap leaves this spoke",
        node: amounts.available ? (
          <DataTableAmount {...amounts.available} />
        ) : f && avail && borrowable !== false ? (
          <Prov info={valued(availableProv(f, names))}>
            <span title={avail.title}>{avail.display}</span>
          </Prov>
        ) : (
          dash
        ),
      },
      supplyRate: {
        sort: f?.supplyApr ?? -1,
        title: `Supply rate: ${RATE_TIP.supply.toLowerCase()}`,
        node:
          f && f.supplyApr != null ? <Prov info={supplyRateProv(f, names)}>{ratePercentText(f.supplyApr)}</Prov> : dash,
      },
      borrowRate: {
        sort: f?.drawnApr ?? -1,
        title: `Borrow rate: ${RATE_TIP.borrow.toLowerCase()}`,
        node:
          f && f.drawnApr != null && borrowable !== false ? (
            <Prov info={drawnRateProv(f, names)}>{ratePercentText(f.drawnApr)}</Prov>
          ) : (
            dash
          ),
      },
      collateral: {
        sort: cf ?? 0,
        node: (
          <Prov info={storedTermProv("collateral factor", `${l.symbol} on ${sp.name}`, c, l.cfBlock)}>
            {cf != null ? pctText(cf) : <span className={MUTED}>Not collateral</span>}
          </Prov>
        ),
      },
      creditUsed: {
        sort: f?.creditUsed ?? -1,
        title: "What the spoke owes the hub ÷ the draw cap the hub set for it",
        node:
          f && f.creditUsed != null ? (
            <Prov info={creditUsedProv(f, names)}>{pctText(Math.round(f.creditUsed * 1000) / 1000)}</Prov>
          ) : f && f.drawCap == null ? (
            <span className={MUTED} data-prov-exempt="">
              no cap
            </span>
          ) : (
            dash
          ),
      },
    },
  };
}

function reservesCsv(rows: V4Row[]): string {
  const head = [
    "symbol",
    "address",
    "hub",
    "supplied",
    "borrowed",
    "available",
    "price_usd",
    "supply_apr",
    "drawn_apr",
    "collateral_factor",
    "credit_used",
  ];
  const lines = rows.map(({ line: l, f, price }) =>
    [
      l.symbol,
      l.underlying,
      l.hub,
      f?.spokeSupplied ?? l.supplied,
      f?.spokeBorrowed ?? l.borrowed,
      f?.available ?? "",
      price?.usd ?? "",
      f?.supplyApr ?? "",
      f?.drawnApr ?? "",
      f?.collateralFactor ?? l.collateralFactor ?? "",
      f?.creditUsed ?? "",
    ].join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

function reservesTable(d: V4Deployment, sp: V4Spoke, rows: V4Row[], c: StoredCoords): ReserveTableModel {
  return {
    scope: `reserves-${sp.slug}`,
    title: "Reserves",
    line: (
      <>
        Every reserve on the spoke, one row per token and the hub it is drawn from; filter by class, sort any column.
        Supplied and Borrowed are this spoke&apos;s, valued at the spoke oracle&apos;s price; Available and the rates
        are the hub&apos;s. Borrowers pay the borrow rate {PREMIUM_LINE}. A row opens its reserve&apos;s page; Details
        opens its parameters in place.
      </>
    ),
    label: `${sp.name} reserves`,
    anatomy: "M1",
    assetLabel: "Asset",
    tableClassName: "lg:min-w-[960px]",
    columns: [
      { key: "supplied", label: "Supplied", align: "right", className: NUM },
      { key: "borrowed", label: "Borrowed", align: "right", className: NUM },
      {
        key: "available",
        label: "Available",
        align: "right",
        className: NUM,
        tip: "Available: the hub's liquidity, capped by the draw cap less what this spoke owes",
        hooks: { "data-available": "" },
      },
      {
        key: "supplyRate",
        label: "Supply rate",
        align: "right",
        className: RATE,
        tip: `Supply rate: ${RATE_TIP.supply.toLowerCase()}`,
        hooks: { "data-rate": "supply" },
      },
      {
        key: "borrowRate",
        label: "Borrow rate",
        align: "right",
        className: RATE,
        tip: `Borrow rate: ${RATE_TIP.borrow.toLowerCase()}`,
        hooks: { "data-rate": "borrow" },
      },
      {
        key: "collateral",
        label: "Collateral",
        align: "right",
        className: RATE,
        tip: "Collateral: the collateral factor, the share of the asset's value the spoke counts toward a borrow",
        hooks: { "data-collateral": "" },
      },
      {
        key: "creditUsed",
        label: "Credit used",
        align: "right",
        className: RATE,
        tip: "Credit used: what this spoke owes the hub ÷ the draw cap the hub set for it",
        hooks: { "data-credit-used": "" },
      },
    ],
    rows: rows.map((x) => rowOf(d, sp, x, c)),
    groups: CLASS_ORDER.map((k) => ({ key: k, label: ASSET_CLASS_TITLE[k], color: ASSET_CLASS_COLOR[k] })),
    groupLabel: "Class",
    defaultSort: { key: "supplied", dir: "desc" },
    emptyFiltered: "No reserves match this filter.",
    tools: {
      links: [
        {
          item: "positions",
          title: "Positions",
          subtitle: `Every ${sp.name} position`,
          href: spokePositionsHref(d, sp.key),
          internal: true,
        },
        { item: "hubs", title: "Hubs", subtitle: "The liquidity this spoke draws", href: hubsHref(d), internal: true },
      ],
      exports: {
        csv: {
          filename: `aave-v4-${sp.slug}-reserves.csv`,
          build: () => reservesCsv(rows),
          subtitle: "Every reserve, figures unrounded",
        },
      },
    },
  };
}

/** "Draws from" with each hub's share of the spoke's borrowing. */
function DrawsFrom({ d, sp, rows }: { d: V4Deployment; sp: V4Spoke; rows: V4Row[] }) {
  const owed = (h: V4HubKey) =>
    rows.filter((r) => r.line.hub === h).reduce((a, r) => a + rowTokens(r, "borrowed") * (r.price?.usd ?? 0), 0);
  const total = sp.hubs.reduce((a, h) => a + owed(h), 0);
  return (
    <div data-prov-exempt="">
      <div className="mb-1.5 text-[11px] uppercase tracking-wider text-rb-500">Draws from</div>
      <ul className="space-y-1 text-[13px]">
        {sp.hubs.map((h) => (
          <li key={h} className="flex items-baseline justify-between gap-3" data-draws-from={h}>
            <Link href={`${hubsHref(d)}#hub-${h}`} className={INLINE_LINK}>
              {V4_HUB_LABEL[h]}
            </Link>
            <span className="tabular-nums text-rb-500" title="Share of this spoke's borrowing drawn from the hub">
              {total > 0 ? `${Math.round((owed(h) / total) * 100)}% of borrowing` : "no borrowing"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One line of the spoke's liquidation settings. */
function LiquidationLine({ f, spoke }: { f: V4ReserveFigures; spoke: string }) {
  const l = f.liquidation;
  if (!l) return null;
  return (
    <p className="mt-2 text-[12px] text-rb-500" data-spoke-liquidation="">
      <Prov info={liquidationConfigProv(f, spoke)}>
        <span>
          Liquidation restores a health factor of {l.targetHealthFactor.toFixed(2)}; the bonus starts at{" "}
          {pctText(l.bonusFactor)} of its maximum and reaches it at a health factor of{" "}
          {l.healthFactorForMaxBonus.toFixed(2)}.
        </span>
      </Prov>
    </p>
  );
}

function spokeMarkdown(sp: V4Spoke, rows: V4Row[], block: number): string {
  const lines = rows.map(({ line: l, f, price }) => {
    const a = (n: number) => amountText(n, price?.usd ?? null, l.symbol).display;
    return `- ${l.symbol} (${V4_HUB_LABEL[l.hub]}): supplied ${a(f?.spokeSupplied ?? l.supplied)}, borrowed ${a(f?.spokeBorrowed ?? l.borrowed)}${f?.supplyApr != null ? `, supply rate ${ratePercentText(f.supplyApr)}` : ""}${f?.drawnApr != null ? `, borrow rate ${ratePercentText(f.drawnApr)}` : ""}`;
  });
  return [
    `# ${sp.name}, an Aave V4 spoke`,
    "",
    ...(purposeOf(sp.name) ? [purposeOf(sp.name)!, ""] : []),
    `Draws from the ${andList(sp.hubs.map((h) => V4_HUB_LABEL[h]))} ${sp.hubs.length === 1 ? "hub" : "hubs"}.`,
    "",
    ...lines,
    "",
    `Read at block ${block.toLocaleString("en-US")}.`,
  ].join("\n");
}

function spokeHead(d: V4Deployment, s: V4Stored, sp: V4Spoke, rows: V4Row[]): ProductHead {
  const c = coordsOf(s);
  const read = rows.filter((r) => r.f);
  const first = read[0]?.f ?? null;
  const block = Math.max(0, ...read.map((r) => r.f!.block));
  const book = rowBook(rows);
  const sumOf = (side: "supplied" | "borrowed") =>
    pricedSum(
      rows.map((r) => ({ underlying: r.line.underlying, symbol: r.line.symbol, tokens: rowTokens(r, side) })),
      book,
    );
  const supSum = sumOf("supplied");
  const borSum = sumOf("borrowed");
  const sup = fmtUsd(supSum.usd);
  const bor = fmtUsd(borSum.usd);
  const listing = spokePositionsHref(d, sp.key);
  const contracts = first
    ? [
        {
          name: `${sp.name} spoke`,
          address: first.spokeAddress,
          reads: "getReserveConfig, getDynamicReserveConfig, getLiquidationConfig",
        },
        ...[...new Map(read.map((r) => [r.f!.hubAddress, r])).values()].map((r) => ({
          name: `${r.names.hub} hub`,
          address: r.f!.hubAddress,
          reads: "getSpokeAddedAssets, getSpokeTotalOwed, getAssetLiquidity, getAssetDrawnRate, getAssetOwed",
        })),
        ...(first.oracle ? [{ name: `${sp.name} oracle`, address: first.oracle, reads: "getReservePrice" }] : []),
      ]
    : [];
  const figures: HeadFigure[] = [
    {
      slot: "roster",
      label: "Reserves",
      value: <Prov info={reserveCountProv(sp.name, sp.lines.length, c)}>{sp.lines.length}</Prov>,
    },
    {
      slot: "sizeIn",
      label: "Supplied",
      tip: sup.title,
      value: <PricedTotal sum={supSum} info={spokeValueProv(sp.name, "supplied", block, read.length, supSum)} />,
    },
    {
      slot: "sizeOut",
      label: "Borrowed",
      tip: bor.title,
      value: <PricedTotal sum={borSum} info={spokeValueProv(sp.name, "borrowed", block, read.length, borSum)} />,
    },
    ...(sp.positions != null
      ? [
          {
            slot: "population" as const,
            label: "Positions",
            value: <Prov info={positionsProv(sp.name, c)}>{sp.positions.toLocaleString("en-US")}</Prov>,
          },
        ]
      : []),
  ];
  const tools: SectionTools = {
    links: spokeLinks(d, sp, false),
    exports: {
      markdown: { build: () => spokeMarkdown(sp, rows, block), copySubtitle: "This spoke as Markdown, for an LLM" },
    },
  };
  return {
    scope: `spoke-${sp.slug}`,
    title: sp.name,
    titleHref: listing,
    subtitle: <StructureLine d={d} hubs={sp.hubs} />,
    purpose: purposeOf(sp.name),
    figures,
    aside: <DrawsFrom d={d} sp={sp} rows={rows} />,
    entries: [
      positionEntry({ href: listing, name: sp.name, noun: V4_TERMS.position, count: sp.positions ?? undefined }),
    ].filter((e): e is EntryLink => e != null),
    notes: first ? <LiquidationLine f={first} spoke={sp.name} /> : undefined,
    readAt:
      first && block > 0
        ? {
            chainId: d.chainId,
            block,
            readBy: first.readBy,
            receipt: (at) =>
              readStampProv({
                chainId: d.chainId,
                block,
                at,
                readBy: first.readBy,
                what: `Every figure on ${sp.name}`,
                contracts,
              }),
          }
        : null,
    tools,
    explainer: {
      body: (
        <>
          <ExplainGroup title="This spoke">
            <ExplainBullet>
              {sp.name} lists <Fig bold>{sp.lines.length}</Fig> reserves; suppliers have added{" "}
              <Fig bold>{sup.display}</Fig> and borrowers owe <Fig bold>{bor.display}</Fig>.
            </ExplainBullet>
            <ExplainBullet>
              {sp.name} draws from the {andList(sp.hubs.map((h) => V4_HUB_LABEL[h]))}{" "}
              {sp.hubs.length === 1 ? "hub" : "hubs"}, each over a credit line: an add cap and a draw cap per asset.
            </ExplainBullet>
          </ExplainGroup>
          <ExplainGroup title="How it works">
            <ExplainBullet>The hub holds the money for each asset and sets its drawn rate.</ExplainBullet>
            <ExplainBullet>
              The spoke sets the terms: collateral factor, liquidation bonus and fee, and the collateral risk that sets
              a borrower&apos;s premium.
            </ExplainBullet>
            <ExplainBullet>
              Suppliers earn the drawn rate and the premium, less the hub&apos;s liquidity fee.
            </ExplainBullet>
          </ExplainGroup>
        </>
      ),
      label: "Show spoke explanation",
    },
    learnMore: aaveV4PositionModal(sp.name),
    bandHooks: { "data-market-panel": sp.slug },
  };
}

/** A spoke's rows, once every head read has settled. */
export function useSpokeRows(sp: V4Spoke | null, book: V4PriceBook | null): Loadable<V4Row[]> {
  const qs = useMemo(() => (sp ? sp.lines.map((l) => headQuery(sp, l)) : null), [sp]);
  const heads = useV4Heads(qs);
  if (!sp) return { state: "loading" };
  if (!heads || !book) return { state: "loading" };
  if (heads.every((h) => h.state !== "ok"))
    return { state: "error", message: "The head read failed for every reserve: reload to retry." };
  return {
    state: "ok",
    data: sp.lines.map((l, i) => {
      const h = heads[i] as V4Read<V4ReserveHead>;
      const f = h.state === "ok" ? settleHead(h.data) : null;
      const price: V4Price | null =
        f?.price != null ? { usd: f.price, via: "oracle", spoke: sp.name, block: f.block } : book(l.underlying);
      return { line: l, f, names: namesOf(sp, l), price };
    }),
  };
}

/** The spoke page: its head, then its reserves. */
export function AaveV4SpokePage({ d, slug }: { d: V4Deployment; slug: string }) {
  return (
    <PricesProvider>
      <SpokeBody d={d} slug={slug} />
    </PricesProvider>
  );
}

function SpokeBody({ d, slug }: { d: V4Deployment; slug: string }) {
  const stored = useV4Stored(d);
  const s = stored.state === "ok" ? stored.data : null;
  const sp = s?.spokes.find((x) => x.slug === slug) ?? null;
  const book = useV4PriceBook(s);
  const rows = useSpokeRows(sp, book);
  let market: Loadable<MarketModel>;
  if (stored.state === "error") market = stored;
  else if (!s) market = { state: "loading" };
  else if (!sp) market = { state: "error", message: `No spoke ${slug} on Aave V4 here.` };
  else if (rows.state !== "ok") market = rows;
  else
    market = {
      state: "ok",
      data: { head: spokeHead(d, s, sp, rows.data), reserves: reservesTable(d, sp, rows.data, coordsOf(s)) },
    };
  return (
    <MarketPage
      header={{ protocol: protocolOf(d), title: sp ? `${sp.name} spoke` : "Spoke", learnMore: aaveV4Modal("hubs") }}
      market={market}
      what={sp?.name ?? "the spoke"}
    />
  );
}
