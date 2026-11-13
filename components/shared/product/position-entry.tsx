"use client";

// The way into the positions (archetype A6, rails-ops ui-jobs 549): the
// "View all <N> <market> <positions> →" link at the foot of a head, and the
// largest holders on one side of a reserve (anatomy M3.7, M3.8): rank, the
// account (its facehash and ENS name or short address) and the amount in the
// token with its mark, each row a D4 linked row to the position; under it the
// refresh time and the accounts left out.

import type { ReactNode } from "react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableRowLink,
} from "@/components/shared/data-table/data-table";
import { AssetUnit } from "@/components/shared/asset-unit";
import { HeadingTip } from "@/components/shared/tip-label";
import { Facehash } from "@/components/shared/facehash";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { formatAgeShort } from "@/lib/date";
import type { EntryLink, Noun } from "@/lib/shared/product/model";

const NOTE = "text-[12px] text-rb-500";

/** "View all Aave V3 Core positions →": the listing filtered to this object;
 *  null where the explorer has no listing. */
export function positionEntry({
  href,
  name,
  noun,
  count,
}: {
  href: string | null;
  /** The object's name: "Aave V3 Core". */
  name: string;
  noun: Noun;
  /** How many, where the family can count them. */
  count?: number;
}): EntryLink | null {
  if (!href) return null;
  const n = count != null ? `${count.toLocaleString("en-US")} ` : "";
  return { label: `View all ${n}${name} ${count === 1 ? noun.one : noun.many}`, href };
}

/** One holder: the position it opens, and its amount drawn with its receipt. */
export interface HolderRow {
  wallet: string;
  rank: number;
  href: string;
  amount: ReactNode;
  /** The amount over the reserve's total on its side, with its receipt. */
  share?: ReactNode;
  hooks?: Record<`data-${string}`, string>;
}

/** A position's account cell: its facehash and ENS name or short address, the row's one link. */
export function Account({ wallet, href }: { wallet: string; href: string }) {
  const ens = useEnsName(wallet);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Facehash address={wallet} size={20} />
      <DataTableRowLink href={href} className="min-w-0 truncate font-mono text-[13px]" title={wallet}>
        {ens ?? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`}
      </DataTableRowLink>
    </span>
  );
}

export function HoldersTable({
  side,
  rows,
  amountLabel,
  unit,
  refreshedAt,
  leftOut,
  shareTip,
}: {
  side: "suppliers" | "borrowers";
  rows: HolderRow[];
  /** The amount column's heading: "Supplied". */
  amountLabel: string;
  /** The token the amounts are in. */
  unit: { symbol: string; address: string };
  refreshedAt: string | null;
  /** Protocol accounts the ranking leaves out (decision 0024). */
  leftOut: number;
  /** The Share column's tip, naming its denominator; no column without it. */
  shareTip?: string;
}) {
  const age = refreshedAt ? formatAgeShort(refreshedAt, new Date()) : null;
  return (
    <>
      {rows.length === 0 ? (
        <p className={NOTE}>No {side} held for this reserve.</p>
      ) : (
        <DataTable
          label={`Largest ${side}`}
          rowHeight="one"
          tableClassName="text-[13px]"
          data-holders={side}
          data-holders-count={rows.length}
        >
          <DataTableHead>
            <DataTableHeader label="#" className="w-10" />
            <DataTableHeader label="Account" />
            <DataTableHeader label={amountLabel} align="right" />
            {shareTip && (
              <DataTableHeader align="right">
                <HeadingTip text="Share" tip={shareTip} />
              </DataTableHeader>
            )}
          </DataTableHead>
          <DataTableBody>
            {rows.map((x) => (
              <DataTableRow key={x.wallet} href={x.href} data-holder-row={x.wallet} data-holder-rank={x.rank}>
                <DataTableCell className="w-10 tabular-nums text-rb-500" data-prov-exempt="">
                  {x.rank}
                </DataTableCell>
                <DataTableCell rowHeader className="max-w-0 sm:max-w-none">
                  <Account wallet={x.wallet} href={x.href} />
                </DataTableCell>
                <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                  <span className="inline-flex items-center justify-end gap-1.5" {...x.hooks}>
                    {x.amount}
                    <AssetUnit symbol={unit.symbol} address={unit.address} />
                  </span>
                </DataTableCell>
                {shareTip && (
                  <DataTableCell align="right" className="whitespace-nowrap tabular-nums" data-holder-share="">
                    {x.share ?? <span data-prov-exempt="">—</span>}
                  </DataTableCell>
                )}
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      <p className={`${NOTE} mt-1.5`} data-holders-refreshed={refreshedAt ?? ""}>
        {age == null ? "Refresh time not stated" : age === "now" ? "Refreshed just now" : `Refreshed ${age} ago`}
        {leftOut > 0 && `. ${leftOut} protocol ${leftOut === 1 ? "account" : "accounts"} left out under decision 0024.`}
      </p>
    </>
  );
}
