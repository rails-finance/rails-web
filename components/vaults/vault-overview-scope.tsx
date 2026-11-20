"use client";

// The /vaults overview's cards under Focus (ui-jobs 557, 776): a card stays
// where its chain is focused and one of its roster's vaults touches a focused
// asset (the vault's asset or its share), as the rosters keep their rows.
// ScopeNote says how many cards it hid, with Show all.

import { Children, type ReactNode } from "react";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";

export interface OverviewCardScope {
  chainId: number;
  /** `chain:address` of every vault's asset and share on the roster. */
  keys: string[];
}

export function VaultOverviewScope({
  cards,
  className,
  children,
}: {
  /** One per child, in the same order. */
  cards: OverviewCardScope[];
  className: string;
  children: ReactNode;
}) {
  const nodes = Children.toArray(children);
  const all = cards.map((c, i) => ({ ...c, i }));
  const scoped = useScopedRows(
    all,
    (c) => c.keys,
    (c) => c.chainId,
  );
  return (
    <>
      <ScopeNote scoped={scoped} noun={["roster", "rosters"]} className="mt-4" />
      <div className={className} data-vault-overview-cards={scoped.rows.length} {...scoped.listProps}>
        {scoped.rows.map((c) => nodes[c.i])}
      </div>
    </>
  );
}
