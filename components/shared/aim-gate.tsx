"use client";

// AIM (asset isolation mode, ui-jobs 557) over one object's page: where the
// object touches none of the AIM set, an empty state stands in for its
// content, "This Morpho market is outside your focus (BOLD +4)", with Turn off AIM
// and Change AIM. Where it touches the set the page is whole, events included.
//
// The page passes the object's asset keys (`chain:address`, lowercased), the
// ones it already holds: a Morpho market its loan and collateral tokens. The
// content is held hidden until AIM has been read (data-scope-list), so it does
// not draw and then vanish.

import type { ReactNode } from "react";
import { OPEN_SCOPE_PANEL, scopeSymbolOf, useAssetScope, type AssetPick } from "@/lib/shared/asset-scope";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";

/** "BOLD +4": the first chosen symbol and how many more. */
export function aimShort(picks: AssetPick[]): string {
  const names = [...new Set(picks.map((p) => scopeSymbolOf(p.chain, p.token) ?? `${p.token.slice(0, 6)}…`))];
  return `${names[0] ?? ""}${names.length > 1 ? ` +${names.length - 1}` : ""}`;
}

export function AimGate({ keys, what, children }: { keys: string[]; what: string; children: ReactNode }) {
  const scope = useAssetScope();
  const inside = scope.keys == null || keys.some((k) => scope.keys!.has(k.toLowerCase()));
  if (inside)
    return (
      <div data-scope-list="" {...(scope.ready ? { "data-scope-ready": "" } : {})}>
        {children}
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center" data-aim-gate="out">
      <p className="text-sm text-foreground">
        {what} is outside your focus ({aimShort(scope.picks)})
      </p>
      <p className="flex items-center gap-2 text-sm">
        <button type="button" onClick={scope.clear} className={`font-semibold ${INPLACE_TEXT}`}>
          Show everything
        </button>
        <span className="text-rb-500" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_SCOPE_PANEL))}
          className={`font-semibold ${INPLACE_TEXT}`}
        >
          Change focus
        </button>
      </p>
    </div>
  );
}
