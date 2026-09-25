#!/usr/bin/env node
// The timeline navigator — the timeline's date control, on every family the
// shared driver serves.
// ----------------------------------------------------------------------------
//
// ⚠️ IT WAS BEHIND `?nav=1` FOR ONE DAY (2026-09-11) and the flag is now
// DELETED, not defaulted on — a flag nobody can turn off is a branch that
// rots. Three groups below were written as comparisons across it and could not
// survive that: 7 compared the counts on both sides, 8 asserted what a load
// without the flag did, and 9 compared the boundary card against the bare
// spine node. Each says in its own place what replaced it and what simply
// stopped being checkable. None was closed up silently.
// ----------------------------------------------------------------------------
// Opens each fixture in a real browser (every claim below is about what the
// panel draws once the page is live, which no route check can see) and asserts,
// per fixture:
//
//   1  THE WHOLE LIFE IS THE MONTH MATRIX, and all of it: the opened panel
//      holds ONE grid, at month grain, whose live cells run from the month
//      holding the summary's own `firstTimestamp` to the month holding its
//      `lastTimestamp` with no month between them missing. Read from
//      `/api/aave-v3/timeline/summary` on the run — never a pasted number;
//   2  A MONTH CLICK SHOWS THAT MONTH'S ROWS. Where the loaded rows hold it,
//      which is every month of a `?folders=0` page the grid lets you click,
//      it FILTERS: it writes `?from=`/`?to=` as the whole month, moves the
//      count line, and the editable spread reads the same two dates back. One
//      control, one grammar. ⚠️ THE PANEL CLOSES ON THE PICK (Miles,
//      2026-09-25), so every check below that reads the grid after a click
//      opens it again first; one that forgot would read an absent panel and
//      report a wrong one.
//
//      ⚠️ THIS ASSERTION WAS REVERSED ON 2026-09-11, deliberately, and is
//      kept rather than deleted so nobody later reads the change as a
//      regression that slipped through. It used to assert the opposite —
//      "opening filters nothing", navigating is not choosing — which was right
//      for the build it was written against, where a month click was a DEAD
//      END that filled the whole row budget with nowhere to go next. Miles:
//      "should the months also be a viewable set of events?"
//
//      ⚠️ AND THE FIGURE THE COUNT LINE THEN STATES IS THE PAGE'S, NOT THE
//      MONTH'S. Where the page holds its whole history the two agree exactly,
//      and the check asserts that equality. Where the page is a WINDOW they
//      cannot: on `deep` (counted 2026-09-21) the map's cell reads "Apr 2026 ·
//      106 events" and the page holds 57 of them, because the other 49 sit
//      below the cut in the opening balance. The page states a shortfall — the
//      word "listed", and the boundary at the older end — but it is the
//      WINDOW's shortfall and not that month's, and nothing on the page
//      relates the 106 to the 57.
//      So the check asserts the weaker true thing there: never more than the
//      map's figure, and a stated shortfall whenever it is less;
//   3  THE SPREAD IS THE PICKER, AND IT ROUND-TRIPS: typing ONE day into both
//      ends writes it as one UTC day, moves the count line, and comes back on
//      reload with the panel reading the same two dates; typing a SPAN writes
//      both ends. The map cannot say a span and does not have to — the spread
//      is a date control, which is where Miles has always said a span belongs;
//   4  ONE MONTH AT A TIME: the same month again clears the selection rather
//      than extending it, and a drag across the month matrix — which under the
//      old range grammar was a span — still selects one month;
//   5  NOTHING ON THE PAGE IS MARKED. ⚠️ THIS CHECK WAS INVERTED ON
//      2026-09-25, not deleted. It asserted the LIQUIDATION REGISTER, that
//      the summary's `byAction` bucket, the listed rows and the marked month
//      cells all agreed, and Miles dropped the marks everywhere, the
//      `?folders=0` grid and the legend included: "the heatmap is enough and
//      if users need to find a liquidation they can use the event filter". So
//      it now asserts the absence: no cell anywhere carries a mark, no legend
//      names one, and the DENSITY KEY is still under the grid. Same subject,
//      read the other way round, and it goes red the day a mark comes back.
//      The old form's fail-first proof is kept below;
//   6  ⚠️ GONE WITH THE MARKS, 2026-09-25, BY DECISION. It asserted that no
//      month cell below the cut carried a mark and that the grid's caption
//      said why. There are no marks and there is no clause, so both halves
//      have no subject; the number is left unused rather than closed up, the
//      way group 10's was, so nobody later reads the gap as a check that
//      quietly stopped running. What stood WITH it, the reach at 13 below,
//      is untouched and still runs on the same fixtures;
//   7  NO COUNT MOVED: the toolbar's count line and every row-number pill read
//      byte-identically before the panel is opened and while it is open. The
//      navigator is a map, and a map does not change the territory.
//
//      ⚠️ It compared the two SIDES OF THE FLAG until 2026-09-11. With the
//      flag gone there is no "without" to read, so it compares the page
//      against itself with the panel open — the surviving half of the same
//      claim, and the useful one.
//
//      ⚠️ It also used to compare the boundary CARD's label and range pill,
//      and that half was VACUOUS from the day it was written: the boundary
//      only draws once the local render window has reached the end of the list
//      (`!hasMore`, 50 rows a chunk against 1,000), and this check never
//      paged. It was comparing `null` with `null` on all five fixtures. Group
//      9 makes the comparison properly — it pages to the end first;
//   8  THE PANEL IS A DROPDOWN, AND THE INLINE HEATMAP IS GONE: the page at
//      rest carries NO panel at all; the Date button opens one floating over
//      the rows, holding exactly one heatmap; Escape closes it, and so does a
//      press outside the strip; and closing it leaves NO grid anywhere, which
//      is how the deleted inline control would show up if it came back under
//      another name. The Date button wears the same chevron as the filter
//      triggers beside it, turned over while it is open. The panel does NOT
//      restate the count line: it hangs below the control strip, so the
//      strip's own is still on screen above the panel's top edge, which the
//      check asserts by geometry rather than by eye.
//
//      ⚠️ TWO CHECKS HERE ARE DELETED (2026-09-11): both asserted what a load
//      WITHOUT the flag did, and there is no such load;
//   9  THE BOUNDARY SPEAKS IN THE SPINE ALONE, AND THE TIP STOPS CLAIMING
//      LIVE-NESS FOR A FILTERED PAST (2026-09-11):
//        • paged to the end of the list, a windowed page draws no boundary
//          card at all and one bare boundary row carrying the spine's `Layers`
//          glyph, with nothing beside it in the protocol column (Miles);
//        • and it is NOT drawn before that paging: while a "Show 50 more"
//          button still stands under the rows the older events are one click
//          away, not hidden, and a glyph there would claim an omission the
//          page is not making. That is the guard `!hasMore`, read on both
//          sides of the same load;
//        • with a PAST day selected the top of the spine carries no pulsing
//          dot and does carry the bare boundary glyph; with the NEWEST listed
//          day selected — a date filter every bit as much on — the pulse is
//          there. That second half is the discriminating one: the condition is
//          a timestamp comparison against the newest event the page holds, and
//          a check that only ever filtered to the past would pass just as well
//          on the wrong rule, "a filter exists";
//  11  AN EMPTY CELL IS DRAWN AND REFUSES THE CLICK: a month with no events is
//      not interactive (Miles, 2026-09-11), while a month that holds listed
//      events still takes the click. A SUMMARISED cell refuses for its own
//      separate reason and keeps it — its count is real, and comes from the
//      opening balance;
//  13  A BELOW-CUT DAY CAN BE REACHED, EVEN THOUGH THE PAGE DOES NOT HOLD IT
//      (2026-09-11). The index answers `/timeline?from=&to=` — a span of time
//      in unix seconds — and this asserts the reach end to end through the
//      web's own proxy: on a windowed fixture, take the busiest day the
//      summary names that lies WHOLLY below the oldest LISTED row, ask for it
//      by span, and get exactly that day's own figure back with nothing
//      outside the day. A span answer carries `cutoffBlock: null` and echoes
//      the span, because a stretch in the middle of a history is not the
//      newest slice of anything and brings no opening balance forward.
//
//      ⚠️ THE DAY IS CHOSEN FROM THE SUMMARY, NOT PICKED. A day inside the
//      window would pass against rows the page already holds and prove
//      nothing, so the third check states the premise out loud: the day ends
//      before the oldest listed row. Raise the cut past this position and that
//      check goes RED rather than quiet.
//
//      ⚠️ THIS IS THE REACH, NOT THE VIEW. The page still HOLDS its window,
//      so the map's below-cut months still refuse the click. Making one of
//      them fetch its own rows needs a fourth `TimelineWindow` state — a span
//      brings no opening balance, so every lifetime figure on the page would
//      have to go absent rather than be reduced from a stretch in the middle —
//      and that is 164 references across 25 files, not a wiring job;
//  12  THE OLDER END SPEAKS TOO, AND ONLY ONCE. A page hides older events two
//      ways: the window CUT, which the boundary card has always spoken for,
//      and the VIEW — a filter, on a position with no cut at all (Miles,
//      2026-09-11: 38 events, a day selected, and nothing below the rows). So
//      with older events filtered out, EXACTLY ONE statement stands at the
//      older end — the card, or the cut's bare row under the flag, or the
//      view's — never two, and on a page whose rows are its whole history it
//      is the view's own. With nothing hidden there, nothing is said.
//
// ── ⚠️ GROUP 10 IS GONE, BY DECISION AND NOT BY ROT ─────────────────────────
//
// Group 10 asserted that the navigator's DAY TIER drew as a seven-column
// calendar at 44 px a cell. There is no day tier: it was built on 2026-09-11
// (`d40c4d8b`) and deleted the same day, along with the whole drill, when
// Miles chose "one grid, no drilling" and "it's the rows, not the map" — "you
// can see if a day is busy by scrolling down the timeline so that is not
// needed". The number is left unused rather than closed up so that this note
// keeps a place in the list; a check that simply vanished would read later
// like one that quietly stopped running. Its fail-first proof is kept below
// for the same reason.
//
// Check 8 was ALSO settled by pixel, once, by hand — a browser check cannot see
// a shifted margin. `control` and `liquidated`, flag off, at 1440 and 390, shot
// against `2fac3aae` (the commit before any of this) and against the finished
// change: 390 byte-identical on both; 1440 differing by 284 px on control
// (0.02%) and 8,690 on liquidated (0.67%). Both figures are the FLOOR — two
// runs of the SAME code differ by 260 and by 8,690 in the same places, which
// are the pulsing spine tip's animation phase and the dotted spine's
// antialiasing. The change moves nothing with the flag off.
//
// Fixtures are the five the plan pins (2026-09-11), all Aave V3 Ethereum,
// market `core`: the deepest user position measured, a short dense life, a
// long thin one, a liquidated account whose whole history is under the cut,
// and a shallow control. Every figure is read from the routes on the run.
//
// `deep` was CoW's settlement contract `0x9008…ab41` until 2026-09-21. It is
// plumbing under rails-ops decision `0024` and gained events during a run, so
// a count line captured before a drill drifted from the one read after it.
// It is now `0xee7c…2954` (decision `0019`): 7,150 events from 2023-07-31, a
// cut at 2026-04-02, three liquidations all below it, and empty months
// between its first event and 2024-03. It still trades, at a few events a
// day rather than thousands.
//
//   BASE=http://localhost:3000 node scripts/verify/verify-timeline-navigator.mjs
//   ONLY=liquidated,control …   run a subset (fixture ids)
//
// ⚠️ Served folders became the page DEFAULT (2026-09-12, leg B of `0019`), and
// every fixture URL in groups 1–13 pins `?folders=0`: those checks measure the
// page's LISTED ROWS against the flat timeline answer, and a grouped page lists
// rows a flat answer has no counterpart for. The default page has its own arm,
// group G at the end of this file (2026-09-21): the count line and the jump
// over a list that is part rows and part folders, measured against the grouped
// route. The MARKS on a grouped page are out of its scope — see its note.
//
// ⚠️ THE MONTHS LEFT THE DATE PANEL ON THE DEFAULT PAGE (2026-09-24) AND CAME
// BACK TO IT ON 2026-09-25. For one day the matrix was a sticky picker above
// the rows with Previous / Next / Newest of its own, and every month click
// was a read. Miles then ruled the middle ground, live's form with dev's reach
// (decision 0019, amendment 2026-09-25): the grid is in the Date panel again,
// with the heat ramp and the typed spread, and a month click takes ONE OF TWO
// PATHS. Where the loaded rows hold the month it filters them, instantly, as
// rails.finance does; where they do not, the page reads that month from the
// index as its own segment, which is what dev did for every month. The picker
// component and its Previous / Next / Newest are deleted.
//
// S0 to S4 inside group G were rewritten against that rather than deleted, and
// they are where the two paths are told apart: S2 is the FILTER path and S3 is
// the READ path, each asserting the thing the other cannot do. G2–G4 stay
// superseded, the S checks covering the same ground on the default page, and G1
// still asserts the count line states TIME and names no row cap. Groups 1–13
// pin `?folders=0`, which offers no read, so their month click is the filter
// path alone.
//
// The hosted default is dev.rails.finance through the Vercel bypass header
// (lib/host.mjs); `BASE=http://localhost:3000` points it at a dev server.
//
//   ONLY=grouped-deep,grouped-whole …   the grouped arm alone
//
// ── PROVED IT CAN FAIL ──────────────────────────────────────────────────────
//   2026-09-11 (the panel stands again): the dropdown's `tl.heatmapOpen` gate
//   replaced by `true`, so the panel renders whether or not it was asked for →
//   25/27 over `control`, "the page at rest carries no panel and no grid" red
//   ("1 panel(s), 1 dropdown(s), grids [months]") and the two-ways-out check
//   red behind it, because a panel that was never closed cannot be closed.
//
//   ⚠️ THE FIRST ATTEMPT AT THAT BREAK DID NOT REDDEN ANYTHING. It swapped the
//   gate for `heatmapShown`, which LOOKS like "more open than before" and is
//   false at rest anyway (`tl.heatmapOpen || (dateActive && !isPhone)`, and
//   neither holds on an unfiltered page). A break has to change the state the
//   check is standing on, not merely the expression it is written in.
//
//   2026-09-11 (the two ways out): `dropdownOpen` forced `false`, so neither
//   listener is ever armed → 26/27 over `control`, one check red: "after
//   Escape 1 panel(s); after an outside press 1".
//
//   ⚠️ SUPERSEDED the same evening — the panel's count line was REMOVED
//   (Miles: "we don't need the repetition of the count in the dropdown"). The
//   desktop dropdown hangs below the strip and never covered the figure, so
//   the copy said the same thing twice within one glance. Kept because the
//   break is the one that found the pair of checks, and the replacement check
//   is the same claim read the other way round.
//
//   2026-09-11 (the reach, cut at the proxy): the Aave V3 timeline proxy's
//   `spanQs` forced to "", so `?from=`/`?to=` never reach the index and the
//   route answers the whole history instead → 30/32 over `dense-short`, both
//   reach checks red and quoting exactly what came back: "3393 row(s) against
//   the map's 133 for 2026-08-27, 3260 outside the day" and "span
//   undefined…undefined". The third check of the group stayed GREEN, which is
//   right — it asserts the PREMISE (that day lies below the oldest listed row)
//   and the premise is a fact about the fixture, not about the reach.
//
//   2026-09-11 (the panel's count line): the count line in the panel's header
//   replaced by a constant → 25/27 over `control`, both checks that read it
//   red — "panel "Showing 1 of 1 events" vs toolbar "43 events"" at rest, and
//   the same pair after a month click ("vs toolbar "6 of 43 events"").
//
//   2026-09-11 (the second grid): the toolbar's inline heatmap un-gated from
//   the flag, so both it and the panel draw → 26/27 over `control`, "a
//   dropdown holding exactly one heatmap" red with both quoted: "grids
//   [months, months], 1 outside the panel".
//
//   2026-09-11 (the spread cannot say a span): `commit`'s far end changed from
//   `Math.max(one, other)` to `Math.min(one, other)`, so every selection
//   collapses to its near day → 26/27 over `control`, ONLY the span half of
//   check 3 red ("url 2026-01-06…2026-01-06, want 2026-01-06…2026-09-11").
//   The single-day half stayed green, which is the discriminating shape: both
//   ends equal is the one case the broken rule gets right.
//
//   2026-09-11 (the spread at rest): the whole-life default dropped, so the
//   fields open empty → 26/27 over `control`, "with nothing selected the
//   spread shows the whole life, editable" red ("spread …").
//
//   ⚠️ AND THAT CHECK HAD TO BE TIGHTENED BEFORE IT WOULD GO RED. It first
//   asserted `from != null && to != null && from <= to`, which two EMPTY
//   STRINGS satisfy — not null, and "" <= "". It reads the ISO shape and the
//   near end's own value now. A null check is not a value check, and an empty
//   field is the most likely wrong value a field can hold.
//
//   2026-09-11 (the older end, silent): `tailIsCut` forced `false` → 27/29 over
//   `control`, both filtered halves of group 12 red ("0 card(s) + 0 cut row(s)
//   + 0 view row(s) at the older end on 2026-09-01") and the resting one green.
//
//   2026-09-11 (the older end, twice): the `!boundaryAtBottom` dedupe dropped
//   from `viewBoundaryAtBottom`, so a windowed page under a filter draws both
//   → 29/30 over `dense-short`, one check red and quoting the double: "1
//   card(s) + 0 cut row(s) + 1 view row(s)". This is the half that says ONCE,
//   and it needs a fixture with a cut to say anything at all.
//
//   2026-09-11 (the older end, always): `tailIsCut` forced `true` → 28/29 over
//   `control`, the resting check red ("1 view boundary row(s) on an unfiltered
//   page"). A glyph that is always there states nothing.
//
//   ⚠️ SUPERSEDED — the day tier these two broke was deleted the same day (see
//   the note on group 10 above). Kept because the reasoning generalises and
//   because a proof list that silently loses entries is a proof list nobody
//   trusts.
//
//   2026-09-11 (the day tier's size): `calendar` forced `false`, giving the day
//   tier back the 12 px contribution grid it inherited → 24/26 over `control`,
//   both of group 10 red and nothing else moved: "5 column(s) at 1440 / 5 at
//   390, 4 weekday head(s)" — the week columns and the Mon/Wed/Fri/Sun rail —
//   and "smallest side 12 px at 1440 (largest 12), 12 px at 390".
//
//   2026-09-11 (the empty cell, broken AT THE GUARD): `isEmpty` changed from
//   `count <= 0` to `count < 0`, so nothing is ever empty and the guard lets
//   everything through → 27/29 over `liquidated`, exactly the two empty-cell
//   checks red ("3 of 3 empty month(s) still interactive", "4 of 4 empty
//   day(s)") with the two beside them GREEN: the months that hold events still
//   open, and the pending days still refuse. Setting a COUNT on an empty cell
//   would have proved nothing — the count is the guard's input, so the break
//   had to be the guard itself.
//
//   2026-09-11 (the pending day): the day grid's `selectable` cut to
//   `!d.summarised`, dropping both the lifetime test and the emptiness one →
//   the same 27/29 over `liquidated` with a different pair red, "4 of 4 empty
//   day(s) still interactive" and "19 pending day(s) still interactive". The
//   days after the life's last event are drawn as empty buckets so the month
//   reads as a month; a click on one filters the list to nothing.
//
//   2026-09-11 (the card-less boundary): the flag gate at the `boundaryAtBottom`
//   render site reverted to `false`, so the card draws under `?nav=1` as it
//   always did → 23/24 over `dense-short`, ONE check red and quoting the whole
//   state: "1 card(s), 0 bare row(s), 0 glyph(s), beside it """. The half above
//   it — the card present and complete with the flag OFF — stayed green, which
//   is what says the break was the flag and not the card.
//
//   ⚠️ Both halves only mean anything because the check PAGES THE LIST TO ITS
//   END first (`toEndOfList`). Check 7's old boundary assertion did not, and so
//   compared `null` with `null` on every fixture from the day it was written.
//
//   2026-09-11 (the tip, keyed on the wrong thing — THE DISCRIMINATING BREAK):
//   `tipIsStale` changed from the timestamp comparison to `tl.isFiltered`, the
//   plausible wrong rule → 43/45 over `dense-short` and `control`, and the ONLY
//   red is "a filter that leaves the newest event at the top keeps the pulse"
//   on both ("spine tip dot(s) "", 1 bare tip row(s) on 2026-09-11"). The
//   past-day half stayed GREEN — the wrong rule passes it — which is exactly
//   why that half alone would not have been a check at all.
//
//   2026-09-11 (the tip, not suppressed): `tipIsStale` forced `false` → 23/24
//   over `dense-short`, "on a past day the tip loses its pulse and takes the
//   boundary glyph" red ("spine tip dot(s) "above", 0 bare tip row(s), 0
//   glyph(s) on 2026-09-10") and nothing else moved.
//
//   2026-09-11 (the tip, always suppressed): `tipIsStale` forced `true` → 19/21
//   over `control`, the resting check red ("with no date filter the newest row
//   keeps its pulse — spine tip dot(s) "", 1 bare tip row(s)") along with the
//   newest-day one. The pulse has to be provably PRESENT somewhere, or
//   "withheld" is just "deleted".
//
//   2026-09-11 (the two controls): the Date button put back under `{!navOn &&
//   …}` — the state this change undoes — → 16/19 over `control`, all three of
//   the new group-8 checks red and nothing else moved: "0 Date control(s)",
//   "0 picker(s) reading null…null", and the span one quoting the URL that
//   never moved off the single day ("url 2026-09-11…2026-09-11, want
//   2026-01-06…2026-09-11; map label "Fri, 11 Sept 2026"").
//
//   ⚠️ SUPERSEDED — 2026-09-11 (the drill): `onOpenMonth` changed to also set
//   the date range to the month it opens, which at the time was "the one thing
//   the model forbids" → 25/33 over `broad` and `control`, check 2 "opening
//   filters nothing" red on both with the range it wrote quoted, and check 3
//   red behind it. Check 1 stayed GREEN, which was the discriminating half.
//   THAT BREAK IS NOW THE BEHAVIOUR: the assertion was reversed later the same
//   day (see check 2's own note above). Kept because a proof that a check
//   could fail does not stop being true when the check is inverted, and
//   because the reversal is easier to read with the original beside it.
//
//   2026-09-11 (the month click, put back): `onOpenMonth`'s
//   `onChange([monthStartTs(idx), monthEndTs(idx)])` reverted to the old
//   `if (value) onChange(null)` → 28/30 over `control`, both halves of the new
//   check 2 red: "opening wrote "?nav=1" (want from=2026-09-01
//   to=2026-09-30); count line "43 events" → "43 events"" and "43 row(s),
//   against the map's own 6 for 2026-09". Nothing else moved — not check 3,
//   not check 4: a day chosen inside a selected month behaves the same either
//   way, which is what makes the reversal safe.
//
//   2026-09-11 (the month's label): the `monthPicked` branch of the panel's
//   label forced off, so a month selection falls through to the two-ended span
//   → 29/30 over `control`, one check red and quoting what the map would have
//   said about a click the reader made in one word: label "Tue, 1 Sept 2026 –
//   Wed, 30 Sept 2026" (want "Sep 2026"). The URL and the count line were
//   right; only the sentence was wrong, which is the half a URL check cannot
//   see.
//
//   2026-09-11 (the month drawn whole): the navigator's `extent` cut to a
//   fortnight instead of the month → 31/33 over `broad` and `control`, check 2
//   red on both ("15 day cells of 30 in 2026-09, 0 outside it, 11 live") and
//   nothing else moved. This is the assertion that caught the real thing: the
//   day grid used to stop at the position's LAST EVENT, so the month it is
//   living through drew as a two-column stub.
//
//   2026-09-11 (the day): `select="single"` removed from the day grid, giving
//   it back the range grammar the toolbar's own grid still uses → 29/33, both
//   halves of check 4 red on both fixtures ("a drag across the day grid selects
//   one day, never a span — from=2026-09-01 to=2026-09-11") and NOTHING else
//   moved. A drill-down that quietly still takes spans is the exact regression
//   this rebuild exists to prevent.
//
//   2026-09-11 (the marks): an opening-balance day admitted to the marks →
//   check 6 red on `dense-short` ("1 mark(s) before the oldest listed month
//   2026-08 — earliest marked 2026-06") and on `broad` (2026-06 / 2025-03),
//   with `control` — which has no cut — GREEN.
//
//   ⚠️ THE FIRST ATTEMPT AT THAT THIRD BREAK DID NOT REDDEN ANYTHING, and the
//   reason is worth keeping: setting a mark on a below-cut month is not enough,
//   because `CellMarks` is gated on `marks.from` (the oldest listed day) and
//   the grid simply refuses to draw it. The gate is the defence; the break had
//   to remove the gate. A check whose subject is a guard has to be broken AT
//   the guard, or it reports on something the guard was already handling.
//
//   An earlier version of check 6 caught ITSELF first: it read a month cell's
//   bucket key as a day key (a month start is also a day start) and reddened
//   deep and dense-short while the page was right. Which grain a cell belongs
//   to is read off its own grid's `data-heatmap-grain` here and never inferred
//   from the key.
//
//   2026-09-21 (group G, the grouped arm), each break against a local server
//   on the onboarding api, restored after:
//   • the header's own count dropped from the count line's numerator
//     (`filteredEventCount` skipping a folder whose `matched` it knows) →
//     7/9 over `grouped-whole`, G2 red ("12 of 389 events" want "18 of 389
//     events") and G5 red ("4 of 389" want "10 of 389": 6 folder members that
//     day), nothing else moved;
//   • `openFilteredFolders` forced false → 8/9 over `grouped-whole`, G3 alone
//     red ("1 folder row(s) standing, 0 open; 1 meet 2026-05");
//   • together, on `grouped-deep`: `folderAdmits`'s date clause disabled, so
//     every folder stands under a month filter, and the grouped count line
//     without its noun → 7/9, G3 red ("86 folder row(s) standing, 86 open; 7
//     meet 2026-09") and G1 red ("Showing 1,000 of 7,150 events" want
//     "Showing 1,000 rows of 7,150 events"). The count checks stayed green
//     under the first, which is right: a folder outside the month adds 0.
//
//   2026-09-24 (the S checks, the segment picker), each break against a local
//   dev server on the production api (which predates the grouped span, so a
//   segment answered flat), restored after:
//   • `inBand` in timeline-segment-picker.tsx inverted → 10/15 over
//     `grouped-deep`: S3's four red (the click on 2025-10 scrolled instead:
//     the count line stayed "7,161 events · loaded 14 Nov 2025 to 24 Sept
//     2026", 1,000 rows outside the month, the band eleven months) and S4's
//     tap red the same way. S2 stayed green, which is right: a month the
//     preload holds is scrolled to whichever branch the click takes;
//   • `segmentStatement` labelling the life's newest month in place of the
//     picked one → 13/15, S3's first red ("September 2026 holds 293 events"
//     want "October 2025 holds 293 events") and S4's tap red for the same
//     line; the rows, the band and the tip stayed green, as they should;
//   • the segment's `eventsBefore` dropped from `olderCount` → nothing red,
//     recorded so the gap is known: no check reads a row number.
//
//   ⚠️ THE FIRST TWO BREAKS ARE KEPT THOUGH THEIR SUBJECT IS GONE. `inBand`
//   and the band it drew were deleted the same evening (the low-fi cut), so
//   neither break can be made again; they are the record that the S checks
//   stood on the page's state rather than on its markup, and the second one
//   still applies verbatim to the count line S2 and S3 read.
//
//   2026-09-24 (evening, the low-fi navigator), against a local dev server on
//   the production api, restored after: `pickMonth` in position-view.tsx
//   swallowing the pick — the month set, no read issued → 8/17 over
//   `grouped-deep`. S2's Previous and Next red and S3's four red, each quoting
//   the count line that never moved off "7,161 events · loaded 20 Jan 2025 to
//   24 Sept 2026", with "2500 row(s), 2500 outside" December 2024 and "current
//   2026-09" where the picked month was wanted. S1 stayed GREEN, which is
//   right — it reads the page at rest, where no pick has happened — and so did
//   "Newest gives back the rows the page opened with", which is the one
//   control the break leaves working.
//
//   ⚠️ S4 AND G5 WENT RED IN THAT RUN FOR A DIFFERENT REASON and are not
//   evidence for the break: the api's timeline reads began answering 500 at
//   their 10 s budget part way through the run, so the phone page and the
//   reload before G5 drew no rows at all ("0 events"). A verdict read off a
//   backend that fell over mid-run is not a finding about the page.
//
//   2026-09-24 (evening), same server: the picker's `current` pinned to the
//   life's newest month whatever the page holds (`month ?? last` → `last`) →
//   13/17 over `grouped-deep`. S2's Previous and Next red and S3's picker
//   check red, all three quoting "current 2026-09" against the month asked
//   for, and S4's tap red with "underlined 2026-09". S1 stayed GREEN, and so
//   did S3's count line and its rows: the break moves the MARK and nothing
//   else, so only the checks that read the mark after a pick can see it. A
//   check that only ever reads a fresh load would have passed on all four.
//
//   2026-09-25 (the two paths), against a local dev server on the production
//   api, restored after each:
//   • the HELD BOUNDARY collapsed: `heldMinIdx` forced to `lifeMinIdx` in
//     the months grid, so every month of the life reads as one the page holds
//     and every click is a filter → 11/17 over `grouped-deep`. S3's five red,
//     quoting the damage exactly: "the grid called it a filter", then
//     "Showing 0 of 20 Jan 2025 to 24 Sept 2026 · 7,161 events" with "0
//     row(s)" and no month ringed, and S4's tap red for the same line. THAT
//     EMPTY LIST IS THE WHOLE REASON FOR THE TWO PATHS: a month below the cut
//     filtered rather than read gives the reader a grid full of density over
//     no rows at all. ⚠️ S2 STAYED GREEN, which is the discriminating shape:
//     the break makes everything a filter, and a month the page does hold
//     still filters correctly, so a check that only ever clicked a held month
//     would have passed on all of it;
//   • the PANEL LEFT STANDING: `onPicked` dropped from the grid's `onChange`
//     → 26/27 over `control`, exactly one red, "the panel closes on the pick,
//     the panel was still on the page after a month was clicked". Every
//     other check in the group passed, including the filter it performed,
//     which is right: the pick worked, the map just stayed over the rows;
//   • the MARKS BACK: a `data-cell-mark` span put back on every selectable
//     month cell → 26/27 over `control`, check 5 alone red with "9 marked
//     cell(s), 0 legend(s), 0 picker element(s), 1 density key(s)". An
//     ABSENCE CHECK THAT CANNOT BE MADE TO FAIL IS NOT A CHECK, and check 5
//     is an absence now, so this is the break that earns it.
//
//   A check that cannot be made to fail is not a check.

import { chromium } from "playwright";
import { RECENT_QS } from "./_timeline-window.mjs";
import { BASE, bypassHeaders, hostFetch } from "./lib/host.mjs";

const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const SECONDS_PER_DAY = 86_400;

let passes = 0;
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (ok) passes++;
  else failures++;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);
const n = (v) => Number(v).toLocaleString("en-US");
const day = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
const month = (ts) => new Date(ts * 1000).toISOString().slice(0, 7);
const startOfUtcDay = (ts) => Math.floor(ts / SECONDS_PER_DAY) * SECONDS_PER_DAY;
const monthIdxOf = (ts) => {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const monthStartOf = (ts) => {
  const d = new Date(ts * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
};
const monthEndOf = (at) => {
  const d = new Date(at * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000) - 1;
};

const WALLETS = {
  deep: "0xee7ca610d896c53ffe716b801c05748efd902954",
  "dense-short": "0xd411d428a63cf4c7029bc53f0e0f56c4933fdbb7",
  broad: "0x4d431856295413906075dd40266d83624e09c672",
  liquidated: "0x9984a1d407bc6ac53b404aabf66b80b99d96bb47",
  control: "0x1ddd6f79b93825158f0aa7d5964039deb2cb3361",
};

/** `cut` — the page draws a WINDOW of a longer history, so checks 5 and 6
 *  split: 5 needs a page whose rows ARE the history, 6 needs one whose rows are
 *  not. `liquidations` — the fixture the liquidation register exists FOR. On
 *  the other whole-history fixture the register's own count is 0, which is a
 *  real answer and not a check: it would pass with the marks removed entirely. */
const FIXTURES = [
  { id: "deep", cut: true },
  // ⚠️ THIS FLAG IS A FUNCTION OF `TIMELINE_WINDOW_ROWS`, not of the position.
  // Counted 2026-09-11: `broad` 6,705 events, this one 3,393, `liquidated`
  // 388, `control` 43; `deep` 7,150 on 2026-09-21. So at a cut of 5,000 — the
  // raise measured in lib/shared/timeline-opening-balance.ts and not taken —
  // this fixture flips to `cut: false` and only `deep` and `broad` stay
  // windowed. Written
  // down here because the flag would otherwise be the thing that goes quietly
  // wrong on the day the constant moves.
  { id: "dense-short", cut: true },
  { id: "broad", cut: true },
  { id: "liquidated", cut: false, liquidations: true },
  { id: "control", cut: false },
];

/** Light theme, row numbers on, run-collapsing off — set before any script of
 *  the page runs, so every row's pill is in the DOM for check 7. */
const INIT = `
  try {
    const k = "timeline-display-v3";
    const cur = JSON.parse(localStorage.getItem(k) || "{}");
    localStorage.setItem(k, JSON.stringify({ ...cur, showEventNumbers: true, collapseRuns: false }));
    localStorage.setItem("theme", "light");
  } catch {}
`;

async function getJson(path) {
  const res = await hostFetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return res.json();
}

/** Wait for the page to be LIVE — not merely painted. The count line is
 *  server-rendered and a click before React attaches is lost (the pre-hydration
 *  click window), and on a windowed page the opening balance is a second
 *  request the grid's own span depends on. */
async function settle(page) {
  await page.waitForSelector("[data-prov-exempt] span.text-xs.tabular-nums", { timeout: 300_000 });
  await page.waitForFunction(
    () => /\d/.test(document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? ""),
    { timeout: 240_000 },
  );
  await page.waitForFunction(() => document.querySelector("[data-ctrl-waking]") == null, { timeout: 120_000 });
  // The total stops reading "listed" (the flat page) or opening with
  // "Loaded" (the served page, since 2026-09-24) once the opening balance is
  // in hand; `data-timeline-total` says the same thing for a machine.
  await page
    .waitForFunction(
      () => {
        const line = (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim();
        const total = document.querySelector("[data-timeline-total]")?.getAttribute("data-timeline-total");
        return !/listed$/.test(line) && !/^Loaded /.test(line) && total !== "pending";
      },
      { timeout: 120_000 },
    )
    .catch(() => {});
  // The strip's own Date control is the last thing to arrive and the thing
  // every caller reaches for next, so it — not a stopwatch — is what says the
  // page is ready. `READ_CONTROLS` asserts exactly one of these at rest, so a
  // passing page always has it.
  await page.waitForSelector("[data-date-control]", { timeout: 30_000 }).catch(() => {});
}

/** ⚠️ EVERY WAIT BELOW IS BOUNDED AND SWALLOWS ITS TIMEOUT, AND THAT IS THE
 *  POINT. A wait that throws turns a red check into a CRASH — a run that never
 *  reached a verdict — and the reader loses the one thing the script was for:
 *  the check's own message saying what the page actually showed. So each wait
 *  only makes the happy path fast; the `check(...)` under it still does all the
 *  judging, on whatever state the page is in when the wait gives up.
 *
 *  The rule the sleeps broke: a flat `waitForTimeout` is a bet that the machine
 *  is as quick today as it was the day the number was picked. Under load it
 *  lands early and the check reports a page that was merely late as a page that
 *  is wrong — which is how this script produced reds that moved. */
async function settled(page, fn, arg = null, timeout = 15_000) {
  await page.waitForFunction(fn, arg, { timeout }).catch(() => {});
}

/** The URL is the navigator's output: every grid click and typed date lands in
 *  `?from=&to=`. Waiting for the search string to MOVE is the honest signal —
 *  it says the interaction was taken, and leaves what it wrote to the check. */
const searchMoved = (page, before) => settled(page, (b) => location.search !== b, before);

/** Rows have stopped arriving — read twice, a beat apart.
 *
 *  ⚠️ NOT a boundary node, and not a row count over zero. A whole-history page
 *  draws no boundary and a filtered span may hold no rows at all; anchoring on
 *  either would hang on precisely the fixtures that are RIGHT to have none.
 *  Every page has a row count, including the count 0, so stillness is a signal
 *  a passing page can always produce. */
async function stillRows(page, timeout = 15_000) {
  await page
    .evaluate(() => {
      delete window.__rbRowCount;
    })
    .catch(() => {});
  await page
    .waitForFunction(
      () => {
        const n = document.querySelectorAll("[data-event-id]").length;
        const seen = window.__rbRowCount;
        window.__rbRowCount = n;
        return seen === n;
      },
      null,
      { timeout, polling: 250 },
    )
    .catch(() => {});
}

/** Open the panel — the Date button, which is the ONLY way in now. Every check
 *  about what the panel draws has to do this first, and a check that forgot
 *  would read an empty page rather than a wrong one.
 *
 *  ⚠️ THIS FUNCTION IS WHERE THE SCRIPT'S MOVING RED CAME FROM. It clicked,
 *  slept a flat 700 ms, then tested for the panel exactly once — so under load
 *  the single test landed before the dropdown mounted and check 8 reported "no
 *  panel after pressing the Date control" on a page whose panel opened fine a
 *  moment later. The wait now runs until the panel is there, and the return
 *  value still reports the truth if it never is. */
async function openPanel(page) {
  if ((await page.$("[data-timeline-navigator]")) != null) return true;
  await page.click("[data-date-control]", { timeout: 10_000 }).catch(() => {});
  // ⚠️ THE PANEL MOUNTS BEFORE ITS GRID DOES, AND WAITING ONLY FOR THE PANEL IS
  // WHY THE 700 ms SLEEP LOOKED UNNECESSARY. The sleep was covering a wait
  // nobody had written: on the first sweep after it was removed, `control` —
  // last of the five, on the coldest summary fetch — reported "1 panel(s), 1
  // dropdown(s), grids []" and took four checks down with it, while passing
  // 26/26 when run alone. A dropped sleep does not remove a race, it reveals
  // one; the fix is to name the thing the sleep was buying.
  //
  // The grain element and a live cell are both safe to wait on: check 1 asserts
  // the panel IS one grid at month grain, and check 2 asserts at least one
  // month is selectable, so a passing page always has them (traps #10/#11).
  await page
    .waitForFunction(
      () => {
        const nav = document.querySelector("[data-timeline-navigator]");
        const grid = nav?.querySelector("[data-heatmap-grain]");
        return grid != null && grid.querySelector("[data-cell-at][data-cell-live]") != null;
      },
      null,
      { timeout: 30_000 },
    )
    .catch(() => {});
  return (await page.$("[data-timeline-navigator]")) != null;
}

/** Closed — the panel is off the page. The checks that follow a close read
 *  several things at once (dropdowns, grids, the surviving Date control); this
 *  waits on the one that must go, and leaves the rest to them. */
const panelGone = (page) => settled(page, () => document.querySelector("[data-timeline-navigator]") == null);

/** Page the local render window to the END of the list — 50 rows a chunk.
 *  Neither boundary, card or bare row, is drawn until every loaded row is on
 *  the page (`!hasMore` in chain-truth-timeline.tsx), so a check that skips
 *  this reads a page with no boundary on it at all and compares two absences. */
async function toEndOfList(page) {
  // 2,500 rows at 50 a press (the preload since 2026-09-24), with room.
  for (let i = 0; i < 60; i++) {
    // Click, and count the rows we had BEFORE it — the rows arriving is the
    // receipt that the chunk landed.
    const before = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /^Show [\d,]+ more$/.test((x.textContent ?? "").trim()),
      );
      if (!b) return null;
      const rows = document.querySelectorAll("[data-event-id]").length;
      b.click();
      return rows;
    });
    if (before == null) break;
    // ⚠️ NOT THE BUTTON'S LABEL — IT DOES NOT MOVE. The first repair here waited
    // for the label to change and cost this script 274 s on one fixture, because
    // chain-truth-timeline.tsx:1169 renders `Show {min(WINDOW_CHUNK, remaining)}
    // more`: it reads "Show 50 more" on every chunk but the last, so the wait
    // timed out its full 15 s on each of ~20 presses and the run then blew the
    // runner's 900 s cap. Same family as the readiness-wait trap — a signal that
    // a CORRECT page never changes is no signal at all.
    //
    // The rows are the signal: a chunk that landed is 50 more of them, and the
    // last chunk takes the button away instead.
    await settled(
      page,
      (had) =>
        document.querySelectorAll("[data-event-id]").length > had ||
        ![...document.querySelectorAll("button")].some((x) => /^Show [\d,]+ more$/.test((x.textContent ?? "").trim())),
      before,
    );
  }
  await stillRows(page);
}

/** What the navigator is drawing, read as facts and never as prose. */
const READ_NAV = () => {
  const nav = document.querySelector("[data-timeline-navigator]");
  if (!nav) return null;
  const grid = nav.querySelector("[data-heatmap-grain]");
  const cells =
    grid == null
      ? []
      : [...grid.querySelectorAll("[data-cell-at]")]
          .filter((c) => c.hasAttribute("data-cell-live"))
          .map((c) => ({
            at: Number(c.getAttribute("data-cell-at")),
            // The cell's OWN figure, off its own tooltip — the map's claim
            // about this bucket, read on the same render as the count line it
            // is compared with, so an indexer writing rows mid-run cannot make
            // the two disagree.
            count: Number(
              (((c.getAttribute("title") ?? "").match(/· ([\d,]+) event/) ?? [])[1] ?? "").replace(/,/g, ""),
            ),
            // WHICH PATH this cell's click takes: a read where the loaded rows
            // do not hold the month, a filter where they do.
            reach: c.hasAttribute("data-cell-reach"),
            current: c.hasAttribute("data-cell-current"),
          }));
  return {
    grains: [...nav.querySelectorAll("[data-heatmap-grain]")].map((g) => g.getAttribute("data-heatmap-grain")),
    grain: grid?.getAttribute("data-heatmap-grain") ?? null,
    cells,
    from: nav.querySelector("[data-date-from]")?.value ?? null,
    to: nav.querySelector("[data-date-to]")?.value ?? null,
    // The density key, which survived the marks; the legend did not.
    keys: nav.querySelectorAll("[data-density-key]").length,
    reset: [...nav.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim() === "Reset"),
  };
};

/** The marks, as an ABSENCE, anywhere on the page and not merely in the panel,
 *  because the legend used to sit beside the grid and the cells inside it. */
const READ_MARKS = () => ({
  cells: document.querySelectorAll("[data-cell-mark]").length,
  legends: document.querySelectorAll("[data-mark-legend]").length,
  // The picker that stood above the rows for one day (2026-09-24) and went
  // with the 2026-09-25 ruling: nothing on the page may draw it again.
  pickers: document.querySelectorAll("[data-segment-picker], [data-segment-strip], [data-segment-matrix]").length,
});

/** The panel as a THING ON THE PAGE rather than as a grid: is it there, is it
 *  floating, and is it the only heatmap anywhere. */
const READ_CONTROLS = () => ({
  dateControls: document.querySelectorAll("[data-date-control]").length,
  navigators: document.querySelectorAll("[data-timeline-navigator]").length,
  dropdowns: document.querySelectorAll("[data-nav-dropdown]").length,
  grains: [...document.querySelectorAll("[data-heatmap-grain]")].map((g) => g.getAttribute("data-heatmap-grain")),
  grainsOutsideNav: [...document.querySelectorAll("[data-heatmap-grain]")].filter(
    (g) => g.closest("[data-timeline-navigator]") == null,
  ).length,
  marks: document.querySelectorAll("[data-cell-mark]").length,
  navCount: document.querySelector("[data-nav-count]")?.textContent?.trim() ?? null,
  // The geometry behind "it does not cover what it stopped restating": the
  // bottom of the strip's own count line against the top of the dropdown. A
  // check written on the DOM alone cannot see a panel that overlaps.
  countLineBottom: (() => {
    const e = document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums");
    return e ? Math.round(e.getBoundingClientRect().bottom) : null;
  })(),
  dropdownTop: (() => {
    const e = document.querySelector("[data-nav-dropdown]");
    return e ? Math.round(e.getBoundingClientRect().top) : null;
  })(),
  // The Date button's own affordance: a chevron, turned over while open.
  chevrons: document.querySelectorAll("[data-date-control] [data-date-chevron]").length,
  // `getAttribute`, not `.className` — on an SVG element that property is an
  // SVGAnimatedString, which has no `includes`.
  chevronTurned: (
    document.querySelector("[data-date-control] [data-date-chevron]")?.getAttribute("class") ?? ""
  ).includes("rotate-180"),
});

/** The figures check 7 compares across the flag — the count line and the
 *  row-number pills, which are on the page from the first paint. */
const READ_COUNTS = () => ({
  line: (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim(),
  pills: [...document.querySelectorAll('span[aria-label^="Event "]')].map((s) => s.textContent).join(","),
});

/** Group 9's and 12's subject: what stands at each end of the spine. */
const READ_SPINE = () => ({
  cards: document.querySelectorAll('[data-figure="timeline-boundary"]').length,
  cut: document.querySelectorAll('[data-boundary-row="cut"]').length,
  tip: document.querySelectorAll('[data-boundary-row="tip"]').length,
  view: document.querySelectorAll('[data-boundary-row="view"]').length,
  glyphs: document.querySelectorAll("[data-boundary-row] svg").length,
  beside: document.querySelector("[data-boundary-row]")?.textContent?.trim() ?? "",
  pulses: [...document.querySelectorAll("[data-spine-tip]")].map((e) => e.getAttribute("data-spine-tip")).join(","),
  label: document.querySelector('[data-figure="timeline-boundary"] .text-sm.font-medium')?.textContent?.trim() ?? null,
  range: document.querySelector("[data-boundary-range]")?.getAttribute("data-boundary-range") ?? null,
});

/** WHICH CELLS REFUSE THE CLICK, AND WHY. The three reasons are distinct and
 *  the cell states each of them itself: a summarised cell says so in its own
 *  tooltip and an empty one reads "· 0 events". `cursor-pointer` is the class
 *  the grid puts on a cell it will answer — the same class `CLICK_CELL`
 *  refuses to click without. */
const READ_REFUSALS = () =>
  [...document.querySelectorAll("[data-timeline-navigator] [data-cell-at][data-cell-live]")].map((c) => ({
    empty: /· 0 events/.test(c.getAttribute("title") ?? ""),
    summarised: /in the opening balance/.test(c.getAttribute("title") ?? ""),
    reach: c.hasAttribute("data-cell-reach"),
    pointer: c.className.includes("cursor-pointer"),
    at: Number(c.getAttribute("data-cell-at")),
  }));

/** Click the live, selectable cell at `at`. Returns false when the panel has
 *  no such cell, so a check says "nothing to click" rather than passing on an
 *  interaction that never happened. */
const CLICK_CELL = (at) => {
  const c = document.querySelector(`[data-timeline-navigator] [data-cell-at="${at}"][data-cell-live]`);
  if (!c || !c.className.includes("cursor-pointer")) return false;
  c.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  c.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  return true;
};

/** Type into one end of the spread the way a person does — React's own value
 *  setter, then the events it listens for. */
const TYPE_DATE = ([which, iso]) => {
  const el = document.querySelector(`[data-date-${which}]`);
  // No field is a red check, never a throw that takes the fixture's other
  // checks down with it.
  if (el == null) return false;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(el, iso);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

const COUNT_LINE = () =>
  (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim();

// ⚠️ THREE READERS WENT WITH THE PICKER, 2026-09-25: `READ_PICKER`,
// `READ_STRIP` and `pressCell`. They read a control that no longer exists
// (`components/shared/timeline-segment-picker.tsx`, its Previous / Next /
// Newest and its phone strip); what replaced them is `READ_NAV` and
// `CLICK_CELL` above, which read the grid where it now is, in the Date panel.
// `READ_MARKS` asserts that none of it came back.

/** How a windowed page says its list is short of the month it is filtered to.
 *  The word "listed" carried it until 2026-09-24, when decision 0019's last
 *  amendment replaced "Showing N of M listed · T events" with the loaded span
 *  in time — "Showing 1,000 of 11 Sept 2026 to 24 Sept 2026 · 4,353 events".
 *  Both forms are accepted, because the flat arm reads pages on either side of
 *  that change; neither is a count, which is the point of the amendment. */
const STATES_SHORTFALL = /\bof \d{1,2} [A-Za-z]+ \d{4} to \d{1,2} [A-Za-z]+ \d{4}\b|\blisted\b/;

/** Does the page state the row cap? The three phrases the amendment retired,
 *  and the cap itself as a bare figure in the count line. */
const NAMES_THE_CAP = (cap) => {
  const text = document.body.innerText;
  if (/Showing [\d,]+ rows|most recent [\d,]+ events|above what Rails|showing the newest/i.test(text)) return true;
  const line = (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim();
  return line.includes(`${cap.toLocaleString("en-US")} `) && !/events$/.test(line)
    ? true
    : line.startsWith(`Showing ${cap.toLocaleString("en-US")}`);
};

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const monthLong = (idx) => `${MONTH_LONG[idx % 12]} ${Math.floor(idx / 12)}`;
const monthName = (idx) => `${String(Math.floor(idx / 12))}-${String((idx % 12) + 1).padStart(2, "0")}`;
const monthStartTs = (idx) => Math.floor(Date.UTC(Math.floor(idx / 12), idx % 12, 1) / 1000);
/** The count line's own date register: "14 Nov 2025". */
const dateText = (ts) =>
  new Date(ts * 1000).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const search = (page) => page.url().replace(/^[^?]*/, "");
const firstNumber = (line) => Number(((line.match(/[\d,]+/) ?? [])[0] ?? "").replace(/,/g, ""));

console.log(`Timeline navigator checks — against ${BASE}\n`);
const browser = await chromium.launch();
// The hosted default is dev.rails.finance behind Vercel Authentication; the
// bypass header rides every request the browser makes (lib/host.mjs).
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "light",
  extraHTTPHeaders: bypassHeaders(),
});
await ctx.addInitScript(INIT);

for (const f of FIXTURES) {
  if (ONLY && !ONLY.has(f.id)) continue;
  const wallet = WALLETS[f.id];
  // `?folders=0` is PINNED on every page URL below rather than in `path`, so
  // the URLs that add `from=`/`to=` join it with `&` — see the note at the
  // head of this file for why it is pinned at all.
  const path = `/ethereum/aave-v3/${wallet}`;
  const page = await ctx.newPage();
  page.setDefaultTimeout(300_000);
  try {
    // Both routes on the same run: the whole-life summary the span is measured
    // against, and the listed rows checks 5 and 6 measure the cut against.
    const [summary, rows] = await Promise.all([
      getJson(`/api/aave-v3/timeline/summary?market=core&wallet=${wallet}&cutoffBlock=99999999`),
      getJson(`/api/aave-v3/timeline?market=core&wallet=${wallet}&${RECENT_QS}`),
    ]);
    if (summary.error || rows.error) {
      check(`0  ${f.id}: the routes answered`, false, summary.error ?? rows.error);
      continue;
    }
    const listed = rows.events ?? [];
    const oldestListed = listed.length > 0 ? Math.min(...listed.map((e) => e.timestamp)) : null;

    await page.goto(`${BASE}${path}?folders=0`, { waitUntil: "domcontentloaded" });
    await settle(page);

    // 8 — at rest the panel is NOT on the page. It is a dropdown now: the
    // reader gets the rows, and the map only when they ask for it.
    const atRestControls = await page.evaluate(READ_CONTROLS);
    check(
      `8  ${f.id}: under the flag the page at rest carries no panel and no grid`,
      atRestControls.navigators === 0 && atRestControls.dropdowns === 0 && atRestControls.grains.length === 0,
      `${atRestControls.navigators} panel(s), ${atRestControls.dropdowns} dropdown(s), grids [${atRestControls.grains.join(", ")}]`,
    );
    // 9/12 — the resting spine, read while the panel is still shut.
    const atRest = await page.evaluate(READ_SPINE);
    check(
      `9  ${f.id}: with no date filter the newest row keeps its pulse`,
      atRest.pulses === "above" && atRest.tip === 0,
      `spine tip dot(s) "${atRest.pulses}", ${atRest.tip} bare tip row(s)`,
    );
    check(
      `12 ${f.id}: with nothing hidden at the older end, nothing is said there`,
      atRest.view === 0,
      `${atRest.view} view boundary row(s) on an unfiltered page`,
    );

    const opened = await openPanel(page);
    if (!opened) {
      check(`8  ${f.id}: the Date button opens the panel`, false, "no panel after pressing the Date control");
      continue;
    }
    const restLine = await page.evaluate(COUNT_LINE);
    const rest = await page.evaluate(READ_NAV);
    const openControls = await page.evaluate(READ_CONTROLS);
    check(
      `8  ${f.id}: the Date button opens it as a dropdown holding exactly one heatmap`,
      openControls.dateControls === 1 &&
        openControls.navigators === 1 &&
        openControls.dropdowns === 1 &&
        openControls.grainsOutsideNav === 0 &&
        openControls.grains.length === 1,
      `${openControls.dateControls} Date control(s), ${openControls.navigators} panel(s), ${openControls.dropdowns} dropdown(s), grids [${openControls.grains.join(", ")}], ${openControls.grainsOutsideNav} outside the panel`,
    );
    check(
      `8  ${f.id}: the panel does not restate the count, and does not cover the strip's own`,
      openControls.navCount === null &&
        restLine.length > 0 &&
        openControls.countLineBottom != null &&
        openControls.dropdownTop != null &&
        openControls.countLineBottom <= openControls.dropdownTop,
      `panel count ${openControls.navCount === null ? "absent" : `"${openControls.navCount}"`}; strip's "${restLine}" ends at ${openControls.countLineBottom}, panel starts at ${openControls.dropdownTop}`,
    );
    check(
      `8  ${f.id}: the Date button wears a chevron, turned over while the panel is open`,
      openControls.chevrons === 1 &&
        openControls.chevronTurned &&
        atRestControls.chevrons === 1 &&
        !atRestControls.chevronTurned,
      `open: ${openControls.chevrons} chevron(s), turned ${openControls.chevronTurned}; at rest: ${atRestControls.chevrons}, turned ${atRestControls.chevronTurned}`,
    );

    // 1 — the panel is the whole life at month grain, all of it.
    const firstMonth = monthIdxOf(summary.firstTimestamp);
    const lastMonth = monthIdxOf(summary.lastTimestamp);
    const liveMonths = (rest?.cells ?? []).map((c) => monthIdxOf(c.at)).sort((a, b) => a - b);
    check(
      `1  ${f.id}: the panel is one grid, at month grain`,
      rest != null && rest.grains.length === 1 && rest.grain === "months",
      `grids [${rest?.grains.join(", ")}]`,
    );
    check(
      `1  ${f.id}: it spans the whole life, every month of it`,
      liveMonths.length === lastMonth - firstMonth + 1 &&
        liveMonths[0] === firstMonth &&
        liveMonths[liveMonths.length - 1] === lastMonth,
      `grid ${liveMonths[0]}…${liveMonths[liveMonths.length - 1]} (${liveMonths.length} live cells), summary ${firstMonth}…${lastMonth} (${lastMonth - firstMonth + 1})`,
    );
    info(
      `1  ${f.id}: whole life`,
      `${n(summary.totalEvents)} events, ${month(summary.firstTimestamp)} → ${month(summary.lastTimestamp)}`,
    );
    check(
      `3  ${f.id}: with nothing selected the spread shows the whole life, editable`,
      // Two real dates, not two empty fields: the reader is looking at all of
      // it, and the control says so rather than sitting blank. The near end is
      // the summary's own first timestamp; the far end is only required to be
      // a later ISO day, because on a live position it moves between the route
      // read and the page load.
      ISO_DAY.test(rest?.from ?? "") &&
        ISO_DAY.test(rest?.to ?? "") &&
        rest.from === day(summary.firstTimestamp) &&
        rest.from <= rest.to,
      `spread ${rest?.from}…${rest?.to} (want it to open at ${day(summary.firstTimestamp)})`,
    );

    // 11 — an empty month is drawn and refuses the click; one that holds
    // events still takes it.
    const refusals = await page.evaluate(READ_REFUSALS);
    const emptyMonths = refusals.filter((m) => m.empty);
    const liveMonthCells = refusals.filter((m) => !m.empty && !m.summarised);
    if (emptyMonths.length === 0) {
      info(`11 ${f.id}: an empty month in this life`, "none — every month the position lived through holds an event");
    } else {
      check(
        `11 ${f.id}: a month with no events is drawn and refuses the click`,
        emptyMonths.every((m) => !m.pointer),
        `${emptyMonths.filter((m) => m.pointer).length} of ${emptyMonths.length} empty month(s) still interactive`,
      );
    }
    check(
      `11 ${f.id}: the refusal is the count and not the grid — a month that holds events still takes it`,
      liveMonthCells.length > 0 && liveMonthCells.every((m) => m.pointer),
      `${liveMonthCells.filter((m) => m.pointer).length} of ${liveMonthCells.length} month(s) that hold listed events are interactive`,
    );

    // 5 — INVERTED 2026-09-25: there are no marks, anywhere. The register
    // check this replaced (the summary's liquidation bucket against the
    // listed rows against the marked cells) lost its subject when Miles
    // dropped all three marks; what it can still assert is that none came
    // back, and that the DENSITY KEY, the key to the wash and not to a mark,
    // is still under the grid.
    const marksNow = await page.evaluate(READ_MARKS);
    check(
      `5  ${f.id}: no cell carries a mark, no legend names one, and the density key stands`,
      marksNow.cells === 0 && marksNow.legends === 0 && marksNow.pickers === 0 && (rest?.keys ?? 0) === 1,
      `${marksNow.cells} marked cell(s), ${marksNow.legends} legend(s), ${marksNow.pickers} picker element(s), ${rest?.keys} density key(s) in the panel`,
    );

    // 6 is GONE with the marks (see the head of this file). The reach it stood
    // beside is not, and runs here on the same windowed fixtures.
    if (f.cut) {
      // 13 — the index can be REACHED for a below-cut day, through the web's
      // own proxy. This is the half of the fix that exists today: the page
      // still HOLDS only its window, but the rows under a dead month are now
      // one bounded request away.
      //
      // The day is chosen from the summary's own `byDay` — the busiest day
      // that lies WHOLLY below the oldest listed row — so the check is about a
      // stretch the page provably does not hold. Picking any old day would let
      // it pass against a day inside the window, which proves nothing.
      const belowDays = (summary.byDay ?? [])
        .map((b) => ({ at: Number(b.key), count: b.count }))
        .filter((b) => Number.isFinite(b.at) && b.at + SECONDS_PER_DAY <= oldestListed && b.count > 0)
        .sort((a, b) => b.count - a.count);
      const pick = belowDays[0] ?? null;
      if (!pick) {
        check(
          `13 ${f.id}: a below-cut day to reach for`,
          false,
          "no day in the summary lies wholly below the oldest listed row",
        );
      } else {
        const span = await getJson(
          `/api/aave-v3/timeline?market=core&wallet=${wallet}&from=${pick.at}&to=${pick.at + SECONDS_PER_DAY - 1}`,
        );
        const got = span.events ?? [];
        const outside = got.filter((e) => e.timestamp < pick.at || e.timestamp >= pick.at + SECONDS_PER_DAY);
        check(
          `13 ${f.id}: a day below the cut can be read by its own span, and the day's figure is what comes back`,
          !span.error && got.length === pick.count && outside.length === 0,
          `${span.error ?? `${got.length} row(s) against the map's ${pick.count} for ${day(pick.at)}, ${outside.length} outside the day`}`,
        );
        check(
          `13 ${f.id}: and a span answer brings nothing forward — it is not the newest slice of anything`,
          span.cutoffBlock == null && span.span?.from === pick.at && span.span?.to === pick.at + SECONDS_PER_DAY - 1,
          `cutoffBlock ${span.cutoffBlock}, span ${span.span?.from}…${span.span?.to}`,
        );
        // The page does NOT hold these rows — which is the whole point, and
        // the thing that would quietly stop being true if the cut were raised
        // past this position.
        check(
          `13 ${f.id}: and the page did not already hold them`,
          listed.every((e) => e.timestamp >= oldestListed) && pick.at + SECONDS_PER_DAY <= oldestListed,
          `day ${day(pick.at)} ends at ${pick.at + SECONDS_PER_DAY}, oldest listed row at ${oldestListed}`,
        );
      }
    }

    // 2 — a month click filters to that month.
    //
    // ⚠️ THE PANEL CLOSES ON THE PICK (Miles, 2026-09-25), so every read of
    // the grid after a click opens it again first. A check that forgot would
    // read `rest?.from` off a panel that is not there and report the spread as
    // absent rather than as wrong.
    //
    // The month chosen is the one holding the NEWEST listed row: on a windowed
    // page every earlier month may be below the cut, and a month that cannot be
    // clicked would make this check vacuous rather than red.
    const targetMonth = listed.length > 0 ? monthStartOf(Math.max(...listed.map((e) => e.timestamp))) : null;
    const beforeMonthClick = search(page);
    const clickedMonth = targetMonth == null ? false : await page.evaluate(CLICK_CELL, targetMonth);
    await searchMoved(page, beforeMonthClick);
    await stillRows(page);
    if (!clickedMonth) {
      check(`2  ${f.id}: a month to click`, false, "no live, selectable month cell on the grid");
    } else {
      const afterOpenLine = await page.evaluate(COUNT_LINE);
      const closedOnPick = (await page.$("[data-timeline-navigator]")) == null;
      await openPanel(page);
      const afterOpen = await page.evaluate(READ_NAV);
      const openedSp = new URLSearchParams(search(page));
      const monthCell = (rest?.cells ?? []).find((c) => c.at === targetMonth);
      const shownAfterOpen = firstNumber(afterOpenLine);
      check(
        `2  ${f.id}: the panel closes on the pick, the reader having asked for rows`,
        closedOnPick,
        "the panel was still on the page after a month was clicked",
      );
      check(
        `2  ${f.id}: clicking a month filters the rows to it and the spread reads it back`,
        openedSp.get("from") === day(targetMonth) &&
          openedSp.get("to") === day(monthEndOf(targetMonth)) &&
          afterOpenLine !== restLine &&
          afterOpen?.from === day(targetMonth) &&
          afterOpen?.to === day(monthEndOf(targetMonth)),
        `clicking wrote "${search(page)}" (want from=${day(targetMonth)} to=${day(monthEndOf(targetMonth))}); count line "${restLine}" → "${afterOpenLine}"; spread ${afterOpen?.from}…${afterOpen?.to}`,
      );
      check(
        `2  ${f.id}: the rows it shows are the month's own figure, or the page says what it cannot show`,
        f.cut
          ? shownAfterOpen <= (monthCell?.count ?? -1) &&
              (shownAfterOpen === monthCell?.count || STATES_SHORTFALL.test(afterOpenLine))
          : shownAfterOpen === monthCell?.count,
        `count line "${afterOpenLine}" → ${shownAfterOpen} row(s), against the map's own ${monthCell?.count} for ${month(targetMonth)}`,
      );
      // 4 — one month at a time. The panel was reopened above, so the second
      // click lands on the same cell of the same grid.
      const beforeSecondClick = search(page);
      await page.evaluate(CLICK_CELL, targetMonth);
      await searchMoved(page, beforeSecondClick);
      await stillRows(page);
      check(
        `4  ${f.id}: the same month again clears the selection rather than extending it`,
        !/[?&](from|to)=/.test(search(page)) && (await page.evaluate(COUNT_LINE)) === restLine,
        `url "${search(page)}", count line "${await page.evaluate(COUNT_LINE)}" (want "${restLine}")`,
      );
      // And no drag produces a span: press on one month, release on another,
      // which under the range grammar the grid used to carry would be a
      // multi-month selection. Any OTHER live, selectable month — not
      // necessarily a later one, since the newest month usually has nothing
      // after it and a forward-only drag test would quietly never run.
      await openPanel(page);
      const spanTo = refusals.filter((m) => m.pointer && m.at !== targetMonth).map((m) => m.at)[0];
      if (spanTo == null) {
        // A real answer, not a failed check: a position whose whole life bar
        // the newest month is below the cut has exactly one month a drag
        // could start or end on. Stated rather than asserted — an assertion
        // with one cell to work over would be reporting on nothing. The check
        // above already asserts that at least one month IS selectable, so this
        // cannot quietly swallow a grid that went entirely inert.
        info(`4  ${f.id}: a second selectable month to drag across`, "none — the grid has one");
      } else {
        const beforeDrag = search(page);
        await page.evaluate(
          ([a, b]) => {
            const at = (x) => document.querySelector(`[data-timeline-navigator] [data-cell-at="${x}"][data-cell-live]`);
            at(a)?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            at(b)?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            at(b)?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          },
          [targetMonth, spanTo],
        );
        // Wait only for the drag to have WRITTEN something. Whether it wrote one
        // month or a span is the check's call, and waiting on the right answer
        // would be waiting for the bug not to be there.
        await searchMoved(page, beforeDrag);
        const sp2 = new URLSearchParams(search(page));
        check(
          `4  ${f.id}: a drag across the month grid selects one month, never a span`,
          sp2.get("from") === day(targetMonth) && sp2.get("to") === day(monthEndOf(targetMonth)),
          `from=${sp2.get("from")} to=${sp2.get("to")} after dragging ${month(targetMonth)} → ${month(spanTo)} (want the one month)`,
        );
      }
    }

    // 3 — the spread IS the picker, and it round-trips.
    const pickDay = listed.length > 0 ? startOfUtcDay(Math.max(...listed.map((e) => e.timestamp))) : null;
    const spanFrom = startOfUtcDay(oldestListed ?? summary.firstTimestamp);
    if (pickDay == null) {
      check(`3  ${f.id}: a listed day to type`, false, "no listed rows");
    } else {
      await page.goto(`${BASE}${path}?folders=0`, { waitUntil: "domcontentloaded" });
      await settle(page);
      await openPanel(page);
      const beforeFrom = search(page);
      await page.evaluate(TYPE_DATE, ["from", day(pickDay)]);
      await searchMoved(page, beforeFrom);
      const beforeTo = search(page);
      await page.evaluate(TYPE_DATE, ["to", day(pickDay)]);
      await searchMoved(page, beforeTo);
      await stillRows(page);
      const typedLine = await page.evaluate(COUNT_LINE);
      const typedSp = new URLSearchParams(search(page));
      check(
        `3  ${f.id}: one day typed into both ends is one UTC day, and the count moves`,
        typedSp.get("from") === day(pickDay) && typedSp.get("to") === day(pickDay) && typedLine !== restLine,
        `from=${typedSp.get("from")} to=${typedSp.get("to")} (want ${day(pickDay)}); count line "${restLine}" → "${typedLine}"`,
      );
      const typedUrl = search(page);
      await page.goto(`${BASE}${path}${typedUrl}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      await openPanel(page);
      const reloaded = await page.evaluate(READ_NAV);
      check(
        `3  ${f.id}: the reloaded view is the same view, and the spread says so`,
        search(page) === typedUrl && reloaded?.from === day(pickDay) && reloaded?.to === day(pickDay),
        `url "${typedUrl}" → "${search(page)}"; spread ${reloaded?.from}…${reloaded?.to} (want ${day(pickDay)} both ends)`,
      );
      // A SPAN — the one thing the map cannot say, and the reason the spread
      // is a control and not a caption.
      const beforeSpan = search(page);
      await page.evaluate(TYPE_DATE, ["from", day(spanFrom)]);
      await searchMoved(page, beforeSpan);
      await stillRows(page);
      const spanned = await page.evaluate(READ_NAV);
      const sp3 = new URLSearchParams(search(page));
      const wantFrom = spanFrom <= pickDay ? day(spanFrom) : day(pickDay);
      const wantTo = spanFrom <= pickDay ? day(pickDay) : day(spanFrom);
      check(
        `3  ${f.id}: a span typed into the spread is written whole and read back whole`,
        sp3.get("from") === wantFrom &&
          sp3.get("to") === wantTo &&
          spanned?.from === wantFrom &&
          spanned?.to === wantTo,
        `url ${sp3.get("from")}…${sp3.get("to")} (want ${wantFrom}…${wantTo}); spread ${spanned?.from}…${spanned?.to}`,
      );
    }

    // 8 — the two ways out, and the flag off.
    await page.goto(`${BASE}${path}?folders=0`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await openPanel(page);
    await page.keyboard.press("Escape");
    await panelGone(page);
    const afterEsc = await page.evaluate(READ_CONTROLS);
    await openPanel(page);
    // A press on the page itself, well clear of the toolbar strip.
    await page.mouse.click(30, 700);
    await panelGone(page);
    const afterAway = await page.evaluate(READ_CONTROLS);
    check(
      `8  ${f.id}: Escape closes it, and so does a press outside the strip`,
      afterEsc.navigators === 0 && afterAway.navigators === 0,
      `after Escape ${afterEsc.navigators} panel(s); after an outside press ${afterAway.navigators}`,
    );

    // 7 — NO COUNT MOVED. Read on a fresh load, because the checks above leave
    // a filter in force and this claim is about LOOKING, not filtering.
    //
    // ⚠️ IT USED TO COMPARE THE FLAG AGAINST ITS ABSENCE — the same count line
    // and the same row pills with `?nav=1` and without. The flag was deleted
    // on 2026-09-11 and there is no "without" to read, so the comparison is
    // now against the page BEFORE THE PANEL IS OPENED. That is the surviving
    // half of the same claim and the useful one: a map is a map, and opening
    // it must not move a figure on the page underneath.
    await page.goto(`${BASE}${path}?folders=0`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const beforeOpen = await page.evaluate(READ_COUNTS);
    await openPanel(page);
    // ⚠️ THE ONE SLEEP THAT STAYS A SLEEP, AND IT IS NOT AN OVERSIGHT. This
    // check asserts that NOTHING MOVED, and there is no event to wait for when
    // the passing behaviour is the absence of one: a conditional wait here
    // would return the instant the panel mounted and read the counts before a
    // regression had time to move them, passing on a page that does move them.
    // A fixed pause is the honest instrument for a negative claim — it is the
    // window in which the thing that must not happen had its chance.
    await page.waitForTimeout(500);
    const whileOpen = await page.evaluate(READ_COUNTS);
    check(
      `7  ${f.id}: opening the map moves no count line`,
      beforeOpen.line === whileOpen.line && beforeOpen.line.length > 0,
      `"${beforeOpen.line}" vs "${whileOpen.line}"`,
    );
    check(
      `7  ${f.id}: and no row number`,
      beforeOpen.pills === whileOpen.pills,
      `${beforeOpen.pills.split(",").length} vs ${whileOpen.pills.split(",").length} pills`,
    );

    // 8 — THE INLINE HEATMAP IS GONE FOR GOOD. Closing the panel must leave no
    // grid behind: the control that opened BELOW the strip and pushed the rows
    // down was deleted with the flag, and a page that kept one after a close
    // would have brought it back under another name.
    //
    // ⚠️ TWO CHECKS STOOD HERE AND ARE DELETED, 2026-09-11: "with the flag off
    // there is no panel, no dropdown and no mark" and "with the flag off the
    // Date button opens the month grid it always did". Both asserted what
    // happened on a load that did not ask for the navigator, and there is no
    // such load any more. Left as this note rather than closed up.
    await page.keyboard.press("Escape");
    await panelGone(page);
    const closed = await page.evaluate(READ_CONTROLS);
    check(
      `8  ${f.id}: closing it leaves no grid anywhere — the inline heatmap is gone`,
      closed.navigators === 0 && closed.dropdowns === 0 && closed.grains.length === 0 && closed.dateControls === 1,
      `${closed.navigators} panel(s), ${closed.dropdowns} dropdown(s), grids [${closed.grains.join(", ")}], ${closed.dateControls} Date control(s)`,
    );

    // 9 — THE BOUNDARY IS A BARE SPINE NODE, AT WHICHEVER END THE SORT PUTS
    // IT. Only where the page draws fewer rows than the position has: a
    // whole-history page has no boundary of either kind, and asserting an
    // absence against an absence would pass with the whole thing deleted.
    //
    // ⚠️ THIS CHECK HAS LOST TWO SUBJECTS AND KEPT ITS OWN. It was first a
    // pair, one per side of `?nav=1`: the card without the flag, the bare node
    // with it. The flag went on 2026-09-11 and the withholding went
    // everywhere, so the "without" half had no subject; what replaced it was
    // the OTHER ORDER, reading the same boundary at the top of an ascending
    // list. That order went on 2026-09-12 (see useTimelineEvents's header),
    // and the second half went with it.
    //
    // What stands in its place is the boundary's own GUARD rather than a
    // second view of it. `boundaryAtBottom` is `effectiveBoundary != null &&
    // !hasMore`, so the glyph must be ABSENT while a "Show 50 more" button is
    // still under the rows and PRESENT once it is gone — read on both sides of
    // one load. That is the discriminating shape: "the glyph is drawn", taken
    // alone, passes just as well on a page that draws it always.
    if (f.cut) {
      await page.goto(`${BASE}${path}?folders=0`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const before = await page.evaluate(READ_SPINE);
      const paging = await page.evaluate(() =>
        [...document.querySelectorAll("button")].some((x) => /^Show [\d,]+ more$/.test((x.textContent ?? "").trim())),
      );
      await toEndOfList(page);
      const end = await page.evaluate(READ_SPINE);
      // Only meaningful where the window actually pages — a fixture whose
      // loaded rows all fit the first chunk has `!hasMore` from the start, and
      // would pass the "absent" half for a reason that is not the guard.
      if (!paging) console.log(`SKIP  9  ${f.id}: no paging on this fixture, the guard has no both-sides`);
      else
        check(
          `9  ${f.id}: no boundary at all while "Show more" stands — those events are one click away, not hidden`,
          before.cut === 0 && before.cards === 0,
          `${before.cards} card(s), ${before.cut} bare row(s) with paging still to do`,
        );
      check(
        `9  ${f.id}: paged to the end, the cut's boundary is one bare node, nothing beside it`,
        end.cards === 0 && end.cut === 1 && end.glyphs === 1 && end.beside === "",
        `${end.cards} card(s), ${end.cut} bare row(s), ${end.glyphs} glyph(s), beside it "${end.beside}"`,
      );
    }

    // 9 and 12 — THE TIP IS A TIMESTAMP, NOT A FILTER, and the older end
    // speaks once. Two days, both of them a date filter: the newest listed
    // day, which leaves the newest event the page holds standing at the top,
    // and an earlier one, which does not.
    const listedDays = [...new Set(listed.map((e) => startOfUtcDay(e.timestamp)))].sort((a, b) => b - a);
    const newestListedDay = listedDays[0] ?? null;
    const pastListedDay = listedDays[1] ?? null;
    if (pastListedDay == null) {
      check(`9  ${f.id}: a second listed day to select`, false, `${listedDays.length} listed day(s)`);
    } else {
      await page.goto(`${BASE}${path}?folders=0&from=${day(pastListedDay)}&to=${day(pastListedDay)}`, {
        waitUntil: "domcontentloaded",
      });
      await settle(page);
      const past = await page.evaluate(READ_SPINE);
      check(
        `9  ${f.id}: on a past day the tip loses its pulse and takes the boundary glyph`,
        past.pulses === "" && past.tip === 1 && past.glyphs >= 1,
        `spine tip dot(s) "${past.pulses}", ${past.tip} bare tip row(s), ${past.glyphs} glyph(s) on ${day(pastListedDay)}`,
      );
      // 12 — paged to the end of the filtered list, because while a "Show 50
      // more" button stands below the rows the older events are one click away
      // rather than hidden.
      await toEndOfList(page);
      const older = await page.evaluate(READ_SPINE);
      check(
        `12 ${f.id}: with older events filtered out the spine says so at the older end, once`,
        older.cards + older.cut + older.view === 1,
        `${older.cards} card(s) + ${older.cut} cut row(s) + ${older.view} view row(s) at the older end on ${day(pastListedDay)}`,
      );
      if (!f.cut) {
        // On a page whose rows ARE the history there is no window boundary to
        // stand in for this one, so it has to be the VIEW's own — the case
        // Miles was looking at (38 events, a day selected, nothing below).
        check(
          `12 ${f.id}: with no cut to speak for it, the VIEW's own boundary draws it`,
          older.view === 1 && older.cards === 0 && older.cut === 0,
          `${older.view} view row(s), ${older.cards} card(s), ${older.cut} cut row(s)`,
        );
      }
      await page.goto(`${BASE}${path}?folders=0&from=${day(newestListedDay)}&to=${day(newestListedDay)}`, {
        waitUntil: "domcontentloaded",
      });
      await settle(page);
      const newest = await page.evaluate(READ_SPINE);
      check(
        `9  ${f.id}: a filter that leaves the newest event at the top keeps the pulse`,
        newest.pulses === "above" && newest.tip === 0,
        `spine tip dot(s) "${newest.pulses}", ${newest.tip} bare tip row(s) on ${day(newestListedDay)}`,
      );
    }
  } catch (err) {
    check(`${f.id}: the page loaded and the checks ran`, false, String(err?.message ?? err).slice(0, 200));
  } finally {
    await page.close();
  }
  console.log("");
}

// ── G — THE GROUPED ARM: the DEFAULT page, where the list is rows AND folders ──
//
// Everything above pins `?folders=0`. This arm opens the page as a reader gets
// it and checks the two things the navigator does to the list there: the count
// line, and the jump — a month click, and a day typed into the spread — over a
// list that is part event rows and part served folders. Every expected figure
// is reduced from the grouped route (`/timeline?group=1`) read on the run: the
// loose events by their own timestamps, and each folder by its `byDay`.
//
//   G0  the premise: the route answers grouped, with folders AND loose events,
//       and the page, paged to its end, draws each folder as one row and each
//       loose event as one row;
//   G1  the count line at rest: a windowed grouped page names its noun,
//       "Showing <rows> rows of <total> events"; a whole one reads
//       "<total> events";
//   G2  a month click filters to the month, the spread reads it back, and the
//       count line states the month's events — the loose ones in it plus the
//       folder members the folders' `byDay` puts in it, exact, never "at
//       least" — and the map cell's own figure (on a windowed page the
//       month is chosen wholly above the cut, so the two count one set);
//   G3  the folders left standing are exactly the ones whose span meets the
//       month, and every one of them is open (a date filter opens what covers
//       the dates);
//   G4  the same month again clears the selection and the count line returns;
//   G5  one day typed into both ends, on the busiest day a folder covers:
//       the line counts that day's loose events plus the members the folders'
//       `byDay` puts on it.
//
// ⚠️ THE MARKS ARE NOT CHECKED HERE, AND CANNOT BE YET. A folder carries
// `counts` (per action) and `byDay` (per day) as two separate histograms, so
// it cannot say on which day its liquidation fell; the marks on a grouped page
// need the day × action cross-tab from the server (rails-ops
// reference/timeline-navigator-prototype.md, "the day × action cross-tab").
// What the map DRAWS on a grouped page is `H1` in verify-folder-reductions.mjs.
//
// Fixtures (Aave V3 Ethereum, `core`), timed grouped on preview 2026-09-21
// before being chosen: `grouped-deep` 0xee7c…2954, a user position (not in
// `protocol_plumbing_contracts`, not router-flagged) whose grouped answer is
// cut by ROWS — 1,000 rows, 86 folders beside 914 events, of 7,150 — in 7.7 s;
// `grouped-whole` 0x9984…bb47 (`liquidated` above), whole history, one folder
// of six beside 383 events, in 1.4 s. `grouped-deep` is the position `deep`
// reads flat.
const FOLDER_HEADER = '[role="button"][aria-expanded][aria-label*=" consecutive "]';
const GROUPED_FIXTURES = [
  { id: "grouped-deep", wallet: "0xee7ca610d896c53ffe716b801c05748efd902954" },
  { id: "grouped-whole", wallet: "0x9984a1d407bc6ac53b404aabf66b80b99d96bb47" },
];

/** The drawn list as rows: folder headers, and event rows. With every folder
 *  shut the event rows are the loose events; an open folder adds its members. */
const READ_GROUPED_LIST = (sel) => {
  const heads = [...document.querySelectorAll(sel)];
  return {
    folders: heads.length,
    open: heads.filter((h) => h.getAttribute("aria-expanded") === "true").length,
    sizes: heads.map((h) =>
      Number((/^([\d,]+) consecutive/.exec(h.getAttribute("aria-label") ?? "")?.[1] ?? "0").replace(/,/g, "")),
    ),
    events: document.querySelectorAll("[data-event-id]").length,
    unit: document.querySelector("[data-timeline-unit]")?.getAttribute("data-timeline-unit") ?? null,
    shown: document.querySelector("[data-timeline-shown]")?.getAttribute("data-timeline-shown") ?? null,
  };
};

for (const g of GROUPED_FIXTURES) {
  if (ONLY && !ONLY.has(g.id)) continue;
  const path = `/ethereum/aave-v3/${g.wallet}`;
  const page = await ctx.newPage();
  page.setDefaultTimeout(300_000);
  try {
    const route = await getJson(`/api/aave-v3/timeline?market=core&wallet=${g.wallet}&group=1`);
    const plan = route.rowPlan ?? [];
    const folders = plan.filter((r) => r.kind === "folder").map((r) => r.folder);
    const loose = route.events ?? [];
    check(
      `G0 ${g.id}: the route answers grouped, part folders and part loose events`,
      !route.error && route.grouped === true && folders.length > 0 && loose.length > 0,
      route.error ?? `${plan.length} row(s): ${folders.length} folder(s), ${loose.length} event(s)`,
    );
    if (route.error || folders.length === 0) continue;
    const windowed = route.cutoffBlock != null;
    const eventsServed = route.eventsServed ?? loose.length + folders.reduce((a, f) => a + f.count, 0);
    info(
      `G0 ${g.id}: grouped answer`,
      `${n(plan.length)} rows of ${n(route.totalEvents)} events, ${n(eventsServed)} listed, ${windowed ? `cut by ${route.boundBy}` : "whole history"}`,
    );

    // What the page should count for a UTC span [from, to]: the loose events
    // in it, plus each folder's members on the days of its `byDay` inside it.
    const expectedIn = (from, to) =>
      loose.filter((e) => e.timestamp >= from && e.timestamp <= to).length +
      folders.reduce(
        (a, f) => a + f.byDay.reduce((b, d) => (Number(d.key) >= from && Number(d.key) <= to ? b + d.count : b), 0),
        0,
      );

    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const restLine = await page.evaluate(COUNT_LINE);
    await toEndOfList(page);
    const drawn = await page.evaluate(READ_GROUPED_LIST, FOLDER_HEADER);
    check(
      `G0 ${g.id}: paged to its end, the page draws each folder as one row and each loose event as one row`,
      drawn.folders === folders.length && drawn.open === 0 && drawn.events === loose.length,
      `${drawn.folders} folder row(s) (${drawn.open} open) against the route's ${folders.length}; ${drawn.events} event row(s) against ${loose.length} loose events`,
    );

    // G1 — the count line at rest states TIME, never the preload's size
    // (decision 0019, amendment 2026-09-24): "7,161 events · loaded 14 Nov
    // 2025 to 24 Sept 2026" on a windowed page, "389 events" on a whole one.
    const oldestServed = Math.min(...loose.map((e) => e.timestamp), ...folders.map((f) => f.firstAt));
    const newestServed = Math.max(...loose.map((e) => e.timestamp), ...folders.map((f) => f.lastAt));
    const loadedText = `${dateText(oldestServed)} to ${dateText(newestServed)}`;
    const wantRest = windowed
      ? `${n(route.totalEvents)} events · loaded ${loadedText}`
      : `${n(route.totalEvents)} events`;
    check(
      `G1 ${g.id}: the count line at rest ${windowed ? "states the loaded span in time" : "is the whole history's count"}`,
      restLine === wantRest && (!windowed || drawn.unit === "rows"),
      `"${restLine}" (want "${wantRest}"), unit ${drawn.unit}`,
    );
    check(
      `G1 ${g.id}: nothing on the page names the row cap`,
      !(await page.evaluate(NAMES_THE_CAP, plan.length)),
      `a "Showing N rows", "most recent N" or "above what Rails" phrase, or the cap ${n(plan.length)} as a bare count, is on the page`,
    );

    // ── S — THE TWO PATHS (decision 0019, amendment 2026-09-25) ──
    //
    // ⚠️ REWRITTEN, NOT DELETED, FOR THE THIRD TIME. S0 to S4 were written
    // against the sticky picker above the rows (2026-09-24), rewritten the
    // same evening when it went low-fi, and rewritten again on 2026-09-25 when
    // Miles put the grid back in the Date panel and ruled that a month click
    // takes one of two paths: filter where the loaded rows hold the month,
    // read where they do not. The subject is the same both times, what a
    // month click does, so the checks moved with it. A check that simply
    // vanished would read later like one that quietly stopped running.
    //
    //   S0  the grid is BACK IN THE PANEL and the picker above the rows is
    //       gone: nothing on the page draws one, and the Date button opens a
    //       panel holding the spread and exactly one month grid;
    //   S1  that grid is every month the life holds, with the density key
    //       under it and no mark on any cell;
    //   S2  THE FILTER PATH. A month the loaded rows hold writes
    //       `?from=`/`?to=` for that month, moves the count line to its
    //       filtered form, closes the panel and reads NOTHING: no skeleton
    //       stands and the line never states a segment;
    //   S3  THE READ PATH. A month below the cut becomes the page's segment:
    //       the count line states the month in time, every row drawn is inside
    //       it, the tip is withheld at the top, no lifetime figure stands, and
    //       the grid reopened rings that month as the one the page is on. Then
    //       Reset gives back the rows the page opened with;
    //   S4  the phone at 390 keeps its `MobileSheet` form: the Date control
    //       opens a sheet holding the grid, and a tap on a below-cut month
    //       reads it there too.
    //
    // The two paths differ in what they COST, which is the reason for having
    // both, so each is timed and the figure printed beside its check.
    const marksG = await page.evaluate(READ_MARKS);
    const atRestG = await page.evaluate(READ_CONTROLS);
    check(
      `S0 ${g.id}: nothing above the rows is a picker, and the page at rest carries no grid`,
      marksG.pickers === 0 && atRestG.navigators === 0 && atRestG.grains.length === 0,
      `${marksG.pickers} picker element(s); ${atRestG.navigators} panel(s), grids [${atRestG.grains.join(", ")}]`,
    );
    const openedG = await openPanel(page);
    const navG = await page.evaluate(READ_NAV);
    const openG = await page.evaluate(READ_CONTROLS);
    check(
      `S0 ${g.id}: the Date button opens one panel holding the spread and one month grid`,
      openedG &&
        openG.navigators === 1 &&
        openG.grains.length === 1 &&
        navG?.grain === "months" &&
        ISO_DAY.test(navG?.from ?? "") &&
        ISO_DAY.test(navG?.to ?? ""),
      `opened ${openedG}, ${openG.navigators} panel(s), grids [${openG.grains.join(", ")}], spread ${navG?.from}…${navG?.to}`,
    );

    // The whole life by month: the summary read past the tip IS the life, and
    // is what the page's own `lifeDays` sums to from the opening balance, the
    // folders' `byDay` and the loose events.
    const life = await getJson(`/api/aave-v3/timeline/summary?market=core&wallet=${g.wallet}&cutoffBlock=99999999`);
    const lifeMonths = new Map();
    for (const b of life?.byDay ?? []) {
      const i = monthIdxOf(Number(b.key));
      lifeMonths.set(i, (lifeMonths.get(i) ?? 0) + b.count);
    }
    const liveWant = [...lifeMonths.entries()]
      .filter(([, c]) => c > 0)
      .map(([i]) => i)
      .sort((a, b) => a - b);
    const newestMonth = liveWant[liveWant.length - 1];
    const holdsLine = (idx) => {
      const c = lifeMonths.get(idx) ?? 0;
      return `${monthLong(idx)} holds ${n(c)} ${c === 1 ? "event" : "events"}`;
    };
    /** A segment has landed when the count line states its month and the
     *  skeleton is gone. */
    const landed = (p, head) =>
      settled(
        p,
        (w) =>
          (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "")
            .trim()
            .startsWith(w) && document.querySelector("[data-segment-skeleton]") == null,
        head,
        120_000,
      );
    const filteredLine = (x) =>
      windowed
        ? `Showing ${n(x)} of ${loadedText} · ${n(route.totalEvents)} events`
        : `${n(x)} of ${n(route.totalEvents)} events`;

    // S1 — the grid is the life, and it carries a key and no marks.
    const gridMonths = (navG?.cells ?? []).map((c) => monthIdxOf(c.at)).sort((a, b) => a - b);
    check(
      `S1 ${g.id}: the grid is every month the life holds, with the density key and no mark`,
      liveWant.every((i) => gridMonths.includes(i)) &&
        (navG?.keys ?? 0) === 1 &&
        marksG.cells === 0 &&
        marksG.legends === 0,
      `${gridMonths.length} live cell(s) covering ${liveWant.filter((i) => gridMonths.includes(i)).length} of ${liveWant.length} month(s) the life holds; ${navG?.keys} density key(s), ${marksG.cells} mark(s), ${marksG.legends} legend(s)`,
    );

    // S2 — THE FILTER PATH. The month holding the newest served row: the page
    // holds those rows, so the click must never issue a read.
    const heldMonth = monthIdxOf(newestServed);
    const heldFrom = monthStartTs(heldMonth);
    const heldTo = monthEndOf(heldFrom);
    const wantFiltered = filteredLine(expectedIn(heldFrom, heldTo));
    const filterCell = (navG?.cells ?? []).find((c) => c.at === heldFrom);
    if (filterCell == null || filterCell.reach) {
      check(
        `S2 ${g.id}: ${monthName(heldMonth)} is a month the loaded rows hold`,
        false,
        filterCell == null ? "no cell for it on the grid" : "the grid calls it a read, not a filter",
      );
    } else {
      const t0 = Date.now();
      const clicked = await page.evaluate(CLICK_CELL, heldFrom);
      await settled(
        page,
        (w) => (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim() === w,
        wantFiltered,
        30_000,
      );
      const tookFilter = Date.now() - t0;
      const line = await page.evaluate(COUNT_LINE);
      const sp = new URLSearchParams(search(page));
      const closed = (await page.$("[data-timeline-navigator]")) == null;
      const skeleton = (await page.$("[data-segment-skeleton]")) != null;
      check(
        `S2 ${g.id}: ${monthName(heldMonth)} is held, so the click filters the rows and reads nothing`,
        clicked &&
          sp.get("from") === day(heldFrom) &&
          sp.get("to") === day(heldTo) &&
          line === wantFiltered &&
          !skeleton &&
          closed,
        `clicked ${clicked}; from=${sp.get("from")} to=${sp.get("to")} (want ${day(heldFrom)}…${day(heldTo)}); "${line}" (want "${wantFiltered}"); skeleton ${skeleton}; panel closed ${closed}`,
      );
      info(`S2 ${g.id}: the filter path`, `${tookFilter} ms from click to the count line`);
    }

    // S3 — THE READ PATH. The newest month wholly below the oldest served row
    // that holds events, from the whole-life summary.
    const below = [...lifeMonths.entries()]
      .filter(([i, c]) => c > 0 && monthEndOf(monthStartTs(i)) < oldestServed)
      .sort((a, b) => b[0] - a[0]);
    const target = below[0] ?? null;
    if (!windowed) {
      info(`S3 ${g.id}: a month below the cut`, "the page holds the whole history; no month sits below a cut");
    } else if (target == null) {
      check(`S3 ${g.id}: a month below the cut to pick`, false, "none in the summary");
    } else {
      const [tIdx, tCount] = target;
      const cap = route.boundBy === "rows" ? plan.length : null;
      const head = holdsLine(tIdx);
      const from = monthStartTs(tIdx);
      const to = monthEndOf(from);
      await openPanel(page);
      const beforePick = await page.evaluate(READ_NAV);
      const reachCell = (beforePick?.cells ?? []).find((c) => c.at === from);
      const t0 = Date.now();
      const pressed = await page.evaluate(CLICK_CELL, from);
      await landed(page, head);
      await stillRows(page);
      const tookRead = Date.now() - t0;
      const line = await page.evaluate(COUNT_LINE);
      const spine = await page.evaluate(READ_SPINE);
      const closed = (await page.$("[data-timeline-navigator]")) == null;
      const rowsAt = await page.evaluate(() =>
        [...document.querySelectorAll("[data-row-at]")].map((e) => Number(e.dataset.rowAt)),
      );
      const shrunk = cap != null && tCount > cap;
      check(
        `S3 ${g.id}: ${monthName(tIdx)} is below the cut, so the grid offers it as a read and the click takes it`,
        pressed && reachCell?.reach === true && closed,
        `pressed ${pressed}; the grid called it ${reachCell == null ? "no cell at all" : reachCell.reach ? "a read" : "a filter"}; panel closed ${closed}`,
      );
      check(
        `S3 ${g.id}: the count line states the month in time`,
        // A month over the preload in events may still fit it in rows once
        // grouped, so over the cap either form is right; under it, the month
        // is on the page whole and the line says only that.
        shrunk ? line === head || line.startsWith(`${head}; loaded `) : line === head,
        `"${line}" (want ${shrunk ? `"${head}" or "${head}; loaded …"` : `"${head}"`})`,
      );
      check(
        `S3 ${g.id}: every row drawn is inside ${monthName(tIdx)}, and there are rows`,
        rowsAt.length > 0 && rowsAt.every((t) => t >= from && t <= to),
        `${rowsAt.length} row(s), ${rowsAt.filter((t) => t < from || t > to).length} outside`,
      );
      check(
        `S3 ${g.id}: the tip is withheld at the top, and no lifetime figure is on the line`,
        spine.tip >= 1 && !line.includes(n(route.totalEvents)),
        `${spine.tip} bare tip row(s); "${line}"`,
      );
      await openPanel(page);
      const onSegment = await page.evaluate(READ_NAV);
      const current = (onSegment?.cells ?? []).filter((c) => c.current).map((c) => monthIdxOf(c.at));
      check(
        `S3 ${g.id}: the grid reopened rings ${monthName(tIdx)} as the month the page is on`,
        current.length === 1 && current[0] === tIdx,
        `${current.length} month(s) ringed as current${current.length ? ` (${current.map(monthName).join(", ")})` : ""}`,
      );
      info(
        `S3 ${g.id}: the read path`,
        `${tookRead} ms from click to the rows, against the filter path's figure above`,
      );

      // And Reset gives the rows the page opened with back, count line and
      // all: the one way out of a segment now the Newest button is gone.
      await page.click("[data-timeline-navigator] button:has-text('Reset')", { timeout: 10_000 }).catch(() => {});
      await settled(
        page,
        (w) => (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim() === w,
        wantRest,
        60_000,
      );
      const restAgain = await page.evaluate(COUNT_LINE);
      check(
        `S3 ${g.id}: Reset gives back the rows the page opened with`,
        restAgain === wantRest,
        `"${restAgain}" (want "${wantRest}")`,
      );
    }

    // S4 — the phone at 390, where the panel is a MobileSheet.
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "light",
      extraHTTPHeaders: bypassHeaders(),
    });
    await phone.addInitScript(INIT);
    const small = await phone.newPage();
    small.setDefaultTimeout(300_000);
    try {
      await small.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await settle(small);
      const openedPhone = await openPanel(small);
      const phoneNav = await small.evaluate(READ_NAV);
      const phoneMarks = await small.evaluate(READ_MARKS);
      check(
        `S4 ${g.id}: at 390 the Date control opens the sheet, and the grid is in it`,
        openedPhone && phoneNav?.grain === "months" && (phoneNav?.cells.length ?? 0) > 0 && phoneMarks.pickers === 0,
        `opened ${openedPhone}, grain ${phoneNav?.grain}, ${phoneNav?.cells.length ?? 0} live cell(s), ${phoneMarks.pickers} picker element(s)`,
      );
      if (windowed && target != null) {
        const [tIdx] = target;
        const head = holdsLine(tIdx);
        const tapped = await small.evaluate(CLICK_CELL, monthStartTs(tIdx));
        await landed(small, head);
        const line = await small.evaluate(COUNT_LINE);
        check(
          `S4 ${g.id}: a tap on ${monthName(tIdx)} reads it there too`,
          tapped && line.startsWith(head),
          `tapped ${tapped}; "${line}" (want "${head}…")`,
        );
        // ⚠️ THE SHEET'S RESET IS THE ONLY ONE ON A PHONE, the panel's own
        // being withheld inside the sheet, so it has to clear the SEGMENT, not the
        // date range alone. Without this a month read on a phone has no way
        // back, which is how the first build of this shipped.
        await openPanel(small);
        await small.click("[role='dialog'] button:has-text('Reset')", { timeout: 10_000 }).catch(() => {});
        await settled(
          small,
          (w) =>
            (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim() === w,
          wantRest,
          60_000,
        );
        const backOnPhone = await small.evaluate(COUNT_LINE);
        check(
          `S4 ${g.id}: the sheet's Reset gives the rows the page opened with back`,
          backOnPhone === wantRest,
          `"${backOnPhone}" (want "${wantRest}")`,
        );
      }
    } finally {
      await small.close();
      await phone.close();
    }

    // Back to the newest rows for G5: reload rather than pick, so the spread
    // reads the preload's own life.
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    // G5 — a day typed into the spread, on the busiest day a folder covers.
    const folderDays = new Map();
    for (const f of folders)
      for (const d of f.byDay) {
        const at = Number(d.key);
        if (!windowed || at >= oldestServed) folderDays.set(at, (folderDays.get(at) ?? 0) + d.count);
      }
    const pickDay = [...folderDays.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (pickDay == null) {
      check(`G5 ${g.id}: a day a folder covers`, false, "no folder day in the listed range");
    } else {
      await openPanel(page);
      const beforeFrom = search(page);
      await page.evaluate(TYPE_DATE, ["from", day(pickDay)]);
      await searchMoved(page, beforeFrom);
      const beforeTo = search(page);
      await page.evaluate(TYPE_DATE, ["to", day(pickDay)]);
      await searchMoved(page, beforeTo);
      await stillRows(page);
      const want = expectedIn(pickDay, pickDay + SECONDS_PER_DAY - 1);
      await settled(
        page,
        (w) => (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim() === w,
        filteredLine(want),
        30_000,
      );
      const line = await page.evaluate(COUNT_LINE);
      const sp = new URLSearchParams(search(page));
      check(
        `G5 ${g.id}: ${day(pickDay)} typed into both ends counts its loose events plus the folder members on it`,
        sp.get("from") === day(pickDay) && sp.get("to") === day(pickDay) && line === filteredLine(want),
        `from=${sp.get("from")} to=${sp.get("to")}; "${line}" (want "${filteredLine(want)}": ${folderDays.get(pickDay)} folder member(s) that day)`,
      );
    }
  } catch (err) {
    check(`G  ${g.id}: the page loaded and the checks ran`, false, String(err?.message ?? err).slice(0, 200));
  } finally {
    await page.close();
  }
  console.log("");
}

await browser.close();
console.log(`${passes}/${passes + failures} checks passed`);
process.exit(failures === 0 ? 0 : 1);
