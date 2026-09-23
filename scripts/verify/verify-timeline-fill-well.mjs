// The "still being filled in" well above a Base timeline, and the coverage copy
// that went with it (rails-ops TO-DO-ui-jobs.md §40).
//
// Per fixture, the wallet's timeline route payload (/api/chain/<explorer>/
// timeline) is read first and its `coverage.fill` — the lane's walk as
// rails-server states it — decides what the page must show, re-derived here
// from the payload and lib/shared/fill-eta-overrides.ts (parsed off the source,
// not imported): a well exactly when the walk is filling and this answer holds
// unpriced rows below its frontier; the date from the override when one is set
// for the lane, else remaining event blocks over the 24 h rate from
// `measuredAt`, as a UTC day; no date clause once that day has ended. The page
// is then opened and the well's presence, copy and date are checked against
// that. A fixture whose payload carries no `fill` fails: every lane here is
// priced by a walk, so a missing field is the server not stating it.
//
// Then the coverage pages: the Aave V4 `atBlockPrices` cell is a tick that
// names its exceptions, and the Base notes no longer say the history is swept
// on every request or that the backfill may still be in progress.
//
// No chain reads: the page and its own API routes only.
//
// Fail-first (2026-09-21, dev server on :3047 against the onboarding box): the override
// branch disabled with an override set → 2 FAIL (source, date); the well never
// drawn → 1 FAIL (aave-below shown); the gate ignoring this position's own rows
// → 1 FAIL (aave-above absent); the old Aave V3 Base note restored → 1 FAIL.
// Restored: ALL PASS (Aave V3 Base 21 October 2026, Moonwell Base 22 September
// 2026; with an override of 2026-10-30 it wins, with 2026-09-01 the date drops).
//
// Run:  BASE=http://localhost:3000 node scripts/verify/verify-timeline-fill-well.mjs
//       FIXTURES=aave-below,moonwell-below …   (a subset, by name)

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ONLY = process.env.FIXTURES ? new Set(process.env.FIXTURES.split(",")) : null;
const DAY_MS = 86_400_000;

// Discovered 2026-09-21 on the onboarding box (aave_v3_base_accounts / moonwell_base_accounts
// first_block against price_walk_state): the "below" wallets opened before the
// walk frontier (Aave V3 Base 32,140,552; Moonwell Base 10,147,054), the
// "above" one after it. Which way each must render is read from the payload
// at run time, not assumed from these notes.
const FIXTURES = [
  {
    name: "aave-below",
    explorer: "aave-v3-base",
    page: "/base/aave-v3/",
    wallet: "0x4e82c081fb87b180e23be2ba768184751b6f9ce8",
    expectWell: true,
  },
  {
    name: "aave-above",
    explorer: "aave-v3-base",
    page: "/base/aave-v3/",
    wallet: "0x39d8151734287d7d3c21d60714a57302b78d042c",
    expectWell: false,
  },
  {
    name: "moonwell-below",
    explorer: "moonwell-base",
    page: "/base/moonwell/",
    wallet: "0x9a699642f8d2bb9d03e77d0066cbeaf5c08f9f90",
    expectWell: true,
  },
  // Seamless's walk reached the Pool's first event before 2026-09-13.
  {
    name: "seamless-done",
    explorer: "seamless",
    page: "/base/seamless/",
    wallet: "0x03fa15e1f7789dd6f291296c555799cccfbcad8d",
    expectWell: false,
  },
].filter((f) => !ONLY || ONLY.has(f.name));

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

/** The override map, read off the source file. */
function overrides() {
  const src = readFileSync(new URL("../../lib/shared/fill-eta-overrides.ts", import.meta.url), "utf8");
  // Line-anchored: the file's own comment carries a commented-out example.
  const m = src.match(/^export const FILL_ETA_OVERRIDES[^=]*=\s*(\{[^}]*\})/m);
  if (!m) throw new Error("FILL_ETA_OVERRIDES not found in lib/shared/fill-eta-overrides.ts");
  const map = m[1];
  return Object.fromEntries(
    [...map.matchAll(/"?([a-z0-9-]+)"?\s*:\s*"(\d{4}-\d{2}-\d{2})"/g)].map((m) => [m[1], m[2]]),
  );
}

const longDate = (ms) =>
  new Date(ms).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

/** What the page must show for this payload: null (no well) or { date|null, source }. */
function expected(fill, ov, now = Date.now()) {
  if (!fill?.filling || !(fill.unpricedRowsBelowFrontier > 0)) return null;
  let day = null;
  let source = null;
  if (ov[fill.lane]) {
    day = Date.parse(`${ov[fill.lane]}T00:00:00Z`);
    source = "override";
  } else if (fill.remainingEventBlocks != null && fill.eventBlocksPerDay > 0) {
    const eta = Date.parse(fill.measuredAt) + (fill.remainingEventBlocks / fill.eventBlocksPerDay) * DAY_MS;
    day = Math.floor(eta / DAY_MS) * DAY_MS;
    source = "rate";
  }
  if (day != null && day + DAY_MS <= now) return { day: null, source: "none" };
  return { day, source: source ?? "none" };
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const ov = overrides();
console.log(`overrides in lib/shared/fill-eta-overrides.ts: ${JSON.stringify(ov)}`);

for (const f of FIXTURES) {
  const tl = await api(`/api/chain/${f.explorer}/timeline?wallet=${f.wallet}`);
  const fill = tl?.coverage?.fill;
  check(
    `${f.name}: timeline payload states the lane's walk`,
    fill && fill.lane === f.explorer,
    fill ? JSON.stringify(fill) : "coverage.fill absent",
  );
  if (!fill) continue;
  const want = expected(fill, ov);
  check(
    `${f.name}: the payload is the case this fixture stands for`,
    (want != null) === f.expectWell,
    `filling ${fill.filling}, unpriced below frontier ${fill.unpricedRowsBelowFrontier}, remaining ${fill.remainingEventBlocks}, ${fill.eventBlocksPerDay}/day`,
  );

  const page = await ctx.newPage();
  await page.goto(`${BASE}${f.page}${f.wallet}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // The timeline has mounted when its toolbar's event-type filter is up.
  await page.locator('[aria-label="Types of event"]').first().waitFor({ state: "attached", timeout: 90000 });
  const well = page.locator(`[data-fill-well="${f.explorer}"]`);
  const shown = (await well.count()) > 0;
  check(`${f.name}: well ${want ? "shown" : "absent"}`, shown === (want != null));
  if (want && shown) {
    const text = (await well.innerText()).replace(/\s+/g, " ").trim();
    check(
      `${f.name}: well opens with the stated sentence`,
      text.startsWith("USD values for part of this position’s history are still being filled in."),
      text,
    );
    const source = await well.getAttribute("data-fill-eta-source");
    check(`${f.name}: date source is ${want.source}`, source === want.source, `page says ${source}`);
    if (want.day != null) {
      // The page read the lane state through its own request; a read either
      // side of a UTC midnight can land one day apart, never more.
      const m = text.match(/expected by (\d{1,2} [A-Z][a-z]+ \d{4})\.$/);
      const shownDay = m ? Date.parse(`${m[1]} UTC`) : NaN;
      const within =
        Number.isFinite(shownDay) && Math.abs(shownDay - want.day) <= (want.source === "override" ? 0 : DAY_MS);
      check(`${f.name}: expected by ${longDate(want.day)}`, within, `page: "${m?.[1] ?? "no date"}"`);
    } else {
      check(`${f.name}: no date clause`, /Rails is processing them\.$/.test(text), text);
    }
  }
  await page.close();
}

// ── Coverage copy ──────────────────────────────────────────────────────────
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/coverage/ethereum`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const v4 = page.locator('[aria-label^="Included, except RLUSD"]');
  await v4
    .first()
    .waitFor({ state: "attached", timeout: 30000 })
    .catch(() => undefined);
  check(
    "coverage/ethereum: Aave V4 prices-at-the-block is a tick naming RLUSD and PT-USDe",
    (await v4.count()) > 0 && /PT-USDe/.test((await v4.first().getAttribute("aria-label")) ?? ""),
  );
  await page.close();

  const html = await (await fetch(`${BASE}/coverage/base`)).text();
  check("coverage/base: served", html.length > 10000, `${html.length} bytes`);
  for (const stale of [
    "may still be in progress",
    "sweeps the Pool&#x27;s own logs for it from the Pool&#x27;s first block on every request",
    "sweeps this Pool&#x27;s own logs from its first block on every request",
    "Because the sweep runs live rather than out of an index",
  ]) {
    check(
      `coverage/base: no "${stale.replace(/&#x27;/g, "'")}"`,
      !html.includes(stale) && !html.includes(stale.replace(/&#x27;/g, "'")),
    );
  }
  check(
    "coverage/base: Aave V3 Base note says the history is read from the capture",
    html.includes("reads that one wallet") && html.includes("capture"),
  );
  check("coverage/base: the notes name the well", html.includes("says so above its timeline"));
}

await browser.close();
console.log(failures ? `\n${failures} FAIL` : "\nALL PASS");
process.exit(failures ? 1 : 0);
