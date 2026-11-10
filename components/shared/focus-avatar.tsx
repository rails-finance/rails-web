"use client";

// Focus mode on the profile control (ui-jobs 557, Miles 10 Nov 2026): with
// Focus on, the facehash carries a teal ring and a badge at its lower right
// saying what is in focus: the asset's mark for one asset, the chain's for
// chains alone, the count when several. Off, the facehash as it was.

import { Facehash } from "@/components/shared/facehash";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ChainGlyph } from "@/components/shared/chain-toggle";
import { effectivePicks, scopeSymbolOf, useAssetScope, type AssetPick } from "@/lib/shared/asset-scope";
import type { ChainId } from "@/lib/shared/chains";

/** A chain's mark in its own colour, so Base's square reads as Base. */
const CHAIN_TINT: Record<number, string> = { 8453: "#0052FF" };

const symbolOf = (p: AssetPick) => scopeSymbolOf(p.chain, p.token) ?? p.token;

/** The facehash (or its placeholder) with Focus's ring and badge. */
export function FocusAvatar({ face, size = 20 }: { face: string | null; size?: number }) {
  const scope = useAssetScope();
  const on = scope.ready && scope.on;
  const shown = on ? effectivePicks(scope.picks, scope.chains) : [];
  const picks = on ? [...new Map((shown.length ? shown : scope.picks).map((p) => [symbolOf(p), p])).values()] : [];
  const chains = on ? scope.chains : [];
  const badge = Math.round(size * 0.6);
  return (
    <span
      className={`relative inline-flex shrink-0 ${on ? "mr-1" : ""}`}
      style={on ? { borderRadius: 5, boxShadow: "0 0 0 2px var(--color-teal-500)" } : undefined}
      data-focus-avatar={on ? (picks.length ? "assets" : "chains") : undefined}
    >
      {face ? (
        <Facehash address={face} size={size} mono />
      ) : (
        <span className="block rounded-[4.4px] bg-current opacity-30" style={{ width: size, height: size }} />
      )}
      {on && (
        <span
          className="absolute -bottom-1.5 -right-1.5 inline-flex items-center justify-center rounded-full bg-background ring-2 ring-background"
          style={{ minWidth: badge, height: badge }}
          aria-hidden="true"
          data-focus-badge=""
        >
          {picks.length === 1 ? (
            <TokenChipIcon
              symbol={symbolOf(picks[0])}
              address={picks[0].token}
              size={badge}
              filterable={false}
              untitled
            />
          ) : picks.length === 0 && chains.length === 1 ? (
            <span
              className="inline-flex size-full items-center justify-center rounded-full"
              style={{ color: CHAIN_TINT[chains[0]] ?? "var(--foreground)" }}
            >
              <ChainGlyph chainId={chains[0] as ChainId} className="size-[80%]" />
            </span>
          ) : (
            <span
              className="inline-flex size-full items-center justify-center rounded-full bg-teal-600 px-0.5 text-[8px] font-bold leading-none text-white"
              style={{ fontSize: Math.max(7, Math.round(badge * 0.62)) }}
            >
              {picks.length || chains.length}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
