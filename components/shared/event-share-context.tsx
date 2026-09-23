"use client";

// The one channel a per-event share link travels from `ChainTruthTimeline`
// (which knows the position's path and every event's opaque id) down to
// `EventCardFooter` (which draws the copy-link control) — without threading a
// new prop through 20 families' event-card composers. `ChainTruthTimeline`
// wraps each rendered card in a provider carrying that ONE event's share href;
// the footer reads it and renders the control only where a provider is
// actually present, so a card rendered outside a timeline (a simulator shell,
// a standalone preview) simply gets no share button rather than a broken one.

import { createContext, useContext, type ReactNode } from "react";

const EventShareContext = createContext<string | null>(null);

export function EventShareProvider({ href, children }: { href: string; children: ReactNode }) {
  return <EventShareContext.Provider value={href}>{children}</EventShareContext.Provider>;
}

/** This event's share path (site-relative — `EventCardFooter` resolves it
 *  against `window.location.origin` at copy time), or `null` outside any
 *  provider. */
export function useEventShareHref(): string | null {
  return useContext(EventShareContext);
}
