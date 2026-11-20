"use client";

// The /vaults overview's family cards under Focus (ui-jobs 557, 776, 782): a
// roster's row stays where its chain is focused and one of its vaults touches
// a focused asset (the vault's asset or its share), as the rosters keep their
// rows; a card whose rows are all hidden drops out. ScopeNote says how many
// rosters it hid, with Show all.

import type { ReactNode } from "react";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";

export interface OverviewRowScope {
  chainId: number;
  /** `chain:address` of every vault's asset and share on the roster. */
  keys: string[];
  /** The row, drawn by the server. */
  node: ReactNode;
}

export interface OverviewCardScope {
  key: string;
  /** The heading and lead, drawn by the server. */
  head: ReactNode;
  className: string;
  /** The card's data hooks. */
  attrs: Record<string, string>;
  rows: OverviewRowScope[];
}

export function VaultOverviewScope({ cards, className }: { cards: OverviewCardScope[]; className: string }) {
  const all = cards.flatMap((c, ci) => c.rows.map((r, ri) => ({ ...r, ci, ri })));
  const scoped = useScopedRows(
    all,
    (r) => r.keys,
    (r) => r.chainId,
  );
  const kept = new Set(scoped.rows.map((r) => `${r.ci}:${r.ri}`));
  // The cards with a row left; the count on the list is theirs.
  const shown = cards
    .map((c, ci) => ({ c, rows: c.rows.filter((_, ri) => kept.has(`${ci}:${ri}`)) }))
    .filter((x) => x.rows.length > 0);
  return (
    <>
      <ScopeNote scoped={scoped} noun={["roster", "rosters"]} className="mt-4" />
      <div className={className} data-vault-overview-cards={shown.length} {...scoped.listProps}>
        {shown.map(({ c, rows }) => {
          return (
            <article key={c.key} className={c.className} {...c.attrs}>
              {c.head}
              <ul className="mt-auto divide-y divide-rb-200 pt-3 dark:divide-rb-700">
                {rows.map((r) => (
                  <li key={r.chainId}>{r.node}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </>
  );
}
