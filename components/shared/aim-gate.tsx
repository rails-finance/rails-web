"use client";

// Focus mode (ui-jobs 557) over one object's page: where the object is not in
// the focus (none of its assets, or its chain not focused), an empty state
// stands in for its content, "This Morpho market is outside your focus (BOLD
// on Ethereum)", with Show all (this page, until it is left) and Change
// focus. Where it is in focus the page is whole, events included.
//
// The page passes the object's asset keys (`chain:address`, lowercased), the
// ones it already holds (a Morpho market: its loan and collateral tokens), and
// its chain. The content is held hidden until the focus has been read
// (data-scope-list), so it does not draw and then vanish.
//
// `FocusChainGate` stands over every route in the shell: a page on a chain
// chain focus leaves out (an explorer's pages, `/base`, an asset page on that
// chain), an explorer the asset focus hides (it lists none of the assets, or
// Rails has no asset list for it), and an asset page outside the focus.

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useExplorerScope } from "@/lib/shared/explorer-scope";
import { explorerWhy } from "@/components/shared/asset-scope-strip";
import {
  chainNameOf,
  effectivePicks,
  openFocusPanel,
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

function OutOfFocus({ what, why, onPeek }: { what: string; why?: string; onPeek: () => void }) {
  const scope = useAssetScope();
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center" data-aim-gate="out" data-anatomy="H21">
      <p className="text-sm text-foreground">
        {what} is outside your focus ({focusShort(scope.picks, scope.chains)})
      </p>
      {why && <p className="text-xs text-rb-500">{why}</p>}
      <p className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onPeek}
          className={`inline-flex min-h-11 items-center font-semibold sm:min-h-0 ${INPLACE_TEXT}`}
          data-aim-gate-peek=""
        >
          Show all
        </button>
        <span className="text-rb-500" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          onClick={() => openFocusPanel("edit")}
          className={`inline-flex min-h-11 items-center font-semibold sm:min-h-0 ${INPLACE_TEXT}`}
          data-aim-gate-change=""
        >
          Change focus
        </button>
      </p>
    </div>
  );
}

/** Show all on a gate: this page whole, until the reader leaves it. */
function usePeek(): [boolean, () => void] {
  const pathname = usePathname();
  const [peekAt, setPeekAt] = useState<string | null>(null);
  useEffect(() => setPeekAt(null), [pathname]);
  return [peekAt === pathname, () => setPeekAt(pathname)];
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
  const [peek, setPeek] = usePeek();
  if (peek || scope.matches(keys, chain))
    return (
      <div data-scope-list="" {...(scope.ready ? { "data-scope-ready": "" } : {})}>
        {children}
      </div>
    );
  return <OutOfFocus what={what} onPeek={setPeek} />;
}

const BY_SLUG = new Map(Object.values(CHAINS).map((c) => [c.slug, c.id as number]));

/** What a route belongs to: its explorer and chain; an asset page's chain and
 *  token (`/assets/<chain>/<address>`); else its first segment's chain. */
function routeOf(
  pathname: string | null,
): { chain: number; explorer: ReturnType<typeof protocolForPathname>; token: string | null } | null {
  const entry = protocolForPathname(pathname);
  if (entry) return { chain: entry.chainId, explorer: entry, token: null };
  const seg = pathname?.split("/") ?? [];
  if (seg[1] === "assets" && seg[2] && /^0x[0-9a-f]{40}$/i.test(seg[3] ?? "")) {
    const chain = BY_SLUG.get(seg[2]);
    return chain != null ? { chain, explorer: undefined, token: seg[3].toLowerCase() } : null;
  }
  const chain = seg[1] ? BY_SLUG.get(seg[1]) : undefined;
  return chain != null ? { chain, explorer: undefined, token: null } : null;
}

export function FocusChainGate({ children }: { children: ReactNode }) {
  const scope = useAssetScope();
  const ex = useExplorerScope();
  const [peek, setPeek] = usePeek();
  const at = routeOf(usePathname());
  if (!at || peek) return <>{children}</>;
  const name = chainNameOf(at.chain);
  const hold = (ready: boolean) => (
    <div data-chain-gate="" data-scope-list="" {...(ready ? { "data-scope-ready": "" } : {})}>
      {children}
    </div>
  );
  if (!scope.ready) return hold(false);
  if (!scope.chainOk(at.chain))
    return (
      <OutOfFocus
        what={at.explorer ? `${at.explorer.label} on ${name}` : at.token ? "This asset" : name}
        onPeek={setPeek}
      />
    );
  if (at.token && !scope.matches([`${at.chain}:${at.token}`], at.chain))
    return <OutOfFocus what="This asset" onPeek={setPeek} />;
  // An explorer the asset focus hides opens to the gate, saying why.
  if (at.explorer && scope.keys) {
    if (!ex.ready) return hold(false);
    if (ex.on) {
      const w = explorerWhy(at.explorer, ex.statusOf(at.explorer.id), scope.keys);
      if (w) return <OutOfFocus what={`${at.explorer.label} on ${name}`} why={w.why} onPeek={setPeek} />;
    }
  }
  return hold(true);
}
