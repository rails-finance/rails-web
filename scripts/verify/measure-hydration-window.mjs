// The pre-hydration click window — how long a page LOOKS interactive before it IS.
//
// Every detail page and every SSR-seeded listing ships from the server as
// finished HTML. The controls (a filter dropdown, the sort flip) are painted and
// clickable-looking long before React has downloaded, parsed and attached the
// handlers behind them. A click inside that gap is not queued against the
// finished page — it goes to a picture of a button.
//
// This was first seen in our own verifiers, whose clicks evaporated; the fix
// there was to re-assert aria-pressed each poll, which papered over the question
// rather than answering it. Everything we know about the size of the gap comes
// from `next dev`, where the bundle is unminified and compiled on demand — which
// is to say we know nothing about it. This measures a PRODUCTION build.
//
// TWO probes per page, and both are needed, because "the click did nothing" and
// "the click was lost" are different claims:
//
//   poll  — click the control every POLL_MS from first paint until aria-expanded
//           actually flips. Answers "when does a click first work?". The gap
//           between first paint and that moment is the window a visitor can
//           click into.
//
//   early — load again, click ONCE as early as the control exists, then wait
//           REPLAY_WAIT_MS and look. React 18+ records discrete events that land
//           on a not-yet-hydrated boundary and replays them once it hydrates —
//           but only from the moment hydrateRoot RUNS. Before the bundle
//           executes there is no listener and the click is gone for good. So a
//           panel that is open at the end of this probe means the click was
//           merely LATE; one that is still shut means it was LOST. That
//           distinction decides the fix: a lost click wants a visibly inert
//           control, a late one wants a pending state.
//
// aria-expanded is the probe signal because it is the control's own state, set
// by the same React that owns the click — it cannot read "true" through any path
// that does not involve a handled click, and it only ever goes false → true
// here, so a poll cannot toggle past the transition it is looking for.
//
// Guards, in the spirit of the token census: a selector that matches nothing
// looks exactly like an instant page. A page whose control is never found is
// reported NO CONTROL and exits non-zero; a probe that never succeeds inside
// GIVE_UP_MS is reported NEVER, not silently averaged away.
//
//   BASE=http://localhost:3020 node scripts/verify/measure-hydration-window.mjs
//   BASE=… CPU=4 NET=slow4g node scripts/verify/measure-hydration-window.mjs
//   BASE=… node scripts/verify/measure-hydration-window.mjs /ethereum/aave-v3
//
// CPU=<n> throttles the renderer by that factor and NET=<profile> shapes the
// link (off / fast4g / slow4g / 3g), because the machine this runs ON is not the
// machine it runs FOR, and localhost is not a network. Unthrottled on this Mac
// is the floor, not the answer — quote it beside a throttled run or it flatters
// every page.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const CPU = Number(process.env.CPU ?? 1);
const RUNS = Number(process.env.RUNS ?? 3);
const NET = process.env.NET ?? "off";
const POLL_MS = 20;
const GIVE_UP_MS = 25000;
const REPLAY_WAIT_MS = 10000;

// The control this probes on every page: a filter dropdown or the sort flip,
// both of which carry aria-expanded (components/shared/filter-dropdown.tsx:212,
// components/shared/filter-bar/sort-control.tsx:54). Ordered widest-first so a
// page missing one still probes the other rather than reporting NO CONTROL.
const CONTROL = "button[aria-expanded][aria-haspopup], button[aria-expanded]";

// A listing under each strategy, plus the deep detail pages — the surfaces that
// carry the most client work between paint and interactive, which is where the
// window should be widest if it is anywhere.
const DEFAULT_PATHS = [
  "/ethereum/aave-v3",
  "/ethereum/morpho",
  "/ethereum/liquity-v1",
  "/ethereum/aave-v4",
  // A Morpho position with a deep timeline — an SSR'd detail page whose toolbar
  // is painted with real data in the first response.
  "/ethereum/morpho/ebd23a871b52e0a8c92bd719f4413600101b69e946cb72923b3a33fb5bc6ec85-0xebb870a0aaaa7bc55ead925d03a4af4a8db79a03",
];

// Network profiles. The bundle has to ARRIVE before it can execute, and on
// localhost it arrives in no time at all — which is why an unthrottled run here
// measures almost nothing a visitor experiences. Latency dominates: a detail
// page's first load is ~240 kB of JS, and it is the round trips, not the bytes,
// that decide when the handlers attach. Numbers are Chrome DevTools' own presets.
const NETWORKS = {
  off: null,
  fast4g: { latency: 20, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 },
  slow4g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  "3g": { latency: 300, downloadThroughput: (700 * 1024) / 8, uploadThroughput: (250 * 1024) / 8 },
};

/** Renderer CPU + network throttling. Playwright has no API for either; CDP has
 *  both, and they must go through ONE session — a second newCDPSession on the
 *  same page silently drops the first session's emulation on some Chrome builds. */
async function throttle(page, rate, net) {
  const conditions = NETWORKS[net];
  if (rate === 1 && !conditions) return;
  const cdp = await page.context().newCDPSession(page);
  if (rate !== 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  if (conditions) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...conditions });
  }
}

/** First contentful paint, in page time — the moment a visitor can see, and so
 *  aim at, a control. Installed on `window` before any page script runs, rather
 *  than eval'd where it is used: a production build may ship a CSP without
 *  `unsafe-eval`, under which an eval'd helper throws and the whole measurement
 *  reads as a page that has no control. */
const INSTALL_FCP = () => {
  window.__fcp = () => {
    const p = performance.getEntriesByName("first-contentful-paint")[0];
    if (p) return p.startTime;
    const t = performance.timing;
    return t.domContentLoadedEventEnd - t.navigationStart;
  };
};

async function pollProbe(browser, path) {
  const page = await browser.newPage();
  await throttle(page, CPU, NET);
  await page.addInitScript(INSTALL_FCP);
  // "commit" hands control back as soon as the response starts, so the poll is
  // running before the document has finished — waitUntil "load" would return
  // after the very gap being measured.
  await page.goto(BASE + path, { waitUntil: "commit", timeout: 120000 });

  const result = await page.evaluate(
    async ({ sel, pollMs, giveUpMs }) => {
      const started = performance.now();
      let el = null;
      while (!el && performance.now() - started < giveUpMs) {
        el = document.querySelector(sel);
        if (!el) await new Promise((r) => setTimeout(r, pollMs));
      }
      if (!el) return { control: false };

      const appearedAt = performance.now();
      let clicks = 0;
      while (performance.now() - started < giveUpMs) {
        // Re-read the node each pass: the first paint's button can be replaced
        // outright when React hydrates a subtree, and a click on a detached node
        // reaches nothing at all.
        const live = document.querySelector(sel);
        if (!live) break;
        live.click();
        clicks += 1;
        if (live.getAttribute("aria-expanded") === "true") {
          return {
            control: true,
            worked: true,
            clicks,
            appearedAt,
            workedAt: performance.now(),
            fcp: window.__fcp(),
            jsDone: Math.max(
              0,
              ...performance
                .getEntriesByType("resource")
                .filter((r) => r.name.endsWith(".js"))
                .map((r) => r.responseEnd),
            ),
          };
        }
        await new Promise((r) => setTimeout(r, pollMs));
      }
      return { control: true, worked: false, clicks, appearedAt, fcp: window.__fcp() };
    },
    { sel: CONTROL, pollMs: POLL_MS, giveUpMs: GIVE_UP_MS },
  );

  await page.close();
  return result;
}

async function earlyProbe(browser, path) {
  const page = await browser.newPage();
  await throttle(page, CPU, NET);
  await page.addInitScript(INSTALL_FCP);
  await page.goto(BASE + path, { waitUntil: "commit", timeout: 120000 });

  const clicked = await page.evaluate(
    async ({ sel, pollMs, giveUpMs }) => {
      const started = performance.now();
      let el = null;
      while (!el && performance.now() - started < giveUpMs) {
        el = document.querySelector(sel);
        if (!el) await new Promise((r) => setTimeout(r, pollMs));
      }
      if (!el) return { control: false };
      el.click();
      return { control: true, clickedAt: performance.now(), fcp: window.__fcp() };
    },
    { sel: CONTROL, pollMs: POLL_MS, giveUpMs: GIVE_UP_MS },
  );

  if (!clicked.control) {
    await page.close();
    return clicked;
  }

  await page.waitForTimeout(REPLAY_WAIT_MS);
  const open = await page.evaluate(
    (sel) => document.querySelector(sel)?.getAttribute("aria-expanded") === "true",
    CONTROL,
  );
  await page.close();
  return { ...clicked, replayed: open };
}

const ms = (n) => `${Math.round(n)}ms`;

async function main() {
  const paths = process.argv.slice(2).filter((a) => a.startsWith("/"));
  const targets = paths.length ? paths : DEFAULT_PATHS;
  const browser = await chromium.launch();

  console.log(`base ${BASE} · cpu ${CPU}× · net ${NET} · ${RUNS} runs/page\n`);
  let missing = 0;
  let never = 0;

  for (const path of targets) {
    const windows = [];
    let control = true;
    for (let i = 0; i < RUNS; i += 1) {
      const r = await pollProbe(browser, path);
      if (!r.control) {
        control = false;
        break;
      }
      if (!r.worked) {
        windows.push(null);
        continue;
      }
      windows.push({ window: r.workedAt - r.fcp, fcp: r.fcp, jsDone: r.jsDone, clicks: r.clicks });
    }

    if (!control) {
      missing += 1;
      console.log(`NO CONTROL  ${path}`);
      console.log(`            nothing matched ${CONTROL} — this is a broken probe, not a fast page\n`);
      continue;
    }

    const good = windows.filter(Boolean);
    if (good.length === 0) {
      never += 1;
      console.log(`NEVER       ${path}`);
      console.log(`            no click worked inside ${GIVE_UP_MS}ms across ${RUNS} runs\n`);
      continue;
    }

    const w = good.map((g) => g.window).sort((a, b) => a - b);
    const median = w[Math.floor(w.length / 2)];
    const early = await earlyProbe(browser, path);

    console.log(`${path}`);
    console.log(
      `  window     ${ms(median)}  (runs ${w.map((n) => ms(n)).join(" ")})  from first paint to first click that worked`,
    );
    console.log(`  paint      ${ms(good[0].fcp)}   js settled ${ms(good[0].jsDone)}`);
    console.log(
      `  lost click ${
        early.control
          ? early.replayed
            ? "NO  — a click at first paint opened the panel late (React replayed it)"
            : "YES — a click at first paint was still doing nothing " + REPLAY_WAIT_MS / 1000 + "s later"
          : "n/a — control never appeared on the replay run"
      }`,
    );
    console.log("");
  }

  await browser.close();
  if (missing || never) {
    console.log(`${missing} page(s) with no control, ${never} never interactive — treat this run as unproven`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
