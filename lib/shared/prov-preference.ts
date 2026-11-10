"use client";

// The standing provenance inspector (rails-ops decision 0062 point 1, ui-jobs
// 571): one switch in the profile menu (H20), off by default, held in this
// browser as Focus's views are (lib/shared/asset-scope.ts). While it is on,
// the inspector layer arms page-wide on arrival on the routes in
// lib/shared/prov-preference-routes.ts.

import { useSyncExternalStore } from "react";

export const PROV_PREFERENCE_KEY = "rails-prov-inspector";
const CHANGE = "rails:prov-preference";

function read(): boolean {
  try {
    return localStorage.getItem(PROV_PREFERENCE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(fn: () => void) {
  window.addEventListener(CHANGE, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(CHANGE, fn);
    window.removeEventListener("storage", fn);
  };
}

/** Turn the standing inspector on or off in this browser. */
export function setProvPreference(on: boolean) {
  try {
    if (on) localStorage.setItem(PROV_PREFERENCE_KEY, "1");
    else localStorage.removeItem(PROV_PREFERENCE_KEY);
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

/** Whether the standing inspector is on; false on the server and until hydration. */
export function useProvPreference(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
