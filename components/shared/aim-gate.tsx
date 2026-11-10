"use client";

// Focus mode (ui-jobs 557) over one object's page: where the object is not in
// the focus (none of its assets, or its chain not focused), an empty state
// stands in for its content, "This Morpho market is outside your focus (BOLD
// on Ethereum)", with Show everything and Change focus. Where it is in focus
// the page is whole, events included.
//
// The page passes the object's asset keys (`chain:address`, lowercased), the
// ones it already holds (a Morpho market: its loan and collateral tokens), and
// its chain. The content is held hidden until the focus has been read
// (data-scope-list), so it does not draw and then vanish.
//
// `FocusChainGate` does the same for every page on a chain's routes (an
// explorer's pages, `/base`) when chain focus leaves that chain out.

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  chainNameOf,
  effectivePicks,
  OPEN_SCOPE_PANEL,
  scopeSymbolOf,
  useAssetScope,
  type AssetPick,
} from "@/lib/shared/asset-scope";
import { CHAINS } from "@/lib/shared/chains";
import { protocolForPathname } from "@/lib/shared/protocols";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";

/** "BOLD +4": the first chosen symbol and how many more. */
export function aimShort(picks: AssetPick[]): string {
  const names = [...new Set(picks.map((p) => scopeSymbolOf(p.chain, p.token) ?? `${p.token.slice(0, 6)}…`))];
  return `${names[0] ?? ""}${names.length > 1 ? ` +${names.length - 1}` : ""}`;
}

/** "Ethereum and Base": the focused chains in prose. */
export function chainsProse(chains: number[]): string {
  const names = chains.map(chainNameOf);
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "BOLD +4 on Ethereum", "Base": the whole focus, short. */
export function focusShort(picks: AssetPick[], chains: number[]): string {
  const a = aimShort(effectivePicks(picks, chains).length ? effectivePicks(picks, chains) : picks);
  const c = chainsProse(chains);
  return a && c ? `${a} on ${c}` : a || c;
}

function OutOfFocus({ what }: { what: string }) {
  const scope = useAssetScope();
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center" data-aim-gate="out">
      <p className="text-sm text-foreground">
        {what} is outside your focus ({focusShort(scope.picks, scope.chains)})
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

export function AimGate({
  keys,
  chain,
  what,
  children,
}: {
  keys: string[];
  chain?: number;
  what: string;
  children: ReactNode;
}) {
  const scope = useAssetScope();
  if (scope.matches(keys, chain))
    return (
      <div data-scope-list="" {...(scope.ready ? { "data-scope-ready": "" } : {})}>
        {children}
      </div>
    );
  return <OutOfFocus what={what} />;
}

const BY_SLUG = new Map(Object.values(CHAINS).map((c) => [c.slug, c.id as number]));

/** The chain a route belongs to: its explorer's, else its first segment's. */
function chainOfPath(pathname: string | null): { chain: number; label: string | null } | null {
  const entry = protocolForPathname(pathname);
  if (entry) return { chain: entry.chainId, label: entry.label };
  const slug = pathname?.split("/")[1];
  const chain = slug ? BY_SLUG.get(slug) : undefined;
  return chain != null ? { chain, label: null } : null;
}

export function FocusChainGate({ children }: { children: ReactNode }) {
  const scope = useAssetScope();
  const at = chainOfPath(usePathname());
  if (!at) return <>{children}</>;
  if (!scope.ready || scope.chainOk(at.chain))
    return (
      <div data-chain-gate="" {...(scope.ready ? { "data-scope-ready": "" } : {})}>
        {children}
      </div>
    );
  const name = chainNameOf(at.chain);
  return <OutOfFocus what={at.label ? `${at.label} on ${name}` : name} />;
}
