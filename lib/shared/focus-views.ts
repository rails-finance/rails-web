// Saved Focus views (ui-jobs 557, Miles 10 Nov 2026): a reader keeps any
// number of named focuses in this browser, beside the saved items, and one is
// in use or Focus is off. A view's name is a free label ("My stables"); one
// with no name of its own is called by what it holds ("WETH and BOLD").
//
// One state: `rails-focus-views` holds `{ views: [{ id, name?, assets, chains,
// savedAt }], active: id | null }` in the reader's order, and the script in
// app/layout.tsx reads it before first paint. A view always holds something:
// an edit that empties a view removes it, so "empty" and "off" are one state.
// A link (`?assets=`, `?chains=`, `&view=<name>`) is a proposed view: nothing
// filters by it until "Use this view" saves it, or switches to a saved view
// holding the same focus, so a link opened twice is one view.
//
// A view takes a star as the saved items do (ui-jobs 652): the profile menu's
// Focus group lists the starred views, in the reader's order, and Off. The
// view in use is listed too while it is unstarred, so Focus can always be
// turned off from the menu. A new view starts starred. A store from before 652 is seeded once (`seedViewStars`).
//
// Pure: type imports only (scripts/test/focus-views.test.mjs runs it directly).

import type { AssetPick, Focus } from "@/lib/shared/asset-preference";

/** The name a link gives its view. */
export const VIEW_PARAM = "view";

export interface FocusView {
  id: string;
  /** The reader's or the link's name; absent, the view is called by what it holds. */
  name?: string;
  assets: AssetPick[];
  chains: number[];
  savedAt: number;
  /** Listed in the profile menu (ui-jobs 652). */
  starred?: boolean;
}

export interface FocusViews {
  views: FocusView[];
  /** The view in use; null is Focus off. */
  active: string | null;
}

export const NO_VIEWS: FocusViews = { views: [], active: null };

/** Views a backup or a store may hold; more are dropped. */
export const MAX_VIEWS = 100;
const MAX_PICKS = 200;
export const MAX_NAME = 60;

const isPick = (p: unknown): p is AssetPick =>
  !!p &&
  typeof p === "object" &&
  Number.isInteger((p as AssetPick).chain) &&
  typeof (p as AssetPick).token === "string" &&
  /^0x[0-9a-f]{40}$/i.test((p as AssetPick).token) &&
  typeof (p as AssetPick).builtOn === "boolean" &&
  ((p as AssetPick).symbol === undefined || typeof (p as AssetPick).symbol === "string") &&
  ((p as AssetPick).also === undefined ||
    (Array.isArray((p as AssetPick).also) &&
      (p as AssetPick).also!.every(
        (a) => !!a && Number.isInteger(a.chain) && typeof a.token === "string" && /^0x[0-9a-f]{40}$/i.test(a.token),
      )));

function isView(v: unknown): v is FocusView {
  if (!v || typeof v !== "object") return false;
  const r = v as FocusView;
  return (
    typeof r.id === "string" &&
    (r.name === undefined || typeof r.name === "string") &&
    (r.starred === undefined || typeof r.starred === "boolean") &&
    Array.isArray(r.assets) &&
    r.assets.every(isPick) &&
    Array.isArray(r.chains) &&
    r.chains.every((c) => Number.isInteger(c))
  );
}

/** A view read from a store or a file, on the chains Rails knows: picks and
 *  chains elsewhere dropped, the name cut to MAX_NAME, null when nothing is left. */
export function cleanView(v: unknown, chainOk: (id: number) => boolean = () => true): FocusView | null {
  if (!isView(v)) return null;
  const assets = v.assets
    .filter((p) => chainOk(p.chain))
    .slice(0, MAX_PICKS)
    .map((p) => ({
      chain: p.chain,
      token: p.token.toLowerCase(),
      builtOn: p.builtOn,
      ...(p.symbol ? { symbol: p.symbol.slice(0, 40) } : {}),
      ...(p.also?.length
        ? {
            also: p.also.filter((a) => chainOk(a.chain)).map((a) => ({ chain: a.chain, token: a.token.toLowerCase() })),
          }
        : {}),
    }));
  const chains = [...new Set(v.chains.filter(chainOk))];
  if (!assets.length && !chains.length) return null;
  const name = v.name?.trim().slice(0, MAX_NAME);
  return {
    id: v.id.slice(0, 40),
    ...(name ? { name } : {}),
    assets,
    chains,
    savedAt: typeof v.savedAt === "number" ? v.savedAt : 0,
    ...(v.starred ? { starred: true } : {}),
  };
}

export function isFocusViews(v: unknown): v is FocusViews {
  if (!v || typeof v !== "object") return false;
  const r = v as FocusViews;
  return Array.isArray(r.views) && r.views.every(isView) && (r.active === null || typeof r.active === "string");
}

/** The store as read: each view kept or dropped on its own (one malformed
 *  view does not empty the rest), empty views gone, the view in use null
 *  unless it is still there. */
export function readViews(v: unknown, chainOk?: (id: number) => boolean): FocusViews {
  if (!v || typeof v !== "object" || !Array.isArray((v as FocusViews).views)) return NO_VIEWS;
  const seen = new Set<string>();
  const views: FocusView[] = [];
  for (const raw of (v as FocusViews).views) {
    const c = cleanView(raw, chainOk);
    if (!c || seen.has(c.id) || views.length >= MAX_VIEWS) continue;
    seen.add(c.id);
    views.push(c);
  }
  const active = (v as FocusViews).active;
  return { views, active: typeof active === "string" && seen.has(active) ? active : null };
}

export const focusOn = (f: Focus): boolean => f.assets.length > 0 || f.chains.length > 0;

/** A pick's addresses under a chain focus: its own and its asset's on other
 *  chains (`also`), on the focused chains; with no chain focus, its own. */
export function pickKeys(p: AssetPick, chains: readonly number[]): string[] {
  const own = `${p.chain}:${p.token.toLowerCase()}`;
  if (!chains.length) return [own];
  return [{ chain: p.chain, token: p.token }, ...(p.also ?? [])]
    .filter((a) => chains.includes(a.chain))
    .map((a) => `${a.chain}:${a.token.toLowerCase()}`);
}

/** Two focuses reach the same assets (each with its built-on switch) on the
 *  same chains, in any order: `8453:BOLD` and `1:BOLD` under Ethereum focus
 *  are one focus. */
export function sameFocus(a: Focus, b: Focus): boolean {
  const assets = (f: Focus) =>
    [...new Set(f.assets.flatMap((p) => pickKeys(p, f.chains).map((k) => `${k}:${p.builtOn ? 1 : 0}`)))]
      .sort()
      .join(",");
  const chains = (f: Focus) => [...new Set(f.chains)].sort((x, y) => x - y).join(",");
  return assets(a) === assets(b) && chains(a) === chains(b);
}

/** The view in use, or null. */
export function activeView(s: FocusViews): FocusView | null {
  return s.views.find((v) => v.id === s.active) ?? null;
}

/** The focus in use: the active view's, or none. */
export function activeFocus(s: FocusViews): Focus {
  const v = activeView(s);
  return v ? { assets: v.assets, chains: v.chains } : { assets: [], chains: [] };
}

/** "Use this view": the link's focus saved and put in use, or the saved view
 *  holding the same focus put in use (taking the link's name when it has
 *  none). A new view goes first. */
export function adoptFocus(s: FocusViews, f: Focus, name: string | undefined, id: string, at: number): FocusViews {
  const label = name?.trim().slice(0, MAX_NAME) || undefined;
  if (!focusOn(f)) return s;
  const same = s.views.find((v) => sameFocus(v, f));
  if (same)
    return {
      views: s.views.map((v) => (v.id === same.id && !v.name && label ? { ...v, name: label } : v)),
      active: same.id,
    };
  const view: FocusView = {
    id,
    ...(label ? { name: label } : {}),
    assets: f.assets,
    chains: f.chains,
    savedAt: at,
    starred: true,
  };
  return { views: [view, ...s.views], active: id };
}

/** An edit to the focus in use: written into the active view, or, with none
 *  in use and the focus on, into a new view put in use (named `name`). An
 *  edit that empties the view in use removes it: Focus is off. */
export function editActive(s: FocusViews, f: Focus, id: string, at: number, name?: string): FocusViews {
  if (s.active && s.views.some((v) => v.id === s.active)) return editView(s, s.active, f);
  if (!focusOn(f)) return s;
  return addView(s, f, name, id, at);
}

/** An edit to one view; emptied, it is removed (and Focus is off if it was in use). */
export function editView(s: FocusViews, id: string, f: Focus): FocusViews {
  if (!focusOn(f)) return removeView(s, id);
  return { ...s, views: s.views.map((v) => (v.id === id ? { ...v, assets: f.assets, chains: f.chains } : v)) };
}

/** A new view holding `f`, first in the list (or at `index`), put in use and
 *  starred. A focus holding nothing makes no view. */
export function addView(
  s: FocusViews,
  f: Focus,
  name: string | undefined,
  id: string,
  at: number,
  index = 0,
): FocusViews {
  if (!focusOn(f)) return s;
  const label = name?.trim().slice(0, MAX_NAME) || undefined;
  const view: FocusView = {
    id,
    ...(label ? { name: label } : {}),
    assets: f.assets,
    chains: f.chains,
    savedAt: at,
    starred: true,
  };
  const views = [...s.views];
  views.splice(Math.max(0, Math.min(views.length, index)), 0, view);
  return { views, active: id };
}

/** A removed view put back where it was, in use again if it was. */
export function restoreView(s: FocusViews, view: FocusView, index: number, wasActive: boolean): FocusViews {
  if (s.views.some((v) => v.id === view.id)) return s;
  const views = [...s.views];
  views.splice(Math.max(0, Math.min(views.length, index)), 0, view);
  return { views, active: wasActive ? view.id : s.active };
}

export function setActive(s: FocusViews, id: string | null): FocusViews {
  return { ...s, active: id && s.views.some((v) => v.id === id) ? id : null };
}

/** An empty name goes back to what the view holds. */
export function renameView(s: FocusViews, id: string, name: string): FocusViews {
  const label = name.trim().slice(0, MAX_NAME);
  return {
    ...s,
    views: s.views.map((v) => {
      if (v.id !== id) return v;
      const { name: _old, ...rest } = v;
      void _old;
      return label ? { ...rest, name: label } : rest;
    }),
  };
}

export function removeView(s: FocusViews, id: string): FocusViews {
  return { views: s.views.filter((v) => v.id !== id), active: s.active === id ? null : s.active };
}

export interface ViewsMerge {
  state: FocusViews;
  /** Distinct views the file carried. */
  read: number;
  /** Of those, the ones not already saved here. */
  added: number;
}

/** An import: each view the file carries that no saved view holds the same
 *  focus as goes after the reader's views, in the file's order, with the
 *  file's star; one already saved gives it the file's name when it has none.
 *  With `starAll` (a file from before ui-jobs 652, which carries no stars) a
 *  view the import adds starts starred. The view in use stays. */
export function mergeViews(
  s: FocusViews,
  incoming: unknown,
  newId: () => string,
  at: number,
  chainOk?: (id: number) => boolean,
  starAll = false,
): ViewsMerge {
  const list = Array.isArray(incoming)
    ? incoming
        .slice(0, MAX_VIEWS)
        .map((v) => cleanView(v, chainOk))
        .filter((v): v is FocusView => v != null)
    : [];
  let views = [...s.views];
  const seen: FocusView[] = [];
  let added = 0;
  for (const v of list) {
    if (seen.some((x) => sameFocus(x, v))) continue;
    seen.push(v);
    const label = v.name;
    const held = views.find((x) => sameFocus(x, v));
    if (held) {
      if (!held.name && label) views = views.map((x) => (x.id === held.id ? { ...x, name: label } : x));
      continue;
    }
    if (views.length >= MAX_VIEWS) break;
    const id = views.some((x) => x.id === v.id) ? newId() : v.id;
    views.push({
      id,
      ...(label ? { name: label } : {}),
      assets: v.assets,
      chains: v.chains,
      savedAt: v.savedAt || at,
      ...(starAll || v.starred ? { starred: true } : {}),
    });
    added++;
  }
  return { state: { views, active: s.active }, read: seen.length, added };
}

/** Move a view to `to` (clamped). */
export function moveView(s: FocusViews, id: string, to: number): FocusViews {
  const from = s.views.findIndex((v) => v.id === id);
  if (from < 0) return s;
  const views = [...s.views];
  const [v] = views.splice(from, 1);
  views.splice(Math.max(0, Math.min(views.length, to)), 0, v);
  return { ...s, views };
}

/** Star or unstar a view. */
export function toggleViewStar(s: FocusViews, id: string): FocusViews {
  return {
    ...s,
    views: s.views.map((v) => {
      if (v.id !== id) return v;
      if (!v.starred) return { ...v, starred: true };
      const { starred: _old, ...rest } = v;
      void _old;
      return rest;
    }),
  };
}

/** The views the profile menu lists (ui-jobs 652): the starred and the view
 *  in use, in the reader's order. */
export const menuViews = (s: FocusViews): FocusView[] => s.views.filter((v) => v.starred || v.id === s.active);

/** The stars a store from before ui-jobs 652 is given: with no view starred,
 *  the view the menu offered is starred (the one chosen for it, `menuId`, else
 *  the view in use, else the first). A store with a star is left as it is. */
export function seedViewStars(s: FocusViews, menuId: string | null): FocusViews {
  if (!s.views.length || s.views.some((v) => v.starred)) return s;
  const pick = s.views.find((v) => v.id === menuId) ?? activeView(s) ?? s.views[0];
  return { ...s, views: s.views.map((v) => (v.id === pick.id ? { ...v, starred: true } : v)) };
}
