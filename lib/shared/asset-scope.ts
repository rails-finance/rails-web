"use client";

// The asset preference in the browser (ui-jobs 557): the reader's stored
// assets (lib/shared/asset-preference.ts, `rails-assets-v1`), `?assets=` over
// them for one view, and the set of keys every filtered list tests against
// (lib/shared/asset-family.ts `familyOf`).
//
// The server renders every list whole; the stored preference is read after
// hydration. The script in app/layout.tsx marks <html data-asset-scope> before
// first paint when a preference or `?assets=` is present, and globals.css
// holds a filtered list (`data-scope-list`) hidden until it is ready, so the
// whole list does not flash first.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { BASE_TOKEN_ADDRESSES } from "@/lib/shared/token-addresses.base";
import { assetKey, familyOf, FAMILY_SYMBOLS } from "@/lib/shared/asset-family";
import { notifyUrlChanged } from "@/lib/shared/use-url-search-params";
import {
  ASSET_PREFERENCE_KEY,
  ASSETS_PARAM,
  formatAssetsParam,
  isPickList,
  parseAssetsParam,
  type AssetPick,
  type SymbolIndex,
} from "@/lib/shared/asset-preference";

export type { AssetPick };

export const SCOPE_CHAINS: Record<number, string> = { 1: "Ethereum", 8453: "Base" };

/** Every token the chooser offers: the address tables, then the family
 *  table's own tokens (the PTs, yBOLD, the sentinels). */
export const SCOPE_TOKENS: { chain: number; token: string; symbol: string }[] = (() => {
  const out = new Map<string, { chain: number; token: string; symbol: string }>();
  const put = (chain: number, token: string, symbol: string) => {
    const key = assetKey(chain, token);
    if (!out.has(key)) out.set(key, { chain, token: token.toLowerCase(), symbol });
  };
  for (const [s, a] of Object.entries(TOKEN_ADDRESSES)) put(1, a, s);
  for (const [s, a] of Object.entries(BASE_TOKEN_ADDRESSES)) put(8453, a, s);
  for (const [key, s] of Object.entries(FAMILY_SYMBOLS)) {
    const [chain, token] = key.split(":");
    put(Number(chain), token, s);
  }
  return [...out.values()];
})();

const BY_KEY = new Map(SCOPE_TOKENS.map((t) => [assetKey(t.chain, t.token), t.symbol]));
export const SCOPE_SYMBOLS: SymbolIndex = (() => {
  const m: SymbolIndex = new Map();
  for (const t of SCOPE_TOKENS) {
    const s = t.symbol.toLowerCase();
    m.set(s, [...(m.get(s) ?? []), { chain: t.chain, token: t.token }]);
  }
  return m;
})();

export const scopeSymbolOf = (chain: number, token: string): string | null =>
  BY_KEY.get(assetKey(chain, token)) ?? null;

// ── The store ───────────────────────────────────────────────────────────────

const CHANGE = "rails:asset-scope";
/** Opens the panel from anywhere (the profile menu's entry). */
export const OPEN_SCOPE_PANEL = "rails:asset-scope-open";

interface Snapshot {
  stored: AssetPick[];
  /** `?assets=` on this view; null when the URL carries none. */
  link: AssetPick[] | null;
}
const EMPTY: Snapshot = { stored: [], link: null };
let cache: { raw: string; snap: Snapshot } = { raw: "", snap: EMPTY };

function readRaw(): string {
  let stored = "";
  try {
    stored = localStorage.getItem(ASSET_PREFERENCE_KEY) ?? "";
  } catch {}
  const link = new URLSearchParams(window.location.search).get(ASSETS_PARAM);
  return `${stored}\u0000${link ?? "\u0001"}`;
}

function snapshot(): Snapshot {
  const raw = readRaw();
  if (raw === cache.raw) return cache.snap;
  const [s, l] = raw.split("\u0000");
  let stored: AssetPick[] = [];
  try {
    const v = s ? JSON.parse(s) : [];
    if (isPickList(v)) stored = v;
  } catch {}
  const link = l === "\u0001" ? null : parseAssetsParam(l, SCOPE_SYMBOLS);
  cache = { raw, snap: { stored, link } };
  return cache.snap;
}

function subscribe(fn: () => void) {
  window.addEventListener(CHANGE, fn);
  window.addEventListener("storage", fn);
  window.addEventListener("popstate", fn);
  window.addEventListener("rails:url-change", fn);
  return () => {
    window.removeEventListener(CHANGE, fn);
    window.removeEventListener("storage", fn);
    window.removeEventListener("popstate", fn);
    window.removeEventListener("rails:url-change", fn);
  };
}

function markHtml(on: boolean) {
  if (on) document.documentElement.dataset.assetScope = "1";
  else delete document.documentElement.dataset.assetScope;
}

function writeLink(picks: AssetPick[] | null) {
  const sp = new URLSearchParams(window.location.search);
  sp.delete(ASSETS_PARAM);
  let qs = sp.toString();
  if (picks && picks.length) {
    const v = formatAssetsParam(picks, scopeSymbolOf, SCOPE_SYMBOLS);
    qs = `${qs ? `${qs}&` : ""}${ASSETS_PARAM}=${v}`;
  }
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  notifyUrlChanged();
}

/** A link to this view under these picks. */
export function scopeLink(picks: AssetPick[]): string {
  const sp = new URLSearchParams(window.location.search);
  sp.delete(ASSETS_PARAM);
  const qs = sp.toString();
  const v = formatAssetsParam(picks, scopeSymbolOf, SCOPE_SYMBOLS);
  return `${window.location.origin}${window.location.pathname}?${qs ? `${qs}&` : ""}${ASSETS_PARAM}=${v}`;
}

export interface AssetScope {
  /** False through SSR and the first client render: lists draw whole. */
  ready: boolean;
  /** The picks in force: the link's when it carries `?assets=`, else the stored. */
  picks: AssetPick[];
  /** The picks came from `?assets=`. */
  fromLink: boolean;
  /** The keys the picks reach; null when there are no picks (show everything). */
  keys: Set<string> | null;
  /** Replaces the picks in force: the link's when the view has one, else the stored. */
  setPicks: (next: AssetPick[]) => void;
  /** Keeps the link's picks as the stored preference and drops `?assets=`. */
  keepLink: () => void;
  /** Show everything: clears the stored preference and `?assets=`. */
  clear: () => void;
}

export function useAssetScope(): AssetScope {
  usePathname(); // a navigation re-reads `?assets=`
  const ready = useHydrated();
  const snap = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const fromLink = ready && snap.link != null;
  const picks = !ready ? [] : (snap.link ?? snap.stored);
  const keys = useMemo(() => (picks.length ? familyOf(picks) : null), [picks]);

  const setPicks = useCallback((next: AssetPick[]) => {
    if (snapshot().link != null) writeLink(next);
    else {
      try {
        if (next.length) localStorage.setItem(ASSET_PREFERENCE_KEY, JSON.stringify(next));
        else localStorage.removeItem(ASSET_PREFERENCE_KEY);
      } catch {}
      window.dispatchEvent(new Event(CHANGE));
    }
    markHtml(next.length > 0);
  }, []);
  const keepLink = useCallback(() => {
    const link = snapshot().link;
    if (!link) return;
    try {
      localStorage.setItem(ASSET_PREFERENCE_KEY, JSON.stringify(link));
    } catch {}
    writeLink(null);
    window.dispatchEvent(new Event(CHANGE));
  }, []);
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(ASSET_PREFERENCE_KEY);
    } catch {}
    if (snapshot().link != null) writeLink(null);
    window.dispatchEvent(new Event(CHANGE));
    markHtml(false);
  }, []);

  return { ready, picks, fromLink, keys, setPicks, keepLink, clear };
}
