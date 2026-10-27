"use client";

// The health view's factor reads at past blocks (ui-jobs 328 step 5;
// lib/shared/flows-health.ts): one GET per URL, kept for the life of the tab.
// At most MAX_IN_FLIGHT run at once; a read that fails or takes longer than
// READ_TIMEOUT_MS is asked once more, then counts as missing (null).

const READ_TIMEOUT_MS = 25_000;
const RETRY_AFTER_MS = 2_000;
const MAX_IN_FLIGHT = 3;

const settled = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_IN_FLIGHT) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function attempt<T>(url: string, accept: (body: unknown) => T | null): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return res.ok ? accept(await res.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The answer at `url` that `accept` takes (null: refused), or null where
 *  both attempts missed. */
export function healthRead<T>(url: string, accept: (body: unknown) => T | null): Promise<T | null> {
  if (settled.has(url)) return Promise.resolve(settled.get(url) as T);
  let p = inFlight.get(url) as Promise<T | null> | undefined;
  if (!p) {
    p = (async () => {
      let r = await limited(() => attempt(url, accept));
      if (r == null) {
        await new Promise((go) => setTimeout(go, RETRY_AFTER_MS));
        r = await limited(() => attempt(url, accept));
      }
      if (r != null) settled.set(url, r);
      inFlight.delete(url);
      return r;
    })();
    inFlight.set(url, p);
  }
  return p;
}
