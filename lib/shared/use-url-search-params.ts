"use client";

// Self-contained replacement for next/navigation's useSearchParams for the
// chain-state listing pages.
//
// Why not the framework hook: reading useSearchParams() forces the subtree that
// reads it behind a streamed Suspense boundary. On these force-dynamic listing
// routes that boundary's dehydrated copy (`<div hidden id="S:0">`) is left in the
// DOM on hydration, duplicating the whole listing subtree (2× cards, hidden).
// Reading the URL ourselves — seeded from the server (initialSearch), then synced
// to window.location on the client — keeps the listing out of any Suspense
// boundary, so the shell renders inline with no leftover copy.
//
// These pages navigate with the History API (window.history.pushState) rather than
// router.push, to avoid re-running the route's force-dynamic server fetch on every
// filter toggle. pushState doesn't emit `popstate`, so a caller MUST invoke
// notifyUrlChanged() after it for subscribers to re-read the URL.

import { useEffect, useMemo, useState } from "react";

const URL_CHANGE_EVENT = "rails:url-change";

/** Nudge useUrlSearchParams subscribers to re-read the URL. Call immediately after
 *  a window.history.pushState / replaceState (which don't fire `popstate`). */
export function notifyUrlChanged(): void {
  window.dispatchEvent(new Event(URL_CHANGE_EVENT));
}

/** URL query params as a reactive URLSearchParams, without next/navigation's
 *  Suspense-forcing useSearchParams.
 *
 *  First render (server + client hydration) uses `initialSearch` verbatim so the
 *  markup matches; a mount effect then reconciles with the live URL and subscribes
 *  to back/forward (popstate) + our own pushState signal (notifyUrlChanged).
 *
 *  A SEPARATE effect re-adopts `initialSearch` whenever it changes after mount.
 *  Reason: an in-app Next.js navigation to this same route with different search
 *  params (e.g. a wallet pill elsewhere that `router.push`es `/ethereum/aave-v4?q=…`) hands
 *  the page.tsx server component a fresh `searchParams` and re-renders this client
 *  component with a new `initialSearch` prop — but React keeps the SAME component
 *  instance (same type, same position), so it does not remount. `popstate` never
 *  fires for a pushState-driven navigation, and `notifyUrlChanged` is only ever
 *  dispatched by this driver's OWN history.pushState calls (facet/search pushes),
 *  not by the Next router — so without this effect, `search` would keep whatever
 *  value it held before the navigation and the new query would never be read. */
export function useUrlSearchParams(initialSearch: string): URLSearchParams {
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => {
    const sync = () => setSearch(window.location.search.replace(/^\?/, ""));
    sync(); // reconcile the first-paint value with the real URL after mount
    window.addEventListener("popstate", sync);
    window.addEventListener(URL_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(URL_CHANGE_EVENT, sync);
    };
  }, []);
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);
  return useMemo(() => new URLSearchParams(search), [search]);
}
