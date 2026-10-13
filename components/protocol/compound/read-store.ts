"use client";

// A card's chain reads, shared with its sheet: the component that makes a
// read (the rate note, the absorb breakdown) mounts only while the card is
// open, and publishes what it read under the event's key; the sheet, built
// for every card, subscribes and draws the figure once it lands. No read is
// made for a card that is never opened.

import { useSyncExternalStore } from "react";

export interface ReadStore<T> {
  set: (key: string, value: T) => void;
  use: (key: string | null) => T | null;
}

export function createReadStore<T>(): ReadStore<T> {
  const values = new Map<string, T>();
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  return {
    set: (key, value) => {
      values.set(key, value);
      listeners.forEach((fn) => fn());
    },
    use: (key) =>
      useSyncExternalStore(
        subscribe,
        () => (key == null ? null : (values.get(key) ?? null)),
        () => null,
      ),
  };
}
