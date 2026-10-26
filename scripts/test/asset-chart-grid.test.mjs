// The asset chart's time grid (lib/shared/asset-chart-grid.ts); rails-ops
// reference/asset-key-map.md, "The chart engine". Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  CHUNK_CELLS,
  DAY_S,
  cellAt,
  gridChunks,
  gridFor,
  gridStep,
  lineTrack,
  needsRegrid,
  sampleSpread,
  sampleTrack,
  withDetail,
} from "../../lib/shared/asset-chart-grid.ts";

test("the step fits the window at about two pixels a cell", () => {
  assert.equal(gridStep(DAY_S, 600), 300); // 300 cells → 288 s → 5 min
  assert.equal(gridStep(30 * DAY_S, 600), 14_400);
  assert.equal(gridStep(365 * DAY_S, 1200), DAY_S);
});

test("a grid covers the window and one window either side, cut to the data", () => {
  const g = gridFor({ from: 10 * DAY_S, to: 11 * DAY_S }, { t0: 0, t1: 100 * DAY_S }, 600);
  assert.equal(g.step, 300);
  assert.equal(g.start, 9 * DAY_S);
  assert.equal(g.start + (g.count - 1) * g.step, 12 * DAY_S);
  const all = gridFor({ from: 0, to: 100 * DAY_S }, { t0: 0, t1: 100 * DAY_S }, 600);
  assert.equal(all.start, 0);
});

test("a cell shows the value in force at its end; a step line holds each price", () => {
  const g = { start: 0, step: 100, count: 5, t1: 450 };
  const t = {
    points: [
      [0, 1],
      [150, 2],
      [160, 3],
      [420, 4],
    ],
    end: 450,
    roundsFrom: 0,
  };
  assert.deepEqual(sampleTrack(g, t), [1, 3, 3, 3, 4]);
  assert.equal(cellAt(g, 4), 450);
});

test("the daily part sits before the rounds; on a day grid the day closes alone", () => {
  const daily = [
    [0, 10],
    [1, 11],
    [2, 12],
  ];
  const rounds = {
    points: [
      [2 * DAY_S + 100, 20],
      [2 * DAY_S + 500, 21],
    ],
    joinDay: 2,
    from: { ts: 2 * DAY_S + 100 },
    asOf: { ts: 2 * DAY_S + 900 },
  };
  const fine = lineTrack(daily, rounds, 60, 2 * DAY_S + 900);
  assert.deepEqual(
    fine.points.map((p) => p[1]),
    [10, 11, 20, 21],
  );
  assert.equal(fine.roundsFrom, 2 * DAY_S + 100);
  const day = lineTrack(daily, rounds, DAY_S, 2 * DAY_S + 900);
  assert.deepEqual(
    day.points.map((p) => p[1]),
    [10, 11, 12],
  );
  assert.equal(day.roundsFrom, null);
});

test("the spread compares rounds at the moment and the daily part by its day", () => {
  const g = { start: 0, step: DAY_S, count: 3, t1: 3 * DAY_S - 1 };
  const main = {
    points: [
      [0, 100],
      [2 * DAY_S, 100],
    ],
    end: g.t1,
    roundsFrom: 2 * DAY_S,
  };
  const other = {
    points: [
      [0, 101],
      [2 * DAY_S, 102],
    ],
    end: g.t1,
    roundsFrom: 2 * DAY_S,
  };
  const byDay = new Map([[0, 0.01]]);
  const s = sampleSpread(g, main, other, byDay);
  assert.equal(s[0], 0.01);
  assert.equal(s[1], null); // not read within ten minutes that day
  assert.ok(Math.abs(s[2] - 0.02) < 1e-12);
});

test("detail windows replace the thinned points inside them", () => {
  const base = [
    [0, 1],
    [500, 2],
    [900, 3],
  ];
  const out = withDetail(base, [
    {
      from: 400,
      to: 800,
      points: [
        [400, 1],
        [450, 5],
        [700, 6],
      ],
    },
  ]);
  assert.deepEqual(out, [
    [0, 1],
    [400, 1],
    [450, 5],
    [700, 6],
    [900, 3],
  ]);
});

test("chunks are aligned and only cover the stored rounds", () => {
  const g = { start: 0, step: 60, count: 3000, t1: 180_000 };
  const S = 60 * CHUNK_CELLS;
  assert.deepEqual(
    gridChunks(g, { from: 100_000, to: 180_000 }).map((c) => [c.from, c.to]),
    [
      [S, 2 * S],
      [2 * S, 3 * S],
      [3 * S, 4 * S],
    ],
  );
  assert.deepEqual(gridChunks({ ...g, step: DAY_S }, { from: 0, to: 1e9 }), []);
});

test("a window that keeps its step and stays inside the grid keeps the grid", () => {
  const bounds = { t0: 0, t1: 100 * DAY_S };
  const v = { from: 10 * DAY_S, to: 11 * DAY_S };
  const g = gridFor(v, bounds, 600);
  assert.equal(needsRegrid(g, v, bounds, 600), false);
  assert.equal(needsRegrid(g, { from: 9 * DAY_S, to: 10 * DAY_S }, bounds, 600), true);
  assert.equal(needsRegrid(g, { from: 10 * DAY_S, to: 10 * DAY_S + 3600 }, bounds, 600), true);
});
