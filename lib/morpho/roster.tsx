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
//   • The loan-token page (/markets/<loanToken>): the token's head, the same
//     table for its markets that carry the book, then the markets that repeat
//     one pair, the small ones and the never funded.
//
// Every row opens its market's page. Sizes and rates are stored and live reads
// at one block (lib/sources/chain/morpho-markets.ts); the market id and the
// oracle sit in the collateral cell's receipt.

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ExplainBullet, ExplainGroup, ExplainSub, Fig } from "@/components/shared/explain-groups";
import { readStampProv } from "@/components/shared/read-stamp";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, type SectionMenuLink } from "@/components/shared/section-menu";
import { ProductHeadSection, ToolsFor } from "@/components/shared/product/product-head";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
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
} from "@/components/shared/data-table/data-table";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
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
  morphoSupplyRateProv,
  morphoUtilizationProv,
  type MorphoMarketCoords,
} from "@/lib/morpho/markets-provenance";
import type {
  MorphoLoanTokenViewData,
  MorphoMarketFamily,
  MorphoRosterData,
  MorphoRosterGroup,
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

function sorted(rows: MorphoMarketRow[], s: Sort): MorphoMarketRow[] {
  const sign = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, s.key);
    const y = sortValue(b, s.key);
    return sign * (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number));
  });
}

/** One market: a keyed component so it owns its receipts registry. */
function MarketRow({ m, r }: { m: MorphoMarketRow; r: Read }) {
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
      <DataTableRow href={href} data-morpho-market={m.id}>
        <DataTableCell rowHeader className="whitespace-nowrap">
          <span className="flex items-center gap-2.5">
            <TokenPairIcons
              first={
                m.isIdle ? { symbol: m.loanSymbol, address: m.loanToken } : { symbol: name, address: m.collateralToken }
              }
              fixed
            />
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
          {m.borrowApr != null ? (
            <Prov info={morphoBorrowRateProv(c)}>{ratePercentText(m.borrowApr)}</Prov>
          ) : (
            <span className="text-rb-500">none</span>
          )}
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

/** One table of markets in one loan token. */
function MarketsTable({
  rows,
  r,
  label,
  sort,
  onSort,
}: {
  rows: MorphoMarketRow[];
  r: Read;
  label: string;
  sort: Sort;
  onSort: (k: SortKey) => void;
}) {
  const th = (k: SortKey, text: string, align: "left" | "right" = "left", tip?: string) => (
    <DataTableHeader
      key={k}
      label={text}
      align={align}
      title={tip ? `${tip}. Click to sort.` : undefined}
      sort={{ dir: sort.key === k ? sort.dir : null, onSort: () => onSort(k), ariaLabel: `Sort by ${text}` }}
    />
  );
  return (
    <DataTable label={label} stacked rowHeight="one" tableClassName="text-[13px] sm:min-w-[40rem]">
      <DataTableHead>
        {th("collateral", "Collateral")}
        {COLUMNS.map((c) => th(c.key, c.label, "right", c.tip))}
      </DataTableHead>
      <DataTableBody>
        {sorted(rows, sort).map((m) => (
          <MarketRow key={m.id} m={m} r={r} />
        ))}
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

/** A loan token's group: a disclosure whose heading states the token's book. */
function Group({
  g,
  r,
  open,
  onToggle,
  sort,
  onSort,
}: {
  g: MorphoRosterGroup;
  r: Read;
  open: boolean;
  onToggle: () => void;
  sort: Sort;
  onSort: (k: SortKey) => void;
}) {
  const c = coordsOf(r, { loanSymbol: g.loanSymbol, loanToken: g.loanToken });
  const util = g.totalSupply > 0 ? g.totalBorrow / g.totalSupply : null;
  const tokenHref = morphoLoanTokenHref(r.chainId, g.loanToken);
  const id = `morpho-group-${g.loanToken}`;
  const more = g.markets - g.rows.length;
  // A margin over the token's own supply, so a rounding tie is not a caution.
  const overIssued =
    g.amountsTrusted && g.loanTokenSupply != null && g.loanTokenSupply > 0 && g.totalSupply > g.loanTokenSupply * 1.001;
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
            · {g.markets.toLocaleString("en-US")} {g.markets === 1 ? "market" : "markets"}
          </span>
        </button>
        <span className="text-[12px] tabular-nums text-rb-500">
          {g.amountsTrusted ? (
            <>
              <span className="text-foreground">
                <Prov info={morphoGroupTotalProv("supplied", c)}>{amount(g.totalSupply)}</Prov>
              </span>{" "}
              supplied ·{" "}
              <span className="text-foreground">
                <Prov info={morphoGroupTotalProv("borrowed", c)}>{amount(g.totalBorrow)}</Prov>
              </span>{" "}
              borrowed
              {util != null && (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-foreground">
                    <Prov info={morphoGroupUtilizationProv(c)}>{pctText(util, 0)}</Prov>
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
      {open && (
        <div id={id} className="mt-2">
          {g.rows.length > 0 && (
            <MarketsTable rows={g.rows} r={r} label={`${g.loanSymbol} markets`} sort={sort} onSort={onSort} />
          )}
          <p className="mt-1 text-[13px]">
            <Link href={tokenHref} prefetch={false} className={INLINE_LINK} data-morpho-token-link={g.loanToken}>
              {more > 0
                ? `All ${g.markets.toLocaleString("en-US")} ${g.loanSymbol} markets, ${more.toLocaleString("en-US")} more`
                : `${g.loanSymbol} markets`}{" "}
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
        <ExplainBullet>
          Each group lists the markets that carry its book. Each loan token&apos;s page lists the rest: markets that
          repeat one pair, the small ones and the never funded.
        </ExplainBullet>
        <ExplainBullet>
          Sizes are as each market last settled; Morpho Blue adds interest only when a market is used.
        </ExplainBullet>
      </ExplainGroup>
    </>
  );
}

export function MorphoRosterPage({ data, chainId }: { data: MorphoRosterData; chainId: ChainId }) {
  const root = `/${chainMeta(chainId).slug}/morpho`;
  const r: Read = { chainId, block: data.blockNumber, fromLogs: data.totalsSource === "sieve" };
  const [sort, onSort] = useSort();
  const [open, setOpen] = useState<Set<string>>(() => new Set(data.groups[0] ? [data.groups[0].loanToken] : []));
  const toggle = (t: string) =>
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  const allRows = useMemo(() => data.groups.flatMap((g) => g.rows), [data.groups]);
  const blue = morphoBlueContract(chainId);
  const explorer = chainMeta(chainId).explorerName;
  const s = data.summary;
  const links: SectionMenuLink[] = [
    {
      item: "positions",
      title: "All Morpho Blue positions",
      subtitle: "Every position Rails holds",
      href: chainId === 42161 ? `${root}/positions` : root,
      internal: true,
    },
    ...(chainId !== 42161
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
        {s.borrowed.toLocaleString("en-US")} have borrowing · {s.neverFunded.toLocaleString("en-US")} never funded
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
            <ProvSection
              scope="markets-table"
              className="mb-8"
              data-anatomy="R1.1"
              data-morpho-markets-table=""
              data-skel-section="page-table"
            >
              <SectionHeading
                title="Markets by loan token"
                menu={
                  <ToolsFor
                    scope="markets-table"
                    title="Markets by loan token"
                    tools={{
                      exports: {
                        csv: {
                          filename: `morpho-${chainMeta(chainId).slug}-markets.csv`,
                          build: () => marketsCsv(allRows),
                          subtitle: "The markets listed under every loan token",
                        },
                      },
                    }}
                  />
                }
              >
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
                  Loan tokens with the most funded markets first. Open one for its markets.
                </p>
              </SectionHeading>
              <div className="mt-3">
                {data.groups.map((g) => (
                  <Group
                    key={g.loanToken}
                    g={g}
                    r={r}
                    open={open.has(g.loanToken)}
                    onToggle={() => toggle(g.loanToken)}
                    sort={sort}
                    onSort={onSort}
                  />
                ))}
              </div>
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

export function MorphoLoanTokenPage({
  g,
  block,
  fromLogs,
  chainId,
}: {
  g: MorphoLoanTokenViewData;
  block: number;
  fromLogs: boolean;
  chainId: ChainId;
}) {
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
  const csv = (rows: MorphoMarketRow[], name: string) => ({
    exports: {
      csv: {
        filename: `morpho-${chainMeta(chainId).slug}-${g.loanSymbol.toLowerCase()}-${name}.csv`,
        build: () => marketsCsv(rows),
      },
    },
  });

  return (
    <div className="min-h-screen" data-anatomy="R1" data-morpho-loan-token={g.loanToken}>
      <div className="py-8">
        <SubPageHeader protocol={protocolForHref(root)!} title={`${g.loanSymbol} markets`} />
        <ProductHeadSection head={head} titled={false} />

        {g.material.length > 0 && (
          <ProvSection
            scope="token-markets"
            className="mb-8"
            data-morpho-markets-table=""
            data-skel-section="page-table"
          >
            <SectionHeading
              title="Markets"
              menu={<ToolsFor scope="token-markets" title="Markets" tools={csv(g.material, "markets")} />}
            >
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">The markets that carry the book.</p>
            </SectionHeading>
            <div className="mt-3">
              <MarketsTable rows={g.material} r={r} label={`${g.loanSymbol} markets`} sort={sort} onSort={onSort} />
            </div>
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
                    g.families.flatMap((f) => f.markets),
                    "repeats",
                  )}
                />
              }
            >
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
                Ten or more markets with one collateral and one LLTV, differing only in their oracle.
              </p>
            </SectionHeading>
            <div className="mt-2">
              {g.families.map((f) => (
                <FamilyBlock key={`${f.collateralToken}:${f.lltv}`} f={f} g={g} r={r} sort={sort} onSort={onSort} />
              ))}
            </div>
          </ProvSection>
        )}

        {g.dust.length > 0 && (
          <ProvSection scope="token-small" className="mb-8" data-morpho-dust="">
            <SectionHeading
              title="Smaller markets"
              menu={<ToolsFor scope="token-small" title="Smaller markets" tools={csv(g.dust, "smaller")} />}
            >
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500" data-prov-exempt="">
                {g.dust.length.toLocaleString("en-US")} funded markets, each under 0.1% of the book.
              </p>
            </SectionHeading>
            <Disclosure label={`${g.dust.length.toLocaleString("en-US")} markets`}>
              <MarketsTable rows={g.dust} r={r} label={`Smaller ${g.loanSymbol} markets`} sort={sort} onSort={onSort} />
            </Disclosure>
          </ProvSection>
        )}

        {g.emptiesCount > 0 && (
          <section className="mb-8" data-morpho-never-funded="">
            <h2 className="text-sm font-semibold text-foreground">Never funded</h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500" data-prov-exempt="">
              {g.emptiesCount.toLocaleString("en-US")} {g.emptiesCount === 1 ? "market has" : "markets have"} never held
              supply. Creating one costs only gas.
            </p>
            <Disclosure label="them">
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums text-rb-500" data-prov-exempt="">
                {g.empties.map((e) => (
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
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
