"use client";

// How did the events on this page reach it?
// ----------------------------------------------------------------------------
// Every event card's provenance receipt carries a custody line — the one line
// that names where a decoded log came from, as opposed to what it means. On
// almost every explorer the answer is the rails-server index. On the Base
// explorers there is no index: the route sweeps the chain's own logs when the
// page asks, and a receipt that named an index there would be pointing the
// reader at something that does not exist.
//
// The card components can't take this as a prop without threading it through
// layers (card → header → detail → explainer) that have no opinion on it, and
// they can't infer it from the chain — a Base explorer that later gains an
// index would keep rendering the sweep wording. So it is context, set by the
// page that knows, exactly as ChainProvider is.
//
// The default is "index" AND THE INDEXED PAGES MOUNT NO PROVIDER, so every
// existing receipt renders the string it rendered before this existed.

import { createContext, useContext, type ReactNode } from "react";

export type CaptureSource = "index" | "sweep";

const CaptureSourceContext = createContext<CaptureSource>("index");

export function CaptureSourceProvider({ value, children }: { value: CaptureSource; children: ReactNode }) {
  return <CaptureSourceContext.Provider value={value}>{children}</CaptureSourceContext.Provider>;
}

/** How this page's events were captured; "index" outside any provider. */
export function useCaptureSource(): CaptureSource {
  return useContext(CaptureSourceContext);
}
