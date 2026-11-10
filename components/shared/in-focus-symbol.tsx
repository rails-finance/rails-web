"use client";

// Focus mode (ui-jobs 557) on a server-drawn list that names its assets by
// symbol (/start's coin chips, pairs and one coin's step): `InFocusSymbol`
// draws its children only where one of the symbols is in focus, and
// `fallback` (or nothing) where none is. A symbol stands for the tokens the
// address tables name under it (SCOPE_SYMBOLS); one they do not name is out
// of an asset focus, and in a chain-only focus. Server-drawn, so the item is
// held hidden until the focus has been read.

import type { ReactNode } from "react";
import { assetKey } from "@/lib/shared/asset-family";
import { SCOPE_SYMBOLS, useAssetScope, type AssetScope } from "@/lib/shared/asset-scope";

/** Whether a symbol is in the focus: a token under it reaches an asset in
 *  focus on a focused chain; under chain focus alone, it has a token on one. */
export function symbolInFocus(scope: AssetScope, symbol: string): boolean {
  if (!scope.on) return true;
  const tokens = SCOPE_SYMBOLS.get(symbol.toLowerCase()) ?? [];
  if (scope.keys) return tokens.some((t) => scope.keys!.has(assetKey(t.chain, t.token)));
  return tokens.length === 0 || tokens.some((t) => scope.chainOk(t.chain));
}

export function InFocusSymbol({
  symbols,
  fallback = null,
  children,
}: {
  symbols: string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const scope = useAssetScope();
  if (!scope.ready) return <div data-scope-list="">{children}</div>;
  return symbols.some((s) => symbolInFocus(scope, s)) ? <>{children}</> : <>{fallback}</>;
}
