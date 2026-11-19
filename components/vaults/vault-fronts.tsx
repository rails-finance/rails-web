// The vault fronts table (rails-ops ui-jobs 774; anatomy E5): one group per
// front, anchored by its slug. From md a table, below md a card per row.
// Every row cites the front's page with the day read (E5.2), a receipt apart
// from <Prov>: the rows quote published pages.

import Link from "next/link";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
} from "@/components/shared/data-table/data-table";
import { FrontCopy } from "@/components/vaults/front-copy";
import { formatDate } from "@/lib/date";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import type { FrontRow } from "@/lib/vaults/fronts-read";
import type { FrontSource } from "@/lib/vaults/fronts";
import { FRONT_POSITION, FRONT_SOURCE, FRONT_VAULT, FRONTS_PAGE } from "@/lib/vaults/fronts-words";

const C = FRONTS_PAGE.columns;
const MUTED = "text-xs text-rb-500";

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** E5.2: the host, the day read, and "curator's page" where it is one. */
function SourceReceipt({ source }: { source: FrontSource }) {
  return (
    <span
      className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 rounded-sm border border-dashed border-rb-300 px-1.5 py-0.5 text-xs dark:border-rb-600"
      data-anatomy="E5.2"
      data-front-source={source.kind}
    >
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.url}
        className={`break-all ${INLINE_LINK}`}
      >
        {host(source.url)}
      </a>
      <span className="text-rb-500">
        {FRONT_SOURCE.read(formatDate(source.readOn))}
        {source.kind === "curator" && `, ${FRONT_SOURCE.curator}`}
      </span>
    </span>
  );
}

function Sources({ row }: { row: FrontRow }) {
  return (
    <span className="flex flex-col items-start gap-1">
      {row.sources.map((s) => (
        <SourceReceipt key={s.url} source={s} />
      ))}
    </span>
  );
}

function Product({ row }: { row: FrontRow }) {
  return (
    <>
      <span className="block text-foreground">{row.product}</span>
      {row.limits && (
        <span className={`mt-0.5 block ${MUTED}`} data-front-limits="">
          “{row.limits}”
        </span>
      )}
    </>
  );
}

function Vault({ row }: { row: FrontRow }) {
  const { read } = row;
  return (
    <span className="block" data-front-vault={row.vault?.toLowerCase() ?? ""} data-front-read={read.kind}>
      {row.vault ? (
        <span className="inline-flex items-center gap-1.5">
          {read.kind === "read" ? (
            <Link href={read.href} title={row.vault} className={`font-mono ${INLINE_LINK}`} prefetch={false}>
              {shortAddress(row.vault)}
            </Link>
          ) : (
            <span title={row.vault} className="font-mono text-foreground">
              {shortAddress(row.vault)}
            </span>
          )}
          <FrontCopy value={row.vault} />
        </span>
      ) : (
        <span className="text-rb-500">{FRONT_VAULT.noAddress}</span>
      )}
      {row.vault && row.vaultNamedBy === "curator" && (
        <span className={`block ${MUTED}`}>{FRONT_VAULT.namedByCurator}</span>
      )}
      {read.kind !== "read" && (
        <span className={`block ${MUTED}`}>
          {read.kind === "not-read"
            ? FRONT_VAULT.notRead
            : read.kind === "family-not-read"
              ? FRONT_VAULT.familyNotRead(read.family)
              : FRONT_VAULT.unnamed}
        </span>
      )}
    </span>
  );
}

function Family({ row }: { row: FrontRow }) {
  return (
    <>
      <span className="block text-foreground">{row.family}</span>
      {row.familyBasis && <span className={`mt-0.5 block ${MUTED}`}>{row.familyBasis}</span>}
    </>
  );
}

function Position({ row }: { row: FrontRow }) {
  return (
    <>
      <span className="block text-foreground">{FRONT_POSITION[row.positionSits]}</span>
      {row.positionQuote && <span className={`mt-0.5 block ${MUTED}`}>“{row.positionQuote}”</span>}
    </>
  );
}

/** One front's rows: the table from md. */
function FrontTable({ front, rows }: { front: string; rows: FrontRow[] }) {
  return (
    <DataTable
      caption={FRONTS_PAGE.caption(front)}
      className="hidden md:block"
      tableClassName="table-fixed text-sm"
      data-front-layout="table"
    >
      <DataTableHead>
        <DataTableHeader label={C.product} className="w-[23%]" />
        <DataTableHeader label={C.chain} className="w-[10%]" />
        <DataTableHeader label={C.family} className="w-[13%]" />
        <DataTableHeader label={C.vault} className="w-[16%]" />
        <DataTableHeader label={C.position} className="w-[20%]" />
        <DataTableHeader label={C.source} className="w-[18%]" />
      </DataTableHead>
      <DataTableBody>
        {rows.map((r) => (
          <tr key={r.product} data-anatomy="E5.1" data-front-row={r.slug}>
            <DataTableCell rowHeader>
              <Product row={r} />
            </DataTableCell>
            <DataTableCell className={r.chainId == null ? "text-rb-500" : "text-foreground"}>
              {r.chainLabel}
            </DataTableCell>
            <DataTableCell>
              <Family row={r} />
            </DataTableCell>
            <DataTableCell>
              <Vault row={r} />
            </DataTableCell>
            <DataTableCell>
              <Position row={r} />
            </DataTableCell>
            <DataTableCell>
              <Sources row={r} />
            </DataTableCell>
          </tr>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

/** Below md: a card per row, every column named. */
function FrontCards({ rows }: { rows: FrontRow[] }) {
  const line = (label: string, body: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 py-1">
      <dt className={MUTED}>{label}</dt>
      <dd className="min-w-0 text-sm">{body}</dd>
    </div>
  );
  return (
    <ul className="flex flex-col gap-3 md:hidden" data-front-layout="cards">
      {rows.map((r) => (
        <li
          key={r.product}
          className="rounded-xl border border-rb-300 px-4 py-3 dark:border-rb-700"
          data-anatomy="E5.1"
          data-front-row={r.slug}
        >
          <dl>
            {line(C.product, <Product row={r} />)}
            {line(C.chain, <span className={r.chainId == null ? "text-rb-500" : ""}>{r.chainLabel}</span>)}
            {line(C.family, <Family row={r} />)}
            {line(C.vault, <Vault row={r} />)}
            {line(C.position, <Position row={r} />)}
            {line(C.source, <Sources row={r} />)}
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function VaultFronts({ rows }: { rows: FrontRow[] }) {
  const groups = new Map<string, FrontRow[]>();
  for (const r of rows) groups.set(r.slug, [...(groups.get(r.slug) ?? []), r]);
  return (
    <div className="flex flex-col gap-8">
      {[...groups].map(([slug, group]) => (
        <section key={slug} id={slug} className="scroll-mt-20" data-front-group={slug} aria-labelledby={`${slug}-h`}>
          <h2 id={`${slug}-h`} className="mb-2 text-lg font-semibold text-foreground">
            {group[0].front}
          </h2>
          <FrontTable front={group[0].front} rows={group} />
          <FrontCards rows={group} />
        </section>
      ))}
    </div>
  );
}
