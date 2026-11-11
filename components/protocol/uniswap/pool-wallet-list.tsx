"use client";

// A wallet's pool positions under Focus (ui-jobs 557): the rows whose pair has
// a side in focus, with the count of what was kept. Uniswap's and Aerodrome's
// wallet pages draw it; the server half reads the positions and names each
// row's keys (pool-focus-keys.ts).

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { FRONT_DOOR } from "@/lib/uniswap/words";
import type { UniswapVersion } from "@/lib/uniswap/types";
import type { UniProtocol } from "@/lib/uniswap/deployments";

export const ROW =
  "flex items-center gap-3 rounded-xl border border-rb-200 bg-raised px-4 py-3 transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600";

export interface PoolWalletRow {
  key: string;
  href: string;
  label: string;
  sub?: string;
  /** Both sides of the pair, `chain:address`. */
  keys: string[];
  chain: number;
  attrs: Record<string, string>;
}

export function PoolWalletList({ rows }: { rows: PoolWalletRow[] }) {
  const scoped = useScopedRows(
    rows,
    (r) => r.keys,
    (r) => r.chain,
  );
  return (
    <>
      <ScopeNote scoped={scoped} noun={["position", "positions"]} className="mb-2" />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" {...scoped.listProps}>
        {scoped.rows.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className={ROW} {...r.attrs}>
              {r.sub ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{r.label}</span>
                  <span className="block text-xs text-rb-500">{r.sub}</span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.label}</span>
              )}
              <ArrowRight
                className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-[var(--text-link)]"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The other Uniswap version's count, of the positions in focus; none in focus, no line. */
export function UniswapOtherCount({
  others,
  version,
  chain,
  protocol,
  href,
}: {
  others: string[][];
  version: UniswapVersion;
  chain: number;
  protocol: UniProtocol;
  href: string;
}) {
  const scoped = useScopedRows(
    others,
    (k) => k,
    () => chain,
  );
  if (scoped.rows.length === 0) return null;
  return (
    <p className="mt-4 text-sm" {...scoped.listProps}>
      <Link href={href} className={INLINE_LINK}>
        {FRONT_DOOR.other(version, scoped.rows.length, protocol)}
      </Link>
    </p>
  );
}
