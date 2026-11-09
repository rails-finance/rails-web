"use client";

// The reserve page's change log (anatomy M3.6, ui-jobs 541 and 549), on the
// house table (D): the reserve's configurator changes, newest first, unlinked
// rows of the date and the change in words
// (lib/shared/aave-reserve-config-words.ts); the date carries the receipt
// with the block and the transaction (decision 0059: no explorer link on the
// surface). The first CHANGES_SHOWN with a control for the rest; above it,
// where each kind's history starts (the route's `held`) and on SparkLend the
// line on its automatic cap steps. The largest holders (M3.7, M3.8) are the
// shared HoldersTable (components/shared/product/position-entry.tsx).
// Aave V4 (lib/aave-v4/reserve.tsx) reuses the log with a Set on column, its
// own receipt per row and its own page length; without those props the table
// is Aave V3's.

import { useState } from "react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";
import { configChangeProv } from "@/lib/shared/aave-reserve-reads-provenance";
import type { ReserveChange } from "@/lib/shared/aave-reserve-config-words";
import type { ConfigRow } from "@/lib/api/fetch-aave-reserve-reads";

const CHANGES_SHOWN = 20;
const NOTE = "text-[12px] text-rb-500";

/** A change with where it was set: the Set on column's words and its hook. */
type SidedChange = ReserveChange & { setOn?: string; side?: string };

export function ReserveChangeLog<C extends SidedChange>({
  changes,
  chainId,
  held,
  automatorNote,
  configurator,
  setOn = false,
  receipt,
  pageSize = CHANGES_SHOWN,
}: {
  changes: C[];
  chainId: ChainId;
  held: string;
  automatorNote: boolean;
  /** The PoolConfigurator the route read (Aave V3's receipt). */
  configurator?: string;
  /** Draw the Set on column from each change's `setOn`, hooked `data-change-side`. */
  setOn?: boolean;
  /** A row's receipt, where it is not the PoolConfigurator's. */
  receipt?: (c: C) => Provenance;
  /** The rows shown before the control for the rest. */
  pageSize?: number;
}) {
  const explorer = chainMeta(chainId).explorerName;
  const [all, setAll] = useState(false);
  const shown = all ? changes : changes.slice(0, pageSize);
  const v3Receipt = (row: ConfigRow, words: string) =>
    configChangeProv(row, words, configurator ?? "", {
      block: explorerUrl(chainId, "block", row.block),
      tx: explorerUrl(chainId, "tx", row.txHash),
      name: explorer,
    });
  return (
    <>
      {held && (
        <p className={`${NOTE} mb-1`} data-change-log-held="">
          {held}
        </p>
      )}
      {automatorNote && (
        <p className={`${NOTE} mb-1`} data-change-log-automator="">
          SparkLend raises and lowers its caps automatically in small steps, so the cap rows include those steps.
        </p>
      )}
      {changes.length === 0 ? (
        <p className={NOTE} data-change-log-empty="">
          No changes held for this reserve.
        </p>
      ) : (
        <>
          <DataTable label="Configuration changes, newest first" stacked tableClassName="text-[13px]">
            <DataTableHead>
              <DataTableHeader label="Date" />
              {setOn && <DataTableHeader label="Set on" />}
              <DataTableHeader label="Change" />
            </DataTableHead>
            <DataTableBody>
              {shown.map((c) => {
                const { row, words } = c;
                return (
                  <DataTableRow
                    key={`${row.block}:${row.txIndex}:${row.logIndex}:${row.kind}`}
                    data-change-row=""
                    data-change-kind={row.kind}
                    data-change-block={row.block}
                    {...(setOn ? { "data-change-side": c.side } : {})}
                  >
                    <DataTableCell rowHeader className="whitespace-nowrap tabular-nums">
                      <Prov info={receipt ? receipt(c) : v3Receipt(row, words)}>{formatDate(row.timestamp)}</Prov>
                    </DataTableCell>
                    {setOn && (
                      <DataTableCell label="Set on" className="whitespace-nowrap">
                        {c.setOn}
                      </DataTableCell>
                    )}
                    <DataTableCell label="Change" wide data-change-words="">
                      {words}
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
          {changes.length > pageSize && (
            <button
              type="button"
              onClick={() => setAll((a) => !a)}
              className={`mt-2 text-[12px] ${INPLACE_TEXT}`}
              data-change-log-more=""
            >
              {all ? `Show the latest ${pageSize}` : `Show all ${changes.length} changes`}
            </button>
          )}
        </>
      )}
    </>
  );
}
