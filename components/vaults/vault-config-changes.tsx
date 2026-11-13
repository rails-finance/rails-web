"use client";

// A MetaMorpho vault's configuration changes of the last 30 days (V9.1;
// rails-ops ui-jobs 554, point 1), inside "What protects it" under its line:
// the count and the latest change in one line, the rest in a small table
// behind "Show the <n> changes", newest first (date, the change in words, the
// block linking the transaction's logs). Read and worded on the server by
// lib/vaults/config-changes-read.ts; each value carries its receipt.

import { useState } from "react";
import { Prov } from "@/components/shared/provenance";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import type { ConfigChangesView } from "@/lib/vaults/config-changes-read";

const n = (v: number) => v.toLocaleString("en-US");

export function VaultConfigChanges({ view }: { view: ConfigChangesView }) {
  const [open, setOpen] = useState(false);
  if (view.kind === "unread")
    return (
      <p className="mt-2 text-[13px] leading-snug text-rb-500" data-anatomy="V9.1" data-protects-changes="unread">
        Recent configuration changes are not shown: Rails&rsquo;s record of them did not answer.
      </p>
    );

  const { count, rows, scope } = view;
  const scoped = scope.kind === "scoped";
  // Where the record starts after the window or stops short of the page's block, the line names its reach.
  const reach = (
    <>
      from {scope.from} through block {n(scope.through)}, where Rails&rsquo;s record stops.
    </>
  );
  if (count === 0)
    return (
      <p
        className="mt-2 text-[13px] leading-snug text-rb-500"
        data-anatomy="V9.1"
        data-protects-changes="0"
        data-changes-scoped={scoped ? "" : undefined}
      >
        {scoped ? (
          <span className="font-semibold text-foreground">
            <Prov info={view.countProv}>None</Prov> {reach}
          </span>
        ) : (
          <>
            <span className="font-semibold text-foreground">
              <Prov info={view.countProv}>No configuration change</Prov> in the last 30 days.
            </span>{" "}
            Logs read through block {n(scope.through)}.
          </>
        )}
      </p>
    );

  const latest = rows[0];
  return (
    <div
      className="mt-2"
      data-anatomy="V9.1"
      data-protects-changes={count}
      data-changes-scoped={scoped ? "" : undefined}
    >
      <p className="text-[13px] leading-snug text-rb-500">
        <span className="font-semibold text-foreground">
          <Prov info={view.countProv}>{n(count)}</Prov> configuration change{count === 1 ? "" : "s"}{" "}
          {scoped ? reach : "in the last 30 days."}
        </span>{" "}
        {count === 1 ? "On" : "The latest, on"} <Prov info={latest.dateProv}>{latest.date}</Prov>:{" "}
        <span data-change-latest={latest.event}>
          <Prov info={latest.textProv}>{latest.text}</Prov>
        </span>
        .
      </p>
      {count > 1 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`mt-1 inline-block text-[13px] ${INLINE_LINK}`}
          data-protects-changes-open=""
        >
          Show the {n(count)} changes
        </button>
      )}
      {count > 1 && open && (
        <div className="mt-2">
          <DataTable label="Configuration changes in the last 30 days" tableClassName="text-[13px]" stacked>
            <DataTableHead>
              <DataTableHeader label="Date" />
              <DataTableHeader label="Change" />
              <DataTableHeader label="Block" align="right" />
            </DataTableHead>
            <DataTableBody>
              {rows.map((r) => (
                <DataTableRow
                  key={r.key}
                  data-config-change={r.key}
                  data-change-event={r.event}
                  data-change-waiting={r.waiting ? "" : undefined}
                >
                  <DataTableCell rowHeader valign="top" className="whitespace-nowrap">
                    <Prov info={r.dateProv}>
                      <span className="text-foreground">{r.date}</span>
                    </Prov>
                  </DataTableCell>
                  <DataTableCell label="Change" valign="top" className="text-foreground">
                    <Prov info={r.textProv}>{r.text}</Prov>
                  </DataTableCell>
                  <DataTableCell label="Block" align="right" valign="top" className="whitespace-nowrap tabular-nums">
                    <a
                      href={r.txHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={INLINE_LINK}
                      title="The transaction's logs"
                    >
                      {n(r.block)}
                    </a>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </div>
      )}
    </div>
  );
}
