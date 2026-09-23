// The Aave-family rate-step market note, on the page.
// ---------------------------------------------------------------------------
// A rate step here says ONE reserve's own rate, on ONE side of it, moved
// between two of a position's own touches. Unlike the Polaris and MakerDAO
// kinds the rate is on NEITHER of the position's rows: both ends are the
// reserve's own ReserveDataUpdated, found by two different as-of rules —
//
//   after A   the last one AT OR BEFORE the earlier touch's own log. The Pool
//             emits it inside that transaction, before the position's own
//             event, so it is the rate that action left in force.
//   before B  the last one STRICTLY BEFORE the later touch's log AND NOT in
//             that touch's own transaction. Without the exclusion a large
//             borrow's own effect on utilisation reads as the market's move.
//
// This file restates that rule from the plan's own words — it does NOT import
// lib/aave-v3/market-notes.ts. A check whose expected value comes from the
// thing under test cannot go red however wrong the thing is. Every expected
// note is recomputed here from the two routes the page itself reads
// (/api/{aave-v3,spark}/timeline and /api/{aave-v3,spark}/reserve-rates),
// fetched independently of the page, and then asserted equal to
// scripts/verify/fixtures/aave-family-rate-step.json — pinned by psql over
// `aave_family_reserve_data` on the onboarding box, 2026-09-06, and never derived from
// this code either.
//
// ⚠️ THE PINS ARE A PAST, AND THESE WALLETS KEEP TRADING. A note whose later
// end is at or before the pin's newest block (`pinnedThrough`) is history: it
// must match the pin field for field, forever. Everything after that block is
// new since the pin — a new stretch ending at a later touch, or a live note
// whose earlier end moved up to a later touch — and is held to the rule
// restated here, over the routes read in this run, not to the pin. Until
// 2026-09-13 every count here was the pin's, and the whale's first trade after
// 2026-09-06 turned fifteen checks red on a working build (95 → 98 stretches,
// its USDe debt repaid, three live notes' earlier ends moved). A new note is
// still never taken from the code under test: its expected value is this
// file's own replay.
//
// Check 1c is the one that proves the RULE rather than the plumbing: it breaks
// the "before B" predicate (reads B's own transaction) and shows the whale's
// count leave 95.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3411 node scripts/verify/verify-aave-family-rate-step.mjs
//       BASE=https://rails-web-onboarding.vercel.app node scripts/verify/verify-aave-family-rate-step.mjs
//
// FLOOR_STUBBED=1 flips check 6's expectation: run it after setting
// AAVE_RATE_STEP_LIVE_FLOOR to 0 in lib/aave-v3/market-notes.ts, and the whale
// must then show 7 head rows instead of 3 — the four reserves nobody borrows
// coming back. Restore the constant afterwards.

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { RECENT_QS } from "./_timeline-window.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const FLOOR_STUBBED = process.env.FLOOR_STUBBED === "1";

/** The shared threshold, in percentage points (lib/shared/market-note.ts's
 *  RATE_STEP_MIN_PP) — restated, not imported. */
const RATE_STEP_MIN_PP = 1;
/** The live floor (lib/aave-v3/market-notes.ts) — restated for the same reason. */
const LIVE_FLOOR = 0.001;

const FIXTURES = JSON.parse(readFileSync(new URL("./fixtures/aave-family-rate-step.json", import.meta.url), "utf8"));

/** The five pages the pins cover, plus the control. `key` is the fixture key. */
const PAGES = [
  {
    key: "aave-v3-core:0xcaab6ff98989fdd4f47e7db6152e6fb47994ec1e",
    proto: "aave-v3",
    wallet: "0xcaab6ff98989fdd4f47e7db6152e6fb47994ec1e",
    market: "core",
    url: "/ethereum/aave-v3/0xcaab6ff98989fdd4f47e7db6152e6fb47994ec1e?market=core",
    pill: 98,
  },
  {
    key: "aave-v3-core:0x763c12108c37e19d3c23d7348daff7af802893fd",
    proto: "aave-v3",
    wallet: "0x763c12108c37e19d3c23d7348daff7af802893fd",
    market: "core",
    url: "/ethereum/aave-v3/0x763c12108c37e19d3c23d7348daff7af802893fd?market=core",
    pill: 23,
  },
  {
    key: "spark:0x4127143a866bf5d8ad2afb6de8e63164b8ad5bf6",
    proto: "spark",
    wallet: "0x4127143a866bf5d8ad2afb6de8e63164b8ad5bf6",
    url: "/ethereum/spark/0x4127143a866bf5d8ad2afb6de8e63164b8ad5bf6",
    pill: 6,
  },
  {
    key: "spark:0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
    proto: "spark",
    wallet: "0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
    url: "/ethereum/spark/0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
    pill: 3,
  },
  {
    key: "spark:0xbdfa66802a80ddaf9e8f9579c3befcbee0c5e1b0",
    proto: "spark",
    wallet: "0xbdfa66802a80ddaf9e8f9579c3befcbee0c5e1b0",
    url: "/ethereum/spark/0xbdfa66802a80ddaf9e8f9579c3befcbee0c5e1b0",
    pill: 1,
  },
];

/** The closed control — the page is asked, never assumed. */
const CONTROL = {
  proto: "aave-v3",
  wallet: "0x69709a1323fd4d0e6acf86a7804174d61792fbfe",
  market: "core",
  url: "/ethereum/aave-v3/0x69709a1323fd4d0e6acf86a7804174d61792fbfe?market=core",
};

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
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

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// ── Formatting, restated from Intl rather than imported ────────────────────
const ratePct = (n) => `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const ppMagnitude = (n) =>
  // 2026-09-10: the unit word is "points" — see lib/shared/market-note.ts's
  // formatDeltaPpMagnitude. The move itself left the header that day (the
  // header states the LATER RATE now) and is stated under the rate card.
  `${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} points`;
const blk = (n) => n.toLocaleString("en-US");

// ── The rule, restated ─────────────────────────────────────────────────────

/** A V3-family event id's tail `:N` segment — the log index. */
const logIndexOf = (id) => {
  const cut = id.lastIndexOf(":");
  return cut < 0 ? -1 : Number(id.slice(cut + 1));
};
/** The 64-hex segment of the id IS the transaction hash — Aave V3 keys
 *  `action:pool:tx:log` and Spark `action:tx:log`, so a positional split would
 *  differ between them. */
const txOf = (id) => (id.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? "").toLowerCase();

const TOUCH = new Set(["supply", "withdraw", "borrow", "repay", "liquidation"]);

/** The position's own touches, each with what it held once the row landed —
 *  a running map over ALL rows in chain order, transfers included. */
function holdings(events) {
  const rows = [...events].sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a.id) - logIndexOf(b.id));
  const held = new Map();
  const at = (r) => {
    const cur = held.get(r) ?? { supply: 0, debt: 0 };
    held.set(r, cur);
    return cur;
  };
  const touches = [];
  for (const e of rows) {
    const d = e.context?.data ?? {};
    if (d.eventType === "liquidation") {
      const coll = (d.collateralAsset ?? "").toLowerCase();
      const debtToken = (e.flows?.[1]?.token ?? "").toLowerCase();
      if (coll && d.supplyAfter != null) at(coll).supply = Number(d.supplyAfter);
      if (debtToken && d.debtAfter != null) at(debtToken).debt = Number(d.debtAfter);
    } else {
      const own = (e.flows?.[0]?.token ?? "").toLowerCase();
      if (own) {
        if (d.supplyAfter != null) at(own).supply = Number(d.supplyAfter);
        if (d.debtAfter != null) at(own).debt = Number(d.debtAfter);
      }
    }
    if (!TOUCH.has(d.eventType)) continue;
    const snapshot = [];
    for (const [reserve, v] of held) {
      if (v.supply > 0) snapshot.push({ reserve, side: "supply", amount: v.supply });
      if (v.debt > 0) snapshot.push({ reserve, side: "borrow", amount: v.debt });
    }
    touches.push({
      block: e.blockNumber,
      log: logIndexOf(e.id),
      tx: txOf(e.id),
      kind: d.eventType,
      held: snapshot,
    });
  }
  return touches;
}

/** Reserves this position borrowed at a STABLE rate — their borrow side is
 *  not noted, because the reserve's log carries the variable rate only. */
function stableReserves(events) {
  const out = new Set();
  for (const e of events) {
    const d = e.context?.data ?? {};
    if (d.eventType === "borrow" && d.interestRateMode === 1) {
      const t = (e.flows?.[0]?.token ?? "").toLowerCase();
      if (t) out.add(t);
    }
  }
  return out;
}

/** The coordinates the page asks about: `after` at every touch the reserve was
 *  held at (the newest included — a live note's earlier end), `before` at
 *  every touch that follows one, in a later block. */
function buildRequests(touches, stable) {
  const byReserve = new Map();
  touches.forEach((t, i) => {
    const next = touches[i + 1];
    for (const h of t.held) {
      if (h.side === "borrow" && stable.has(h.reserve)) continue;
      let e = byReserve.get(h.reserve);
      if (!e) {
        e = { after: new Map(), before: new Map() };
        byReserve.set(h.reserve, e);
      }
      e.after.set(`${t.block}:${t.log}`, [t.block, t.log]);
      if (next && next.block > t.block) e.before.set(`${next.block}:${next.log}`, [next.block, next.log, next.tx]);
    }
  });
  return [...byReserve.entries()].map(([reserve, e]) => ({
    reserve,
    after: [...e.after.values()],
    before: [...e.before.values()],
  }));
}

/** Key the answer back onto the coordinates that asked for it. */
function indexRates(requests, answer) {
  const byReserve = new Map(answer.reserves.map((r) => [r.reserve.toLowerCase(), r]));
  const out = new Map();
  for (const req of requests) {
    const a = byReserve.get(req.reserve.toLowerCase());
    if (!a) continue;
    const after = new Map();
    const before = new Map();
    req.after.forEach((p, i) => a.after[i] && after.set(`${p[0]}:${p[1]}`, a.after[i]));
    req.before.forEach((p, i) => a.before[i] && before.set(`${p[0]}:${p[1]}`, a.before[i]));
    out.set(req.reserve.toLowerCase(), { symbol: a.symbol, after, before });
  }
  return out;
}

const rateOf = (side, p) => (side === "supply" ? p.liquidityRate : p.variableBorrowRate);
const round4 = (n) => Number(n.toFixed(4));

/** The historical notes, in the fixture's own shape. */
function computeNotes(events, rates) {
  const touches = holdings(events);
  const stable = stableReserves(events);
  const out = [];
  for (let i = 0; i < touches.length - 1; i += 1) {
    const a = touches[i];
    const b = touches[i + 1];
    if (b.block <= a.block) continue;
    for (const h of a.held) {
      if (h.side === "borrow" && stable.has(h.reserve)) continue;
      const lookup = rates.get(h.reserve);
      if (!lookup) continue;
      const pa = lookup.after.get(`${a.block}:${a.log}`);
      const pb = lookup.before.get(`${b.block}:${b.log}`);
      if (!pa || !pb) continue;
      const rateA = rateOf(h.side, pa);
      const rateB = rateOf(h.side, pb);
      const deltaPp = (rateB - rateA) * 100;
      if (Math.abs(deltaPp) < RATE_STEP_MIN_PP) continue;
      out.push({
        reserve: lookup.symbol,
        side: h.side,
        from: a.block,
        to: b.block,
        fromKind: a.kind,
        toKind: b.kind,
        fromRate: round4(rateA * 100),
        toRate: round4(rateB * 100),
        deltaPp: round4(deltaPp),
        amt: h.amount,
        fromObs: [pa.block, pa.logIndex],
        toObs: [pb.block, pb.logIndex],
      });
    }
  }
  out.sort((x, y) => x.to - y.to || x.from - y.from);
  return out;
}

/** The live notes, in the fixture's own shape — every held (reserve, side) the
 *  overlay reports, whether or not it clears the floor. */
function computeLive(events, rates, overlay) {
  const touches = holdings(events);
  const stable = stableReserves(events);
  const out = [];
  for (const r of overlay.reserves ?? []) {
    const reserve = r.address.toLowerCase();
    for (const [side, holdsIt, live] of [
      ["supply", BigInt(r.supplyBalanceRaw || "0") > 0n, r.supplyApr],
      ["borrow", BigInt(r.debtBalanceRaw || "0") > 0n, r.borrowApr],
    ]) {
      if (!holdsIt || live == null) continue;
      if (side === "borrow" && stable.has(reserve)) continue;
      let from = null;
      let amount = 0;
      for (let i = touches.length - 1; i >= 0; i -= 1) {
        const h = touches[i].held.find((x) => x.reserve === reserve && x.side === side);
        if (h) {
          from = touches[i];
          amount = h.amount;
          break;
        }
      }
      if (!from) continue;
      const pa = rates.get(reserve)?.after.get(`${from.block}:${from.log}`);
      if (!pa) continue;
      const rateA = rateOf(side, pa);
      out.push({
        reserve: rates.get(reserve).symbol,
        side,
        from: from.block,
        fromKind: from.kind,
        fromRate: round4(rateA * 100),
        liveRate: round4(live * 100),
        amt: amount,
        aboveFloor: Math.max(rateA, live) >= LIVE_FLOOR,
      });
    }
  }
  return out;
}

/** The id the page renders a note under. */
const noteId = (page, n) =>
  `rate-step:${page.proto === "spark" ? "spark" : `aave-v3-${page.market}`}-${n.reserve.toLowerCase()}-${n.side}:${n.from}-${n.to ?? "head"}`;

// ── Loading the two routes exactly as the page does ────────────────────────

async function loadPage(p) {
  const qs =
    p.proto === "aave-v3" ? `wallet=${p.wallet}&market=${p.market}&${RECENT_QS}` : `wallet=${p.wallet}&${RECENT_QS}`;
  const timeline = await api(`/api/${p.proto}/timeline?${qs}`);
  const events = timeline.events ?? [];
  const touches = holdings(events);
  const requests = buildRequests(touches, stableReserves(events));
  const body = p.proto === "aave-v3" ? { market: p.market, requests } : { requests };
  const answer = await post(`/api/${p.proto}/reserve-rates`, body);
  if (answer.status !== 200) throw new Error(`reserve-rates ${answer.status} for ${p.wallet}`);
  const rates = indexRates(requests, answer.json);
  const overlayQs = p.proto === "aave-v3" ? `wallet=${p.wallet}&market=${p.market}` : `wallet=${p.wallet}`;
  const overlay = await api(`/api/chain/${p.proto}/position?${overlayQs}`).catch(() => ({ reserves: [] }));
  return { events, touches, requests, rates, overlay, rows: events.length };
}

// ── The page ───────────────────────────────────────────────────────────────

const SELECTOR = '[data-market-note^="rate-step:"]';

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 180000 })
    .catch(() => {});
  // The notes ride a POST the page issues after the rows land — a 400KB
  // question on the deepest wallet — so poll for the toolbar pill rather than
  // waiting a fixed time. The pill is the page's own signal that the notes
  // computation RAN; without it every count below would be a silent zero, so
  // its absence is reported as a failure rather than read as "no notes".
  for (let i = 0; i < 180; i += 1) {
    if (await page.getByRole("button", { name: /^Market notes/i }).count()) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(600);
  return page;
}

/** Scroll the whole list in — the timeline pages its rows, and a note only
 *  renders beside an anchor that is on screen. */
async function loadEveryRow(page, want) {
  let last = -1;
  for (let i = 0; i < 80; i += 1) {
    const n = await page.locator("[data-event-id]").count();
    if (want != null && n >= want) break;
    await page.mouse.wheel(0, 20000);
    await page.waitForTimeout(400);
    const more = page.getByRole("button", { name: /show more/i });
    if (await more.count())
      await more
        .first()
        .click()
        .catch(() => {});
    if (n === last) {
      await page.waitForTimeout(1200);
      if ((await page.locator("[data-event-id]").count()) === n) break;
    }
    last = n;
  }
  return page.locator("[data-event-id]").count();
}

const noteIdsOn = (page) =>
  page.locator(SELECTOR).evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));

console.log("Aave V3 + SparkLend rate-step market notes — the rule and the page\n");
console.log(`BASE ${BASE}${FLOOR_STUBBED ? "  (FLOOR_STUBBED)" : ""}\n`);

// ── 0. the proxies answer ──────────────────────────────────────────────────

const PIN = {
  reserve: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3",
  afterPoint: [23031177, 4],
  beforePoint: [23038036, 4, "0x2cf555f8b94c6b409fbc4510a5c7ec5b41e1de1dd18b5d9e4667df04c5d4380f"],
  afterObs: [23031177, 2],
  beforeObs: [23038027, 2],
  afterRate: 4.7467,
  beforeRate: 6.4474,
};
{
  const { status, json } = await post("/api/aave-v3/reserve-rates", {
    market: "core",
    requests: [{ reserve: PIN.reserve, after: [PIN.afterPoint], before: [PIN.beforePoint] }],
  });
  const r = json?.reserves?.[0];
  const a = r?.after?.[0];
  const b = r?.before?.[0];
  check(
    "0. the proxy answers the whale's pinned USDe pair at the pinned observations and rates",
    status === 200 &&
      a?.block === PIN.afterObs[0] &&
      a?.logIndex === PIN.afterObs[1] &&
      b?.block === PIN.beforeObs[0] &&
      b?.logIndex === PIN.beforeObs[1] &&
      Math.abs(a.variableBorrowRate * 100 - PIN.afterRate) < 0.0002 &&
      Math.abs(b.variableBorrowRate * 100 - PIN.beforeRate) < 0.0002 &&
      r?.symbol === "USDe",
    `http ${status}; after [${a?.block},${a?.logIndex}] ${a && (a.variableBorrowRate * 100).toFixed(4)}%, before [${b?.block},${b?.logIndex}] ${b && (b.variableBorrowRate * 100).toFixed(4)}%`,
  );
}
{
  const { status } = await post("/api/aave-v3/reserve-rates", {
    market: "not-a-market",
    requests: [{ reserve: PIN.reserve, after: [], before: [] }],
  });
  check("0a. a market the deployment does not have is a 400", status === 400, `http ${status}`);
}
{
  const after = Array.from({ length: 2001 }, (_, i) => [23000000 + i, 0]);
  const { status } = await post("/api/aave-v3/reserve-rates", {
    market: "core",
    requests: [{ reserve: PIN.reserve, after, before: [] }],
  });
  check("0b. more than 2,000 points in one list is a 400", status === 400, `http ${status}`);
}
{
  const { status } = await post("/api/spark/reserve-rates", {
    requests: [{ reserve: "0x6b175474e89094c44da98b954eedeac495271d0f", after: [[19374444, 2]], before: [] }],
  });
  check("0c. the Spark proxy answers on its own single Pool", status === 200, `http ${status}`);
}

// ── 1. the rule, replayed over the routes, against the pins ────────────────

/** The newest block the pin knows about for one wallet — every note ending at or
 *  before it was already history when the pin was taken. */
const pinnedThrough = (want) =>
  Math.max(0, ...want.historical.map((n) => n.to), ...[...want.live, ...want.liveBelowFloor].map((l) => l.from));

const loaded = {};
for (const p of PAGES) {
  const data = await loadPage(p);
  loaded[p.key] = data;
  const want = FIXTURES[p.key];
  const through = pinnedThrough(want);
  const got = computeNotes(data.events, data.rates);
  const since = got.filter((n) => n.to > through);
  const moved = data.touches.some((t) => t.block > through);
  check(
    `1. ${p.wallet.slice(0, 10)}… — the rule over the routes yields the ${want.historical.length} pinned historical note(s) up to block ${blk(through)}`,
    got.length - since.length === want.historical.length,
    `got ${got.length - since.length}, and ${since.length} ending after it`,
  );
  // Field-for-field against the pins, for the part of the history they cover.
  const key = (n) => `${n.reserve}|${n.side}|${n.from}|${n.to}`;
  const byKey = new Map(got.filter((n) => n.to <= through).map((n) => [key(n), n]));
  const diffs = [];
  for (const w of want.historical) {
    const n = byKey.get(key(w));
    if (!n) {
      diffs.push(`missing ${key(w)}`);
      continue;
    }
    byKey.delete(key(w));
    for (const f of ["fromKind", "toKind"]) if (n[f] !== w[f]) diffs.push(`${key(w)} ${f} ${n[f]}≠${w[f]}`);
    for (const f of ["fromRate", "toRate", "deltaPp"]) {
      if (Math.abs(n[f] - w[f]) > 0.0002) diffs.push(`${key(w)} ${f} ${n[f]}≠${w[f]}`);
    }
    if (Math.abs(n.amt - w.amt) > Math.max(1e-9, Math.abs(w.amt) * 1e-12)) {
      diffs.push(`${key(w)} amt ${n.amt}≠${w.amt}`);
    }
    if (String(n.fromObs) !== String(w.fromObs) || String(n.toObs) !== String(w.toObs)) {
      diffs.push(`${key(w)} obs [${n.fromObs}]/[${n.toObs}] ≠ [${w.fromObs}]/[${w.toObs}]`);
    }
  }
  for (const extra of byKey.keys()) diffs.push(`extra ${extra}`);
  check(
    `1a. ${p.wallet.slice(0, 10)}… — every note matches the pin (rates, amount, both observations, both kinds)`,
    diffs.length === 0,
    diffs.slice(0, 4).join(" | "),
  );

  const live = computeLive(data.events, data.rates, data.overlay);
  const above = live.filter((l) => l.aboveFloor);
  const below = live.filter((l) => !l.aboveFloor);
  const sides = (ls) => ls.map((l) => `${l.reserve}/${l.side}`).join(", ");
  // Nothing traded since the pin: the live notes are the pin's, exactly. Once
  // it has, a side can close, open or re-anchor, and only the unmoved ones are
  // still the pin's to state — 1b2 holds those.
  check(
    moved
      ? `1b. ${p.wallet.slice(0, 10)}… — traded since block ${blk(through)}: ${above.length} live note(s) clear the floor, ${below.length} do not`
      : `1b. ${p.wallet.slice(0, 10)}… — ${want.live.length} live note(s) clear the floor, ${want.liveBelowFloor.length} do not`,
    moved || (above.length === want.live.length && below.length === want.liveBelowFloor.length),
    `above ${above.length} (${sides(above)}), below ${below.length} (${sides(below)})`,
  );
  // Every live side, against the pin where the pin still speaks for it:
  //   same earlier end  → the pin's touch type, rate and side of the floor;
  //   a later end       → the wallet touched that side since; the rule decides;
  //   an earlier end    → impossible, a touch cannot un-happen;
  //   not in the pin    → opened since, so its earlier end is past the pin;
  //   pinned, now gone  → closed since, so the wallet has touched past the pin.
  const liveDiffs = [];
  const pinnedSides = [
    ...want.live.map((w) => ({ ...w, aboveFloor: true })),
    ...want.liveBelowFloor.map((w) => ({ ...w, aboveFloor: false })),
  ];
  const reanchored = [];
  for (const n of live) {
    const w = pinnedSides.find((x) => x.reserve === n.reserve && x.side === n.side);
    const tag = `${n.reserve}/${n.side}`;
    if (!w) {
      if (n.from <= through) liveDiffs.push(`${tag} not pinned, yet its earlier end ${n.from} predates the pin`);
      continue;
    }
    if (n.from < w.from) liveDiffs.push(`${tag} from ${n.from} is before the pinned ${w.from}`);
    if (n.from > w.from) {
      reanchored.push(`${tag} ${w.from}→${n.from}`);
      continue;
    }
    if (n.fromKind !== w.fromKind) liveDiffs.push(`${tag} kind ${n.fromKind}≠${w.fromKind}`);
    if (Math.abs(n.fromRate - w.fromRate) > 0.0002) liveDiffs.push(`${tag} fromRate ${n.fromRate}≠${w.fromRate}`);
    if (n.aboveFloor !== w.aboveFloor) liveDiffs.push(`${tag} ${n.aboveFloor ? "clears" : "misses"} the floor`);
  }
  const closed = pinnedSides.filter((w) => !live.some((n) => n.reserve === w.reserve && n.side === w.side));
  if (closed.length > 0 && !moved) liveDiffs.push(`${sides(closed)} gone with no touch since the pin`);
  check(
    `1b2. ${p.wallet.slice(0, 10)}… — each live note's earlier end matches the pin where it has not moved (block, touch type, rate, floor)`,
    liveDiffs.length === 0,
    liveDiffs.length
      ? liveDiffs.slice(0, 4).join(" | ")
      : [
          reanchored.length && `re-anchored since: ${reanchored.join(", ")}`,
          closed.length && `closed since: ${sides(closed)}`,
        ]
          .filter(Boolean)
          .join(" · "),
  );
  data.expected = { historical: got, since, above, below, through };
}

// 1c. BREAK the rule: read B's OWN transaction for the later end, and show the
// whale's count leave the pin. This is the check that the rule in the plan is
// what the pins say it is.
{
  const whale = PAGES[0];
  const data = loaded[whale.key];
  const bogus = data.requests.map((r) => ({
    reserve: r.reserve,
    after: r.after,
    // The same coordinates with the transaction-exclusion neutralised: a hash
    // no ReserveDataUpdated can carry, so the `tx_hash <> q.tx` predicate never
    // bites and the answer is whatever the touch's own transaction emitted.
    before: r.before.map((p) => [p[0], p[1], "0x" + "0".repeat(64)]),
  }));
  const answer = await post("/api/aave-v3/reserve-rates", { market: whale.market, requests: bogus });
  const bogusRates = indexRates(bogus, answer.json);
  const bogusNotes = computeNotes(data.events, bogusRates);
  // The rule's own count in this run — the pin's 95 plus whatever the whale
  // has traded into since (check 1 holds the 95).
  const pinned = data.expected.historical.length;
  check(
    `1c. reading B's OWN transaction for the later end leaves the pin (${bogusNotes.length} ≠ ${pinned})`,
    answer.status === 200 && bogusNotes.length !== pinned && bogusNotes.length > pinned,
    `broken rule yields ${bogusNotes.length}, the rule yields ${pinned} — ${bogusNotes.length - pinned} of the extra stretches are the account's own doing`,
  );
}

// ── the browser ────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1600 },
  permissions: ["clipboard-read", "clipboard-write"],
});

// ── 2–4. each fixture page ─────────────────────────────────────────────────

const pages = {};
for (const p of PAGES) {
  const want = FIXTURES[p.key];
  const data = loaded[p.key];
  // The counts are this run's replay (check 1 tied its past to the pin), not
  // the pin's: a note added by a trade since is on the page, and must be.
  const exp = data.expected;
  const page = await open(context, p.url);
  await loadEveryRow(page, data.rows);
  const ids = await noteIdsOn(page);
  const head = ids.filter((i) => i.endsWith("-head"));
  const historical = ids.filter((i) => !i.endsWith("-head"));
  const stubbedWhale = FLOOR_STUBBED && p === PAGES[0];
  const wantHead = stubbedWhale ? exp.above.length + exp.below.length : exp.above.length;

  check(
    `2. ${p.wallet.slice(0, 10)}… shows ${exp.historical.length} historical + ${wantHead} head row(s)${exp.since.length ? ` (${exp.since.length} of them since the pin)` : ""}`,
    historical.length === exp.historical.length && head.length === wantHead,
    `${historical.length} historical, ${head.length} head`,
  );
  check(
    `2a. ${p.wallet.slice(0, 10)}… — every pinned id is on the page`,
    want.historical.every((n) => historical.includes(noteId(p, n))),
    want.historical
      .filter((n) => !historical.includes(noteId(p, n)))
      .slice(0, 3)
      .map((n) => noteId(p, n))
      .join(", "),
  );
  if (!FLOOR_STUBBED) {
    check(
      `2b. ${p.wallet.slice(0, 10)}… — the ${exp.below.length} below-floor pair(s) have NO head row`,
      exp.below.every((l) => !head.includes(noteId(p, { ...l, to: null }))),
      exp.below.map((l) => `${l.reserve}/${l.side}`).join(", ") || "(none)",
    );
  }
  // `p.pill` is the count at the pin, kept as the record; the page is held to
  // the replay's.
  const pillWanted = exp.historical.length + wantHead;
  const pill = page.getByRole("button", { name: /^Market notes/i }).first();
  const hasPill = (await pill.count()) > 0;
  check(
    `2c0. ${p.wallet.slice(0, 10)}… — the toolbar pill is on the page (the notes computation ran at all)`,
    hasPill,
    hasPill ? "" : "no pill after 180s — the reserve-rates fetch never landed, so every count above is a silent zero",
  );
  const pillText = hasPill ? (await pill.textContent())?.trim() : null;
  check(
    `2c. ${p.wallet.slice(0, 10)}… — the pill reads "Market notes · ${pillWanted}"`,
    pillText === `Market notes · ${pillWanted}`,
    pillText ?? "(no pill)",
  );
  // Each head row's earlier rate is a past log — the pin's where that end has
  // not moved (1b2), the replay's where a later touch re-anchored it. Its LATER
  // end is the Pool's live read, so it is asserted against the overlay RE-READ
  // IN THIS RUN (within 0.05 pp) and its block against the overlay's own
  // (within 200), never against the pin's snapshot of a moving value.
  const headDiffs = [];
  for (const w of exp.above) {
    const id = noteId(p, { ...w, to: null });
    const row = page.locator(`[data-market-note="${id}"]`);
    if (!(await row.count())) {
      headDiffs.push(`no row ${id}`);
      continue;
    }
    await row.scrollIntoViewIfNeeded();
    const expander = row.getByRole("button", { expanded: false }).first();
    if (await expander.count()) await expander.click();
    await page.waitForTimeout(250);
    const text = (await row.textContent()).replace(/\s+/g, " ");
    if (!text.includes(ratePct(w.fromRate / 100)))
      headDiffs.push(`${id} lacks the pinned ${ratePct(w.fromRate / 100)}`);
    const r = (data.overlay.reserves ?? []).find((x) => x.symbol === w.reserve);
    const liveNow = r ? (w.side === "supply" ? r.supplyApr : r.borrowApr) * 100 : null;
    const shown = [...text.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})%/g)].map((m) => Number(m[1].replace(/,/g, "")));
    if (liveNow == null || !shown.some((v) => Math.abs(v - liveNow) <= 0.05)) {
      headDiffs.push(`${id} shows ${shown.join("/")}, overlay re-read says ${liveNow?.toFixed(4)}`);
    }
    const blocks = [...text.matchAll(/(\d{1,3}(?:,\d{3})+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
    if (!blocks.some((b) => Math.abs(b - (data.overlay.blockNumber ?? 0)) <= 200)) {
      headDiffs.push(`${id} names no block within 200 of the overlay's ${data.overlay.blockNumber}`);
    }
    if (!/Elapsed/.test(text)) headDiffs.push(`${id} has no Elapsed cell`);
    if (await row.getByRole("button", { expanded: true }).count()) {
      await row
        .getByRole("button", { expanded: true })
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(150);
    }
  }
  check(
    `2d. ${p.wallet.slice(0, 10)}… — each head row states its earlier rate, and its later end matches the overlay re-read in this run (rate within 0.05 pp, block within 200) with an Elapsed cell`,
    headDiffs.length === 0,
    headDiffs.slice(0, 3).join(" | "),
  );
  pages[p.key] = page;
}

// The whale's own row, opened: the two rates, no interest pair, the
// derivation's own block and the words that name the exclusion.
{
  const whale = PAGES[0];
  const page = pages[whale.key];
  const id = "rate-step:aave-v3-core-usde-borrow:23031177-23038036";
  const row = page.locator(`[data-market-note="${id}"]`);
  check("3. the whale's first pinned USDe stretch is on the page", (await row.count()) === 1, id);
  if (await row.count()) {
    await row.scrollIntoViewIfNeeded();
    await row.getByRole("button", { expanded: false }).first().click();
    await page.waitForTimeout(300);
    const disclosure = row.getByRole("button", { name: /how this note was derived/i });
    if (await disclosure.count()) await disclosure.click();
    await page.waitForTimeout(300);
    const text = (await row.textContent()).replace(/\s+/g, " ");
    check(
      "3a. it states 4.75% → 6.45% and both blocks",
      text.includes("4.75%") && text.includes("6.45%") && text.includes(blk(23031177)) && text.includes(blk(23038036)),
      text.slice(0, 160),
    );
    // No interest pair on an Aave V3 note: the holding it was read against is
    // the row's replayed principal, which leaves out interest, so the note
    // states the rates only (rails-ops TO-DO-ui-jobs §19). It read 109,174 →
    // 148,290 USDe on 2,300,000 USDe before.
    const nums = [...text.matchAll(/(\d{1,3}(?:,\d{3})*)\s*USDe/g)].map((m) => Number(m[1].replace(/,/g, "")));
    check(
      "3b. the row states no interest stat and no USDe holding",
      !/yearly interest/i.test(text) && nums.length === 0,
      `USDe figures on the row: ${nums.join(", ") || "none"}`,
    );
    check(
      '3c. the derivation names block 23,038,027 and the words "before the position\'s own transaction"',
      text.includes(blk(23038027)) && text.includes("before the position's own transaction"),
      text.includes(blk(23038027)) ? "block present" : "block missing",
    );
    check('3d. the header word is "borrow rate"', text.includes("borrow rate"), text.slice(0, 80));
    check(
      "3e. the header states the later rate (6.45%) and the opened card the move — the pinned 1.70 points",
      text.includes("6.45%") && text.includes(ppMagnitude(1.7007)),
      ppMagnitude(1.7007),
    );
  }
}

// 4. a SUPPLY-side row on 0x763c… — the header word has to say "supply", not
//    "debt", and no interest stat is stated (see 3b).
{
  const p = PAGES[1];
  const page = pages[p.key];
  const want = FIXTURES[p.key].historical.find((n) => n.side === "supply");
  const id = noteId(p, want);
  const row = page.locator(`[data-market-note="${id}"]`);
  check(`4. 0x763c… carries a SUPPLY-side row (${want.reserve})`, (await row.count()) === 1, id);
  if (await row.count()) {
    await row.scrollIntoViewIfNeeded();
    await row.getByRole("button", { expanded: false }).first().click();
    await page.waitForTimeout(300);
    const text = (await row.textContent()).replace(/\s+/g, " ");
    check(
      '4a. its header word is "supply rate" and it states no interest on the supply',
      text.includes("supply rate") && !/interest on the supply recorded at block/i.test(text),
      text.slice(0, 200),
    );
  }
}

// 4b. the flat live note — 0xbdfa…'s USDS borrow, Δ 0.00, which MUST render.
// Since 2026-09-10 a flat move is invisible in the HEADER (which states the
// later rate, and on a flat note that is the same rate the earlier end had),
// so the row is opened and the move read where it now lives: under the rate
// card, as "+0.00 points".
{
  const p = PAGES[4];
  const page = pages[p.key];
  const ids = await noteIdsOn(page);
  const head = ids.filter((i) => i.endsWith("-head"));
  const row = page.locator(`[data-market-note="${head[0]}"]`);
  if (head.length === 1) {
    await row.scrollIntoViewIfNeeded();
    await row
      .getByRole("button", { expanded: false })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(300);
  }
  const text = head.length ? (await row.textContent()).replace(/\s+/g, " ") : "";
  check(
    "4b. 0xbdfa… renders its live note even at Δ 0.00 points (nothing having moved is the fact)",
    head.length === 1 && /0\.00 points/.test(text),
    head.length ? text.slice(0, 160) : "no head row",
  );
}

// ── 5. the control ─────────────────────────────────────────────────────────
{
  const page = await open(context, CONTROL.url);
  await loadEveryRow(page);
  const ids = await noteIdsOn(page);
  const head = ids.filter((i) => i.endsWith("-head"));
  check(
    "5. the closed control has NO head row (a closed account holds nothing to read a live rate against)",
    head.length === 0,
    `${ids.length} note(s), ${head.length} head`,
  );
  await page.close();
}

// ── 6. the floor ───────────────────────────────────────────────────────────
{
  const whale = PAGES[0];
  const data = loaded[whale.key];
  const live = computeLive(data.events, data.rates, data.overlay);
  const want = FIXTURES[whale.key];
  // The four pinned below-floor sides are reserves nobody borrows, and their
  // rate sits under the floor for as long as the whale still holds them. A side
  // it has since closed is no longer the floor's to withhold.
  const stillHeld = want.liveBelowFloor.filter((w) => live.some((l) => l.reserve === w.reserve && l.side === w.side));
  check(
    `6. the floor is what withholds the pinned below-floor sides still held: ${stillHeld.length} of ${want.liveBelowFloor.length} held, ${live.filter((l) => l.aboveFloor).length} of ${live.length} sides above the floor`,
    stillHeld.length > 0 &&
      stillHeld.every((w) => live.find((l) => l.reserve === w.reserve && l.side === w.side).aboveFloor === false),
    live.map((l) => `${l.reserve}/${l.side}${l.aboveFloor ? "" : " (below)"}`).join(", "),
  );
  if (FLOOR_STUBBED) {
    const ids = await noteIdsOn(pages[whale.key]);
    check(
      `6a. with AAVE_RATE_STEP_LIVE_FLOOR stubbed to 0 the whale shows all ${live.length} held sides as head rows`,
      ids.filter((i) => i.endsWith("-head")).length === live.length,
      `${ids.filter((i) => i.endsWith("-head")).length} head`,
    );
  } else {
    console.log("SKIP  6a. the stubbed-floor page check — re-run with the constant set to 0 and FLOOR_STUBBED=1");
  }
}

// ── 7. the pill, the eye menu, and the counts ──────────────────────────────
{
  const whale = PAGES[0];
  const page = pages[whale.key];
  const rowsBefore = await page.locator("[data-event-id]").count();
  const countBefore = (
    await page
      .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
      .first()
      .textContent()
  )?.trim();
  const togglePill = page.getByRole("button", { name: /^Market notes/i }).first();
  const pressedBefore = await togglePill.getAttribute("aria-pressed");
  await togglePill.click();
  await page.waitForTimeout(400);
  const pressedAfter = await togglePill.getAttribute("aria-pressed");
  const notesAfter = await page.locator("[data-market-note]").count();
  const rowsAfter = await page.locator("[data-event-id]").count();
  const countAfter = (
    await page
      .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
      .first()
      .textContent()
  )?.trim();
  check(
    "7. pressing the pill hides every note row and flips aria-pressed",
    pressedBefore === "true" && pressedAfter === "false" && notesAfter === 0,
    `aria-pressed ${pressedBefore} → ${pressedAfter}, ${notesAfter} note(s) left`,
  );
  check(
    "7a. every count on the page is identical with notes on and off (a note is never counted)",
    rowsBefore === rowsAfter && countBefore === countAfter,
    `${rowsBefore}/${countBefore} → ${rowsAfter}/${countAfter}`,
  );
  await togglePill.click();
  await page.waitForTimeout(400);

  const countSpan = page.getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/).first();
  const row = countSpan.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " gap-2 ") and contains(concat(" ", normalize-space(@class), " "), " items-center ")][1]',
  );
  const eye = row.locator("div.relative.inline-flex.items-center > button").last();
  await eye.click().catch(() => {});
  await page.waitForTimeout(400);
  const eyeItem = await page.getByRole("button", { name: /^Market notes$/i }).count();
  check('7b. the eye menu has no "Market notes" item', eyeItem === 0, `${eyeItem} found`);
  await page.keyboard.press("Escape").catch(() => {});
}

// ── 8. the markdown export ─────────────────────────────────────────────────
{
  const whale = PAGES[0];
  const page = pages[whale.key];
  const data = loaded[whale.key];
  const exp = data.expected;
  const total = exp.historical.length + exp.above.length;
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(700);
  const md = await page.evaluate(() => navigator.clipboard.readText());
  const tableRows = (md.match(/^\| \d+ \| /gm) ?? []).length;
  // The Aave V3 and Spark snapshots bound their transcript to the most recent
  // MARKDOWN_EVENT_ROWS (50, lib/shared/markdown-history.ts) and the heading
  // says what it left out — a cap that predates market notes entirely, and the
  // reason this is not the route's own row count the way it is on Polaris,
  // whose export lists every row. What a note must not do is MOVE it.
  const MARKDOWN_EVENT_ROWS = 50;
  const wantRows = Math.min(data.rows, MARKDOWN_EVENT_ROWS);
  check(
    `8. the export states "Market notes: ${total}" and adds no row to the event table`,
    new RegExp(`\\*\\*Market notes:\\*\\*\\s*${total}\\b`).test(md) && tableRows === wantRows,
    `table rows ${tableRows}, the snapshot's own cap is ${wantRows} of ${data.rows}; ${md.match(/\*\*Market notes:\*\*[^\n]*/)?.[0] ?? "no line"}`,
  );
  const receipts = (md.match(/^- Receipt: rate after the position's own action/gm) ?? []).length;
  check(
    `8a. the Market notes section lists all ${total} with a receipt each`,
    md.includes("## Market notes") && receipts === total,
    `${receipts} receipt line(s)`,
  );
  check(
    "8b. the section's receipts name both as-of rules in words",
    md.includes("read before the position's own transaction") &&
      md.includes("the Pool's getReserveData, read live at block"),
    "",
  );
  // One annotation per note whose ANCHOR is inside the exported slice. The
  // anchor rule is the shared one, restated: the first displayed event in
  // ascending order at or past the note's `to` block.
  const asc = [...data.events].sort((a, b) => a.blockNumber - b.blockNumber || logIndexOf(a.id) - logIndexOf(b.id));
  const slice = new Set(asc.slice(-MARKDOWN_EVENT_ROWS).map((e) => e.id));
  const wantAnnotations = exp.historical.filter((n) => {
    const anchor = asc.find((e) => e.blockNumber >= n.to);
    return anchor != null && slice.has(anchor.id);
  }).length;
  // 2026-09-10: an annotation leads with the LATER RATE ("… was 6.45% per year
  // by block 23,038,036, +1.70 points"), not with the move.
  const annotations = (md.match(/market note: the \w+ (?:borrow|supply) rate was /g) ?? []).length;
  check(
    `8c. the timeline table annotates every note anchored inside the exported slice (${wantAnnotations} of ${exp.historical.length})`,
    annotations === wantAnnotations,
    `${annotations} annotation(s)`,
  );
}

for (const p of PAGES) await pages[p.key].close();
await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Aave-family rate-step note holds`,
);
process.exit(failures ? 1 : 0);
