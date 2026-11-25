"use client";

// The price strip's hand-over (rails-ops TO-DO-ui-jobs 430): on a page that
// draws a detail position card, the price strip (H7.2) and the recency stamp
// (H6) stand at the left of the card's heading row; on a page that draws none
// (an event page, a loading branch, a wallet overview of listing cards) they
// stay at the wallet heading's right end.
//
// `DetailTopRow` builds the strip and is a sibling of the card, so the context
// sits in the app layout: the row publishes its strip node, the card's heading
// row (`PositionCardStripSlot`) registers on mount and draws it, and the row
// reads whether a slot holds it. The first slot to register draws the strip;
// a second detail card on the page draws none. Rendered in the card, the
// strip's prices are in the card's receipts scope.
//
// One store object for the layout's life, read with `useSyncExternalStore`:
// the row republishes on every render and only the slot re-renders.
//
// The same store carries the other way the position's name (H13.4): each
// detail card registers its `PositionName`, and the wallet heading's trail
// reads the first card's as its position crumb.

import type { PositionName } from "@/lib/shared/position-name";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/** The card's lifecycle as the trail draws it (H13.4): the pill's word and
 *  tone, "open" for the OPEN pill. */
export interface TrailStatus {
  word: string;
  tone: "open" | "muted" | "danger" | "caution";
  tip?: string;
}

interface StripStore {
  node: ReactNode;
  slots: string[];
  /** The detail cards' names, in mount order. */
  names: { id: string; name: PositionName; status: TrailStatus | null }[];
  /** The wallet headings whose trail names the page's position. */
  trails: string[];
  listeners: Set<() => void>;
}

function createStore(): StripStore {
  return { node: null, slots: [], names: [], trails: [], listeners: new Set() };
}

const notify = (s: StripStore) => s.listeners.forEach((l) => l());

const PositionCardStripContext = createContext<StripStore | null>(null);

export function PositionCardStripProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  return <PositionCardStripContext.Provider value={store}>{children}</PositionCardStripContext.Provider>;
}

function useSubscribe(store: StripStore | null) {
  return useCallback(
    (listener: () => void) => {
      if (!store) return () => {};
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );
}

/** DetailTopRow's half: publishes `node` (null for nothing to show) and
 *  returns whether a card's heading row draws it. False on the server and
 *  until a card mounts, so the heading draws the strip until then. */
export function usePublishPositionCardStrip(node: ReactNode): boolean {
  const store = useContext(PositionCardStripContext);
  const subscribe = useSubscribe(store);
  // Every render: the node is new each time.
  useLayoutEffect(() => {
    if (!store) return;
    store.node = node;
    notify(store);
  });
  useEffect(() => {
    if (!store) return;
    return () => {
      store.node = null;
      notify(store);
    };
  }, [store]);
  return useSyncExternalStore(
    subscribe,
    () => (store ? store.slots.length > 0 : false),
    () => false,
  );
}

/** The card's half: the strip, where this card is the first detail card to
 *  mount on the page; else nothing. */
export function PositionCardStripSlot({ children }: { children: (strip: ReactNode) => ReactNode }) {
  const store = useContext(PositionCardStripContext);
  const id = useId();
  const subscribe = useSubscribe(store);
  useLayoutEffect(() => {
    if (!store) return;
    store.slots.push(id);
    notify(store);
    return () => {
      store.slots = store.slots.filter((s) => s !== id);
      notify(store);
    };
  }, [store, id]);
  const node = useSyncExternalStore(
    subscribe,
    () => (store && store.slots[0] === id ? store.node : null),
    () => null,
  );
  return node ? children(node) : null;
}

/** The detail card's half of the name: registers `name` and the card's
 *  lifecycle while the card is mounted, kept current as they change. */
export function usePublishPositionCardName(name: PositionName | undefined, status: TrailStatus | null) {
  const store = useContext(PositionCardStripContext);
  const id = useId();
  const text = name?.text;
  const word = status?.word;
  const tone = status?.tone;
  const tip = status?.tip;
  useLayoutEffect(() => {
    if (!store || !name) return;
    store.names = [...store.names.filter((n) => n.id !== id), { id, name, status }];
    notify(store);
    return () => {
      store.names = store.names.filter((n) => n.id !== id);
      notify(store);
    };
    // The name and status are new objects each render; their words are
    // what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, id, text, word, tone, tip]);
}

/** The wallet heading's half: the first detail card's name and lifecycle,
 *  or null while none is mounted (and on the server). */
export function usePositionCardName(): { name: PositionName; status: TrailStatus | null } | null {
  const store = useContext(PositionCardStripContext);
  const subscribe = useSubscribe(store);
  return useSyncExternalStore(
    subscribe,
    () => store?.names[0] ?? null,
    () => null,
  );
}

/** The wallet heading's half of the hand-over the other way: while `on`, the
 *  heading's trail names the page's position and its lifecycle, so a detail
 *  card leaves its name (the tag) and its pill out of its heading row
 *  (ui-jobs 856). */
export function useRegisterPositionTrail(on: boolean) {
  const store = useContext(PositionCardStripContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!store || !on) return;
    store.trails = [...store.trails, id];
    notify(store);
    return () => {
      store.trails = store.trails.filter((t) => t !== id);
      notify(store);
    };
  }, [store, id, on]);
}

/** The card's half: whether a wallet heading's trail names the position.
 *  False on the server and on a page with no wallet heading. */
export function usePositionTrailNamed(): boolean {
  const store = useContext(PositionCardStripContext);
  const subscribe = useSubscribe(store);
  return useSyncExternalStore(
    subscribe,
    () => (store ? store.trails.length > 0 : false),
    () => false,
  );
}
