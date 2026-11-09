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

import { useState } from "react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { Prov } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";
import { configChangeProv } from "@/lib/shared/aave-reserve-reads-provenance";
import type { ReserveChange } from "@/lib/shared/aave-reserve-config-words";

const CHANGES_SHOWN = 20;
const NOTE = "text-[12px] text-rb-500";

export function ReserveChangeLog({
  changes,
  chainId,
  held,
  automatorNote,
  configurator,
}: {
  changes: ReserveChange[];
  chainId: ChainId;
  held: string;
  automatorNote: boolean;
  /** The PoolConfigurator the route read. */
  configurator: string;
}) {
  const explorer = chainMeta(chainId).explorerName;
  const [all, setAll] = useState(false);
  const shown = all ? changes : changes.slice(0, CHANGES_SHOWN);
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
              <DataTableHeader label="Change" />
            </DataTableHead>
            <DataTableBody>
              {shown.map(({ row, words }) => (
                <DataTableRow
                  key={`${row.block}:${row.txIndex}:${row.logIndex}:${row.kind}`}
                  data-change-row=""
                  data-change-kind={row.kind}
                  data-change-block={row.block}
                >
                  <DataTableCell rowHeader className="whitespace-nowrap tabular-nums">
                    <Prov
                      info={configChangeProv(row, words, configurator, {
                        block: explorerUrl(chainId, "block", row.block),
                        tx: explorerUrl(chainId, "tx", row.txHash),
                        name: explorer,
                      })}
                    >
                      {formatDate(row.timestamp)}
                    </Prov>
                  </DataTableCell>
                  <DataTableCell label="Change" wide data-change-words="">
                    {words}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
          {changes.length > CHANGES_SHOWN && (
            <button
              type="button"
              onClick={() => setAll((a) => !a)}
              className={`mt-2 text-[12px] ${INPLACE_TEXT}`}
              data-change-log-more=""
            >
              {all ? `Show the latest ${CHANGES_SHOWN}` : `Show all ${changes.length} changes`}
            </button>
          )}
        </>
      )}
    </>
  );
}
