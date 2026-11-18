// Answers kept by block number (rails-ops TO-DO-ui-jobs 747): a read at a
// named block never changes, so the last few blocks' answers are kept, and
// concurrent callers asking for one block share one read. Bounded: past
// `limit` blocks, the least recently used goes. An answer `keep` refuses (a
// failed read) is not kept.
//
// Pure: imports nothing, so the unit test reads it (scripts/test).

export function blockKeyedCache<T>(
  limit: number,
  load: (block: number) => Promise<T>,
  keep: (value: T) => boolean = () => true,
): (block: number) => Promise<T> {
  const done = new Map<number, T>();
  const flying = new Map<number, Promise<T>>();
  return (block) => {
    if (done.has(block)) {
      const value = done.get(block) as T;
      done.delete(block);
      done.set(block, value);
      return Promise.resolve(value);
    }
    const inFlight = flying.get(block);
    if (inFlight) return inFlight;
    const p = load(block)
      .then((value) => {
        if (keep(value)) {
          done.set(block, value);
          while (done.size > limit) done.delete(done.keys().next().value as number);
        }
        return value;
      })
      .finally(() => flying.delete(block));
    flying.set(block, p);
    return p;
  };
}
