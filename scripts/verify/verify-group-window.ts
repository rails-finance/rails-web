// verify-group-window — a large group opens as all its rows, windowed.
// ----------------------------------------------------------------------------
// rails-ops decision 0039, rule 5: a group of any size opens in place, its
// members drawn a batch at a time as the reader scrolls, and the
// browser-grouped families add a group's header sums once per member list.
// This file holds both:
//
//   • components/shared/group-frame.tsx `GroupFrame` — the member window, on
//     a client-grouped run (`children`) and a served folder (`members`) drawn
//     through `TimelineRunCard`, and the landing's reveal down to its event;
//   • lib/shared/timeline-chunks.ts `internMembers` and
//     lib/shared/run-folders.tsx `runMemo` — a run that settles to the same
//     members keeps its array, and its sums are read, not re-added.
//
// OFFLINE. Synthetic members rendered with react-dom/server; no page, no
// IntersectionObserver (the window's first batch is what the server draws).
//
//   npx tsx --test scripts/verify/verify-group-window.ts
import * as React from "react";
// The app's .tsx compiles to `React.createElement` under tsx.
(globalThis as { React?: typeof React }).React = React;
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import {
  GROUP_MEMBER_BATCH,
  GroupFrame,
  MemberRevealContext,
  flatMembers,
  membersDrawn,
} from "@/components/shared/group-frame";
import { TimelineRunCard } from "@/components/shared/timeline-run-card";
import { internMembers, settleRunRows, type RunGroupingSpec } from "@/lib/shared/timeline-chunks";
import { runMemo } from "@/lib/shared/run-folders";

const h = React.createElement;

/** A member's card, for the timing: `depth` cells, drawn only when mounted,
 *  as a family's card component is. */
function Card({ i, depth }: { i: number; depth: number }) {
  return h(
    React.Fragment,
    null,
    Array.from({ length: depth }, (_, k) => h("span", { key: k, className: "cell" }, `#${i}.${k}`)),
  );
}

/** `n` member rows keyed by their event id, as `renderEventRow` keys them. */
function memberRows(n: number, depth = 0): React.ReactElement[] {
  return Array.from({ length: n }, (_, i) =>
    h("div", { key: `e${i}`, id: `event-e${i}`, "data-event-id": `e${i}` }, depth > 0 ? h(Card, { i, depth }) : null),
  );
}

const drawnIds = (html: string) => [...html.matchAll(/data-event-id="(e\d+)"/g)].map((m) => m[1]);

function openFrame(members: React.ReactNode, reveal: string | null = null): string {
  return renderToString(
    h(
      MemberRevealContext.Provider,
      { value: reveal },
      h(GroupFrame, { open: true, show() {}, hide: { title: "", subtitle: "", hide() {} }, closed: null, members }),
    ),
  );
}

test("a 1,000-member group opens to one batch, in order, with the next batch's button", () => {
  const html = openFrame(memberRows(1000));
  const ids = drawnIds(html);
  assert.equal(ids.length, GROUP_MEMBER_BATCH);
  assert.deepEqual(
    ids,
    Array.from({ length: GROUP_MEMBER_BATCH }, (_, i) => `e${i}`),
  );
  assert.match(html, /data-group-members="1000"/);
  assert.match(html, new RegExp(`data-group-members-drawn="${GROUP_MEMBER_BATCH}"`));
  assert.match(html, /data-group-more=""/);
  assert.match(html, /Show the next 50 grouped events/);
});

test("a group no larger than a batch draws whole, with no button", () => {
  for (const n of [17, GROUP_MEMBER_BATCH]) {
    const html = openFrame(memberRows(n));
    assert.equal(drawnIds(html).length, n);
    assert.doesNotMatch(html, /data-group-more/);
  }
});

test("a landing inside the group draws down to the batch holding its event", () => {
  const html = openFrame(memberRows(1000), "e120");
  const ids = drawnIds(html);
  assert.equal(ids.length, 150);
  assert.ok(ids.includes("e120"));
  assert.equal(drawnIds(openFrame(memberRows(1000), "e999")).length, 1000);
  // An id the group does not hold leaves it at one batch.
  assert.equal(drawnIds(openFrame(memberRows(1000), "x1")).length, GROUP_MEMBER_BATCH);
});

test("both paths through TimelineRunCard window: a run's children and a served folder's members", () => {
  const base = {
    count: 1000,
    memberNoun: "transfer",
    firstTimestamp: 1,
    lastTimestamp: 2,
    forceOpen: true,
    folder: true,
  };
  const client = renderToString(h(TimelineRunCard, { ...base, children: memberRows(1000) }));
  const served = renderToString(h(TimelineRunCard, { ...base, onOpen() {}, members: memberRows(1000), stale: true }));
  assert.equal(drawnIds(client).length, GROUP_MEMBER_BATCH);
  assert.equal(drawnIds(served).length, GROUP_MEMBER_BATCH);
  // The served folder's stale line stands above its members and is not one.
  assert.match(served, /This position has moved since the page was opened/);
});

test("flatMembers flattens arrays and unkeyed fragments, keeping keys", () => {
  const rows = memberRows(3);
  const list = flatMembers(h(React.Fragment, null, null, h("p", { key: "stale" }), rows));
  assert.deepEqual(
    list.map((m) => (React.isValidElement(m) ? m.key : null)),
    ["stale", "e0", "e1", "e2"],
  );
  assert.equal(membersDrawn(1000, 50, -1), 50);
  assert.equal(membersDrawn(1000, 50, 49), 50);
  assert.equal(membersDrawn(1000, 50, 50), 100);
  assert.equal(membersDrawn(60, 50, 59), 60);
});

interface Ev {
  id: string;
  txHash: string;
  timestamp: number;
  kind: string;
  amount: number;
}
const SPEC: RunGroupingSpec<Ev> = { match: (e) => e.kind === "redeem" };

/** A 1,000-redemption streak between two owner rows, newest first. */
function life(): Ev[] {
  const rows: Ev[] = [{ id: "top", txHash: "0xtop", timestamp: 3_000_000, kind: "adjust", amount: 0 }];
  for (let i = 0; i < 1000; i++)
    rows.push({ id: `r${i}`, txHash: `0xr${i}`, timestamp: 2_000_000 - i * 60, kind: "redeem", amount: i });
  rows.push({ id: "open", txHash: "0xopen", timestamp: 1_000_000, kind: "open", amount: 0 });
  return rows;
}

test("a run settled again with the same members keeps its array; a cut through it does not", () => {
  const all = life();
  const runOf = (inRange: (e: Ev) => boolean) => {
    const row = settleRunRows(all, [SPEC], inRange).find((r) => r.kind === "run");
    assert.ok(row && row.kind === "run");
    return row.events;
  };
  const whole = runOf(() => true);
  assert.equal(whole.length, 1000);
  // A range that drops the owner rows around the run leaves it whole.
  assert.equal(
    runOf((e) => e.kind === "redeem"),
    whole,
  );
  // A cursor inside it slices it: a different list.
  const sliced = runOf((e) => e.timestamp <= 2_000_000 - 500 * 60);
  assert.equal(sliced.length, 500);
  assert.notEqual(sliced, whole);
  assert.equal(internMembers([...whole]), whole);
});

test("a run's header sums are added once per member list", () => {
  const all = life();
  let adds = 0;
  const sums = (events: readonly Ev[]) => {
    adds++;
    return events.reduce((t, e) => t + e.amount, 0);
  };
  for (let render = 0; render < 5; render++) {
    const row = settleRunRows(all, [SPEC], () => true).find((r) => r.kind === "run");
    assert.ok(row && row.kind === "run");
    assert.equal(runMemo(row.events, sums), 499_500);
  }
  assert.equal(adds, 1);
});

test("timing: an open 1,000-member group against an open 50-member one (server render)", () => {
  const time = (draw: () => string, reps = 20) => {
    draw();
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) draw();
    return (performance.now() - t0) / reps;
  };
  // What an open group drew before the window: every member.
  const all1000 = time(() => renderToString(h("div", { className: "flex flex-col gap-2" }, memberRows(1000, 40))));
  const window1000 = time(() => openFrame(memberRows(1000, 40)));
  const window50 = time(() => openFrame(memberRows(50, 40)));
  console.log(
    `  every member drawn: ${all1000.toFixed(2)} ms · windowed, 1,000 members: ${window1000.toFixed(2)} ms · 50 members: ${window50.toFixed(2)} ms`,
  );
  // The window costs about what a batch costs: within a few times, not twenty.
  assert.ok(window1000 < all1000 / 5, "the windowed open costs well under drawing every member");
});
