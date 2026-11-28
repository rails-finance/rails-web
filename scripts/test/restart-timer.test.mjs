// lib/shared/restart-timer.ts — the timeline's landing highlight clear
// (components/shared/chain-truth-timeline.tsx): a new start cancels the held
// timer, so an earlier landing's clear never cuts a later one short.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { cancelTimer, restartTimer } = await import("../../lib/shared/restart-timer.ts");

/** A clock run by hand: `tick(ms)` fires what is due. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const due = new Map();
  return {
    set: (run, ms) => {
      due.set(next, { at: now + ms, run });
      return next++;
    },
    clear: (id) => due.delete(id),
    tick(ms) {
      now += ms;
      for (const [id, t] of [...due]) if (t.at <= now) (due.delete(id), t.run());
    },
    pending: () => due.size,
  };
}

test("two quick starts: only the second's end runs, at its own time", () => {
  const clock = fakeClock();
  const held = { current: undefined };
  const ends = [];
  restartTimer(held, () => ends.push("first"), 2000, clock);
  clock.tick(500);
  restartTimer(held, () => ends.push("second"), 2000, clock);
  clock.tick(1500);
  assert.deepEqual(ends, []);
  clock.tick(500);
  assert.deepEqual(ends, ["second"]);
  assert.equal(held.current, undefined);
  assert.equal(clock.pending(), 0);
});

test("one start runs once and empties the ref; cancel stops a held timer", () => {
  const clock = fakeClock();
  const held = { current: undefined };
  let n = 0;
  restartTimer(held, () => n++, 2000, clock);
  clock.tick(2000);
  assert.equal(n, 1);
  assert.equal(held.current, undefined);
  restartTimer(held, () => n++, 2000, clock);
  cancelTimer(held, clock);
  clock.tick(5000);
  assert.equal(n, 1);
  cancelTimer(held, clock);
  assert.equal(clock.pending(), 0);
});
