// At most `n` calls in flight; the rest wait their turn in order. The Liquidity section's
// reads share one (lib/wallet/liquidity/hop.ts), so a wallet's dozen reads never open more
// connections to rails-server at once than ui-jobs 813's limiter allows.
//
// Pure, with no imports: scripts/test/wallet-liquidity.test.mjs reads it.

export function createLimit(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= n) return;
    const go = queue.shift();
    if (go) {
      active += 1;
      go();
    }
  };
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
  };
}
