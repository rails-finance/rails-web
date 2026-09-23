"use client";

// Page-level price cache. Any descendant calls `useRequestPrices([addr…])` to
// enrol a token, then reads USD values via `usePrices()`. The provider
// batches concurrent requests into a single `/api/prices` call (which itself
// proxies to rails-server-onboarding and DefiLlama), deduplicates in-flight fetches,
// and refreshes entries older than the TTL. Each component asks for what it
// needs — no hardcoded allowlist.
//
// The price-context API surface is PricesProvider, usePrices, useRequestPrices,
// and usePrice; the components that consume it expect this exact contract.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type PriceMap = Record<string, number>;

interface PricesApi {
  request: (tokens: string[]) => void;
}

const PricesDataContext = createContext<PriceMap>({});
const PricesApiContext = createContext<PricesApi | null>(null);

const TTL_MS = 60 * 60 * 1000;
const BATCH_LIMIT = 50;
const ADDR_RE = /^0x[0-9a-f]{40}$/;

function normalize(addr: string): string {
  return addr.trim().toLowerCase();
}

function coerceUsd(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return v;
  if (v && typeof v === "object" && "usd" in v) {
    const u = (v as { usd: unknown }).usd;
    if (typeof u === "number" && u > 0) return u;
  }
  return null;
}

export function PricesProvider({
  children,
  initialPrices,
  endpoint = "/api/prices",
}: {
  children: React.ReactNode;
  initialPrices?: Record<string, number | { usd: number } | undefined>;
  /** Price source endpoint. Defaults to the live `/api/prices` (the rails-server
   *  price service, DefiLlama-backed). Every consumer hook (usePrices /
   *  resolvePrice) is agnostic to it. */
  endpoint?: string;
}) {
  const [prices, setPrices] = useState<PriceMap>(() => {
    const seed: PriceMap = {};
    if (initialPrices) {
      for (const [k, v] of Object.entries(initialPrices)) {
        const n = coerceUsd(v);
        if (n != null) seed[normalize(k)] = n;
      }
    }
    return seed;
  });

  const cacheMetaRef = useRef<Map<string, number>>(new Map());
  const inflightRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    const now = Date.now();
    for (const k of Object.keys(prices)) cacheMetaRef.current.set(k, now);
  }

  const flush = useCallback(async () => {
    flushTimerRef.current = null;
    const queue = [...pendingRef.current];
    pendingRef.current.clear();
    if (queue.length === 0) return;

    for (let i = 0; i < queue.length; i += BATCH_LIMIT) {
      const chunk = queue.slice(i, i + BATCH_LIMIT);
      for (const t of chunk) inflightRef.current.add(t);
      try {
        const sep = endpoint.includes("?") ? "&" : "?";
        const res = await fetch(`${endpoint}${sep}tokens=${chunk.join(",")}`);
        if (!res.ok) continue;
        const data = (await res.json()) as Record<string, unknown>;
        const now = Date.now();
        const next: PriceMap = {};
        for (const [rawAddr, v] of Object.entries(data)) {
          const addr = normalize(rawAddr);
          const num = coerceUsd(v);
          if (num != null) {
            cacheMetaRef.current.set(addr, now);
            next[addr] = num;
          }
        }
        if (Object.keys(next).length > 0) {
          setPrices((prev) => ({ ...prev, ...next }));
        }
      } catch {
        // Same failure semantics as the previous ad-hoc fetchers: silent drop.
      } finally {
        for (const t of chunk) inflightRef.current.delete(t);
      }
    }
  }, [endpoint]);

  const request = useCallback(
    (tokens: string[]) => {
      const now = Date.now();
      let added = false;
      for (const raw of tokens) {
        if (!raw) continue;
        const addr = normalize(raw);
        if (!ADDR_RE.test(addr)) continue;
        const fetchedAt = cacheMetaRef.current.get(addr);
        if (fetchedAt != null && now - fetchedAt < TTL_MS) continue;
        if (inflightRef.current.has(addr)) continue;
        if (pendingRef.current.has(addr)) continue;
        pendingRef.current.add(addr);
        added = true;
      }
      if (added && flushTimerRef.current == null) {
        flushTimerRef.current = setTimeout(flush, 0);
      }
    },
    [flush],
  );

  const api = useMemo<PricesApi>(() => ({ request }), [request]);

  return (
    <PricesApiContext.Provider value={api}>
      <PricesDataContext.Provider value={prices}>{children}</PricesDataContext.Provider>
    </PricesApiContext.Provider>
  );
}

export function usePrices(): PriceMap {
  return useContext(PricesDataContext);
}

/**
 * Enrol a list of token addresses. Triggers a batched fetch for any address
 * that is missing or stale. Stable identity via sorted join means repeated
 * renders with the same set do no extra work.
 */
export function useRequestPrices(tokens: readonly (string | null | undefined)[]): void {
  const api = useContext(PricesApiContext);
  const key = useMemo(() => {
    const clean: string[] = [];
    for (const t of tokens) {
      if (!t) continue;
      const addr = normalize(t);
      if (ADDR_RE.test(addr)) clean.push(addr);
    }
    return [...new Set(clean)].sort().join(",");
  }, [tokens]);
  useEffect(() => {
    if (!api || !key) return;
    api.request(key.split(","));
  }, [api, key]);
}
