"use client";

// Focus mode in the browser (ui-jobs 557): the reader's stored focus
// (lib/shared/asset-preference.ts, `rails-focus-v2`: assets and chains),
// `?assets=` / `?chains=` over it for one view, and the tests every filtered
// list runs: the asset keys the focus reaches (lib/shared/asset-family.ts
// `familyOf`) and the chains it keeps. A row shows when it passes both.
//
// Chain focus overrides a chain an asset pick names: under it, a pick stands
// for its symbol on each focused chain (8453:BOLD with Ethereum focused is
// BOLD on Ethereum), and a pick with no symbol on them reaches nothing.
//
// The server renders every list whole; the stored preference is read after
// hydration. The script in app/layout.tsx marks <html data-asset-scope> before
// first paint when a preference or `?assets=` is present, and globals.css
// holds a filtered list (`data-scope-list`) hidden until it is ready, so the
// whole list does not flash first.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { assetKey, familyOf } from "@/lib/shared/asset-family";
import { SCOPE_TOKENS } from "@/lib/shared/asset-scope-tokens";
import { notifyUrlChanged } from "@/lib/shared/use-url-search-params";
import {
  ASSET_PREFERENCE_KEY,
  ASSETS_PARAM,
  CHAINS_PARAM,
  FOCUS_KEY,
  formatAssetsParam,
  formatChainsParam,
  isFocus,
  isPickList,
  NO_FOCUS,
  parseAssetsParam,
  parseChainsParam,
  type AssetPick,
  type Focus,
  type SymbolIndex,
} from "@/lib/shared/asset-preference";
import { CHAINS, type ChainId } from "@/lib/shared/chains";

export type { AssetPick };

/** The chains the asset chooser's tokens are on. */
export const SCOPE_CHAINS: Record<number, string> = { 1: "Ethereum", 8453: "Base" };

const CHAIN_SLUGS: Record<string, number> = Object.fromEntries(Object.values(CHAINS).map((c) => [c.slug, c.id]));
export const chainNameOf = (id: number): string => CHAINS[id as ChainId]?.name ?? `chain ${id}`;
const chainOfKey = (k: string) => Number(k.slice(0, k.indexOf(":")));

export { SCOPE_TOKENS };

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
  stored: Focus;
  /** The focus a link sets on this view; null when the URL carries neither param. */
  link: Focus | null;
}
const EMPTY: Snapshot = { stored: NO_FOCUS, link: null };
let cache: { raw: string; snap: Snapshot } = { raw: "", snap: EMPTY };

function readStored(): string {
  try {
    const v2 = localStorage.getItem(FOCUS_KEY);
    if (v2 != null) return v2;
    const v1 = localStorage.getItem(ASSET_PREFERENCE_KEY);
    if (v1) {
      const assets = JSON.parse(v1);
      if (isPickList(assets)) {
        const v = JSON.stringify({ assets, chains: [] });
        localStorage.setItem(FOCUS_KEY, v);
        localStorage.removeItem(ASSET_PREFERENCE_KEY);
        return v;
      }
    }
  } catch {}
  return "";
}

function readRaw(): string {
  const sp = new URLSearchParams(window.location.search);
  const a = sp.get(ASSETS_PARAM);
  const c = sp.get(CHAINS_PARAM);
  return [readStored(), a ?? "\u0001", c ?? "\u0001"].join("\u0000");
}

function snapshot(): Snapshot {
  const raw = readRaw();
  if (raw === cache.raw) return cache.snap;
  const [s, a, c] = raw.split("\u0000");
  let stored: Focus = NO_FOCUS;
  try {
    const v = s ? JSON.parse(s) : null;
    if (isFocus(v)) stored = v;
  } catch {}
  const assets = a === "\u0001" ? null : parseAssetsParam(a, SCOPE_SYMBOLS);
  const chains = c === "\u0001" ? null : parseChainsParam(c, CHAIN_SLUGS);
  const link = assets == null && chains == null ? null : { assets: assets ?? [], chains: chains ?? [] };
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

const isOn = (f: Focus) => f.assets.length > 0 || f.chains.length > 0;

function markHtml(on: boolean) {
  if (on) document.documentElement.dataset.assetScope = "1";
  else delete document.documentElement.dataset.assetScope;
}

const slugOf = (id: number) => CHAINS[id as ChainId]?.slug;

/** The query string for this view under a focus link, or with none. */
function focusQuery(f: Focus | null): string {
  const sp = new URLSearchParams(window.location.search);
  sp.delete(ASSETS_PARAM);
  sp.delete(CHAINS_PARAM);
  const parts = sp.toString() ? [sp.toString()] : [];
  if (f && f.assets.length) parts.push(`${ASSETS_PARAM}=${formatAssetsParam(f.assets, scopeSymbolOf, SCOPE_SYMBOLS)}`);
  if (f && f.chains.length) parts.push(`${CHAINS_PARAM}=${formatChainsParam(f.chains, slugOf)}`);
  return parts.join("&");
}

function writeLink(f: Focus | null) {
  const qs = focusQuery(f && isOn(f) ? f : null);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  notifyUrlChanged();
}

function writeStored(f: Focus) {
  try {
    if (isOn(f)) localStorage.setItem(FOCUS_KEY, JSON.stringify(f));
    else localStorage.setItem(FOCUS_KEY, JSON.stringify(NO_FOCUS));
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

/** A link to this view under this focus. */
export function scopeLink(picks: AssetPick[], chains: number[] = []): string {
  const qs = focusQuery({ assets: picks, chains });
  return `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

/** The picks as they apply under chain focus: each pick's symbol on every
 *  focused chain; a pick with no symbol stays only where its chain is focused. */
export function effectivePicks(picks: AssetPick[], chains: number[]): AssetPick[] {
  if (!chains.length) return picks;
  const out = new Map<string, AssetPick>();
  for (const p of picks) {
    const sym = scopeSymbolOf(p.chain, p.token);
    const on = sym ? (SCOPE_SYMBOLS.get(sym.toLowerCase()) ?? []).filter((t) => chains.includes(t.chain)) : [];
    if (on.length) for (const t of on) out.set(`${t.chain}:${t.token}`, { ...t, builtOn: p.builtOn });
    else if (!sym && chains.includes(p.chain)) out.set(`${p.chain}:${p.token}`, p);
  }
  return [...out.values()];
}

export interface AssetScope {
  /** False through SSR and the first client render: lists draw whole. */
  ready: boolean;
  /** Either part of the focus is set. */
  on: boolean;
  /** The asset picks in force: the link's when it carries a focus, else the stored. */
  picks: AssetPick[];
  /** The focused chains; [] is every chain. */
  chains: number[];
  /** The focus came from `?assets=` / `?chains=`. */
  fromLink: boolean;
  /** The asset keys the picks reach on the focused chains; null when no asset is picked. */
  keys: Set<string> | null;
  /** A chain passes chain focus. */
  chainOk: (chain: number) => boolean;
  /** A row passes the whole focus: one of its keys (`chain:address`) reaches
   *  an asset in focus on a focused chain; with chains alone, its chain (or a
   *  key's chain) is focused. */
  matches: (keys: string[], chain?: number) => boolean;
  /** Replaces the asset picks in force (the link's when the view has one). */
  setPicks: (next: AssetPick[]) => void;
  /** Replaces the focused chains in force. */
  setChains: (next: number[]) => void;
  /** Keeps the link's focus as the stored one and drops the params. */
  keepLink: () => void;
  /** Show everything: clears the stored focus and the link's. */
  clear: () => void;
}

export function useAssetScope(): AssetScope {
  usePathname(); // a navigation re-reads the params
  const ready = useHydrated();
  const snap = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const fromLink = ready && snap.link != null;
  const focus = !ready ? NO_FOCUS : (snap.link ?? snap.stored);
  const picks = focus.assets;
  const chains = focus.chains;
  const keys = useMemo(() => {
    if (!picks.length) return null;
    const all = familyOf(effectivePicks(picks, chains));
    return chains.length ? new Set([...all].filter((k) => chains.includes(chainOfKey(k)))) : all;
  }, [picks, chains]);

  const chainOk = useCallback((c: number) => !chains.length || chains.includes(c), [chains]);
  const matches = useCallback(
    (rowKeys: string[], chain?: number) => {
      if (!picks.length && !chains.length) return true;
      if (chain != null && !chainOk(chain)) return false;
      if (keys) return rowKeys.some((k) => keys.has(k.toLowerCase()));
      return chain != null || rowKeys.some((k) => chainOk(chainOfKey(k)));
    },
    [picks.length, chains.length, chainOk, keys],
  );

  const write = useCallback((next: Focus) => {
    if (snapshot().link != null) writeLink(next);
    else writeStored(next);
    markHtml(isOn(next));
  }, []);
  const current = () => {
    const s = snapshot();
    return s.link ?? s.stored;
  };
  const setPicks = useCallback((next: AssetPick[]) => write({ ...current(), assets: next }), [write]);
  const setChains = useCallback((next: number[]) => write({ ...current(), chains: next }), [write]);
  const keepLink = useCallback(() => {
    const link = snapshot().link;
    if (!link) return;
    writeStored(link);
    writeLink(null);
  }, []);
  const clear = useCallback(() => {
    writeStored(NO_FOCUS);
    if (snapshot().link != null) writeLink(null);
    markHtml(false);
  }, []);

  return {
    ready,
    on: picks.length > 0 || chains.length > 0,
    picks,
    chains,
    fromLink,
    keys,
    chainOk,
    matches,
    setPicks,
    setChains,
    keepLink,
    clear,
  };
}
