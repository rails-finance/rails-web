// verify-timeline-window.mjs — the checkpoint model, on the page.
// ---------------------------------------------------------------------------
// A windowed position page fetches the most recent N events and an opening
// balance for everything older, then states figures that cover BOTH. This
// checks the page states the whole position rather than the window it drew.
//
// Every expectation below is anchored on the API's own two responses, fetched
// independently of the page, and on arithmetic between them — never on a value
// the page derived. That is deliberate: a check whose expected value comes from
// the thing under test cannot go red however wrong the thing is, which is how
// verify-timeline-wire.mjs once passed 139 assertions while reconstructing a
// transaction hash as the string "supply".
//
// Run from the repo root with a dev server on :3000 (claude-in-chrome cannot
// reach localhost, so this is the local verification path):
//
//   node scripts/verify/verify-timeline-window.mjs
//
// It is protocol-driven, so one script checks every windowed explorer. The
// protocol-specific part is only ever three strings: which parameters name the
// position, where its page lives, and what its lifetime layer is called.
//
//   PROTO=spark \
//   API_PARAMS='wallet=0x…' \
//   PAGE_PATH='/ethereum/spark/0x…' \
//     node scripts/verify/verify-timeline-window.mjs
//
// Env: BASE (default http://localhost:3000), PROTO, API_PARAMS, PAGE_PATH,
// RECENT, LIFETIME_RE (empty string skips that one check — pwn has no lifetime
// Σ to state), SHOT=path. Unset, it runs the Aave V3 pilot exactly as before.

import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const WALLET = (process.env.WALLET ?? "0xee7ca610d896c53ffe716b801c05748efd902954").toLowerCase();
const MARKET = process.env.MARKET ?? "core";
const RECENT = Number(process.env.RECENT ?? 1000);

// The three protocol-specific strings, defaulting to the pilot.
const PROTO = process.env.PROTO ?? "aave-v3";
const API_PARAMS = process.env.API_PARAMS ?? `wallet=${WALLET}&market=${MARKET}`;
// `folders=0` PINNED on the pilot: every check here reads the page against the
// FLAT `/timeline?recent=N` answer, and grouping became the Aave V3 and
// SparkLend default on 2026-09-12. A PAGE_PATH given by hand on either family
// should pin it too. The grouped page's agreement with this one is H1–H3 in
// verify-folder-reductions.mjs.
const PAGE_PATH = process.env.PAGE_PATH ?? `/ethereum/aave-v3/${WALLET}?market=${MARKET}&folders=0`;
// A protocol with no lifetime Σ (pwn) passes LIFETIME_RE="" and skips that check
// rather than asserting a surface it does not have.
const LIFETIME_RE = process.env.LIFETIME_RE ?? "Lifetime|Deposited|Withdrawn|Supplied";

let pass = 0;
let fail = 0;
const assert = (ok, label, detail) => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

async function api(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json && json.error) throw new Error(`${path} → ${json.error}`);
  return json;
}

const fmt = (n) => n.toLocaleString("en-US");

async function main() {
  // ── The two halves, fetched independently of the page ────────────────────
  let rows;
  let opening;
  try {
    rows = await api(`/api/${PROTO}/timeline?${API_PARAMS}&recent=${RECENT}`);
  } catch (err) {
    assert(false, "the windowed rows fetch answers", String(err.message));
    return;
  }

  const cutoff = rows.cutoffBlock;
  assert(
    typeof cutoff === "number" && cutoff > 0,
    "the rows response names the block its window opened at",
    `cutoffBlock = ${cutoff}`,
  );
  if (typeof cutoff !== "number") return;

  const loaded = rows.events.length;
  assert(loaded >= RECENT, `the window holds at least the ${fmt(RECENT)} events asked for`, `${fmt(loaded)}`);

  try {
    opening = await api(`/api/${PROTO}/timeline/summary?${API_PARAMS}&cutoffBlock=${cutoff}`);
  } catch (err) {
    assert(false, "the opening balance answers at that cutoff", String(err.message));
    return;
  }

  const older = opening.totalEvents;
  const whole = older + loaded;
  assert(older > 0, "the opening balance summarises events below the cut", `${fmt(older)}`);

  // The partition, checked against a THIRD source: the position's own count,
  // read from an unwindowed fetch's row ceiling rather than from either half.
  const unwindowed = await api(`/api/${PROTO}/timeline?${API_PARAMS}`);
  const indexTotal = unwindowed.rowCeiling ? unwindowed.rowCeiling.total : unwindowed.events.length;
  assert(
    whole === indexTotal,
    "opening balance + window is EXACTLY the position's event count",
    `${fmt(older)} + ${fmt(loaded)} = ${fmt(whole)}, index says ${fmt(indexTotal)}`,
  );

  // Every loaded row is at or after the cut; the two halves cannot overlap.
  const below = rows.events.filter((e) => Number(e.blockNumber) < cutoff).length;
  assert(below === 0, "no loaded row falls below the cut", `${below} did`);

  // ── The page ─────────────────────────────────────────────────────────────
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const url = `${BASE}${PAGE_PATH}`;
    // Turn the chronological badge on before the page mounts — it is a display
    // preference, off by default, and the numbering is one of the things under
    // test. Seeded through the same key the toolbar writes.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("timeline-display-v3", JSON.stringify({ showEventNumbers: true }));
      } catch {
        /* private mode — the number checks then skip rather than fail */
      }
    });
    // A protocol whose deepest position is shallower than the page's own
    // TIMELINE_WINDOW_EVENTS can never window in production, so the page's own
    // request would come back with `cutoffBlock: null` and the browser half of
    // this script would have nothing to check — the wiring would ship untested.
    // When RECENT is below that constant, the page's outgoing request is
    // rewritten to the same RECENT the API half used, so the page receives a
    // genuinely windowed response and makes its second request itself. Only the
    // window SIZE is synthetic; every code path below it is the real one. A
    // green run here is not evidence about a deep position — no such position
    // exists on these protocols — it is evidence the page wires up correctly.
    if (RECENT < 1000) {
      await page.route(/\/api\/[^?]+\/timeline\?/, (route) => {
        const u = new URL(route.request().url());
        if (u.searchParams.get("recent") === "1000") {
          u.searchParams.set("recent", String(RECENT));
          return route.continue({ url: u.toString() });
        }
        return route.continue();
      });
      console.log(`  (page requests rewritten to recent=${RECENT} — this protocol never windows at 1,000)`);
    }
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for the OPENING BALANCE to have landed, not merely for the list:
    // the whole point is what the page says once both halves are in hand.
    //
    // ⚠️ WHERE THE PAGE SAYS IT MOVED TWICE. Until `c2eefc0b` a footer read
    // "balance brought forward" / "N events before it"; the boundary card
    // (decision 0019) replaced it, and on 2026-09-11 the card itself was
    // withheld at the cut — the spine's Layers glyph stands there alone
    // (components/shared/timeline-boundary-card.tsx, `TimelineBoundaryRow`).
    // The COUNT survives in exactly one place: the toolbar's count line
    // (`eventCountLine`), which reads "Showing L listed" while the opening
    // balance is in flight and "Showing L of T events" once it is in hand —
    // the lifetime total is never stated from the window alone. So the ready
    // state is that line's FORM, and the opening balance is T − L.
    //
    // The wait is on the form, not on the figures: a wait on the expected
    // numbers would time out on wrong ones and report a crash instead of the
    // checks below. Read from the count SPAN, never the body — the page names
    // the same figures in prose elsewhere.
    const READY = /^Showing ([\d,]+) of ([\d,]+) events?$/;
    const line = await page
      .waitForFunction(
        (src) => {
          const re = new RegExp(src);
          for (const el of document.querySelectorAll("span.tabular-nums")) {
            const s = (el.textContent || "").trim();
            if (re.test(s)) return s;
          }
          return false;
        },
        READY.source,
        { timeout: 90_000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => null);
    assert(line != null, "the page reaches the opening-balance state", 'no "Showing L of T events" line within 90 s');

    const text = await page.innerText("body");

    if (line != null) {
      const [, l, t] = line.match(READY);
      const listed = Number(l.replace(/,/g, ""));
      const total = Number(t.replace(/,/g, ""));
      assert(
        listed === loaded,
        "the count line lists the window the page loaded",
        `${JSON.stringify(line)} lists ${fmt(listed)}, the window holds ${fmt(loaded)}`,
      );
      // The line must account for the events the opening balance summarised,
      // in the page's own digits: what it counts beyond the listed rows.
      assert(
        total - listed === older,
        "the count line accounts for exactly the events the opening balance holds",
        `${JSON.stringify(line)} → ${fmt(total - listed)} beyond the listed rows, opening balance holds ${fmt(older)}`,
      );
    }

    // Numbering runs over the WHOLE history. The oldest event on the page is
    // number `older + 1`, and that expectation comes from the API's own count
    // of the summarised half — nothing the page computed. Read from the badge's
    // aria-label so a formatting change cannot make the check vacuous.
    //
    // ⚠️ WAIT FOR THEM. The count line is server-rendered, so it can reach its
    // ready form before hydration; the badge is a stored display preference,
    // and the server renders the default (off). Read at that moment the page
    // holds no badge, and this check reported 0 on a page that drew them a
    // moment later (2026-09-21, preview). The wait swallows its timeout so a
    // page that never draws them is still a red check, not a crash.
    await page.waitForSelector('[aria-label^="Event "]', { timeout: 30_000 }).catch(() => {});
    const badges = await page.$$eval('[aria-label^="Event "]', (els) =>
      els.map((el) => Number((el.getAttribute("aria-label") ?? "").replace("Event ", ""))),
    );
    assert(badges.length > 0, "the chronological badges render", `${badges.length} found`);
    if (badges.length > 0) {
      const lowest = Math.min(...badges);
      const highest = Math.max(...badges);
      assert(
        lowest > older,
        "no card on the page is numbered inside the opening balance",
        `lowest badge ${fmt(lowest)}, opening balance ends at ${fmt(older)}`,
      );
      assert(
        highest === whole,
        "the newest card is numbered as the position's newest event",
        `highest badge ${fmt(highest)}, position holds ${fmt(whole)}`,
      );
    }

    // Tenure comes from the opening balance's first event, not the window's.
    if (opening.firstTimestamp) {
      const year = String(new Date(opening.firstTimestamp * 1000).getUTCFullYear());
      // Scoped to the eyebrow's own element, not the page body: a year string
      // appears in a dozen places on a three-year position, and a body-wide
      // `includes` would pass on any of them while the tenure said 2026.
      const eyebrow = (await page.locator("text=/^(Active since|Opened) /").first().textContent()) ?? "";
      assert(eyebrow.length > 0, "the tenure eyebrow renders", JSON.stringify(eyebrow));
      assert(
        eyebrow.includes(year),
        "the tenure names the year the position OPENED, not the year its window does",
        `eyebrow reads ${JSON.stringify(eyebrow)}, opening balance starts ${year}`,
      );
    }

    // The type-filter menu counts the POSITION, not the page. Two assertions
    // carry that generically, without either one knowing a protocol's verbs:
    // every row's count added together must be at LEAST the opening balance's
    // own event count (a menu built from the loaded window alone sums to about
    // `recent`, which is orders of magnitude short), and at MOST the whole
    // position (a double-seed would overshoot). Where the largest opening bucket
    // can also be matched to a row by name, its own count is checked too.
    const largest = [...opening.byAction].sort((a, b) => b.count - a.count)[0];
    if (largest && largest.count > 0) {
      const menu = page.locator('[aria-label="Types of event"], button[title="Types of event"]').first();
      const opened = (await menu.count()) > 0;
      assert(opened, "the type filter control is on the page", 'looked for the "Types of event" control');
      if (opened) {
        await menu.click();
        await page.waitForTimeout(400);
        // Scoped through the trigger's own container rather than a role or a
        // class: the panel carries neither, and selecting on a presentational
        // class is how verify-ens-pills.mjs once reported 0 of 94 on a correct
        // page after a font change.
        const menuRows = await page.evaluate(() => {
          const btn = document.querySelector('[aria-label="Types of event"]');
          if (!btn || !btn.parentElement) return [];
          return [...btn.parentElement.querySelectorAll("button")].map((el) => el.textContent ?? "");
        });
        const countOf = (t) => {
          const m = t.match(/([\d][\d,]*)\s*$/);
          return m ? Number(m[1].replace(/,/g, "")) : null;
        };
        const counted = menuRows.map(countOf).filter((n) => n != null);
        assert(
          counted.length > 0,
          "the type filter menu opens with counted rows",
          `${menuRows.length} rows, none counted`,
        );
        const sum = counted.reduce((a, b) => a + b, 0);
        assert(
          sum >= older,
          "the type filter counts the whole position, not the window",
          `menu rows sum to ${fmt(sum)}, opening balance alone holds ${fmt(older)}`,
        );
        assert(
          sum <= whole,
          "the type filter does not count any event twice",
          `menu rows sum to ${fmt(sum)}, position holds ${fmt(whole)}`,
        );
        // The named check, where the protocol's verb and its label agree.
        const wanted = largest.key.replace(/[_-]+/g, " ").trim();
        const row = menuRows.find((t) => t.replace(/[\d,]/g, "").trim().toLowerCase() === wanted.toLowerCase());
        if (row) {
          const n = countOf(row);
          assert(
            n != null && n >= largest.count,
            `the "${largest.key}" row carries at least the opening balance's own count`,
            `row ${JSON.stringify(row)} → ${n}, expected >= ${fmt(largest.count)}`,
          );
        } else {
          console.log(`  (no menu row is named "${wanted}" — the sum assertions carry this protocol)`);
        }
        await page.keyboard.press("Escape");
      }
    }

    // The lifetime tower states a figure at all. Between the two requests it
    // must NOT, and this runs after "ready", so an absence here is a real fail.
    if (LIFETIME_RE) {
      assert(
        new RegExp(LIFETIME_RE, "i").test(text),
        "the lifetime layer renders once the balance is in hand",
        `no match for /${LIFETIME_RE}/i`,
      );
    }

    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });
  } catch (err) {
    assert(false, "the page check ran to completion", String(err.message));
  } finally {
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
