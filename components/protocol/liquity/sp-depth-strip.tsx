"use client";

// The Stability Pool's depth per branch beside the debt it backs (ui-jobs
// 748), on the Stability Pool roster and the branches page: each branch
// pool's BOLD, the branch debt and their ratio at one stated block, every
// figure with its receipt (lib/liquity-v2/sp-depth.ts). Drawn on the house
// table (components/shared/data-table/, ui-jobs 539) across the content
// width: the branch column pinned below sm, the figures sortable, the "All"
// row last whatever the sort. A read that failed draws one line saying so.

import { useState } from "react";
import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  type DataTableDir,
} from "@/components/shared/data-table/data-table";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import {
  boldUnits,
  poolShare,
  spBranchDebtProv,
  spDepositsProv,
  spDepthTotal,
  spShareProv,
  spTotalProv,
  spTotalShareProv,
  type SpDepth,
} from "@/lib/liquity-v2/sp-depth";

type Key = "deposits" | "debt" | "share";

const pct = (v: number) => `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
const PIN = "max-sm:sticky max-sm:left-0";
const DASH = <span className="text-rb-500">&ndash;</span>;

function Bold({ value, info }: { value: number | null; info: Provenance }) {
  if (value == null) return DASH;
  return (
    <Prov info={info} value={String(value)} symbol="BOLD">
      <AmountText value={value} format="compact" symbol="BOLD" /> <span className="text-rb-500">BOLD</span>
    </Prov>
  );
}

function Share({ value, info }: { value: number | null; info: Provenance }) {
  if (value == null) return DASH;
  return (
    <Prov info={info} value={pct(value)}>
      {pct(value)}
    </Prov>
  );
}

export function SpDepthStrip({ depth, className = "" }: { depth: SpDepth | null; className?: string }) {
  const [sort, setSort] = useState<{ key: Key; dir: DataTableDir } | null>(null);
  // The table's own receipts scope: neither page's other scopes reach it.
  const registry = useReceiptRegistry();
  if (!depth) {
    return (
      <p className={`text-xs text-rb-500 ${className}`} data-sp-depth="failed" data-anatomy="M6.2">
        The Stability Pool read failed.
      </p>
    );
  }
  const block = depth.blockNumber;
  const rows = depth.branches.map((b) => ({
    b,
    deposits: boldUnits(b.depositsRaw),
    debt: boldUnits(b.debtRaw),
    share: poolShare(b.depositsRaw, b.debtRaw),
  }));
  if (sort) {
    const sign = sort.dir === "asc" ? 1 : -1;
    // A missing figure sorts last either way.
    rows.sort((x, y) => {
      const a = x[sort.key];
      const c = y[sort.key];
      return a == null ? 1 : c == null ? -1 : sign * (a - c);
    });
  }
  const totalDeposits = spDepthTotal(depth, (b) => b.depositsRaw);
  const totalDebt = spDepthTotal(depth, (b) => b.debtRaw);
  const totalShare = totalDeposits != null && totalDebt != null && totalDebt > 0 ? totalDeposits / totalDebt : null;
  const header = (key: Key, label: string) => ({
    dir: sort?.key === key ? sort.dir : null,
    onSort: () =>
      setSort((s) => (s?.key === key ? (s.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" })),
    ariaLabel: `Sort by ${label}`,
  });
  return (
    <ProvReceiptsScope registry={registry}>
      <section className={`w-full ${className}`} data-sp-depth={block} data-anatomy="M6.2">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-sm font-semibold text-foreground">Stability Pool depth</h2>
          <p className="text-xs text-rb-500">
            At <BlockRef block={block} chainId={MAINNET_CHAIN_ID} />
          </p>
        </div>
        <DataTable
          label="Stability Pool depth per branch"
          rowHeight="one"
          tableClassName="text-sm tabular-nums min-w-[520px]"
        >
          <DataTableHead>
            <DataTableHeader label="Branch" sticky={PIN} />
            <DataTableHeader label="In the pool" align="right" sort={header("deposits", "BOLD in the pool")} />
            <DataTableHeader label="Branch debt" align="right" sort={header("debt", "branch debt")} />
            <DataTableHeader label="Pool ÷ debt" align="right" sort={header("share", "pool ÷ debt")} />
          </DataTableHead>
          <DataTableBody>
            {rows.map(({ b, deposits, debt, share }) => (
              <DataTableRow key={b.symbol} data-sp-depth-branch={b.symbol}>
                <DataTableCell rowHeader sticky={PIN} className="whitespace-nowrap font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <TokenChipIcon
                      symbol={b.symbol}
                      address={LIQUITY_V2_BRANCHES[b.symbol.toLowerCase()]?.collateralAddr}
                      size={20}
                      filterable={false}
                    />
                    {b.symbol}
                  </span>
                </DataTableCell>
                <DataTableCell align="right" className="whitespace-nowrap">
                  <Bold value={deposits} info={spDepositsProv(b, block)} />
                </DataTableCell>
                <DataTableCell align="right" className="whitespace-nowrap">
                  <Bold value={debt} info={spBranchDebtProv(b, block)} />
                </DataTableCell>
                <DataTableCell align="right" className="whitespace-nowrap">
                  <Share value={share} info={spShareProv(b, block)} />
                </DataTableCell>
              </DataTableRow>
            ))}
            <DataTableRow data-sp-depth-branch="all">
              <DataTableCell rowHeader sticky={PIN} className="whitespace-nowrap font-semibold text-foreground">
                All
              </DataTableCell>
              <DataTableCell align="right" className="whitespace-nowrap font-semibold">
                <Bold value={totalDeposits} info={spTotalProv("deposits", block)} />
              </DataTableCell>
              <DataTableCell align="right" className="whitespace-nowrap font-semibold">
                <Bold value={totalDebt} info={spTotalProv("debt", block)} />
              </DataTableCell>
              <DataTableCell align="right" className="whitespace-nowrap font-semibold">
                <Share value={totalShare} info={spTotalShareProv(block)} />
              </DataTableCell>
            </DataTableRow>
          </DataTableBody>
        </DataTable>
      </section>
    </ProvReceiptsScope>
  );
}
