"use client";

// Morpho Blue on Arbitrum — the protocol page's markets table, under the
// wallet input. The census's markets read at one block
// (GET /api/chain/morpho-arbitrum/markets, lib/sources/chain/
// morpho-arbitrum-markets.ts): the funded markets whose loan token is a dollar
// stable or WETH ranked by supply in dollars, every other funded market listed
// in its own loan token, and the markets with nothing supplied behind a
// disclosure. The census block is stated, since a market created after it is
// not in the table.

import { useEffect, useState } from "react";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { BlockRef } from "@/components/shared/block-ref";
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

const TH = "py-2 pr-3 font-normal";
const TH_NUM = `${TH} text-right`;
const TD = "py-2 pr-3 whitespace-nowrap";
const TD_NUM = `${TD} text-right tabular-nums text-foreground`;

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** A token by its symbol where it has one, by its address where it does not. */
function Token({ symbol, address }: { symbol: string | null; address: string }) {
  if (address === "0x0000000000000000000000000000000000000000") return <span className="text-rb-400">none</span>;
  return (
    <a
      href={explorerUrl(MORPHO_ARBITRUM_CHAIN_ID, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-blue-500"
      title={address}
    >
      {symbol ?? <span className="font-mono">{shortAddr(address)}</span>}
    </a>
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
    <tr className="border-b border-rb-200/60 dark:border-rb-500/20" data-morpho-market={m.id}>
      {rank != null && (
        <td className={`${TD} text-rb-500 tabular-nums`} data-prov-exempt="">
          {rank}
        </td>
      )}
      <td className={TD}>
        <Token symbol={m.loanSymbol} address={m.loanToken} />
        <span className="text-rb-400"> / </span>
        <Token symbol={m.collateralSymbol} address={m.collateralToken} />
      </td>
      <td className={TD_NUM}>
        <Prov info={lltvProv(coords)}>{pctText(m.lltv)}</Prov>
      </td>
      <td className={TD_NUM}>
        {m.supply == null ? (
          <span className="text-rb-400">decimals unread</span>
        ) : (
          <>
            <Prov info={sizeProv("supplied", coords)}>{amount(m.supply)}</Prov>{" "}
            <span className="text-rb-500">{unit}</span>
          </>
        )}
      </td>
      {rank != null && (
        <td className={TD_NUM}>
          {m.supplyUsd != null && price != null ? (
            <Prov info={supplyUsdProv(coords, price)}>{usd(m.supplyUsd)}</Prov>
          ) : (
            "—"
          )}
        </td>
      )}
      <td className={TD_NUM}>
        {m.borrow == null ? (
          "—"
        ) : (
          <>
            <Prov info={sizeProv("borrowed", coords)}>{amount(m.borrow)}</Prov>{" "}
            <span className="text-rb-500">{unit}</span>
          </>
        )}
      </td>
      <td className={TD_NUM}>
        {m.utilization == null ? "—" : <Prov info={utilizationProv(coords)}>{pctText(m.utilization, 0)}</Prov>}
      </td>
      <td className={`${TD} font-mono text-rb-500`} title={m.id}>
        {shortMarketId(m.id)}
        {m.excluded === "exceeds-token-supply" && (
          <span className="ml-2 font-sans text-amber-600 dark:text-amber-400">supply above the token&rsquo;s own</span>
        )}
      </td>
    </tr>
  );
}

function Head({ ranked }: { ranked: boolean }) {
  return (
    <thead>
      <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
        {ranked && <th className={TH}>#</th>}
        <th className={TH}>Loan / collateral</th>
        <th className={TH_NUM}>LLTV</th>
        <th className={TH_NUM}>Supplied</th>
        {ranked && <th className={TH_NUM}>In dollars</th>}
        <th className={TH_NUM}>Borrowed</th>
        <th className={TH_NUM}>Used</th>
        <th className={TH}>Market</th>
      </tr>
    </thead>
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
      <section className="space-y-8" data-morpho-arbitrum-markets={data.marketCount}>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-[12px]">
              <Head ranked />
              <tbody>
                {data.ranked.map((m, i) => (
                  <MarketRow key={m.id} m={m} block={block} rank={i + 1} price={data.loanUsd[m.loanToken]} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-sm font-semibold text-foreground">Every other funded market</h2>
          <p className="mb-3 text-[12px] text-rb-500">
            Each in its own loan token, by token and then size. These sizes are not compared across tokens.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-[12px]">
              <Head ranked={false} />
              <tbody>
                {data.unranked.map((m) => (
                  <MarketRow key={m.id} m={m} block={block} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {data.empty.length > 0 && (
          <details className="text-[12px]">
            <summary className="cursor-pointer text-rb-500">
              <span data-prov-exempt="">{data.empty.length.toLocaleString("en-US")}</span> markets with nothing supplied
              at block {block.toLocaleString("en-US")}
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-[12px]">
                <Head ranked={false} />
                <tbody>
                  {data.empty.map((m) => (
                    <MarketRow key={m.id} m={m} block={block} />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
    </ProvReceiptsScope>
  );
}
