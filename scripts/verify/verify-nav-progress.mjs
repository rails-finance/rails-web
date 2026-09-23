// verify-nav-progress — the navigation progress bar acknowledges a click and
// clears once the route commits (components/nav/navigation-progress.tsx,
// rails-ops TO-DO-ui-jobs §35).
//
// The bar covers one wait, click → commit, so the verifier makes that wait long
// on purpose: the RSC request a click makes is held for HOLD_MS, and the
// target is a Maple wallet page, a route with no `loading.tsx`, so the old page
// stays up until the server answers. Every RSC request made before the click is
// held until the click, then HOLD_MS more: on a production build (preview) the
// listing prefetches each row's page whole as it loads — a plain RSC request,
// no `next-router-prefetch` header — and the click then commits in ~120 ms
// from cache (measured 2026-09-21), so the bar correctly draws nothing and
// "visible before the URL changes" goes red for a reason that is not a fault.
// Held, the prefetch is still in flight at the click, which is the case the bar
// is for. (Refusing it instead made Next fall back to a full-document load on
// the click, which no bar survives.) `next dev` does not prefetch, so there the
// hold covers only the click's own request.
//
// What is read: a per-frame recorder in the page samples the bar's declared
// state (`data-nav-progress`: "running" / "done" / absent), its computed opacity
// and its computed scaleX, beside the URL. The checks are over those samples.
//
// The negatives each need the positive to mean anything: a page with no bar
// draws nothing on a hash link either. So the bar's presence is gated first, and
// a row click must draw before any "draws nothing" line is allowed to pass.
//
// Usage:
//   BASE=http://localhost:3000 node scripts/verify/verify-nav-progress.mjs
//   BASE=https://preview.rails.finance node scripts/verify/verify-nav-progress.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const LISTING = "/ethereum/maple";
const ROW = `a[href^="${LISTING}/0x"]`;
const HOLD_MS = 2500;
/** The bar must be gone this soon after the URL changes (§35 plan step 7). */
const CLEAR_WITHIN_MS = 1000;
/** How long a "draws nothing" case is watched. Well past DRAW_DELAY_MS (120). */
const QUIET_MS = 800;

const fails = [];
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

/** Hold every RSC request until `gate.open`, then HOLD_MS more.
 *  `recordNavigation` opens the gate for its click and shuts it after. */
const gate = { open: false };
async function holdNavigations(page) {
  await page.route("**/*", async (route) => {
    if (route.request().headers()["rsc"] !== "1") return route.fallback();
    while (!gate.open) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, HOLD_MS));
    // The page may have moved on while this was held.
    await route.fallback().catch(() => {});
  });
}

async function startRecorder(page) {
  await page.evaluate(() => {
    if (window.__navRaf) cancelAnimationFrame(window.__navRaf);
    window.__navSamples = [];
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector("[data-nav-progress-bar]");
      const cs = el ? getComputedStyle(el) : null;
      const m = cs?.transform?.match(/^matrix\(([^,]+),/);
      window.__navSamples.push({
        t: performance.now() - t0,
        url: location.pathname + location.search,
        state: el ? (el.getAttribute("data-nav-progress") ?? null) : "missing",
        opacity: cs ? Number(cs.opacity) : 0,
        scale: m ? Number(m[1]) : cs?.transform === "none" ? 1 : 0,
      });
      window.__navRaf = requestAnimationFrame(tick);
    };
    tick();
  });
}

async function stopRecorder(page) {
  return page.evaluate(() => {
    cancelAnimationFrame(window.__navRaf);
    window.__navRaf = null;
    return window.__navSamples;
  });
}

/** Not "networkidle": held prefetches keep the network busy by design. The
 *  bar hydrating is the signal that clicks reach React rather than the
 *  browser's own link handling. */
async function openListing(page) {
  await page.goto(BASE + LISTING, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector(ROW, { timeout: 60000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector("[data-nav-progress-bar]");
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
    },
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(500);
}

/** The listing has no hash or new-tab link, so the verifier adds its own. The
 *  new-tab one points at a real route, so a listener that ignored `target`
 *  would start the bar. */
async function injectLinks(page) {
  await page.evaluate((listing) => {
    const box = document.createElement("div");
    // Top right: the dev overlay's portal sits bottom left and takes the click.
    box.style.cssText = "position:fixed;right:8px;top:120px;z-index:99999;background:#fff;padding:4px";
    box.innerHTML =
      `<a id="vnp-hash" href="#vnp-anchor">hash</a> ` +
      `<a id="vnp-blank" href="${listing}/info" target="_blank">blank</a>`;
    document.body.appendChild(box);
  }, LISTING);
}

/** Act, wait for the URL to leave `from`, keep recording CLEAR_WITHIN_MS + 500. */
async function recordNavigation(page, act) {
  const from = await page.evaluate(() => location.pathname + location.search);
  await startRecorder(page);
  gate.open = true;
  await act();
  await page.waitForURL((u) => u.pathname + u.search !== from, { timeout: 120000 });
  await page.waitForTimeout(CLEAR_WITHIN_MS + 500);
  gate.open = false;
  const samples = await stopRecorder(page);
  const committed = samples.find((s) => s.url !== from);
  const before = samples.filter((s) => s.url === from);
  const cleared = committed
    ? samples.find((s) => s.t >= committed.t && s.state === null && s.opacity === 0)
    : undefined;
  return { from, samples, before, committed, cleared };
}

async function recordQuiet(page, act) {
  await startRecorder(page);
  await act();
  await page.waitForTimeout(QUIET_MS);
  const samples = await stopRecorder(page);
  return {
    drawn: samples.filter((s) => s.opacity > 0).length,
    running: samples.filter((s) => s.state === "running").length,
    n: samples.length,
  };
}

function reportNavigation(label, r) {
  const shown = r.before.filter((s) => s.state === "running" && s.opacity > 0);
  check(
    `${label}: the bar is drawn before the URL changes`,
    shown.length > 0,
    `${shown.length} of ${r.before.length} frames before the commit drew it` +
      (shown.length ? `, first at ${Math.round(shown[0].t)} ms` : ""),
  );
  const gone = r.cleared && r.committed ? r.cleared.t - r.committed.t : null;
  check(
    `${label}: the bar is gone within ${CLEAR_WITHIN_MS} ms of the URL changing`,
    gone != null && gone <= CLEAR_WITHIN_MS,
    gone == null ? "never cleared in the window" : `${Math.round(gone)} ms`,
  );
  return shown;
}

const browser = await chromium.launch();

// ── Motion ─────────────────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await holdNavigations(page);
  await openListing(page);

  const bars = await page.locator("[data-nav-progress-bar]").count();
  check("the bar is mounted once on the listing", bars === 1, `${bars} found`);
  const idle = await page.evaluate(() => {
    const el = document.querySelector("[data-nav-progress-bar]");
    return el ? { state: el.getAttribute("data-nav-progress"), opacity: getComputedStyle(el).opacity } : null;
  });
  check(
    "at rest it declares no state and draws nothing",
    idle != null && idle.state === null && Number(idle.opacity) === 0,
    JSON.stringify(idle),
  );

  // 1. A listing row, to a route with no loading.tsx.
  const row = page.locator(ROW).first();
  const rowHref = await row.getAttribute("href");
  const r1 = await recordNavigation(page, () => row.click({ position: { x: 4, y: 4 } }));
  const shown = reportNavigation(`row click → ${rowHref}`, r1);
  const rowDrew = shown.length > 0;

  // The climb: it grows and never reaches the end before the commit.
  const scales = shown.map((s) => s.scale);
  const peak = scales.length ? Math.max(...scales) : 0;
  check(
    "row click: the bar climbs and stops short of the end until the commit",
    scales.length > 1 && scales[scales.length - 1] > scales[0] && peak < 0.95,
    scales.length ? `first ${scales[0].toFixed(2)}, last ${scales[scales.length - 1].toFixed(2)}` : "no frames",
  );

  // 2. Back (popstate). Next restores the entry from `history.state` and
  // commits it in the popstate task, so there is no wait and correctly no bar.
  // What can go wrong is a bar started after that commit, which nothing
  // finishes: it held for 15 s on every back step until the component compared
  // the URL with the committed route (2026-09-21). So: nothing is left running.
  const r2 = await recordNavigation(page, () => page.goBack());
  const left = r2.committed
    ? r2.samples.filter((s) => s.t > r2.committed.t + CLEAR_WITHIN_MS && (s.state !== null || s.opacity > 0))
    : [];
  const after = r2.committed ? r2.samples.filter((s) => s.t > r2.committed.t + CLEAR_WITHIN_MS).length : 0;
  check(
    `back: no bar is left running ${CLEAR_WITHIN_MS} ms after the URL changes`,
    r2.committed != null && after > 0 && left.length === 0,
    `${left.length} of ${after} later frames still running or drawn`,
  );
  await page.waitForSelector(ROW, { timeout: 60000 });

  // 3. A router.push caller: the wallet pill's filter inside the row.
  const pill = page.locator(`${ROW} button[aria-label^="Filter positions by wallet"]`).first();
  if ((await pill.count()) === 0) {
    check("wallet pill: found inside a row", false, "no filter button in any row");
  } else {
    const r3 = await recordNavigation(page, () => pill.click());
    reportNavigation("wallet pill (router.push)", r3);
  }

  // ── Clicks that must draw nothing. Only meaningful once a row click drew. ──
  // Each case starts from a fresh load: a bar left running by the case before
  // (it holds up to 15 s when nothing commits) would read as this case's.
  const quietCase = async (label, act) => {
    await openListing(page);
    await injectLinks(page);
    const q = await recordQuiet(page, act);
    const url = await page.evaluate(() => location.pathname + location.search);
    check(
      `${label}: draws nothing`,
      rowDrew && q.drawn === 0 && q.running === 0 && url === LISTING,
      rowDrew
        ? `${q.drawn} drawn / ${q.running} running of ${q.n} frames, at ${url}`
        : "UNRUN — the row click never drew, so a quiet bar proves nothing",
    );
  };

  await quietCase("the copy button inside a row link", () =>
    page.locator(`${ROW} button[aria-label="Copy address"]`).first().click(),
  );
  await quietCase("the bookmark star inside a row link", () =>
    page.locator(`${ROW} button[aria-label="Bookmark this wallet"]`).first().click(),
  );

  await quietCase("a hash-only link", () => page.click("#vnp-hash"));
  const hashed = await page.evaluate(() => location.hash);
  check("a hash-only link: the hash did change (the click happened)", hashed === "#vnp-anchor", hashed);
  // The browser fires popstate for a hash-only step. That is the path that
  // drew the bar on the first run of this verifier (2026-09-21).
  const q = await recordQuiet(page, () => page.goBack());
  const back = await page.evaluate(() => location.pathname + location.search + location.hash);
  check(
    "a back step off a hash: draws nothing",
    rowDrew && q.drawn === 0 && q.running === 0 && back === LISTING,
    rowDrew
      ? `${q.drawn} drawn / ${q.running} running of ${q.n} frames, at ${back}`
      : "UNRUN — the row click never drew, so a quiet bar proves nothing",
  );

  const popup = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  await quietCase('a target="_blank" link', () => page.click("#vnp-blank"));
  (await popup)?.close();

  const modPopup = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await quietCase(`a ${mod}-click on a row link`, () =>
    page
      .locator(ROW)
      .first()
      .click({ modifiers: [mod], position: { x: 4, y: 4 } }),
  );
  (await modPopup)?.close();

  await context.close();
}

// ── Reduced motion: a full-width bar at reduced opacity, no movement ───────
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await holdNavigations(page);
  await openListing(page);
  const r = await recordNavigation(page, () =>
    page
      .locator(ROW)
      .first()
      .click({ position: { x: 4, y: 4 } }),
  );
  const drawn = r.before.filter((s) => s.opacity > 0);
  const partial = drawn.filter((s) => s.scale < 0.999);
  const dim = drawn.every((s) => s.opacity > 0.2 && s.opacity < 0.6);
  check(
    "reduced motion: the bar is drawn full width and dimmed, and never moves",
    drawn.length > 0 && partial.length === 0 && dim,
    `${drawn.length} drawn frames, ${partial.length} not full width, opacities ${[...new Set(drawn.map((s) => s.opacity))].join("/") || "none"}`,
  );
  await context.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exitCode = fails.length ? 1 : 0;
