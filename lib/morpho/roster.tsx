"use client";

// Morpho Blue's roster and loan-token pages on the product shells (rails-ops
// ui-jobs 549 step 5; decisions 0043 and 0059). Each market measures in its
// loan token, so the loan token is the roster's group level and the only unit a
// total can be stated in.
//
//   • The roster (R1, /<chain>/morpho/markets): one head for the chain (its
//     markets, loan tokens and funded markets, with the read stamp and ⋮), then
//     one house table grouped by loan token, each group a disclosure headed
//     "<token> · N markets" with the group's supplied, borrowed and utilisation
//     in that token. The largest group opens on arrival. A group lists the
//     markets that carry its book; the rest open on the token's page.
//   • The default view (R1.1.3, Miles's agreement of 9 Nov 2026): on Ethereum
//     and Base a group shows only the markets a vault on Rails's roster lends
//     into (the vault directory's withdraw queues); "Show all markets" in the
//     ⋮, or `?all=1`, shows every row. Heading counts, totals and the group
//     order follow the view; the chain head always counts everything. Arbitrum
//     has no vault roster, so every row shows there.
//   • Markets in one group with one collateral and one LLTV share one row
//     that opens in place (R1.1.1), each market saying what sets it apart; a
//     market at the rate ceiling carries the tag (R1.1.2).
//   • The loan-token page (/markets/<loanToken>): the token's head, the same
//     table for its markets that carry the book, then the markets that repeat
//     one pair, the small ones and the never funded.
//   • Focus (ui-jobs 557): a market counts when its loan or its collateral
//     token is in focus. The roster judges every row that carries a book (the
//     vault view steps aside) and keeps the groups with one; the loan-token
//     page is held behind an AimGate when none of its markets counts, and its
//     tables keep the markets that do.
//
// Every row opens its market's page. Sizes and rates are stored and live reads
// at one block (lib/sources/chain/morpho-markets.ts); the market id and the
// oracle sit in the collateral cell's receipt.

import Link from "next/link";
import { Fragment, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ExplainBullet, ExplainGroup, ExplainSub, Fig } from "@/components/shared/explain-groups";
import { readStampProv } from "@/components/shared/read-stamp";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, type SectionMenuLink } from "@/components/shared/section-menu";
import { ProductHeadSection, ToolsFor } from "@/components/shared/product/product-head";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AimGate } from "@/components/shared/aim-gate";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { assetKey } from "@/lib/shared/asset-family";
import { AssetUnit } from "@/components/shared/asset-unit";
import { TokenPairIcons } from "@/components/shared/token-pair-icons";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
  DATA_TABLE_PILL,
  DataTableGroupRow,
} from "@/components/shared/data-table/data-table";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { ARC_CHAIN_ID, chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { morphoBlueContract } from "@/lib/morpho/asset-catalog";
import { morphoLoanTokenHref, morphoMarketHref } from "@/lib/morpho/market-routes";
import { amount, pctText } from "@/lib/morpho/markets-format";
import {
  morphoBorrowRateProv,
  morphoFamilyTotalProv,
  morphoGroupTotalProv,
  morphoGroupUtilizationProv,
  morphoLltvProv,
  morphoLoanTokenSupplyProv,
  morphoMarketIdentityProv,
  morphoMarketSizeProv,
  morphoPairTotalProv,
  morphoPriceSourceProv,
  morphoRateCeilingProv,
  morphoSupplyRateProv,
  morphoUtilizationProv,
  type MorphoMarketCoords,
} from "@/lib/morpho/markets-provenance";
import type {
  MorphoLoanTokenViewData,
  MorphoMarketFamily,
  MorphoRosterData,
  MorphoRosterGroup,
  MorphoRosterRow,
} from "@/lib/morpho/markets-shape";
import type { MorphoMarketRow } from "@/lib/sources/chain/morpho-markets";
import type { ProductHead, ReadAt } from "@/lib/shared/product/model";

const DOCS = "https://docs.morpho.org";
const NOTE = "text-[13px] text-rb-500";
const NUM = "whitespace-nowrap tabular-nums text-foreground";
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The read every figure on a roster page shares. */
interface Read {
  chainId: ChainId;
  block: number;
  fromLogs: boolean;
}

const coordsOf = (r: Read, extra: Partial<MorphoMarketCoords> = {}): MorphoMarketCoords => ({
  fromLogs: r.fromLogs,
  chainId: r.chainId,
  blockNumber: r.block,
  ...extra,
});

function readAtOf(r: Read, what: string): ReadAt | null {
  if (r.block <= 0) return null;
  const blue = morphoBlueContract(r.chainId);
  return {
    chainId: r.chainId,
    block: r.block,
    receipt: (at) =>
      readStampProv({
        chainId: r.chainId,
        block: r.block,
        at,
        what,
        contracts: [
          {
            name: blue.name,
            address: blue.address,
            reads: r.fromLogs
              ? "market(id) for every market, from rails-server's replay of the chain's logs at this block; each market's rate from borrowRateView on the IRM it names"
              : "market(id) for every market; each market's rate from borrowRateView on the IRM it names",
          },
        ],
      }),
  };
}

// ── The table ────────────────────────────────────────────────────────────────

type SortKey = "collateral" | "lltv" | "supplied" | "supplyRate" | "borrowRate" | "utilisation";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const COLUMNS: { key: Exclude<SortKey, "collateral">; label: string; tip?: string }[] = [
  {
    key: "lltv",
    label: "LLTV",
    tip: "The most a borrower may owe against the collateral's value, and the liquidation line",
  },
  {
    key: "supplied",
    label: "Supplied",
    tip: "What suppliers have put in, as the market last settled, in the loan token",
  },
  { key: "supplyRate", label: "Supply rate", tip: "What suppliers earn a year, as an APR" },
  { key: "borrowRate", label: "Borrow rate", tip: "What borrowers pay a year, as an APR" },
  { key: "utilisation", label: "Utilisation", tip: "Borrowed ÷ supplied" },
];

const collateralName = (m: MorphoMarketRow) =>
  m.isIdle ? "Idle" : (m.collateralSymbol ?? shortAddr(m.collateralToken));

function sortValue(m: MorphoMarketRow, k: SortKey): number | string {
  switch (k) {
    case "collateral":
      return collateralName(m).toLowerCase();
    case "lltv":
      return m.lltv;
    case "supplied":
      return m.totalSupply;
    case "supplyRate":
      return m.supplyApr ?? -1;
    case "borrowRate":
      return m.borrowApr ?? -1;
    case "utilisation":
      return m.utilization ?? -1;
  }
}

/** "rate ceiling" beside a borrow rate (R1.1.2): the vault pages' illiquid
 *  test on the market alone (lib/vaults/illiquid.ts `atRateCeiling`). */
function CeilingTag({ m, c }: { m: MorphoRosterRow; c: MorphoMarketCoords }) {
  if (!m.ceiling) return null;
  return (
    <span
      className={`${DATA_TABLE_PILL} px-1.5 py-0.5 text-[11px] font-medium`}
      title={CEILING_TIP}
      data-anatomy="R1.1.2"
      data-morpho-ceiling={m.id}
    >
      <Prov info={morphoRateCeilingProv(c, { ...m.ceiling, utilisation: m.utilization ?? 1 })}>rate ceiling</Prov>
    </span>
  );
}

const CEILING_TIP =
  "Fully lent out: the rate has climbed to the model's maximum, and suppliers may not be able to withdraw until borrowers repay.";

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** What sets each of a repeated pair's markets apart, by id, in words: the
 *  feeds its oracle names ("priced by RSS / USD"), or "a separate price
 *  source" where the oracle names none Rails can read. Where two lines would
 *  read alike, each adds its place by size among them ("price source 1 of
 *  2"). Contract addresses stay in the line's receipt (decision 0059 point 1). */
function pairLines(markets: readonly MorphoRosterRow[]): Map<string, string> {
  const base = markets.map((m) => {
    const src = m.priceSource;
    const named = (src?.feeds ?? []).map((f) => f.description).filter((d): d is string => d != null);
    return src?.readable && named.length > 0 && named.length === src.feeds.length ? `priced by ${list(named)}` : null;
  });
  // `markets` is largest first, so the place among alike lines is by size.
  return new Map(
    markets.map((m, i) => {
      const alike = markets.map((_, k) => k).filter((k) => base[k] === base[i]);
      const place = alike.length > 1 ? `${alike.indexOf(i) + 1} of ${alike.length}` : null;
      const line = base[i]
        ? place
          ? `${base[i]}, price source ${place}`
          : base[i]
        : place
          ? `a separate price source, ${place}`
          : "a separate price source";
      return [m.id, line];
    }),
  );
}

/** One market: a keyed component so it owns its receipts registry. A child of
 *  a repeated pair (`child`) is indented and says what sets it apart. */
function MarketRow({
  m,
  r,
  child,
}: {
  m: MorphoRosterRow;
  r: Read;
  /** A child of a repeated pair: the line that sets it apart. */
  child?: string;
}) {
  const registry = useReceiptRegistry();
  const c = coordsOf(r, {
    marketId: m.id,
    loanSymbol: m.loanSymbol,
    collateralSymbol: m.collateralSymbol,
    irm: m.irm,
    loanToken: m.loanToken,
  });
  const href = morphoMarketHref(r.chainId, m.loanToken, m.id);
  const name = collateralName(m);
  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <DataTableRow
        href={href}
        child={child != null}
        data-morpho-market={m.id}
        data-morpho-lent={m.lent ? "" : undefined}
        data-morpho-pair-child={child != null ? "" : undefined}
      >
        <DataTableCell rowHeader className="whitespace-nowrap">
          <span className="flex items-center gap-2.5">
            <TokenPairIcons
              first={
                m.isIdle ? { symbol: m.loanSymbol, address: m.loanToken } : { symbol: name, address: m.collateralToken }
              }
              fixed
            />
            <span className="flex min-w-0 flex-col">
              <DataTableRowLink
                href={href}
                className={`text-[13px] font-medium ${m.isIdle || m.collateralNamed ? "" : "font-mono"}`}
                data-morpho-market-link={m.id}
              >
                <Prov
                  info={morphoMarketIdentityProv(c, {
                    collateralToken: m.collateralToken,
                    oracle: m.oracle,
                    irm: m.irm,
                    lltv: m.lltv,
                  })}
                >
                  {name}
                </Prov>
              </DataTableRowLink>
              {child != null && (
                <span className="truncate text-[11px] text-rb-500" data-morpho-price-source={m.id}>
                  <Prov
                    info={morphoPriceSourceProv(c, { oracle: m.oracle, irm: m.irm, feeds: m.priceSource?.feeds ?? [] })}
                  >
                    {child}
                  </Prov>
                </span>
              )}
            </span>
          </span>
        </DataTableCell>
        <DataTableCell label="LLTV" align="right" className={NUM}>
          {m.isIdle ? (
            <span className="text-rb-500">none</span>
          ) : (
            <Prov info={morphoLltvProv(c)}>{pctText(m.lltv)}</Prov>
          )}
        </DataTableCell>
        <DataTableCell label="Supplied" align="right" className={NUM}>
          {m.amountsTrusted ? (
            <span className="inline-flex items-center gap-1.5">
              <Prov info={morphoMarketSizeProv("supplied", c)}>{amount(m.totalSupply)}</Prov>
              <AssetUnit symbol={m.loanSymbol} address={m.loanToken} />
            </span>
          ) : (
            <span
              className="text-rb-500"
              title="The loan token's decimals cannot be trusted, so its sizes are not stated"
            >
              not stated
            </span>
          )}
        </DataTableCell>
        <DataTableCell label="Supply rate" align="right" className={NUM}>
          {m.supplyApr != null ? (
            <Prov info={morphoSupplyRateProv(c)}>{ratePercentText(m.supplyApr)}</Prov>
          ) : (
            <span className="text-rb-500">none</span>
          )}
        </DataTableCell>
        <DataTableCell label="Borrow rate" align="right" className={NUM}>
          <span className="inline-flex items-center gap-1.5">
            <CeilingTag m={m} c={c} />
            {m.borrowApr != null ? (
              <Prov info={morphoBorrowRateProv(c)}>{ratePercentText(m.borrowApr)}</Prov>
            ) : (
              <span className="text-rb-500">none</span>
            )}
          </span>
        </DataTableCell>
        <DataTableCell label="Utilisation" align="right" className={NUM}>
          {m.utilization != null ? (
            <Prov info={morphoUtilizationProv(c)}>{pctText(m.utilization)}</Prov>
          ) : (
            <span className="text-rb-500">no supply</span>
          )}
        </DataTableCell>
      </DataTableRow>
    </ProvReceiptsScope>
  );
}

/** Markets in one loan token with one collateral and one LLTV, differing only
 *  in their oracle or rate model (R1.1.1): one row that opens in place. */
interface Pair {
  key: string;
  /** Largest first. */
  markets: MorphoRosterRow[];
  totalSupply: number;
  totalBorrow: number;
}

type Item = { kind: "market"; m: MorphoRosterRow } | { kind: "pair"; p: Pair };

/** The table's items: each repeated pair run together, every other market alone. */
function itemsOf(rows: readonly MorphoRosterRow[], collapse: boolean): Item[] {
  if (!collapse) return rows.map((m) => ({ kind: "market", m }));
  const by = new Map<string, MorphoRosterRow[]>();
  for (const m of rows) {
    const k = m.isIdle ? `idle:${m.id}` : `${m.collateralToken}:${m.lltv}`;
    by.set(k, [...(by.get(k) ?? []), m]);
  }
  return [...by.entries()].map(([key, ms]): Item => {
    if (ms.length === 1) return { kind: "market", m: ms[0] };
    const markets = [...ms].sort((a, b) => b.totalSupply - a.totalSupply);
    return {
      kind: "pair",
      p: {
        key,
        markets,
        totalSupply: markets.reduce((s, m) => s + m.totalSupply, 0),
        totalBorrow: markets.reduce((s, m) => s + m.totalBorrow, 0),
      },
    };
  });
}

/** An item's sort value: a pair sorts on its summed supply and its largest market's rates. */
function itemValue(it: Item, k: SortKey): number | string {
  if (it.kind === "market") return sortValue(it.m, k);
  return k === "supplied" ? it.p.totalSupply : sortValue(it.p.markets[0], k);
}

function PairRow({ p, r, open, onToggle }: { p: Pair; r: Read; open: boolean; onToggle: () => void }) {
  const registry = useReceiptRegistry();
  const top = p.markets[0];
  const name = collateralName(top);
  const c = coordsOf(r, {
    marketId: top.id,
    loanSymbol: top.loanSymbol,
    collateralSymbol: top.collateralSymbol,
    irm: top.irm,
    loanToken: top.loanToken,
  });
  const n = p.markets.length;
  return (
    <ProvReceiptsScope registry={registry} bounds={false}>
      <DataTableGroupRow
        open={open}
        onToggle={onToggle}
        data-anatomy="R1.1.1"
        data-morpho-pair={`${top.collateralToken}:${top.lltv}`}
        toggleHooks={{ "data-morpho-pair-toggle": `${top.collateralToken}:${top.lltv}` }}
        nameClassName="whitespace-nowrap"
        label={
          <span className="flex items-center gap-2.5">
            <TokenPairIcons first={{ symbol: name, address: top.collateralToken }} fixed />
            <span className="text-[13px] font-medium">
              <span className={top.collateralNamed ? "" : "font-mono"}>{name}</span>
              <span className="font-normal text-rb-500" data-prov-exempt="">
                {" "}
                · {n} markets
              </span>
            </span>
          </span>
        }
        cells={
          <>
            <DataTableCell label="LLTV" align="right" className={NUM}>
              <Prov info={morphoLltvProv(c)}>{pctText(top.lltv)}</Prov>
            </DataTableCell>
            <DataTableCell label="Supplied" align="right" className={NUM}>
              {top.amountsTrusted ? (
                <span className="inline-flex flex-col items-start sm:items-end">
                  <span className="inline-flex items-center gap-1.5">
                    <Prov info={morphoPairTotalProv("supplied", c, n)}>{amount(p.totalSupply)}</Prov>
                    <AssetUnit symbol={top.loanSymbol} address={top.loanToken} />
                  </span>
                  <span className="text-[11px] text-rb-500">
                    <Prov info={morphoPairTotalProv("borrowed", c, n)}>{amount(p.totalBorrow)}</Prov> borrowed
                  </span>
                </span>
              ) : (
                <span className="text-rb-500">not stated</span>
              )}
            </DataTableCell>
            <DataTableCell label="Supply rate" align="right" className={NUM}>
              {top.supplyApr != null ? (
                <Prov info={morphoSupplyRateProv(c)}>{ratePercentText(top.supplyApr)}</Prov>
              ) : (
                <span className="text-rb-500">none</span>
              )}
            </DataTableCell>
            <DataTableCell label="Borrow rate" align="right" className={NUM}>
              <span className="inline-flex items-center gap-1.5">
                <CeilingTag m={top} c={c} />
                {top.borrowApr != null ? (
                  <Prov info={morphoBorrowRateProv(c)}>{ratePercentText(top.borrowApr)}</Prov>
                ) : (
                  <span className="text-rb-500">none</span>
                )}
              </span>
            </DataTableCell>
            <DataTableCell label="Utilisation" align="right" className={NUM}>
              {top.utilization != null ? (
                <Prov info={morphoUtilizationProv(c)}>{pctText(top.utilization)}</Prov>
              ) : (
                <span className="text-rb-500">no supply</span>
              )}
            </DataTableCell>
          </>
        }
      />
    </ProvReceiptsScope>
  );
}

/** One table of markets in one loan token. With `collapse`, markets that
 *  repeat a pair run together into one row (R1.1.1). */
function MarketsTable({
  rows,
  r,
  label,
  sort,
  onSort,
  collapse = false,
}: {
  rows: MorphoRosterRow[];
  r: Read;
  label: string;
  sort: Sort;
  onSort: (k: SortKey) => void;
  collapse?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const th = (k: SortKey, text: string, align: "left" | "right" = "left", tip?: string) => (
    <DataTableHeader
      key={k}
      label={text}
      align={align}
      title={tip ? `${tip}. Click to sort.` : undefined}
      sort={{ dir: sort.key === k ? sort.dir : null, onSort: () => onSort(k), ariaLabel: `Sort by ${text}` }}
    />
  );
  const sign = sort.dir === "asc" ? 1 : -1;
  const items = itemsOf(rows, collapse).sort((a, b) => {
    const x = itemValue(a, sort.key);
    const y = itemValue(b, sort.key);
    return sign * (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number));
  });
  return (
    <DataTable label={label} stacked rowHeight="one" tableClassName="text-[13px] sm:min-w-[40rem]">
      <DataTableHead>
        {th("collateral", "Collateral")}
        {COLUMNS.map((c) => th(c.key, c.label, "right", c.tip))}
      </DataTableHead>
      <DataTableBody>
        {items.map((it) =>
          it.kind === "market" ? (
            <MarketRow key={it.m.id} m={it.m} r={r} />
          ) : (
            <Fragment key={it.p.key}>
              <PairRow
                p={it.p}
                r={r}
                open={open.has(it.p.key)}
                onToggle={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(it.p.key)) n.delete(it.p.key);
                    else n.add(it.p.key);
                    return n;
                  })
                }
              />
              {open.has(it.p.key) &&
                (() => {
                  const lines = pairLines(it.p.markets);
                  return it.p.markets.map((m) => <MarketRow key={m.id} m={m} r={r} child={lines.get(m.id) ?? ""} />);
                })()}
            </Fragment>
          ),
        )}
      </DataTableBody>
    </DataTable>
  );
}

function useSort(): [Sort, (k: SortKey) => void] {
  const [sort, setSort] = useState<Sort>({ key: "supplied", dir: "desc" });
  const onSort = (k: SortKey) =>
    setSort((s) =>
      s.key === k
        ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: k === "collateral" ? "asc" : "desc" },
    );
  return [sort, onSort];
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function marketsCsv(rows: MorphoMarketRow[]): string {
  const head = [
    "market_id",
    "loan_token",
    "loan_symbol",
    "collateral_token",
    "collateral_symbol",
    "lltv",
    "supplied",
    "borrowed",
    "supply_apr",
    "borrow_apr",
    "utilisation",
    "fee",
  ];
  return [
    head.join(","),
    ...rows.map((m) =>
      [
        m.id,
        m.loanToken,
        m.loanSymbol,
        m.isIdle ? "" : m.collateralToken,
        m.collateralSymbol,
        m.lltv,
        m.amountsTrusted ? m.totalSupply : "",
        m.amountsTrusted ? m.totalBorrow : "",
        m.supplyApr,
        m.borrowApr,
        m.utilization,
        m.fee,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}

// ── The roster (R1) ──────────────────────────────────────────────────────────

/** A group as the view draws it: every row under "all", the markets a vault
 *  lends into under the default view (R1.1.3), with the heading's count and
 *  totals over what is shown. */
interface GroupView {
  g: MorphoRosterGroup;
  rows: MorphoRosterRow[];
  /** The heading's count: the shown markets, or every market under "all". */
  count: number;
  totalSupply: number;
  totalBorrow: number;
  /** The markets a vault lends into; null where the filter does not apply. */
  lent: number | null;
  /** The default view is in force on this group. */
  filtered: boolean;
}

function groupViews(groups: MorphoRosterGroup[], filter: "lent" | "all" | "none"): GroupView[] {
  if (filter !== "lent")
    return groups.map((g) => ({
      g,
      rows: g.rows,
      count: g.markets,
      totalSupply: g.totalSupply,
      totalBorrow: g.totalBorrow,
      lent: filter === "all" ? g.rows.filter((m) => m.lent).length : null,
      filtered: false,
    }));
  // The same order as under "all", over the markets shown: the ones outside a
  // family first, then all of them.
  return groups
    .map((g) => {
      const rows = g.rows.filter((m) => m.lent);
      return {
        g,
        rows,
        count: rows.length,
        totalSupply: rows.reduce((s, m) => s + m.totalSupply, 0),
        totalBorrow: rows.reduce((s, m) => s + m.totalBorrow, 0),
        lent: rows.length,
        filtered: true,
      };
    })
    .filter((v) => v.rows.length > 0)
    .sort((a, b) => b.g.lentOwn - a.g.lentOwn || b.rows.length - a.rows.length);
}

/** A market's keys under Focus: its loan and collateral tokens. */
const marketKeys = (chainId: number, m: { loanToken: string; collateralToken: string | null }): string[] => [
  assetKey(chainId, m.loanToken),
  ...(m.collateralToken ? [assetKey(chainId, m.collateralToken)] : []),
];

/** The views narrowed to the rows Focus keeps, counts and totals over them. */
function keptViews(views: GroupView[], kept: ReadonlySet<MorphoRosterRow>): GroupView[] {
  return views
    .map((v) => {
      const rows = v.rows.filter((m) => kept.has(m));
      return {
        ...v,
        rows,
        count: rows.length,
        totalSupply: rows.reduce((s, m) => s + m.totalSupply, 0),
        totalBorrow: rows.reduce((s, m) => s + m.totalBorrow, 0),
        // The vault view's line steps aside: Focus chose these rows.
        lent: null,
        filtered: true,
      };
    })
    .filter((v) => v.rows.length > 0);
}

const VIEW_LINK = `cursor-pointer ${INLINE_LINK}`;

/** A loan token's group: a disclosure whose heading states the token's book. */
function Group({
  v,
  r,
  open,
  onToggle,
  sort,
  onSort,
  onAll,
}: {
  v: GroupView;
  r: Read;
  open: boolean;
  onToggle: () => void;
  sort: Sort;
  onSort: (k: SortKey) => void;
  onAll: (all: boolean) => void;
}) {
  const g = v.g;
  const c = coordsOf(r, { loanSymbol: g.loanSymbol, loanToken: g.loanToken });
  const over = v.filtered ? v.count : undefined;
  const util = v.totalSupply > 0 ? v.totalBorrow / v.totalSupply : null;
  const tokenHref = morphoLoanTokenHref(r.chainId, g.loanToken);
  const id = `morpho-group-${g.loanToken}`;
  const more = g.markets - v.rows.length;
  // A margin over the token's own supply, so a rounding tie is not a caution.
  const overIssued =
    g.amountsTrusted && g.loanTokenSupply != null && g.loanTokenSupply > 0 && v.totalSupply > g.loanTokenSupply * 1.001;
  const n = (x: number) => x.toLocaleString("en-US");
  return (
    <div className="border-t border-rb-200 py-2 first:border-t-0 dark:border-rb-800" data-morpho-group={g.loanToken}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 text-left text-[14px] font-semibold text-foreground"
          data-morpho-group-toggle={g.loanToken}
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-rb-500 transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden
          />
          <span className={g.loanNamed ? "" : "font-mono"}>{g.loanSymbol}</span>
          {g.ambiguous && (
            <span className="font-mono text-[11px] font-normal text-rb-500">{shortAddr(g.loanToken)}</span>
          )}
          <span className="font-normal text-rb-500" data-prov-exempt="">
            · {n(v.count)} {v.count === 1 ? "market" : "markets"}
          </span>
        </button>
        <span className="text-[12px] tabular-nums text-rb-500">
          {g.amountsTrusted ? (
            <>
              <span className="text-foreground">
                <Prov info={morphoGroupTotalProv("supplied", c, over)}>{amount(v.totalSupply)}</Prov>
              </span>{" "}
              supplied ·{" "}
              <span className="text-foreground">
                <Prov info={morphoGroupTotalProv("borrowed", c, over)}>{amount(v.totalBorrow)}</Prov>
              </span>{" "}
              borrowed
              {util != null && (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-foreground">
                    <Prov info={morphoGroupUtilizationProv(c, over)}>{pctText(util, 0)}</Prov>
                  </span>{" "}
                  utilised
                </>
              )}
            </>
          ) : (
            "sizes not stated"
          )}
          {overIssued && (
            <span
              className="text-caution-500"
              title="These books stand above the amount of the token that exists; the token's page says why"
            >
              {" "}
              · more than the token&apos;s supply
            </span>
          )}
        </span>
      </div>
      {v.lent != null && (
        <p className="mt-0.5 pl-5.5 text-[12px] text-rb-500" data-anatomy="R1.1.3" data-morpho-view-line="">
          {v.filtered ? (
            <>
              Showing {n(v.count)} {v.count === 1 ? "market" : "markets"} a vault lends into
              {g.rows.length > v.count && (
                <>
                  {" "}
                  ·{" "}
                  <button type="button" className={VIEW_LINK} onClick={() => onAll(true)} data-morpho-view-toggle="all">
                    Show all {n(g.rows.length)}
                  </button>
                </>
              )}
            </>
          ) : v.lent === g.rows.length ? (
            "A vault lends into every market here."
          ) : v.lent > 0 ? (
            <>
              A vault lends into {n(v.lent)} of these {n(g.rows.length)} ·{" "}
              <button type="button" className={VIEW_LINK} onClick={() => onAll(false)} data-morpho-view-toggle="lent">
                Show only those
              </button>
            </>
          ) : (
            "No vault on Rails's roster lends into these markets."
          )}
        </p>
      )}
      {open && (
        <div id={id} className="mt-2">
          {v.rows.length > 0 && (
            <MarketsTable rows={v.rows} r={r} label={`${g.loanSymbol} markets`} sort={sort} onSort={onSort} collapse />
          )}
          <p className="mt-1 text-[13px]">
            <Link href={tokenHref} prefetch={false} className={INLINE_LINK} data-morpho-token-link={g.loanToken}>
              {more > 0 ? `All ${n(g.markets)} ${g.loanSymbol} markets, ${n(more)} more` : `${g.loanSymbol} markets`}{" "}
              <span aria-hidden>→</span>
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

function RosterExplainer({ d }: { d: MorphoRosterData }) {
  const s = d.summary;
  return (
    <>
      <ExplainGroup title="The markets">
        <ExplainBullet>
          Each Morpho Blue market lends one token against one collateral, with its own oracle, rate model and LLTV,
          fixed when it was created. Anyone can create one.
        </ExplainBullet>
        <ExplainBullet>
          <Fig bold>{s.total.toLocaleString("en-US")}</Fig> markets exist here;{" "}
          <Fig bold>{s.funded.toLocaleString("en-US")}</Fig> hold supply and{" "}
          <Fig bold>{s.neverFunded.toLocaleString("en-US")}</Fig> never have.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Reading the table">
        <ExplainBullet>
          A market measures in its loan token, so the table groups by loan token and totals only within one. Totals in
          different tokens do not compare.
        </ExplainBullet>
        {d.vaults === "read" && (
          <ExplainBullet>
            By default each group shows the markets a vault on Rails&apos;s roster lends into, read from each
            vault&apos;s withdraw queue. Show all markets, in the table&apos;s ⋮, adds the other markets that carry the
            book.
          </ExplainBullet>
        )}
        <ExplainBullet>
          Each loan token&apos;s page lists every market: the ones that carry the book, markets that repeat one pair,
          the small ones and the never funded.
        </ExplainBullet>
        <ExplainBullet>
          Markets with one collateral and one LLTV that differ only in their oracle or rate model share one row; open it
          for each market and its price source.
        </ExplainBullet>
        <ExplainBullet>
          Sizes are as each market last settled; Morpho Blue adds interest only when a market is used.
        </ExplainBullet>
      </ExplainGroup>
    </>
  );
}

type RosterProps = {
  data: MorphoRosterData;
  chainId: ChainId;
  /** A line under the head (Arc's unlisted markets and its idle market, ui-jobs 577). */
  note?: ReactNode;
  /** The head's word for the markets holding no supply; "never funded" where absent. Arc's list
   *  leaves out the never-supplied markets, so its zero-supply ones are "empty now" (ui-jobs 577). */
  unfundedLabel?: string;
};

/** The roster reads `?all=1` from the URL; the static render, before the
 *  params are known, draws the default view. */
export function MorphoRosterPage(props: RosterProps) {
  return (
    <Suspense fallback={<RosterView {...props} all={false} />}>
      <RosterWithParams {...props} />
    </Suspense>
  );
}

function RosterWithParams(props: RosterProps) {
  const all = useSearchParams().get("all") === "1";
  return <RosterView {...props} all={all} />;
}

function RosterView({ data, chainId, all, note, unfundedLabel = "never funded" }: RosterProps & { all: boolean }) {
  const root = `/${chainMeta(chainId).slug}/morpho`;
  const pathname = usePathname();
  const r: Read = { chainId, block: data.blockNumber, fromLogs: data.totalsSource === "sieve" };
  const [sort, onSort] = useSort();
  const filter = data.vaults !== "read" ? "none" : all ? "all" : "lent";
  // Focus judges every row that carries a book, whatever the vault view.
  const allViews = useMemo(() => groupViews(data.groups, filter === "none" ? "none" : "all"), [data.groups, filter]);
  const allRows = useMemo(() => allViews.flatMap((v) => v.rows), [allViews]);
  const scoped = useScopedRows(
    allRows,
    (m) => marketKeys(chainId, m),
    () => chainId,
  );
  const focusing = scoped.on && !scoped.peek;
  const views = useMemo(
    () => (focusing ? keptViews(allViews, new Set(scoped.rows)) : groupViews(data.groups, filter)),
    [focusing, allViews, scoped.rows, data.groups, filter],
  );
  const hidden = filter === "lent" && !focusing ? data.groups.length - views.length : 0;
  const [open, setOpen] = useState<Set<string>>(() => new Set(views[0] ? [views[0].g.loanToken] : []));
  // The first group Focus keeps opens, as the largest does on arrival.
  const firstKept = focusing ? views[0]?.g.loanToken : undefined;
  useEffect(() => {
    if (firstKept) setOpen((p) => (p.has(firstKept) ? p : new Set([...p, firstKept])));
  }, [firstKept]);
  const toggle = (t: string) =>
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  const setAll = (on: boolean) => {
    // The first group of the new view opens, as the largest does on arrival.
    const first = groupViews(data.groups, on ? "all" : "lent")[0];
    if (first) setOpen((p) => new Set([...p, first.g.loanToken]));
    // The browser's history, which Next's useSearchParams follows: the view
    // is the client's, so the server is not asked again.
    window.history.replaceState(null, "", on ? `${pathname}?all=1` : pathname);
  };
  const shownRows = useMemo(() => views.flatMap((v) => v.rows), [views]);
  const blue = morphoBlueContract(chainId);
  const explorer = chainMeta(chainId).explorerName;
  const s = data.summary;
  const links: SectionMenuLink[] = [
    chainId === ARC_CHAIN_ID
      ? {
          item: "positions",
          title: "A wallet's Morpho Blue positions",
          subtitle: "Read from the chain for the wallet you enter",
          href: root,
          internal: true,
        }
      : {
          item: "positions",
          title: "All Morpho Blue positions",
          subtitle: "Every position Rails holds",
          href: chainId === 42161 ? `${root}/positions` : root,
          internal: true,
        },
    ...(chainId !== 42161 && chainId !== ARC_CHAIN_ID
      ? [
          {
            item: "vaults",
            title: "Vaults",
            subtitle: "The MetaMorpho vaults that lend into these markets",
            href: `${root}/vaults`,
            internal: true,
          },
        ]
      : []),
    {
      item: "blue",
      title: `Morpho Blue on ${explorer}`,
      subtitle: "The contract that holds every market",
      href: explorerUrl(chainId, "address", blue.address),
    },
    { item: "docs", title: "Morpho's docs", subtitle: "Markets", href: `${DOCS}/learn/concepts/market/` },
  ];
  const head: ProductHead = {
    scope: "markets-head",
    title: `Morpho Blue on ${chainMeta(chainId).name}`,
    figures: [
      {
        slot: "roster",
        label: "Markets",
        value: <span data-prov-exempt="">{s.total.toLocaleString("en-US")}</span>,
        tip: "Every market created on this chain, from the CreateMarket log",
      },
      {
        slot: "usage",
        label: "Funded",
        tip: "Markets that hold supply now, of all markets",
        value: <span data-prov-exempt="">{s.funded.toLocaleString("en-US")}</span>,
      },
      {
        slot: "population",
        label: "Loan tokens",
        tip: "Distinct tokens lent across the markets",
        value: <span data-prov-exempt="">{s.loanTokens.toLocaleString("en-US")}</span>,
      },
    ],
    notes: (
      <span data-prov-exempt="">
        {s.borrowed.toLocaleString("en-US")} have borrowing · {s.neverFunded.toLocaleString("en-US")} {unfundedLabel}
        {s.idleMarkets > 0 && ` · ${s.idleMarkets} idle`}
      </span>
    ),
    readAt: readAtOf(r, "Every figure on this page"),
    tools: { links },
    explainer: { body: <RosterExplainer d={data} />, label: "roster explanation" },
    learnMore: null,
    anatomy: "M4",
  };

  return (
    <div className="min-h-screen" data-anatomy="R1" data-morpho-roster="">
      <div className="py-8">
        <SubPageHeader protocol={protocolForHref(root)!} title="Markets" />
        {data.chainStale ? (
          <p className={NOTE}>The market roster could not be read from the chain. Reload to try again.</p>
        ) : (
          <>
            <ProductHeadSection head={head} titled={false} />
            {note}
            <ProvSection
              scope="markets-table"
              className="mb-8"
              data-anatomy="R1.1"
              data-morpho-markets-table=""
              data-morpho-view={filter}
              data-skel-section="page-table"
            >
              <SectionHeading
                title="Markets by loan token"
                menu={
                  <ToolsFor
                    scope="markets-table"
                    title="Markets by loan token"
                    tools={{
                      views:
                        filter === "none"
                          ? []
                          : [
                              {
                                item: "show-all",
                                title: "Show all markets",
                                subtitle: all
                                  ? "On: every market that carries the book"
                                  : "Off: the markets a vault lends into",
                                on: all,
                                toggle: () => setAll(!all),
                              },
                            ],
                      exports: {
                        csv: {
                          filename: `morpho-${chainMeta(chainId).slug}-markets.csv`,
                          build: () => marketsCsv(shownRows),
                          subtitle: "The markets listed under every loan token",
                        },
                      },
                    }}
                  />
                }
              >
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
                  {filter === "lent" && !focusing
                    ? "Loan tokens with the most markets a vault lends into first. Open one for its markets."
                    : "Loan tokens with the most funded markets first. Open one for its markets."}
                </p>
                {filter === "none" && (
                  <p className="mt-0.5 max-w-2xl text-[12px] text-rb-500" data-morpho-view-line="">
                    {data.vaults === "none"
                      ? `Rails does not show ${chainMeta(chainId).name}'s vaults yet, so every market that carries the book is listed.`
                      : "The vaults could not be read, so every market that carries the book is listed."}
                  </p>
                )}
              </SectionHeading>
              <ScopeNote scoped={scoped} noun={["market", "markets"]} className="mt-2" />
              <div className="mt-3" {...scoped.listProps}>
                {views.map((v) => (
                  <Group
                    key={v.g.loanToken}
                    v={v}
                    r={r}
                    open={open.has(v.g.loanToken)}
                    onToggle={() => toggle(v.g.loanToken)}
                    sort={sort}
                    onSort={onSort}
                    onAll={setAll}
                  />
                ))}
              </div>
              {hidden > 0 && (
                <p className="mt-3 text-[12px] text-rb-500" data-prov-exempt="" data-morpho-hidden-tokens="">
                  {hidden.toLocaleString("en-US")} more loan {hidden === 1 ? "token is" : "tokens are"} in the full
                  table ·{" "}
                  <button type="button" className={VIEW_LINK} onClick={() => setAll(true)}>
                    Show all markets
                  </button>
                </p>
              )}
              {data.unfundedTokens > 0 && (
                <p className="mt-3 text-[12px] text-rb-500" data-prov-exempt="">
                  {data.unfundedTokens.toLocaleString("en-US")} more loan tokens have markets that have never held
                  supply.
                </p>
              )}
            </ProvSection>
          </>
        )}
      </div>
      <ProvInspectorLayer />
    </div>
  );
}

// ── One loan token ───────────────────────────────────────────────────────────

function LoanTokenExplainer({ g, overIssued }: { g: MorphoLoanTokenViewData; overIssued: boolean }) {
  const sz = (n: number) => `${amount(n)} ${g.loanSymbol}`;
  return (
    <>
      <ExplainGroup title="These markets">
        <ExplainBullet>
          Every market here lends {g.loanSymbol}, each against its own collateral at its own LLTV. They share no
          liquidity: a supplier in one earns nothing from another.
        </ExplainBullet>
        {g.amountsTrusted && (
          <ExplainBullet
            sub={
              overIssued && (
                <ExplainSub>
                  The books are more than the <Fig bold>{sz(g.loanTokenSupply ?? 0)}</Fig> that exists. Morpho Blue adds
                  interest to a market&apos;s book without moving tokens, so a market left fully borrowed at a climbing
                  rate grows its book past the token behind it.
                </ExplainSub>
              )
            }
          >
            Together suppliers have put in <Fig bold>{sz(g.totalSupply)}</Fig> and borrowers owe{" "}
            <Fig bold>{sz(g.totalBorrow)}</Fig>, as each market last settled.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Reading the page">
        <ExplainBullet>The table lists the markets that carry the book, largest first.</ExplainBullet>
        {g.families.length > 0 && (
          <ExplainBullet>
            Markets that differ only in their oracle are listed together below: anyone can create a new market by naming
            a new oracle.
          </ExplainBullet>
        )}
        {g.dust.length > 0 && <ExplainBullet>Markets each holding under 0.1% of the book follow them.</ExplainBullet>}
      </ExplainGroup>
    </>
  );
}

/** A disclosure over a table of markets: a family, or the small ones. */
function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`text-[13px] ${INLINE_LINK}`}
      >
        {open ? "Hide" : "Show"} {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function FamilyBlock({
  f,
  g,
  r,
  sort,
  onSort,
}: {
  f: MorphoMarketFamily;
  g: MorphoLoanTokenViewData;
  r: Read;
  sort: Sort;
  onSort: (k: SortKey) => void;
}) {
  const coll = f.collateralSymbol ?? shortAddr(f.collateralToken);
  const c = coordsOf(r, { loanSymbol: g.loanSymbol, loanToken: g.loanToken, collateralSymbol: f.collateralSymbol });
  return (
    <div
      className="border-t border-rb-200 py-3 first:border-t-0 dark:border-rb-800"
      data-morpho-family={`${f.collateralToken}:${f.lltv}`}
    >
      <p className="text-[14px] font-semibold text-foreground">
        {coll} at <Prov info={morphoLltvProv(c)}>{pctText(f.lltv)}</Prov>
        <span className="font-normal text-rb-500" data-prov-exempt="">
          {" "}
          · {f.markets.length.toLocaleString("en-US")} markets, {f.oracles.toLocaleString("en-US")} oracles
        </span>
      </p>
      <p className="mt-1 text-[12px] tabular-nums text-rb-500">
        <span className="text-foreground">
          <Prov info={morphoFamilyTotalProv("supplied", c, f.markets.length)}>{amount(f.totalSupply)}</Prov>
        </span>{" "}
        supplied ·{" "}
        <span className="text-foreground">
          <Prov info={morphoFamilyTotalProv("borrowed", c, f.markets.length)}>{amount(f.totalBorrow)}</Prov>
        </span>{" "}
        borrowed{f.allPinned ? ", every one fully borrowed" : ""}
      </p>
      <Disclosure label={`the ${f.markets.length.toLocaleString("en-US")} markets`}>
        <MarketsTable
          rows={f.markets}
          r={r}
          label={`${coll} / ${g.loanSymbol} markets at ${pctText(f.lltv)}`}
          sort={sort}
          onSort={onSort}
        />
      </Disclosure>
    </div>
  );
}

type LoanTokenProps = {
  g: MorphoLoanTokenViewData;
  block: number;
  fromLogs: boolean;
  chainId: ChainId;
};

/** The loan-token page, held behind an AimGate when none of its markets has a
 *  token in focus. */
export function MorphoLoanTokenPage(props: LoanTokenProps) {
  const { g, chainId } = props;
  const keys = useMemo(
    () => [
      assetKey(chainId, g.loanToken),
      ...[...g.material, ...g.families.flatMap((f) => f.markets), ...g.dust, ...g.empties].flatMap((m) =>
        m.collateralToken ? [assetKey(chainId, m.collateralToken)] : [],
      ),
    ],
    [g, chainId],
  );
  const root = `/${chainMeta(chainId).slug}/morpho`;
  return (
    <div className="min-h-screen" data-anatomy="R1" data-morpho-loan-token={g.loanToken}>
      <div className="py-8">
        <SubPageHeader protocol={protocolForHref(root)!} title={`${g.loanSymbol} markets`} />
        <AimGate keys={keys} chain={chainId} what={`Morpho Blue's ${g.loanSymbol} markets`}>
          <LoanTokenBody {...props} />
        </AimGate>
      </div>
      <ProvInspectorLayer />
    </div>
  );
}

function LoanTokenBody({ g, block, fromLogs, chainId }: LoanTokenProps) {
  const root = `/${chainMeta(chainId).slug}/morpho`;
  const r: Read = { chainId, block, fromLogs };
  const [sort, onSort] = useSort();
  const c = coordsOf(r, { loanSymbol: g.loanSymbol, loanToken: g.loanToken });
  const util = g.totalSupply > 0 ? g.totalBorrow / g.totalSupply : null;
  const explorer = chainMeta(chainId).explorerName;
  // A margin over the token's own supply, so a rounding tie is not a caution.
  const overIssued =
    g.amountsTrusted && g.loanTokenSupply != null && g.loanTokenSupply > 0 && g.totalSupply > g.loanTokenSupply * 1.001;
  const size = (n: number, info: ReturnType<typeof morphoGroupTotalProv>) =>
    g.amountsTrusted ? (
      <Prov info={info}>
        {amount(n)} {g.loanSymbol}
      </Prov>
    ) : (
      <span className="text-rb-500">not stated</span>
    );
  const head: ProductHead = {
    scope: "token-head",
    title: `${g.loanSymbol} markets`,
    subtitle: (
      <p className="mt-1 text-[13px] text-rb-500">
        Every Morpho Blue market that lends {g.loanSymbol}
        {g.ambiguous && <span className="font-mono"> ({shortAddr(g.loanToken)})</span>} ·{" "}
        <Link
          href={`${root}/markets`}
          prefetch={false}
          className="text-blue-600 hover:underline dark:text-[var(--text-link)]"
        >
          All markets
        </Link>
      </p>
    ),
    figures: [
      {
        slot: "roster",
        label: "Markets",
        value: <span data-prov-exempt="">{g.markets.toLocaleString("en-US")}</span>,
        tip: "Every market that lends this token",
      },
      {
        slot: "sizeIn",
        label: "Supplied",
        value: <span data-vital="supplied">{size(g.totalSupply, morphoGroupTotalProv("supplied", c))}</span>,
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        value: <span data-vital="borrowed">{size(g.totalBorrow, morphoGroupTotalProv("borrowed", c))}</span>,
      },
      {
        slot: "usage",
        label: "Utilisation",
        tip: "Borrowed ÷ supplied across these markets",
        value:
          util != null ? (
            <Prov info={morphoGroupUtilizationProv(c)}>{pctText(util)}</Prov>
          ) : (
            <span className="text-rb-500">no supply</span>
          ),
      },
    ],
    notes: (
      <>
        <span data-prov-exempt="">
          {g.funded.toLocaleString("en-US")} hold supply · {g.borrowing.toLocaleString("en-US")} have borrowing
        </span>
        {g.amountsTrusted && g.loanTokenSupply != null && (
          <span className={overIssued ? "text-caution-500" : undefined}>
            <span className={overIssued ? undefined : "text-foreground"}>
              <Prov info={morphoLoanTokenSupplyProv(c)}>{amount(g.loanTokenSupply)}</Prov>
            </span>{" "}
            {g.loanSymbol} exists{overIssued ? ", less than these books" : ""}
          </span>
        )}
      </>
    ),
    readAt: readAtOf(r, `Every ${g.loanSymbol} figure on this page`),
    tools: {
      links: [
        {
          item: "markets",
          title: "All markets",
          subtitle: "Every loan token on this chain",
          href: `${root}/markets`,
          internal: true,
        },
        {
          item: "token",
          title: `${g.loanSymbol} on ${explorer}`,
          subtitle: "The loan token",
          href: explorerUrl(chainId, "address", g.loanToken),
        },
      ],
    },
    explainer: { body: <LoanTokenExplainer g={g} overIssued={overIssued} />, label: "explanation" },
    learnMore: null,
    anatomy: "M4",
  };
  // Focus: the markets whose loan or collateral token is in focus (every one,
  // where the loan token is).
  const byMarket = (m: { collateralToken: string | null }) => marketKeys(chainId, { loanToken: g.loanToken, ...m });
  const material = useScopedRows(g.material, byMarket, () => chainId);
  const families = useScopedRows(g.families, byMarket, () => chainId);
  const dust = useScopedRows(g.dust, byMarket, () => chainId);
  const empties = useScopedRows(g.empties, byMarket, () => chainId);
  const emptiesCount = empties.on ? empties.rows.reduce((n, e) => n + e.count, 0) : g.emptiesCount;
  const csv = (rows: MorphoMarketRow[], name: string) => ({
    exports: {
      csv: {
        filename: `morpho-${chainMeta(chainId).slug}-${g.loanSymbol.toLowerCase()}-${name}.csv`,
        build: () => marketsCsv(rows),
      },
    },
  });

  return (
    <>
      <ProductHeadSection head={head} titled={false} />

      {g.material.length > 0 && (
        <ProvSection scope="token-markets" className="mb-8" data-morpho-markets-table="" data-skel-section="page-table">
          <SectionHeading
            title="Markets"
            menu={<ToolsFor scope="token-markets" title="Markets" tools={csv(material.rows, "markets")} />}
          >
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">The markets that carry the book.</p>
          </SectionHeading>
          <ScopeNote scoped={material} noun={["market", "markets"]} className="mt-2" />
          {material.rows.length > 0 && (
            <div className="mt-3">
              <MarketsTable rows={material.rows} r={r} label={`${g.loanSymbol} markets`} sort={sort} onSort={onSort} />
            </div>
          )}
        </ProvSection>
      )}

      {g.families.length > 0 && (
        <ProvSection scope="token-families" className="mb-8" data-morpho-families="">
          <SectionHeading
            title="Markets that repeat one pair"
            menu={
              <ToolsFor
                scope="token-families"
                title="Markets that repeat one pair"
                tools={csv(
                  families.rows.flatMap((f) => f.markets),
                  "repeats",
                )}
              />
            }
          >
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
              Ten or more markets with one collateral and one LLTV, differing only in their oracle.
            </p>
          </SectionHeading>
          <ScopeNote scoped={families} noun={["pair", "pairs"]} className="mt-2" />
          <div className="mt-2">
            {families.rows.map((f) => (
              <FamilyBlock key={`${f.collateralToken}:${f.lltv}`} f={f} g={g} r={r} sort={sort} onSort={onSort} />
            ))}
          </div>
        </ProvSection>
      )}

      {g.dust.length > 0 && (
        <ProvSection scope="token-small" className="mb-8" data-morpho-dust="">
          <SectionHeading
            title="Smaller markets"
            menu={<ToolsFor scope="token-small" title="Smaller markets" tools={csv(dust.rows, "smaller")} />}
          >
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500" data-prov-exempt="">
              {g.dust.length.toLocaleString("en-US")} funded markets, each under 0.1% of the book.
            </p>
          </SectionHeading>
          <ScopeNote scoped={dust} noun={["market", "markets"]} />
          {dust.rows.length > 0 && (
            <Disclosure label={`${dust.rows.length.toLocaleString("en-US")} markets`}>
              <MarketsTable
                rows={dust.rows}
                r={r}
                label={`Smaller ${g.loanSymbol} markets`}
                sort={sort}
                onSort={onSort}
              />
            </Disclosure>
          )}
        </ProvSection>
      )}

      {emptiesCount > 0 && (
        <section className="mb-8" data-morpho-never-funded="">
          <h2 className="text-sm font-semibold text-foreground">Never funded</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500" data-prov-exempt="">
            {emptiesCount.toLocaleString("en-US")} {emptiesCount === 1 ? "market has" : "markets have"} never held
            supply. Creating one costs only gas.
          </p>
          <Disclosure label="them">
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums text-rb-500" data-prov-exempt="">
              {empties.rows.map((e) => (
                <span key={`${e.collateralToken ?? "idle"}:${e.lltv}`}>
                  <span className={e.collateralSymbol && !e.collateralNamed ? "font-mono" : ""}>
                    {e.collateralSymbol ?? "idle"}
                  </span>{" "}
                  · <span className="text-foreground">{pctText(e.lltv)}</span>
                  {e.count > 1 && <> ×{e.count}</>}
                </span>
              ))}
            </p>
          </Disclosure>
        </section>
      )}
    </>
  );
}
