// The holder label's per-tick batching (lib/shared/use-holder-label.ts), apart
// from React so it tests without a DOM. Every ask within one tick goes out as
// one fetch per chain; answers are cached for the session. A fetch takes the
// callbacks waiting at that moment, so one that fails drops only those, and an
// ask made while it is in flight waits for a fetch of its own.

const MAX_PER_CALL = 100;

export interface HolderLabelBatcher<T> {
  /** The cached answer: a value, null for a miss, undefined when not yet asked. */
  get(chainId: number, address: string): T | null | undefined;
  /** Wait for `address` on `chainId`; returns the unsubscribe. */
  subscribe(chainId: number, address: string, cb: (value: T | null) => void): () => void;
  /** Send what is queued now (the scheduler calls it; tests call it direct). */
  flush(): Promise<void>;
}

export function createHolderLabelBatcher<T>(
  fetchBatch: (chainId: number, addresses: string[]) => Promise<Record<string, T>>,
  schedule: (run: () => void) => void = (run) => setTimeout(run, 16),
): HolderLabelBatcher<T> {
  const cache = new Map<string, T | null>();
  const queue = new Map<number, Set<string>>();
  const waiting = new Map<string, Set<(value: T | null) => void>>();
  let scheduled = false;

  const keyOf = (chainId: number, address: string) => `${chainId}:${address}`;

  async function flush() {
    scheduled = false;
    const batches = Array.from(queue.entries());
    queue.clear();
    for (const [chainId, set] of batches) {
      const all = Array.from(set).filter((a) => !cache.has(keyOf(chainId, a)));
      for (let i = 0; i < all.length; i += MAX_PER_CALL) {
        const chunk = all.slice(i, i + MAX_PER_CALL);
        // This fetch's callbacks, taken out of `waiting`, so a later ask
        // starts a set of its own.
        const mine = new Map<string, Set<(value: T | null) => void>>();
        for (const a of chunk) {
          const key = keyOf(chainId, a);
          const cbs = waiting.get(key);
          if (cbs) mine.set(key, cbs);
          waiting.delete(key);
        }
        try {
          const hits = await fetchBatch(chainId, chunk);
          for (const a of chunk) {
            const key = keyOf(chainId, a);
            const value = hits[a] ?? null;
            cache.set(key, value);
            mine.get(key)?.forEach((cb) => cb(value));
            // An ask made during the fetch is answered by it too.
            waiting.get(key)?.forEach((cb) => cb(value));
            waiting.delete(key);
          }
        } catch {
          // Drop this fetch's callbacks only; a later mount may ask again.
        }
      }
    }
  }

  return {
    get: (chainId, address) => cache.get(keyOf(chainId, address)),
    subscribe(chainId, address, cb) {
      const key = keyOf(chainId, address);
      let set = waiting.get(key);
      if (!set) waiting.set(key, (set = new Set()));
      const mine = set;
      mine.add(cb);
      let q = queue.get(chainId);
      if (!q) queue.set(chainId, (q = new Set()));
      q.add(address);
      if (!scheduled) {
        scheduled = true;
        schedule(() => void flush());
      }
      return () => {
        mine.delete(cb);
      };
    },
    flush,
  };
}
