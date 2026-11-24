"use client";

// The vault comparison (E1; rails-ops ui-jobs 553 door 3, 779): a column per
// chosen vault in the order the reader picked them, its name linking the
// vault's page under its protocol. First Differences (E1.2): the facts on
// which the vaults differ, each figure in its receipt; then the full record:
// the readout's five lines, Fees, Where the money is lent and Who holds it.
// Nothing is scored, ranked or sorted. Below md each row stands alone with the
// chosen vaults listed beneath it, so the page never scrolls sideways. The
// read is lib/vaults/compare-read.ts; every word is lib/vaults/compare-words.ts's
// or lib/vaults/health-words.ts's.

import type { ReactNode } from "react";
import Link from "next/link";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { VaultLead, vaultHeads } from "@/components/vaults/vault-heads";
import { HolderDonut } from "@/components/vaults/holder-donut";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { useAssetScope } from "@/lib/shared/asset-scope";
import { assetKey } from "@/lib/shared/asset-family";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { differs } from "@/lib/vaults/compare";
import { COMPARE_PAGE, DIFFERENCE_LABELS as D, EXPOSURE_WORDS, type CompareCell } from "@/lib/vaults/compare-words";
import { flooredPct, type HealthLine } from "@/lib/vaults/health-words";
import { vaultHoldersProv } from "@/lib/vaults/row-provenance";
import type { CompareColumn, CompareExposure, CompareHolders } from "@/lib/vaults/compare-read";

const MUTED = "text-rb-500";
const n = (v: number) => v.toLocaleString("en-US");

/** A share as a place's figure: under 0.1% but above none reads "<0.1%". */
const placeShare = (x: number) => (x > 0 && x < 0.001 ? "<0.1%" : flooredPct(x));

const withProv = (info: Provenance | null | undefined, node: ReactNode) =>
  info ? <Prov info={info}>{node}</Prov> : node;

function Cell({ c, prov }: { c: CompareCell | HealthLine; prov?: Provenance | null }) {
  return (
    <div className="space-y-0.5">
      {c.headline && <div className="font-semibold text-foreground">{withProv(prov, c.headline)}</div>}
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

/** One row of a table: its label, and per column what it draws and, for
 *  Differences, the value it is compared by. */
interface Row {
  key: string;
  label: string;
  cell: (c: CompareColumn) => ReactNode;
  /** What the column prints, for Differences; absent on the full record. */
  same?: (c: CompareColumn) => string | null;
}

const line = (c: CompareColumn, k: HealthLine["key"]) => c.lines.find((l) => l.key === k);
const lineText = (l: HealthLine | CompareCell | undefined) =>
  l ? [l.headline, l.sentence].filter(Boolean).join(" ") || null : null;
const none = <span className={MUTED}>—</span>;
/** A fact of identity: no receipt, as the roster row states it. */
const plain = (text: string) => (
  <span className="text-foreground" data-prov-exempt="">
    {text}
  </span>
);

const head = (c: CompareColumn, id: string) =>
  vaultHeads({
    vault: c.vault,
    holdersHref: null,
    receipts: c.receipts,
  }).find((h) => h.id === id)?.value ?? none;

const DIFFERENCES: readonly Row[] = [
  { key: "asset", label: D.asset, cell: (c) => plain(c.vault.asset.symbol), same: (c) => c.vault.asset.symbol },
  { key: "family", label: D.family, cell: (c) => plain(c.family), same: (c) => c.family },
  { key: "chain", label: D.chain, cell: (c) => plain(c.chain), same: (c) => c.chain },
  {
    key: "total-assets",
    label: D.totalAssets,
    cell: (c) => head(c, "total-assets"),
    same: (c) => (c.vault.totalAssets ? `${c.vault.totalAssets.raw} ${c.vault.asset.address}` : null),
  },
  {
    key: "share-price",
    label: D.sharePrice,
    cell: (c) => head(c, "share-price"),
    same: (c) => (c.vault.sharePrice ? `${c.vault.sharePrice.raw} ${c.vault.asset.address}` : null),
  },
  // The readout's line, as the full record states it: one yield figure per
  // vault on the page.
  {
    key: "yield",
    label: D.yield,
    cell: (c) => (line(c, "yield") ? <Cell c={line(c, "yield")!} prov={c.lineProvs.yield} /> : none),
    same: (c) => lineText(line(c, "yield")),
  },
  {
    key: "holder-count",
    label: D.holders,
    cell: (c) =>
      c.vault.census ? (
        <span className="font-semibold text-foreground">
          <Prov info={vaultHoldersProv(c.vault, c.vault.census)}>{n(c.vault.census.live)}</Prov>
        </span>
      ) : (
        <span className={MUTED}>{c.holders.kind === "none" ? c.holders.why : "—"}</span>
      ),
    same: (c) => (c.vault.census ? String(c.vault.census.live) : null),
  },
  {
    key: "steward",
    label: D.steward,
    cell: (c) => (line(c, "steward") ? <Cell c={line(c, "steward")!} prov={c.lineProvs.steward} /> : none),
    same: (c) => lineText(line(c, "steward")),
  },
  { key: "fees", label: D.fees, cell: (c) => <Cell c={c.fees} prov={c.feeProv} />, same: (c) => lineText(c.fees) },
  {
    key: "withdrawals",
    label: D.withdrawals,
    cell: (c) => (line(c, "withdrawals") ? <Cell c={line(c, "withdrawals")!} prov={c.lineProvs.withdrawals} /> : none),
    same: (c) => lineText(line(c, "withdrawals")),
  },
];

const RECORD: readonly Row[] = [
  ...(["size", "yield", "withdrawals", "losses", "steward"] as const).map(
    (k): Row => ({
      key: k,
      label: "",
      cell: (c) => (line(c, k) ? <Cell c={line(c, k)!} prov={c.lineProvs[k]} /> : none),
    }),
  ),
  { key: "fees", label: COMPARE_PAGE.fees, cell: (c) => <Cell c={c.fees} prov={c.feeProv} /> },
  // Where the money is lent and the holder donut state shares the vault's
  // page traces leg by leg and holder by holder; here they stand without.
  {
    key: "exposure",
    label: COMPARE_PAGE.exposure,
    cell: (c) => (
      <div data-prov-exempt="the vault's page traces each place's share">
        <Exposure e={c.exposure} />
      </div>
    ),
  },
  {
    key: "holders",
    label: COMPARE_PAGE.holders,
    cell: (c) => (
      <div data-prov-exempt="the census's holder shares; the vault's holders page traces each">
        <Holders h={c.holders} />
      </div>
    ),
  },
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
          {VAULT_FAMILIES[c.vault.family].venue && (
            <ProtocolIcon id={VAULT_FAMILIES[c.vault.family].venue ?? ""} className="h-3 w-3" />
          )}
          {c.family} · {c.chain}
        </div>
        <div className={`text-xs ${MUTED} tabular-nums`} data-compare-block={c.block ?? ""}>
          {c.readAt != null ? COMPARE_PAGE.readAt(c.readAt) : COMPARE_PAGE.unread}
        </div>
      </div>
    </div>
  );
}

/** Under Focus the comparison keeps the vaults the reader chose and says how
 *  many of them are outside the focus (ui-jobs 557). */
function FocusCompareNote({ columns }: { columns: CompareColumn[] }) {
  const scope = useAssetScope();
  if (!scope.on) return null;
  const out = columns.filter(
    (c) =>
      !scope.matches(
        [assetKey(c.vault.chainId, c.vault.asset.address), assetKey(c.vault.chainId, c.vault.address)],
        c.vault.chainId,
      ),
  ).length;
  if (!out) return null;
  return (
    <p className={`mb-3 text-xs ${MUTED}`} data-compare-focus-out={out}>
      {out === columns.length
        ? "None of these vaults is in your focus. They show because you chose them."
        : `${out} of these ${columns.length} vaults ${out === 1 ? "is" : "are"} outside your focus. They show because you chose them.`}
    </p>
  );
}

/** One table: from md a column per vault, below md each row with the vaults beneath it. */
function Table({ rows, cols, part }: { rows: readonly Row[]; cols: CompareColumn[]; part: "differences" | "record" }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-rb-200 bg-raised md:block dark:border-rb-600">
        <table className="w-full min-w-[760px] table-fixed text-sm" data-compare-table={part}>
          <caption className="sr-only">
            {part === "differences" ? COMPARE_PAGE.differences : COMPARE_PAGE.caption}
          </caption>
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
            {rows.map((row) => (
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

      <div className="space-y-4 md:hidden" data-compare-phone={part}>
        {rows.map((row) => (
          <section
            key={row.key}
            className="rounded-xl border border-rb-200 bg-raised p-4 text-sm dark:border-rb-600"
            data-compare-row={row.key}
          >
            <h3 className="mb-3 font-semibold text-foreground">{labelOf(row, cols)}</h3>
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
    </>
  );
}

export function VaultCompare({ columns }: { columns: CompareColumn[] }) {
  const differing = DIFFERENCES.filter((r) => differs(columns.map((c) => r.same!(c))));
  return (
    <div data-compare-columns={columns.map((c) => c.key).join(",")}>
      <FocusCompareNote columns={columns} />

      {/* Below md the vaults once, then each table's rows. */}
      <ol
        className="mb-4 space-y-3 rounded-xl border border-rb-200 bg-raised p-4 md:hidden dark:border-rb-600"
        data-compare-phone=""
      >
        {columns.map((c) => (
          <li key={c.key} data-compare-column={c.key}>
            <VaultHead c={c} />
          </li>
        ))}
      </ol>

      <section className="mb-8" data-anatomy="E1.2" data-compare-differences={differing.map((r) => r.key).join(",")}>
        <h2 className="mb-3 text-lg font-semibold text-foreground">{COMPARE_PAGE.differences}</h2>
        {differing.length > 0 ? (
          <Table rows={differing} cols={columns} part="differences" />
        ) : (
          <p className={`text-sm ${MUTED}`} data-compare-no-differences="">
            {COMPARE_PAGE.noDifferences}
          </p>
        )}
      </section>

      <section data-compare-record="">
        <h2 className="mb-3 text-lg font-semibold text-foreground">{COMPARE_PAGE.record}</h2>
        <Table rows={RECORD} cols={columns} part="record" />
      </section>
    </div>
  );
}
