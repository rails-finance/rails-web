"use client";

// The reserve page's two indexed tables (ui-jobs 541), on the house table (D):
//   M3.6 the change log: the reserve's configurator changes, newest first,
//        unlinked rows of the date over its block, the change in words
//        (lib/shared/aave-reserve-config-words.ts) and the transaction, the
//        explorer links muted; the first CHANGES_SHOWN with a control for the
//        rest; above it, where each kind's history starts (the route's `held`)
//        and on SparkLend the CapAutomator's share of the cap rows.
//   M3.7 / M3.8 the largest suppliers and borrowers: rank, the account (its
//        facehash and ENS name or short address) and the amount in the token
//        with its mark, each row a D4 linked row to the position; under it the
//        view's refresh time and the accounts decision 0024 left out.

import { useState } from "react";
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
import { Facehash } from "@/components/shared/facehash";
import { Prov } from "@/components/shared/provenance";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { formatAgeShort, formatDate } from "@/lib/date";
import { formatCompactTitled } from "@/lib/shared/format-compact";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";
import { holderAmountProv } from "@/lib/shared/aave-reserve-reads-provenance";
import type { ReserveChange } from "@/lib/shared/aave-reserve-config-words";
import type { Holder, ReserveHolders } from "@/lib/api/fetch-aave-reserve-reads";

const CHANGES_SHOWN = 20;
const NOTE = "text-[12px] text-rb-500";

export function ReserveChangeLog({
  changes,
  chainId,
  held,
  automatorNote,
}: {
  changes: ReserveChange[];
  chainId: ChainId;
  held: string;
  automatorNote: boolean;
}) {
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
          SparkLend&apos;s CapAutomator moves the caps through the configurator, so the cap rows include its steps.
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
              <DataTableHeader label="Date and block" />
              <DataTableHeader label="Change" />
              <DataTableHeader label="Transaction" />
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
                    <span className="block">{formatDate(row.timestamp)}</span>
                    <a
                      href={explorerUrl(chainId, "block", row.block)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-muted text-[12px]"
                      data-prov-exempt=""
                      data-change-block-link=""
                    >
                      block {row.block.toLocaleString("en-US")}
                    </a>
                  </DataTableCell>
                  <DataTableCell label="Change" wide data-change-words="">
                    {words}
                  </DataTableCell>
                  <DataTableCell label="Transaction">
                    <a
                      href={explorerUrl(chainId, "tx", row.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-muted font-mono text-[12px]"
                    >
                      {row.txHash.slice(0, 10)}…
                    </a>
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

function Account({ wallet, href }: { wallet: string; href: string }) {
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

export function ReserveHoldersTable({
  side,
  h,
  symbol,
  address,
  decimals,
}: {
  side: "suppliers" | "borrowers";
  h: ReserveHolders;
  symbol: string;
  address: string;
  decimals: number;
}) {
  const rows: Holder[] = h[side];
  const leftOut = h.leftOut?.[side]?.length ?? 0;
  const age = h.refreshedAt ? formatAgeShort(h.refreshedAt, new Date()) : null;
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
            <DataTableHeader label={side === "suppliers" ? "Supplied" : "Borrowed"} align="right" />
          </DataTableHead>
          <DataTableBody>
            {rows.map((x) => {
              const tokens = Number(x.amount) / 10 ** decimals;
              const t = formatCompactTitled(tokens);
              return (
                <DataTableRow key={x.wallet} href={x.positionPath} data-holder-row={x.wallet} data-holder-rank={x.rank}>
                  <DataTableCell className="w-10 tabular-nums text-rb-500" data-prov-exempt="">
                    {x.rank}
                  </DataTableCell>
                  <DataTableCell rowHeader className="max-w-0 sm:max-w-none">
                    <Account wallet={x.wallet} href={x.positionPath} />
                  </DataTableCell>
                  <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1.5" data-holder-amount={x.amount}>
                      <Prov
                        info={holderAmountProv(
                          side === "suppliers" ? "supplied" : "borrowed",
                          symbol,
                          decimals,
                          x.wallet,
                          x.amount,
                          h,
                        )}
                      >
                        <span title={t.title}>{t.display}</span>
                      </Prov>
                      <AssetUnit symbol={symbol} address={address} />
                    </span>
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}
      <p className={`${NOTE} mt-1.5`} data-holders-refreshed={h.refreshedAt ?? ""}>
        {age == null ? "Refresh time not stated" : age === "now" ? "Refreshed just now" : `Refreshed ${age} ago`}
        {leftOut > 0 && `. ${leftOut} protocol ${leftOut === 1 ? "account" : "accounts"} left out under decision 0024.`}
      </p>
    </>
  );
}
