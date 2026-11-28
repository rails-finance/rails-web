// One timer held in a ref, restarted: starting it cancels the one it holds,
// so a later start is never cut short by an earlier one's end. The timeline's
// landing highlight (components/shared/chain-truth-timeline.tsx) holds its 2 s
// clear here. Pure, and imports nothing: scripts/test loads it directly.

export interface HeldTimer<T> {
  current: T | undefined;
}

export interface TimerClock<T> {
  set: (run: () => void, ms: number) => T;
  clear: (t: T) => void;
}

/** Cancels the timer `held` holds, if any, and starts `run` after `ms`. */
export function restartTimer<T>(held: HeldTimer<T>, run: () => void, ms: number, clock: TimerClock<T>): void {
  cancelTimer(held, clock);
  held.current = clock.set(() => {
    held.current = undefined;
    run();
  }, ms);
}

/** Cancels the timer `held` holds, if any. */
export function cancelTimer<T>(held: HeldTimer<T>, clock: Pick<TimerClock<T>, "clear">): void {
  if (held.current !== undefined) clock.clear(held.current);
  held.current = undefined;
}
