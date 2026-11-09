"use client";

// AIM (asset isolation mode, ui-jobs 557) in the search's dropdown (H15.2).
//
// While AIM is on the dropdown is restricted too (Miles, 9 Nov 2026): a token,
// vault or explorer row shows only where it touches the AIM set
// (useAimSuggestScope); wallets and bookmarks stay. Assets are added in the
// AIM panel, opened from the strip, which is also the way out.
//
// The button on a token row: "AIM" while AIM is off turns it on with that
// token; "In AIM" while it is on takes it out.
// The index carries a token as its symbol alone. The symbol maps to every
// token the AIM chooser offers under it, case aside, on every chain
// (SCOPE_SYMBOLS, the same reading as a bare `?assets=bold`): "USDC" adds
// USDC on Ethereum and on Base, and a symbol two contracts share on one chain
// adds both. A symbol the chooser does not offer draws no button.
//
//   off               "AIM"         turns AIM on with the symbol's tokens, built-on on
//   on, picked        "In AIM"      takes them out (the last one out turns AIM off)
//   on, reached       "In AIM"      a label, no press: another pick's built-on reaches it
// An out-of-set token row is not drawn under AIM; were one passed, it draws nothing.

import { forwardRef, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check } from "lucide-react";
import { assetKey } from "@/lib/shared/asset-family";
import { SCOPE_SYMBOLS, useAssetScope } from "@/lib/shared/asset-scope";
import { useExplorerScope } from "@/lib/shared/explorer-scope";
import { protocolForHref } from "@/lib/shared/protocols";
import type { SuggestScope } from "@/lib/search/suggest";

export type AimButtonState = "off" | "in" | "reached" | "out";

/** The index's chain names; a chain AIM does not cover keeps nothing. */
const CHAIN_IDS: Record<string, number> = { Ethereum: 1, Base: 8453 };

/** What the dropdown keeps while AIM is on; null while it is off. A vault
 *  shows where its asset or its share token is in the set (as /vaults does),
 *  an explorer where it lists an AIM asset (lib/shared/explorer-scope.ts), and
 *  nothing shows until that index has been judged. */
export function useAimSuggestScope(): SuggestScope | null {
  const scope = useAssetScope();
  const ex = useExplorerScope();
  return useMemo(() => {
    const keys = scope.keys;
    if (!keys) return null;
    const symbolIn = (symbol: string, chain?: number) =>
      aimTokensFor(symbol).some((t) => (chain == null || t.chain === chain) && keys.has(assetKey(t.chain, t.token)));
    return {
      token: (symbol) => symbolIn(symbol),
      vault: (v) => {
        const chain = CHAIN_IDS[v[4]];
        return chain != null && (keys.has(assetKey(chain, v[5])) || symbolIn(v[2], chain));
      },
      explorer: (href) => {
        const entry = protocolForHref(href);
        return entry != null && ex.on && ex.statusOf(entry.id) === "lists";
      },
    };
  }, [scope.keys, ex]);
}

/** The chooser's tokens under a search symbol; [] where it offers none. */
export const aimTokensFor = (symbol: string) => SCOPE_SYMBOLS.get(symbol.toLowerCase()) ?? [];

const PILL =
  "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500";
const OUTLINE = `${PILL} border border-teal-500/60 text-teal-700 hover:bg-teal-500/10 dark:text-teal-400`;
const FILLED = `${PILL} border border-transparent bg-teal-500/15 text-teal-700 hover:bg-teal-500/25 dark:text-teal-300`;

export const AimSearchButton = forwardRef<
  HTMLButtonElement,
  {
    symbol: string;
    id?: string;
    onKeyDown?: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }
>(function AimSearchButton({ symbol, id, onKeyDown, onFocus, onBlur }, ref) {
  const scope = useAssetScope();
  const tokens = aimTokensFor(symbol);
  if (!scope.ready || tokens.length === 0) return null;

  const picked = (t: { chain: number; token: string }) =>
    scope.picks.some((p) => p.chain === t.chain && p.token === t.token);
  const state: AimButtonState =
    scope.picks.length === 0
      ? "off"
      : tokens.every(picked)
        ? "in"
        : tokens.some((t) => scope.keys?.has(assetKey(t.chain, t.token)))
          ? "reached"
          : "out";

  if (state === "out") return null;
  if (state === "reached")
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-400"
        title="Built on another asset in your focus"
        data-aim-search="reached"
      >
        <Check className="size-3" aria-hidden="true" />
        In focus
      </span>
    );

  const press = () => {
    if (state === "in") {
      scope.setPicks(scope.picks.filter((p) => !tokens.some((t) => t.chain === p.chain && t.token === p.token)));
      return;
    }
    scope.setPicks(tokens.map((t) => ({ ...t, builtOn: true })));
  };

  const label = state === "off" ? `Focus Rails on ${symbol}` : `Remove ${symbol} from your focus`;

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        // The row under it navigates; this press stays on the page.
        e.stopPropagation();
        press();
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className={state === "in" ? FILLED : OUTLINE}
      data-aim-search={state}
    >
      {state === "in" && <Check className="size-3" aria-hidden="true" />}
      {state === "off" ? "Focus" : "In focus"}
    </button>
  );
});
