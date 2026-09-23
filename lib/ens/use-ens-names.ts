"use client";

// Client-side reverse ENS resolution for the owner pills, batched.
// ---------------------------------------------------------------------------
// Each pill that lacks a backend-supplied name calls useEnsName(address); a
// module-level queue coalesces every address requested within a tick into ONE
// `/api/ens/reverse` call (so a listing page of ~20 owner pills is a single
// round trip, not 20). Results are cached in-module for the session, so
// paging back and forth never re-resolves. Best-effort: a failure leaves the
// name null and the pill shows the short address.

import { useEffect, useState } from "react";

const ADDR_RE = /^0x[0-9a-f]{40}$/;

// Resolved names, keyed by lower-cased address. A present key (even → null)
// means "already resolved, don't re-request".
const cache = new Map<string, string | null>();
// Addresses queued for the next flush.
const queue = new Set<string>();
// address → listeners waiting on it.
const subscribers = new Map<string, Set<(name: string | null) => void>>();
let flushScheduled = false;

const MAX_PER_CALL = 100;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  // A macrotask tick lets a full render pass of pills enqueue before we fire.
  setTimeout(flush, 16);
}

async function flush() {
  flushScheduled = false;
  const batch = Array.from(queue);
  queue.clear();
  if (batch.length === 0) return;

  // Chunk defensively — the queue is normally a single page, but never let one
  // call exceed the route's cap.
  for (let i = 0; i < batch.length; i += MAX_PER_CALL) {
    const chunk = batch.slice(i, i + MAX_PER_CALL);
    try {
      const res = await fetch(`/api/ens/reverse?addresses=${chunk.join(",")}`);
      const names: Record<string, string | null> = res.ok ? ((await res.json()).names ?? {}) : {};
      for (const addr of chunk) {
        const name = names[addr] ?? null;
        cache.set(addr, name);
        subscribers.get(addr)?.forEach((cb) => cb(name));
        subscribers.delete(addr);
      }
    } catch {
      // Leave these unresolved but don't pin them — a later mount can retry.
      for (const addr of chunk) subscribers.delete(addr);
    }
  }
}

/**
 * Reverse-resolve one address to its primary ENS name, or null. Returns null
 * until resolution lands (or if there is no name). Pass null to skip (e.g. a
 * closed position with no owner). Safe to call in a listing — lookups batch.
 */
export function useEnsName(address: string | null | undefined): string | null {
  const key = address?.toLowerCase() ?? "";
  const valid = ADDR_RE.test(key);
  const [name, setName] = useState<string | null>(() => (valid ? (cache.get(key) ?? null) : null));

  useEffect(() => {
    if (!valid) {
      setName(null);
      return;
    }
    if (cache.has(key)) {
      setName(cache.get(key) ?? null);
      return;
    }

    let live = true;
    const cb = (resolved: string | null) => {
      if (live) setName(resolved);
    };
    let set = subscribers.get(key);
    if (!set) {
      set = new Set();
      subscribers.set(key, set);
    }
    set.add(cb);
    queue.add(key);
    scheduleFlush();

    return () => {
      live = false;
      subscribers.get(key)?.delete(cb);
    };
  }, [key, valid]);

  return name;
}
