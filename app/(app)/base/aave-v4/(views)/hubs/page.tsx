"use client";

// Aave V4 on Base — the Equities hub and its Mag7 spoke. The Ethereum
// explorer's sub-page compares four hubs side by side; Base has one, so this
// page states that hub's reserves as the spoke sees them: each reserve's price
// and when its feed published it, the risk parameters the spoke enforces, and
// the hub's caps and usage for the spoke. Present, don't rank: reserve order is
// the spoke's own reserve id, no score, no valence colour. On the house table
// (rails-ops ui-jobs 539: D1, D6 cards below sm), unsorted and unlinked; token
// amounts carry the reserve's mark (`AssetUnit`).

import { useEffect, useState } from "react";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { aaveV4Modal } from "@/lib/aave-v4/event-templates";
import { protocolForHref } from "@/lib/shared/protocols";
import { explorerUrl, BASE_CHAIN_ID } from "@/lib/shared/chains";
import { formatNumber } from "@/lib/utils/format";
import { publishedText, ageClauseText, ageText } from "@/lib/morpho/oracle-age";
import { AAVE_V4_BASE_API_ROOT } from "@/lib/aave-v4/deployment-routes";
import { BlockRef } from "@/components/shared/block-ref";
import { AssetUnit } from "@/components/shared/asset-unit";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";

const PROTOCOL = protocolForHref("/base/aave-v4")!;

interface Reserve {
  reserveId: number;
  underlying: string;
  symbol: string | null;
  decimals: number;
  collateralFactorBps: number | null;
  maxLiquidationBonusBps: number | null;
  liquidationFeeBps: number | null;
  paused: boolean;
  frozen: boolean;
  /** Coinbase's registry flag for the stock; null for USDC. */
  registryPaused: boolean | null;
  borrowable: boolean;
  addCap: string | null;
  drawCap: string | null;
  spokeActive: boolean | null;
  spokeHalted: boolean | null;
  addedRaw: string | null;
  owedRaw: string | null;
  drawnRateRay: string | null;
  priceRaw: string;
  priceDecimals: number;
  feed: string | null;
  feedUpdatedAt: number | null;
  blockNumber: number;
  blockTimestamp: number;
}
interface Spoke {
  spoke: string;
  name: string;
  hubName: string | null;
  address: string;
  targetHealthFactor: number;
  healthFactorForMaxBonus: number;
  liquidationBonusFactorBps: number;
  openPositions: number;
  positionsWithDebt: number;
}
interface ReservesResponse {
  spokes: Spoke[];
  reserves: Reserve[];
}

const HUB = "0xa4d5947eb727a052bae69c593ffc84247ec9864e";
const SPOKE = "0x17905db0e4a3514467539956c084180616ae7b8d";

function tokens(raw: string | null, decimals: number): number | null {
  if (raw == null) return null;
  const v = BigInt(raw);
  const d = BigInt(10) ** BigInt(decimals);
  return Number(v / d) + Number(v % d) / Number(d);
}
const pct = (bps: number | null) => (bps == null ? "—" : `${(bps / 100).toFixed(2)}%`);
const NUM = "whitespace-nowrap tabular-nums text-foreground";
const usd = (n: number | null) => (n == null ? "—" : `$${formatNumber(n)}`);

// The spoke's state first, then Coinbase's registry pause beside it: the
// spoke does not read the registry, so a stock paused there alone stays
// open on the spoke at a held price, and both are stated.
function spokeWords(r: Reserve): string {
  if (r.paused) return "Paused";
  if (r.frozen) return "Frozen";
  if (r.spokeHalted) return "Halted by the hub";
  if (r.spokeActive === false) return "Inactive on the hub";
  return r.borrowable ? "Borrowable" : "Collateral only";
}
function statusWords(r: Reserve): string {
  const spoke = spokeWords(r);
  return r.registryPaused ? `${spoke}; price paused by Coinbase` : spoke;
}

export default function AaveV4BaseHubPage() {
  const [data, setData] = useState<ReservesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${AAVE_V4_BASE_API_ROOT}/reserves`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ReservesResponse>) : Promise.reject(new Error(`${r.status}`))))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      cancelled = true;
    };
  }, []);

  const block = data?.reserves[0]?.blockNumber ?? null;
  const readTs = data?.reserves[0]?.blockTimestamp ?? null;
  const spoke = data?.spokes[0] ?? null;

  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader
          protocol={PROTOCOL}
          title="Equities hub"
          learnMore={aaveV4Modal("base_hub")}
          stamp={
            block != null && (
              <p className="mt-2 text-[11px] text-rb-500">
                Read from the Mag7 spoke, its oracle and the hub at <BlockRef block={block} chainId={BASE_CHAIN_ID} />
              </p>
            )
          }
        />
        {error ? (
          <div className="py-12 text-center text-rb-500">
            <p className="mb-1">Couldn&apos;t load the hub&apos;s reserves.</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-rb-500 text-sm">Reading the spoke…</div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl bg-raised px-5 py-4 text-sm text-rb-500 space-y-1.5">
              <p>
                <span className="text-foreground font-semibold">Mag7 spoke</span>{" "}
                <a
                  href={explorerUrl(BASE_CHAIN_ID, "address", SPOKE)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  {SPOKE.slice(0, 6)}…{SPOKE.slice(-4)}
                </a>{" "}
                on the Equities hub{" "}
                <a
                  href={explorerUrl(BASE_CHAIN_ID, "address", HUB)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external"
                >
                  {HUB.slice(0, 6)}…{HUB.slice(-4)}
                </a>
                .
              </p>
              {spoke && (
                <p>
                  A liquidation aims to restore a health factor of{" "}
                  <span className="text-foreground tabular-nums">{spoke.targetHealthFactor.toFixed(2)}</span>; the bonus
                  reaches its maximum at a health factor of{" "}
                  <span className="text-foreground tabular-nums">{spoke.healthFactorForMaxBonus.toFixed(2)}</span>, and
                  starts at <span className="text-foreground tabular-nums">{pct(spoke.liquidationBonusFactorBps)}</span>{" "}
                  of it.{" "}
                  {spoke.openPositions > 0 && (
                    <>
                      <span className="text-foreground tabular-nums">{spoke.openPositions}</span> accounts hold a
                      balance, <span className="text-foreground tabular-nums">{spoke.positionsWithDebt}</span> of them
                      with debt.
                    </>
                  )}
                </p>
              )}
            </div>
            <DataTable
              label="The Mag7 spoke's reserves"
              stacked
              rowHeight="two"
              tableClassName="text-[13px] sm:min-w-[900px]"
              data-skel-section="page-table"
            >
              <DataTableHead>
                <DataTableHeader label="Reserve" />
                <DataTableHeader label="Price" align="right" />
                <DataTableHeader label="Published" />
                <DataTableHeader label="Collateral factor" align="right" />
                <DataTableHeader label="Max bonus" align="right" />
                <DataTableHeader label="Supplied / cap" align="right" />
                <DataTableHeader label="Supplied value" align="right" />
                <DataTableHeader label="Borrowed / credit line" align="right" />
                <DataTableHeader label="Status" />
              </DataTableHead>
              <DataTableBody>
                {data.reserves.map((r) => {
                  const price = Number(r.priceRaw) / 10 ** r.priceDecimals;
                  const added = tokens(r.addedRaw, r.decimals);
                  const owed = tokens(r.owedRaw, r.decimals);
                  const unit = <AssetUnit symbol={r.symbol ?? "???"} address={r.underlying} named={r.symbol != null} />;
                  return (
                    <DataTableRow key={r.reserveId}>
                      <DataTableCell rowHeader className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-2 text-foreground">
                          <TokenChipIcon
                            symbol={r.symbol ?? "???"}
                            address={r.underlying}
                            size={18}
                            filterable={false}
                          />
                          {r.symbol ?? "???"}
                        </span>
                      </DataTableCell>
                      <DataTableCell label="Price" align="right" className={NUM}>
                        ${formatNumber(price)}
                      </DataTableCell>
                      {/* The date over its age; the stamp names the read's block,
                          and the full clause is the cell's title. */}
                      <DataTableCell
                        label="Published"
                        wide
                        className="whitespace-nowrap"
                        title={
                          r.feedUpdatedAt != null && readTs != null
                            ? `${publishedText(r.feedUpdatedAt, readTs)} ${ageClauseText(r.feedUpdatedAt, readTs, r.blockNumber)}`
                            : undefined
                        }
                      >
                        {r.feedUpdatedAt != null && readTs != null ? (
                          <>
                            <span className="block text-foreground">{publishedText(r.feedUpdatedAt, readTs)}</span>
                            <span className="block text-[11px] text-rb-500">
                              {ageText(readTs - r.feedUpdatedAt)} before the read
                            </span>
                          </>
                        ) : (
                          <span className="text-rb-500">—</span>
                        )}
                      </DataTableCell>
                      <DataTableCell label="Collateral factor" align="right" className={NUM}>
                        {r.collateralFactorBps ? pct(r.collateralFactorBps) : "—"}
                      </DataTableCell>
                      <DataTableCell label="Max bonus" align="right" className={NUM}>
                        {r.collateralFactorBps && r.maxLiquidationBonusBps != null
                          ? pct(r.maxLiquidationBonusBps - 10_000)
                          : "—"}
                      </DataTableCell>
                      <DataTableCell label="Supplied / cap" align="right" className={NUM}>
                        <span className="inline-flex items-center gap-1.5">
                          {added == null ? "—" : formatNumber(added)} /{" "}
                          {r.addCap ? formatNumber(Number(r.addCap)) : "—"}
                          {unit}
                        </span>
                      </DataTableCell>
                      <DataTableCell label="Supplied value" align="right" className={NUM}>
                        {usd(added == null ? null : added * price)}
                      </DataTableCell>
                      <DataTableCell label="Borrowed / credit line" align="right" className={NUM}>
                        {r.borrowable ? (
                          <span className="inline-flex items-center gap-1.5">
                            {owed == null ? "—" : formatNumber(owed)} /{" "}
                            {r.drawCap ? formatNumber(Number(r.drawCap)) : "—"}
                            {unit}
                          </span>
                        ) : (
                          <span className="text-rb-500">Not borrowable</span>
                        )}
                      </DataTableCell>
                      <DataTableCell label="Status" className="text-rb-500">
                        {statusWords(r)}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
            <p className="text-xs text-rb-500 max-w-prose">
              Prices are the spoke oracle&apos;s getReservePrice; &ldquo;Published&rdquo; is the updatedAt of the
              Chainlink round behind it, read with latestRoundData at the same block. Caps are whole tokens, set by the
              hub for this spoke. Borrowed is what the spoke owes the hub, interest included.
            </p>
          </div>
        )}
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
