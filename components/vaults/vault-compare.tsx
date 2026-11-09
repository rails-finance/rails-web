"use client";

// The vault comparison (E1; rails-ops ui-jobs 553, door 3): a column per
// chosen vault, its name linking the vault's page under its protocol, then
// the readout's five lines, Fees, Where the money is lent and Who holds it.
// "Sort by" orders the columns only (teal presses, color-grammar.md §4c); the
// sort lives in `?sort=`, written only off its default. Below md each row
// stands alone with the chosen vaults listed beneath it, so the page never
// scrolls sideways. The read is lib/vaults/compare-read.ts; every word is
// lib/vaults/compare-words.ts's or lib/vaults/health-words.ts's.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { VaultLead } from "@/components/vaults/vault-heads";
import { HolderDonut } from "@/components/vaults/holder-donut";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { COMPARE_SORTS, mixedAssets, sortColumns, type CompareSort } from "@/lib/vaults/compare";
import { COMPARE_PAGE, EXPOSURE_WORDS, type CompareCell } from "@/lib/vaults/compare-words";
import { flooredPct, type HealthLine } from "@/lib/vaults/health-words";
import type { CompareColumn, CompareExposure, CompareHolders } from "@/lib/vaults/compare-read";

const MUTED = "text-rb-500";
const TEAL_PRESS =
  "text-teal-600 hover:underline dark:text-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:focus-visible:ring-teal-400 rounded";
const DEFAULT_SORT: CompareSort = "size";

/** A share as a place's figure: under 0.1% but above none reads "<0.1%". */
const placeShare = (x: number) => (x > 0 && x < 0.001 ? "<0.1%" : flooredPct(x));

type RowKey = HealthLine["key"] | "fees" | "exposure" | "holders";

interface Row {
  key: RowKey;
  label: string;
  cell: (c: CompareColumn) => ReactNode;
}

function Cell({ c }: { c: CompareCell | HealthLine }) {
  return (
    <div className="space-y-0.5">
      {c.headline && <div className="font-semibold text-foreground">{c.headline}</div>}
      {c.sentence && <div className={c.read ? "text-rb-600 dark:text-rb-300" : MUTED}>{c.sentence}</div>}
    </div>
  );
}

function Exposure({ e }: { e: CompareExposure }) {
  if (e.kind === "cell") return <Cell c={e.cell} />;
  return (
    <ul className="space-y-1.5">
      {e.rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words text-foreground">{r.label}</span>
            {r.share != null && <span className="shrink-0 text-foreground tabular-nums">{placeShare(r.share)}</span>}
          </div>
          {r.sub && <div className={`text-xs break-words ${MUTED}`}>{r.sub}</div>}
        </li>
      ))}
      {e.more > 0 && <li className={`text-xs ${MUTED}`}>{EXPOSURE_WORDS.more(e.more)}</li>}
    </ul>
  );
}

function Holders({ h }: { h: CompareHolders }) {
  if (h.kind === "none") return <div className={MUTED}>{h.why}</div>;
  return <HolderDonut top={h.top} live={h.live} />;
}

const ROWS: readonly Row[] = [
  ...(["size", "yield", "withdrawals", "losses", "steward"] as const).map(
    (k, i): Row => ({
      key: k,
      label: "",
      cell: (c) => <Cell c={c.lines.find((l) => l.key === k) ?? c.lines[i]} />,
    }),
  ),
  { key: "fees", label: COMPARE_PAGE.fees, cell: (c) => <Cell c={c.fees} /> },
  { key: "exposure", label: COMPARE_PAGE.exposure, cell: (c) => <Exposure e={c.exposure} /> },
  { key: "holders", label: COMPARE_PAGE.holders, cell: (c) => <Holders h={c.holders} /> },
];

/** A row's label: the readout's own for its five lines. */
const labelOf = (row: Row, cols: CompareColumn[]) =>
  row.label || cols[0]?.lines.find((l) => l.key === row.key)?.label || row.key;

function VaultHead({ c }: { c: CompareColumn }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <VaultLead vault={c.vault} size={28} />
      <div className="min-w-0">
        <Link href={c.href} className={`font-semibold ${INLINE_LINK}`} data-compare-vault-link={c.key}>
          {c.name}
        </Link>
        <div className={`flex items-center gap-1 text-xs ${MUTED}`}>
          <ProtocolIcon id={VAULT_FAMILIES[c.vault.family].venue} className="h-3 w-3" />
          {c.family} · {c.chain}
        </div>
        <div className={`text-xs ${MUTED} tabular-nums`} data-compare-block={c.block ?? ""}>
          {c.block != null ? COMPARE_PAGE.readAt(c.block) : COMPARE_PAGE.unread}
        </div>
      </div>
    </div>
  );
}

export function VaultCompare({ columns, initialSort }: { columns: CompareColumn[]; initialSort: CompareSort }) {
  const [sort, setSort] = useState<CompareSort>(initialSort);
  const cols = sortColumns(columns, sort);
  const note =
    sort === "range"
      ? COMPARE_PAGE.sortNote.range
      : sort === "size" && mixedAssets(cols)
        ? COMPARE_PAGE.sortNote.mixed
        : null;

  const choose = (k: CompareSort) => {
    setSort(k);
    try {
      const p = new URLSearchParams(window.location.search);
      if (k === DEFAULT_SORT) p.delete("sort");
      else p.set("sort", k);
      const qs = p.toString().replace(/%2C/gi, ",").replace(/%3A/gi, ":");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    } catch {
      // The order still changes on the page.
    }
  };

  return (
    <div data-compare-columns={cols.map((c) => c.key).join(",")}>
      <div
        className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm"
        role="group"
        aria-label={COMPARE_PAGE.sortLabel}
      >
        <span className={`mr-1 ${MUTED}`}>{COMPARE_PAGE.sortLabel}</span>
        {COMPARE_SORTS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === sort}
            onClick={() => choose(k)}
            data-compare-sort={k}
            className={`rounded-md px-2 py-0.5 ${k === sort ? "bg-rb-100 font-medium text-foreground dark:bg-rb-700" : TEAL_PRESS}`}
          >
            {COMPARE_PAGE.sorts[k]}
          </button>
        ))}
      </div>
      <p className={`mb-4 min-h-5 text-sm ${MUTED}`} data-compare-sort-note="">
        {note}
      </p>

      {/* From md: a table, a column per vault; it scrolls inside its frame if it must. */}
      <div className="hidden overflow-x-auto rounded-xl border border-rb-200 bg-raised md:block dark:border-rb-600">
        <table className="w-full min-w-[760px] table-fixed text-sm" data-compare-table="">
          <caption className="sr-only">{COMPARE_PAGE.caption}</caption>
          <colgroup>
            <col className="w-36" />
            {cols.map((c) => (
              <col key={c.key} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-rb-200 dark:border-rb-600">
              <td className="p-4" />
              {cols.map((c) => (
                <th key={c.key} scope="col" className="p-4 text-left align-top font-normal" data-compare-column={c.key}>
                  <VaultHead c={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                key={row.key}
                className="border-b border-rb-200 align-top last:border-0 dark:border-rb-600"
                data-compare-row={row.key}
              >
                <th scope="row" className={`p-4 text-left font-normal ${MUTED}`}>
                  {labelOf(row, cols)}
                </th>
                {cols.map((c) => (
                  <td key={c.key} className="p-4" data-compare-cell={c.key}>
                    {row.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below md: the vaults once, then each row with the vaults beneath it. */}
      <div className="space-y-4 md:hidden" data-compare-phone="">
        <ol className="space-y-3 rounded-xl border border-rb-200 bg-raised p-4 dark:border-rb-600">
          {cols.map((c) => (
            <li key={c.key} data-compare-column={c.key}>
              <VaultHead c={c} />
            </li>
          ))}
        </ol>
        {ROWS.map((row) => (
          <section
            key={row.key}
            className="rounded-xl border border-rb-200 bg-raised p-4 text-sm dark:border-rb-600"
            data-compare-row={row.key}
          >
            <h2 className="mb-3 font-semibold text-foreground">{labelOf(row, cols)}</h2>
            <ul className="divide-y divide-rb-200 dark:divide-rb-600">
              {cols.map((c) => (
                <li key={c.key} className="py-3 first:pt-0 last:pb-0" data-compare-cell={c.key}>
                  <div className={`mb-1 text-xs font-semibold ${MUTED}`}>{c.name}</div>
                  {row.cell(c)}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
