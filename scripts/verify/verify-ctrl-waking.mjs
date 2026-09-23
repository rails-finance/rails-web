// The pre-hydration control state does what it claims — and stops doing it.
//
// A control strip carries [data-ctrl-waking] from the server response until its
// handlers attach (hooks/useHydrated + ctrlWaking in lib/shared/ui-grammar);
// globals.css mutes it and takes the pointer away, on a 250ms delay so a fast
// load never paints the muted state at all. Four things have to hold, and three
// of them are ways this change could go wrong rather than right:
//
//   A  the server actually SENDS the mark. Read off the raw HTML, not a live
//      page — a mark added by client JS would be useless here, since the whole
//      point is the window before client JS runs.
//
//   B  the strip comes back to LIFE. This is the assertion that matters most.
//      A strip that keeps the attribute keeps `pointer-events: none` forever,
//      which is a permanently dead toolbar — far worse than the swallowed click
//      this replaces. Asked of the document, not of one node: nothing may still
//      be marked, and a real control must take the pointer at normal opacity.
//
//   C  on a slow load the muted state is REACHED. Without this the change is
//      inert in the literal sense: correct attribute, no visible effect, and a
//      visitor still cannot tell a dead control from a live one.
//
//   D  on a fast load the muted state is NEVER reached. This is the flash guard
//      — the reason for the delay. If D fails, every visitor on every
//      connection gets a grey blink on load and the cure is worse than the
//      disease.
//
// C and D are the same measurement read against opposite expectations, which is
// what keeps either from passing vacuously: a rule that never fires passes D and
// fails C, and one with no delay passes C and fails D. Both also require a
// non-zero sample count, because "never measured" and "measured at opacity 1"
// are indistinguishable in a bare minimum. No pointer is moved during sampling —
// a computed-style read taken after a click or a hover is confounded by the
// hover rule, which has passed on a deliberately broken page here before.
//
//   BASE=http://localhost:3020 node scripts/verify/verify-ctrl-waking.mjs
//
// Needs a PRODUCTION build (`next build && next start`). Under `next dev` the
// bundle is unminified and compiled on demand, so the fast profile is not fast
// and D fails for a reason that has nothing to do with the code under test.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3020";
const SAMPLE_MS = 16;
const SAMPLE_FOR_MS = 6000;

// A real control inside the strip — what has to be answering the pointer again
// once the mark is gone (filter-dropdown.tsx, sort-control.tsx).
const CONTROL = "button[aria-expanded]";

const SLOW = {
  cpu: 4,
  net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
};

// One listing and one detail page — the two toolbars this is wired into
// (components/shared/filter-bar/list-toolbar.tsx and
// components/shared/timeline-toolbar.tsx). A pass on only one of them would say
// nothing about the other.
const PAGES = [
  { path: "/ethereum/morpho", what: "listing toolbar" },
  {
    path: "/ethereum/morpho/ebd23a871b52e0a8c92bd719f4413600101b69e946cb72923b3a33fb5bc6ec85-0xebb870a0aaaa7bc55ead925d03a4af4a8db79a03",
    what: "timeline toolbar",
  },
];

const fails = [];
const fail = (m) => {
  fails.push(m);
  console.log(`  FAIL  ${m}`);
};
const pass = (m) => console.log(`  ok    ${m}`);

async function ssrMark(path) {
  const res = await fetch(BASE + path);
  const html = await res.text();
  return { ok: res.ok, marked: html.includes("data-ctrl-waking"), busy: html.includes('aria-busy="true"') };
}

/** Load once and watch one strip from first sight until it is live.
 *
 *  Two traps this shape exists to avoid, both found the hard way on the listing
 *  page, whose toolbar React REPLACES outright rather than updating in place:
 *
 *   • "did the mark clear?" cannot be asked of the captured node. A replaced
 *     node keeps the attribute forever while it sits detached, so the honest
 *     question is whether any marked strip is left in the document — and
 *     whether a live control answers the pointer again.
 *   • getComputedStyle on a detached node returns "" for every property, and
 *     Number("") is 0. Sampling through a detach therefore reports opacity 0
 *     and assertion C passes on a page where the rule never fired at all. Only
 *     samples taken while the node is connected AND still marked are counted —
 *     that is the only window in which the rule can apply. */
async function probe(browser, path, slow) {
  const page = await browser.newPage();
  if (slow) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOW.cpu });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...SLOW.net });
  }
  await page.goto(BASE + path, { waitUntil: "commit", timeout: 120000 });

  const out = await page.evaluate(
    async ({ sampleMs, forMs, control }) => {
      const started = performance.now();
      let captured = null;
      let min = null;
      let samples = 0;

      while (performance.now() - started < forMs) {
        const marked = document.querySelector("[data-ctrl-waking]");
        if (!captured && marked) captured = marked;
        if (captured && captured.isConnected && captured.hasAttribute("data-ctrl-waking")) {
          const raw = getComputedStyle(captured).opacity;
          if (raw !== "") {
            const n = Number(raw);
            if (Number.isFinite(n)) {
              min = min === null ? n : Math.min(min, n);
              samples += 1;
            }
          }
        }
        await new Promise((r) => setTimeout(r, sampleMs));
      }

      // End state, asked of the document rather than of one node: nothing may
      // still be marked, and a real control has to take the pointer again.
      const live = document.querySelector(control);
      return {
        found: captured !== null,
        min,
        samples,
        endMarked: document.querySelectorAll("[data-ctrl-waking]").length,
        endControl: !!live,
        endPointer: live ? getComputedStyle(live).pointerEvents : null,
        endOpacity: live ? Number(getComputedStyle(live).opacity) : null,
      };
    },
    { sampleMs: SAMPLE_MS, forMs: SAMPLE_FOR_MS, control: CONTROL },
  );

  await page.close();
  return out;
}

async function main() {
  const browser = await chromium.launch();
  console.log(`base ${BASE}\n`);

  for (const { path, what } of PAGES) {
    console.log(`${what} — ${path}`);

    const ssr = await ssrMark(path);
    if (!ssr.ok) {
      fail(`${what}: the page did not serve`);
      console.log("");
      continue;
    }
    if (ssr.marked) pass("A  server sends data-ctrl-waking in the first response");
    else fail(`${what}: A — no data-ctrl-waking in the server HTML; the window is unmarked`);
    if (ssr.busy) pass("A  server sends aria-busy on the strip");
    else fail(`${what}: A — no aria-busy; assistive tech cannot tell the strip is dead`);

    const slow = await probe(browser, path, true);
    if (!slow.found) {
      fail(`${what}: no marked strip was ever in the DOM — a broken probe, not a fast page`);
      console.log("");
      continue;
    }

    if (slow.endMarked === 0 && slow.endControl && slow.endPointer !== "none" && slow.endOpacity === 1) {
      pass("B  the strip comes back to life — nothing marked, control takes the pointer");
    } else if (slow.endMarked > 0) {
      fail(`${what}: B — ${slow.endMarked} strip(s) still marked; pointer-events stays off and the toolbar is dead`);
    } else if (!slow.endControl) {
      fail(`${what}: B — no control left to check; the end state cannot be proven either way`);
    } else {
      fail(`${what}: B — control ends pointer-events:${slow.endPointer} opacity:${slow.endOpacity}, not live`);
    }

    if (slow.samples === 0) {
      fail(`${what}: C — the strip was never sampled while marked and attached; nothing was measured`);
    } else if (slow.min < 1) {
      pass(`C  slow load reaches the muted state (opacity ${slow.min.toFixed(2)} over ${slow.samples} samples)`);
    } else {
      fail(`${what}: C — a 4× CPU / slow-4G load never muted the strip; the state is invisible`);
    }

    const fast = await probe(browser, path, false);
    if (!fast.found || fast.samples === 0) {
      pass("D  fast load cleared the mark before it could be sampled — no flash");
    } else if (fast.min === 1) {
      pass(`D  fast load never muted the strip (${fast.samples} samples at opacity 1) — no flash`);
    } else {
      fail(
        `${what}: D — an unthrottled load dipped to opacity ${fast.min.toFixed(2)}; every visitor sees a grey blink`,
      );
    }
    console.log("");
  }

  await browser.close();
  if (fails.length) {
    console.log(`${fails.length} FAIL`);
    process.exit(1);
  }
  console.log("all pass");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
