"use client";

// Morpho Blue on Arbitrum — the markets sub-page's table
// (/arbitrum/morpho/markets). The census's markets read at one block
// (GET /api/chain/morpho-arbitrum/markets, lib/sources/chain/
// morpho-arbitrum-markets.ts): the funded markets whose loan token is a dollar
// stable or WETH ranked by supply in dollars, every other funded market listed
// in its own loan token, and the markets with nothing supplied behind a
// disclosure. The census block is stated, since a market created after it is
// not in the table. Each table on the house table (rails-ops ui-jobs 539: D1,
// D6 cards below sm), unsorted (the census's order) and unlinked (a market
// has no Rails page here); sizes carry the loan token's mark (`AssetUnit`).

import { useEffect, useState, type ReactNode } from "react";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
import { AssetUnit } from "@/components/shared/asset-unit";
import { TokenPairIcons } from "@/components/shared/token-pair-icons";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { amount, pctText } from "@/lib/morpho/markets-format";
import { shortMarketId } from "@/lib/morpho/asset-catalog";
import { explorerUrl } from "@/lib/shared/chains";
import { MORPHO_ARBITRUM_CHAIN_ID } from "@/lib/morpho-arbitrum/asset-catalog";
import {
  lltvProv,
  sizeProv,
  supplyUsdProv,
  utilizationProv,
  type MorphoArbitrumMarketCoords,
} from "@/lib/morpho-arbitrum/markets-provenance";
import type {
  MorphoArbitrumMarketRow,
  MorphoArbitrumMarketsResponse,
} from "@/lib/sources/chain/morpho-arbitrum-markets";

const ROUTE = "/api/chain/morpho-arbitrum/markets";

const NONE = "0x0000000000000000000000000000000000000000";
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** A token by its symbol where it has one, by its address where it does not. */
function Token({ symbol, address }: { symbol: string | null; address: string }) {
  if (address === NONE) return <span className="text-rb-400">none</span>;
  return (
    <a
      href={explorerUrl(MORPHO_ARBITRUM_CHAIN_ID, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-blue-600 dark:hover:text-[var(--text-link)]"
      title={address}
    >
      {symbol ?? <span className="font-mono">{shortAddr(address)}</span>}
    </a>
  );
}

const NUM = "whitespace-nowrap tabular-nums text-foreground";

/** A size in the market's loan token, the token's mark after it. */
function Size({ children, m }: { children: ReactNode; m: MorphoArbitrumMarketRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <AssetUnit symbol={m.loanSymbol ?? shortAddr(m.loanToken)} address={m.loanToken} named={m.loanSymbol != null} />
    </span>
  );
}

function MarketRow({
  m,
  block,
  rank,
  price,
}: {
  m: MorphoArbitrumMarketRow;
  block: number;
  rank?: number;
  price?: number;
}) {
  const unit = m.loanSymbol ?? shortAddr(m.loanToken);
  const coords: MorphoArbitrumMarketCoords = {
    blockNumber: block,
    marketId: m.id,
    loanSymbol: unit,
    loanToken: m.loanToken,
  };
  return (
    <DataTableRow data-morpho-market={m.id}>
      {rank != null && (
        // On a card (D6) the rank moves into the pair's line.
        <DataTableCell className="w-8 tabular-nums text-rb-500 max-sm:hidden!" data-prov-exempt="">
          {rank}
        </DataTableCell>
      )}
      <DataTableCell rowHeader className="whitespace-nowrap text-foreground">
        <span className="flex items-center gap-2.5">
          {rank != null && (
            <span className="tabular-nums text-rb-500 sm:hidden" data-prov-exempt="">
              {rank}
            </span>
          )}
          <TokenPairIcons
            first={{ symbol: m.loanSymbol ?? shortAddr(m.loanToken), address: m.loanToken }}
            second={
              m.collateralToken === NONE
                ? null
                : { symbol: m.collateralSymbol ?? shortAddr(m.collateralToken), address: m.collateralToken }
            }
          />
          <span>
            <Token symbol={m.loanSymbol} address={m.loanToken} />
            <span className="text-rb-400"> / </span>
            <Token symbol={m.collateralSymbol} address={m.collateralToken} />
          </span>
        </span>
      </DataTableCell>
      <DataTableCell label="LLTV" align="right" className={NUM}>
        <Prov info={lltvProv(coords)}>{pctText(m.lltv)}</Prov>
      </DataTableCell>
      <DataTableCell label="Supplied" align="right" className={NUM}>
        {m.supply == null ? (
          <span className="text-rb-400">decimals unread</span>
        ) : (
          <Size m={m}>
            <Prov info={sizeProv("supplied", coords)}>{amount(m.supply)}</Prov>
          </Size>
        )}
      </DataTableCell>
      {rank != null && (
        <DataTableCell label="In dollars" align="right" className={NUM}>
          {m.supplyUsd != null && price != null ? (
            <Prov info={supplyUsdProv(coords, price)}>{usd(m.supplyUsd)}</Prov>
          ) : (
            "—"
          )}
        </DataTableCell>
      )}
      <DataTableCell label="Borrowed" align="right" className={NUM}>
        {m.borrow == null ? (
          "—"
        ) : (
          <Size m={m}>
            <Prov info={sizeProv("borrowed", coords)}>{amount(m.borrow)}</Prov>
          </Size>
        )}
      </DataTableCell>
      <DataTableCell label="Used" align="right" className={NUM}>
        {m.utilization == null ? "—" : <Prov info={utilizationProv(coords)}>{pctText(m.utilization, 0)}</Prov>}
      </DataTableCell>
      <DataTableCell label="Market" className="whitespace-nowrap text-rb-500">
        <span className="font-mono" title={m.id}>
          {shortMarketId(m.id)}
        </span>
        {m.excluded === "exceeds-token-supply" && (
          <span className="ml-2 text-amber-600 dark:text-amber-400">supply above the token&rsquo;s own</span>
        )}
      </DataTableCell>
    </DataTableRow>
  );
}

/** One of the page's three tables. */
function MarketsTable({
  label,
  rows,
  block,
  loanUsd,
}: {
  label: string;
  rows: MorphoArbitrumMarketRow[];
  block: number;
  /** The ranked table: a rank and a dollar column, each loan token's price. */
  loanUsd?: Record<string, number>;
}) {
  const ranked = loanUsd != null;
  return (
    <DataTable
      label={label}
      stacked
      rowHeight="one"
      tableClassName={`text-sm ${ranked ? "sm:min-w-[48rem]" : "sm:min-w-[44rem]"}`}
    >
      <DataTableHead>
        {ranked && <DataTableHeader label="#" />}
        <DataTableHeader label="Loan / collateral" />
        <DataTableHeader label="LLTV" align="right" />
        <DataTableHeader label="Supplied" align="right" />
        {ranked && <DataTableHeader label="In dollars" align="right" />}
        <DataTableHeader label="Borrowed" align="right" />
        <DataTableHeader label="Used" align="right" />
        <DataTableHeader label="Market" />
      </DataTableHead>
      <DataTableBody>
        {rows.map((m, i) => (
          <MarketRow key={m.id} m={m} block={block} rank={ranked ? i + 1 : undefined} price={loanUsd?.[m.loanToken]} />
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export function MorphoArbitrumMarketsView() {
  const registry = useReceiptRegistry();
  const [data, setData] = useState<MorphoArbitrumMarketsResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let live = true;
    fetch(ROUTE)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: MorphoArbitrumMarketsResponse) => {
        if (!live) return;
        setData(d);
        setState("ready");
      })
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, []);

  if (state === "loading") return <p className="text-sm text-rb-500">Reading the markets from the singleton…</p>;
  if (state === "failed" || !data)
    return <p className="text-sm text-rb-500">The markets could not be read from the chain. Reload to try again.</p>;

  const block = data.blockNumber;
  const excluded = data.unranked.filter((m) => m.excluded).length;
  return (
    <ProvReceiptsScope registry={registry}>
      <section className="space-y-8" data-anatomy="N6" data-morpho-arbitrum-markets={data.marketCount}>
        {/* The roster count and the two blocks are cardinality and chrome, not
            slot reads. */}
        <p className="text-sm text-rb-500" data-prov-exempt="">
          <span className="text-foreground">{data.marketCount.toLocaleString("en-US")}</span> markets, every one Blue
          had created by the census at block <BlockRef block={data.censusBlock} chainId={MORPHO_ARBITRUM_CHAIN_ID} />; a
          market created since is not in this table. Sizes are each market&rsquo;s stored totals at block{" "}
          <BlockRef block={block} chainId={MORPHO_ARBITRUM_CHAIN_ID} />, interest to its last update.
        </p>

        <div>
          <h2 className="mb-1 text-sm font-semibold text-foreground">Largest markets in dollars</h2>
          <p className="mb-3 text-[12px] text-rb-500">
            The funded markets that lend USDC, USDC.e, USD₮0, DAI or WETH, ranked by supply in dollars, priced by the
            Aave V3 Arbitrum oracle when the sizes were read.
            {excluded > 0 &&
              ` ${excluded === 1 ? "One market" : `${excluded} markets`} in these tokens ${excluded === 1 ? "reports" : "report"} more supplied than the token's whole supply on Arbitrum, and ${excluded === 1 ? "is" : "are"} listed below instead.`}
          </p>
          <MarketsTable label="Largest markets in dollars" rows={data.ranked} block={block} loanUsd={data.loanUsd} />
        </div>

        <div>
          <h2 className="mb-1 text-sm font-semibold text-foreground">Every other funded market</h2>
          <p className="mb-3 text-[12px] text-rb-500">
            Each in its own loan token, by token and then size. These sizes are not compared across tokens.
          </p>
          <MarketsTable label="Every other funded market" rows={data.unranked} block={block} />
        </div>

        {data.empty.length > 0 && (
          <details className="text-[12px]">
            <summary className="cursor-pointer text-rb-500">
              <span data-prov-exempt="">{data.empty.length.toLocaleString("en-US")}</span> markets with nothing supplied
              at block {block.toLocaleString("en-US")}
            </summary>
            <div className="mt-3">
              <MarketsTable label="Markets with nothing supplied" rows={data.empty} block={block} />
            </div>
          </details>
        )}
      </section>
    </ProvReceiptsScope>
  );
}
