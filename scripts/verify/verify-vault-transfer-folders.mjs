#!/usr/bin/env node
// The transfer folder — a vault position whose whole life is share transfers
// collapses the same way a stretch of deposits does.
// ----------------------------------------------------------------------------
// Subject: `lib/aave-vaults/timeline-runs.tsx` — `RUN_KINDS` now covers
// `transfer-in` and `transfer-out`, and `sameRun` (which compares the row's own
// `kind`) keeps the two directions in separate folders. Before this, the vault
// layer's PLUMBING — a stake token holding its own stata backing, a router, a
// treasury Safe — drew its whole window as individual cards, because a plumbing
// position has neither a deposit nor a withdrawal in its life and no run spec
// matched the one kind it does have.
//
// ── WHERE THE EXPECTATIONS COME FROM ───────────────────────────────────────
// The rows are the page's OWN chain read, fetched from the same route the page
// renders (`/api/chain/aave-vaults/vault`), and this script groups them by its
// own statement of the collapse rule (`ownRuns` below) before comparing with the
// DOM. Nothing is expected from a list committed in this repo, and nothing is
// read out of the module under test. A folder's Σ is checked against the sum of
// ITS OWN MEMBERS' deltas — and the members are identified by EXPANDING the
// folder and taking the event ids that appear, not by re-running the grouping:
// that is what makes R2 a check on the folder's arithmetic rather than a second
// run of the same code.
//
// ── THE REDUCTION IS MEASURED, NOT ASSUMED ─────────────────────────────────
// The plan (§7b, R1) expected "an order of magnitude". It is 2.2× on F3:
// 1,000 drawn rows → 446. The reason is the direction split, which is
// deliberate — F3's plumbing alternates inbound and outbound (698 in, 302 out,
// longest same-direction stretch 23), so its runs are short. A folder that
// netted the two directions would collapse further and state a Σ no member row
// says, which §7b forbids. So R1 asserts what is true and prints the ratio: the
// page's own grouped row count EQUALS this script's grouping, folders are drawn,
// and the row count is materially below the event count. A future fixture with
// long one-way stretches (F1's is 310) will show a bigger ratio; the gate is the
// equality, not the ratio.
//
// ── FIXTURES (plan §1), AS INPUTS ──────────────────────────────────────────
//   F3  waEthUSDC `0xd4fa…d23e` / `0x6bf1…8aa6` (stkwaEthUSDC.v1) — 9,035
//       events, of which the newest 1,000 are drawn; EVERY row a plain share
//       transfer. The page that started this thread.
//   F4  stkwaEthUSDT.v1 `0xa484…2d31` / `0x674c…7f04` — an EOA, 9 rows, no
//       stretch of three: the floor still holds and no folder is drawn.
// A fixture that has changed shape is a FAILURE, not a skip: R0 and R4a assert
// the shapes every check below them rests on.
//
// Run:
//   BASE=http://localhost:3762 node scripts/verify/verify-vault-transfer-folders.mjs
//
// ── PROVED IT CAN FAIL, 2026-09-10, BASE=http://localhost:3762 ─────────────
// Restored run: 10/10. Each break applied alone to lib/aave-vaults/timeline-runs.tsx
// and reverted. The lines below are the run's own output, quoted.
//
//  (a) THE TRANSFER KINDS TAKEN BACK OUT of `RUN_KINDS` — exactly the state
//      before this change. 4/7 · 3 SKIP.
//      FAIL R1a — "page says 1,000 rows, own grouping gives 446"
//      FAIL R1b — "0 folders drawn, 1,000 rows for 1,000 events (1.00×)"
//      FAIL R1c — "first 100 window rows disagree at index 3: own
//                  {"kind":"run","count":6}, page {"kind":"event","id":"0x0db9…"}"
//      🔑 R2, R3 and R3b SKIP OUT LOUD rather than passing: with no folder drawn
//      there is nothing to expand, and a green there would have been the
//      emptiest kind of green. Three skips in the tally is the tell.
//
//  (b) THE DIRECTION PREDICATE DROPPED — `sameRun` deleted from the spec, so a
//      run joins any two neighbouring run-kind rows. 7/10.
//      FAIL R1a — "page says 10 rows, own grouping gives 446"
//      FAIL R1c — "disagree at index 0: own {"kind":"event",…}, page
//                  {"kind":"run","count":100,"member":"transfer"}"
//      FAIL R3  — "10 of 10 folders mix inbound and outbound transfers (e.g.
//                  100 members: transfer-out, transfer-in)"
//      🔑 R2 stayed GREEN on this break, and that is right: a mixed folder's Σ
//      is still the absolute sum of ITS OWN members, so no Σ check can see the
//      netting. R3's whole subject is which rows may share a folder — which is
//      why it exists as its own check and not as a clause of R2.
//      🔑 R1b also stayed green ("100.00×"), which is the reason R1b is not the
//      gate: collapsing everything into ten folders scores best on density and
//      is the wrong answer.
//
//  (c) THE Σ OVER THE WRONG MEMBERS — `scaledAbsSum` fed `members.slice(1)`,
//      i.e. a Σ that silently drops the folder's first row. 9/10.
//      FAIL R2 — "folder 1 (4 transfer-in, claims 4): states 26K, own
//                 27,588.137062 (band ±500) · folder 2 (4 transfer-out, claims
//                 4): states 15K, own 16,260.205783 (band ±500) · folder 3 (4
//                 transfer-in, claims 4): states 962.76, own 1,356.201183 (band
//                 ±0.005)"
//      🔑 The band is what makes this readable: at 962.76 the allowed slack is
//      half a hundredth, and the break is 393 off it.
//
//  (d) THE FLOOR DROPPED — `min: 1` on the spec, which is what "every row is
//      its own folder" looks like. 7/10.
//      FAIL R1a — "page says 365 rows, own grouping gives 446"
//      FAIL R1c — "disagree at index 0: … page {"kind":"run","count":1,
//                  "member":"transfer"}"
//      FAIL R4b — "F4's 9-row life draws 3 folder(s) and 5 cards; its longest
//                  same-kind stretch is 2 and the floor is 3"
//      🔑 R1b stayed green again, and more sharply: 2.74× — BETTER density than
//      the shipped build's 2.24×, from a change that hides single events behind
//      a click. R4b is the check that names the rule.
//
// ⚠️ A FAULT THIS SCRIPT'S FIRST BUILD HAD, kept here because the fix is load-
// bearing: members were attributed by SET DIFFERENCE over the painted ids, and
// folder 20 came back with 76 members against a folder claiming 3. Clicking near
// the foot of the list brings the window's sentinel into view and the page grows
// itself by another 100 rows — all new ids. Attribution is by INSERTION
// POSITION now (see R2/R3 below), which is the only reading that distinguishes
// "this folder's members appeared" from "the list got longer".
//
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3762";

/** F3 — the page Miles was reading: a $58M position whose whole life is share
 *  transfers, because it is the Umbrella stake token's own stata backing. */
const F3 = {
  vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
  holder: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
};
/** F4 — the retail-shaped end of the same machine: an EOA, a handful of rows. */
const F4 = {
  vault: "0xa484ab92fe32b143aee7019fc1502b1daa522d31",
  holder: "0x674ce5965471f867f9649bbe69802b24ffed7f04",
};

/** `MIN_VAULT_RUN` in lib/aave-vaults/timeline-runs.tsx and `WINDOW_CHUNK` in
 *  components/shared/chain-truth-timeline.tsx, restated here on purpose: a check
 *  that read them off the source could not catch a change to either. */
const MIN_RUN = 3;
// Mirrors TIMELINE_PAGE_ROWS in lib/shared/timeline-opening-balance.ts — move it with it.
const WINDOW_CHUNK = 50;
/** The kinds a folder may stand for, and the rule it groups them by — THIS
 *  SCRIPT's own statement of it, over the route's own rows. */
const RUN_KINDS = new Set(["deposit", "withdrawal", "transfer-in", "transfer-out"]);
/** `CHUNK_TARGET` in lib/shared/timeline-chunks.ts — a run longer than this
 *  splits into chronological folders, and a remnant shorter than the run floor
 *  joins the folder before it. */
const CHUNK_TARGET = 100;

function ownRuns(events) {
  const out = [];
  let i = 0;
  while (i < events.length) {
    if (!RUN_KINDS.has(events[i].kind)) {
      out.push({ kind: "event", events: [events[i]] });
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < events.length && events[j].kind === events[i].kind) j += 1;
    if (j - i >= MIN_RUN) {
      // The run's own folders. A transaction never splits across two folders;
      // these fixtures carry at most one of a holder's own logs per
      // transaction, so splitting on the count alone is the same answer here —
      // and R1a, which compares the page's total against this, would go red if
      // it ever stopped being.
      const run = events.slice(i, j);
      for (let k = 0; k < run.length; ) {
        const left = run.length - k;
        const take = left <= CHUNK_TARGET + MIN_RUN - 1 ? left : CHUNK_TARGET;
        out.push({ kind: "run", events: run.slice(k, k + take) });
        k += take;
      }
    } else for (let k = i; k < j; k++) out.push({ kind: "event", events: [events[k]] });
    i = j;
  }
  return out;
}

let passes = 0;
let failures = 0;
let skipped = 0;
const check = (name, cond, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const skip = (name, why) => {
  skipped++;
  console.log(`SKIP ${name} — ${why}`);
};

const routeUrl = (f) => `${BASE}/api/chain/aave-vaults/vault?vault=${f.vault}&holder=${f.holder}`;
const pageUrl = (f) => `${BASE}/ethereum/aave/vaults/${f.vault}/${f.holder}`;

/** The compact form a folder's Σ is drawn in (`fmtHeaderMagnitude` → `fmtSpine`:
 *  "4.8K", "28K", "1.2M"), parsed back WITH the band its own last digit allows.
 *  The band is derived from the string this script read, not from the
 *  formatter's rules — so a Σ over the wrong members lands outside it while
 *  honest rounding never does. */
function parseCompact(text) {
  const m = /^([\d,]+(?:\.\d+)?)(K|M)?$/.exec(text.trim());
  if (!m) return null;
  const mult = m[2] === "M" ? 1e6 : m[2] === "K" ? 1e3 : 1;
  const mantissa = m[1].replace(/,/g, "");
  const decimals = mantissa.includes(".") ? mantissa.split(".")[1].length : 0;
  // ⚠️ "28K" is `Math.round(k)` and "1.2M"/"4.8K" are `toFixed(1)`, so the
  // half-unit of the LAST SHOWN DIGIT is the whole band. A thousands figure
  // below 10K carries a tenth of a K; at or above it, a whole K.
  const band = (Math.pow(10, -decimals) * mult) / 2;
  return { value: Number(mantissa) * mult, band };
}

const browser = await chromium.launch();
console.log(`\n── the transfer folder · ${BASE} ──\n`);

// ── the route's own rows ────────────────────────────────────────────────────
const f3Route = await fetch(routeUrl(F3));
const f3Json = f3Route.status === 200 ? await f3Route.json() : null;
const f3Events = f3Json?.timeline?.events ?? [];
const f3Own = ownRuns(f3Events);
const f3OwnFolders = f3Own.filter((r) => r.kind === "run");
const f3Kinds = {};
for (const e of f3Events) f3Kinds[e.kind] = (f3Kinds[e.kind] ?? 0) + 1;

check(
  "R0a F3's drawn life is share transfers and nothing else — the shape that had no spec",
  f3Events.length > 100 && f3Events.every((e) => e.kind === "transfer-in" || e.kind === "transfer-out"),
  `${f3Events.length} rows: ${JSON.stringify(f3Kinds)}`,
);
check(
  "R0b and it still has stretches of three to collapse — a fixture that flattened makes R1–R3 vacuous",
  f3OwnFolders.length >= 10,
  `own grouping: ${f3Own.length} rows, ${f3OwnFolders.length} folders, longest ${Math.max(
    0,
    ...f3OwnFolders.map((r) => r.events.length),
  )}`,
);

// ── the page ────────────────────────────────────────────────────────────────
const f3Page = await browser.newPage();
await f3Page.goto(pageUrl(F3), { waitUntil: "networkidle", timeout: 180_000 });
await f3Page.waitForSelector("[data-vault-timeline-rows]", { timeout: 60_000 });
const FOLDER = "[data-vault-timeline-rows] [aria-label*='consecutive']";
const EVENT = "[data-vault-timeline-rows] [data-event-id]";

const f3Dom = await f3Page.evaluate(
  ({ folderSel, eventSel }) => {
    const showing = /Showing ([\d,]+) of ([\d,]+) rows/.exec(document.body.innerText);
    // The "Showing X of Y rows" line is drawn only while the window has more to
    // reveal. Where it does not, the painted rows ARE all the rows — and the
    // fallback matters: a grouping that collapsed the whole list into ten
    // folders has no such line, and a check that read `null` there would fail
    // with the word "undefined" instead of with the count it found.
    const painted = document.querySelectorAll(`${folderSel}, ${eventSel}`).length;
    return {
      windowed: showing ? Number(showing[1].replace(/,/g, "")) : painted,
      rows: showing ? Number(showing[2].replace(/,/g, "")) : painted,
      folders: document.querySelectorAll(folderSel).length,
      painted: document.querySelectorAll(eventSel).length,
      // Document order: a lone event card carries the event's id, a folder
      // carries the aria-label that says how many members it stands for.
      order: [...document.querySelectorAll(`${folderSel}, ${eventSel}`)].map((el) => {
        const label = el.getAttribute("aria-label");
        const m = label && /^(\d[\d,]*) consecutive (\w+?)s? —/.exec(label);
        return m
          ? { kind: "run", count: Number(m[1].replace(/,/g, "")), member: m[2] }
          : { kind: "event", id: el.getAttribute("data-event-id") };
      }),
    };
  },
  { folderSel: FOLDER, eventSel: EVENT },
);

check(
  "R1a the page's own grouped row count is this script's grouping of the route's rows",
  f3Dom.rows === f3Own.length,
  `page says ${f3Dom.rows?.toLocaleString("en-US")} rows, own grouping gives ${f3Own.length.toLocaleString("en-US")}`,
);
check(
  "R1b folders are drawn, and the page states fewer rows than the life has events",
  f3Dom.folders > 0 && f3Dom.rows != null && f3Dom.rows <= f3Events.length / 1.5,
  `${f3Dom.folders} folders drawn, ${f3Dom.rows?.toLocaleString("en-US")} rows for ${f3Events.length.toLocaleString(
    "en-US",
  )} events (${f3Dom.rows ? (f3Events.length / f3Dom.rows).toFixed(2) : "?"}×)`,
);
const f3Window = f3Own.slice(0, WINDOW_CHUNK);
const windowMismatch = f3Window.findIndex((row, i) => {
  const drawn = f3Dom.order[i];
  if (!drawn) return true;
  if (row.kind === "run") return drawn.kind !== "run" || drawn.count !== row.events.length;
  return drawn.kind !== "event" || drawn.id !== row.events[0].id;
});
check(
  "R1c and the window it painted is that grouping row by row, folder counts included",
  f3Dom.order.length >= f3Window.length && windowMismatch === -1,
  windowMismatch === -1
    ? `${f3Window.length} window rows, ${f3Dom.order.filter((r) => r.kind === "run").length} of them folders`
    : `first ${f3Window.length} window rows disagree at index ${windowMismatch}: own ${JSON.stringify(
        f3Window[windowMismatch]?.kind === "run"
          ? { kind: "run", count: f3Window[windowMismatch].events.length }
          : { kind: "event", id: f3Window[windowMismatch]?.events[0].id },
      )}, page ${JSON.stringify(f3Dom.order[windowMismatch])}`,
);

// ── R2/R3 — one folder at a time, its members taken from the expansion ──────
// A folder's members are not re-derived from the grouping: the folder is
// clicked, and the event ids that appear ARE its members. They are attributed
// by difference, which is exact as long as each click is taken on its own.
// ⚠️ NOT BY SET DIFFERENCE. The first build of this check took the ids that
// were NEW after a click, and folder 20 came back with 76 members against a
// folder claiming 3: clicking near the foot of the list brings the window's
// sentinel into view and the page grows itself by another 100 rows, all of them
// new ids. Insertion POSITION is what identifies a folder's members — they are
// inserted immediately after their own folder, while a window's growth lands at
// the end of the list — so the diff is taken over the ordered markers and read
// at the first position where the two orders part.
const byId = new Map(f3Events.map((e) => [e.id, e]));
const markers = () =>
  f3Page.evaluate(
    ({ folderSel, eventSel }) =>
      [...document.querySelectorAll(`${folderSel}, ${eventSel}`)].map((el) => {
        const label = el.getAttribute("aria-label");
        const m = label && /^(\d[\d,]*) consecutive/.exec(label);
        return m ? `f:${m[1].replace(/,/g, "")}` : `e:${el.getAttribute("data-event-id")}`;
      }),
    { folderSel: FOLDER, eventSel: EVENT },
  );
const headerText = (i) => f3Page.locator(FOLDER).nth(i).innerText();

const folders = [];
if (f3Dom.folders === 0) {
  skip("R2 a folder's Σ is the sum of its own members' deltas", "no folder was drawn — see R1b");
  skip("R3 no folder mixes an inbound with an outbound transfer", "no folder was drawn — see R1b");
  skip("R3b every folder's own kind is one this script expects to collapse", "no folder was drawn — see R1b");
} else {
  for (let i = 0; i < f3Dom.folders; i++) {
    const stated = (await headerText(i)).replace(/\s+/g, " ").trim();
    const claim = Number(
      (/^(\d[\d,]*) consecutive/.exec(await f3Page.locator(FOLDER).nth(i).getAttribute("aria-label")) ?? [
        "",
        "0",
      ])[1].replace(/,/g, ""),
    );
    const before = await markers();
    await f3Page.locator(FOLDER).nth(i).click();
    await f3Page.waitForFunction(
      ({ sel, was }) => document.querySelectorAll(sel).length > was,
      { sel: EVENT, was: before.filter((m) => m.startsWith("e:")).length },
      { timeout: 15_000 },
    );
    const after = await markers();
    let at = 0;
    while (at < before.length && before[at] === after[at]) at++;
    const inserted = after.slice(at, at + claim);
    const members = inserted.every((m) => m.startsWith("e:"))
      ? inserted.map((m) => byId.get(m.slice(2)))
      : // A non-event marker where the members should be is itself the finding:
        // an empty member list fails R2 loudly rather than passing on nothing.
        [];
    folders.push({ i, stated, claim, members });
  }

  // R2 — the Σ. The verb says which leg, the magnitude is compared inside the
  // band its own last digit allows, and the member count must match the folder's
  // own claim about how many rows it stands for.
  const sumBad = [];
  for (const f of folders) {
    const m = /(Received|Sent|Minted|Burned|Deposited|Withdrawn)\s+(<?[\d,.]+[KM]?)/.exec(f.stated);
    const parsed = m ? parseCompact(m[2]) : null;
    const kinds = new Set(f.members.map((e) => e?.kind));
    const own =
      Number(
        f.members.reduce(
          (acc, e) => acc + (BigInt(e?.sharesDelta ?? 0) < 0n ? -BigInt(e.sharesDelta) : BigInt(e?.sharesDelta ?? 0)),
          0n,
        ),
      ) / Math.pow(10, f.members[0]?.shareDecimals ?? 18);
    const countClaim = f.claim;
    const ok =
      f.members.length > 0 &&
      f.members.every((e) => e != null) &&
      countClaim === f.members.length &&
      parsed != null &&
      Math.abs(parsed.value - own) <= parsed.band;
    if (!ok)
      sumBad.push(
        `folder ${f.i} (${f.members.length} ${[...kinds].join("+")}, claims ${countClaim}): states ${
          m ? m[2] : `no Σ in "${f.stated}"`
        }, own ${own.toLocaleString("en-US", { maximumFractionDigits: 6 })}${parsed ? ` (band ±${parsed.band})` : ""}`,
      );
  }
  check(
    "R2 every folder's Σ is the sum of its own members' deltas, read off the members it expanded to",
    sumBad.length === 0,
    sumBad.length === 0
      ? `${folders.length} folders, ${folders.reduce((a, f) => a + f.members.length, 0)} members summed`
      : sumBad.slice(0, 3).join(" · "),
  );

  // R3 — the direction split. The subject is which rows SHARE a folder, which
  // no Σ check can see (a mixed folder's absolute sum is still its own).
  const mixed = folders.filter((f) => new Set(f.members.map((e) => e?.kind)).size > 1);
  check(
    "R3 no folder mixes an inbound with an outbound transfer",
    mixed.length === 0,
    mixed.length === 0
      ? `${folders.length} folders, each one direction (${folders
          .map((f) => f.members[0]?.kind)
          .filter((k, i, a) => a.indexOf(k) === i)
          .join(" / ")})`
      : `${mixed.length} of ${folders.length} folders mix inbound and outbound transfers (e.g. ${
          mixed[0].members.length
        } members: ${[...new Set(mixed[0].members.map((e) => e?.kind))].join(", ")})`,
  );
  check(
    "R3b and every folder's own kind is one this script expects to collapse",
    folders.every((f) => f.members.every((e) => RUN_KINDS.has(e?.kind))),
    `${folders.length} folders`,
  );
}
await f3Page.close();

// ── R4 — the floor still holds on a small life ─────────────────────────────
const f4Route = await fetch(routeUrl(F4));
const f4Json = f4Route.status === 200 ? await f4Route.json() : null;
const f4Events = f4Json?.timeline?.events ?? [];
const f4Own = ownRuns(f4Events);
const f4Kinds = {};
for (const e of f4Events) f4Kinds[e.kind] = (f4Kinds[e.kind] ?? 0) + 1;
let longest = 0;
let cur = 0;
let prev = null;
for (const e of f4Events) {
  cur = e.kind === prev ? cur + 1 : 1;
  prev = e.kind;
  if (cur > longest) longest = cur;
}
check(
  "R4a F4 is still a short life with no stretch of three — the fixture R4b rests on",
  f4Events.length > 0 && f4Events.length < 20 && longest < MIN_RUN,
  `${f4Events.length} rows ${JSON.stringify(f4Kinds)}, longest same-kind stretch ${longest}`,
);
const f4Page = await browser.newPage();
await f4Page.goto(pageUrl(F4), { waitUntil: "networkidle", timeout: 180_000 });
await f4Page.waitForSelector(EVENT, { timeout: 60_000 });
const f4Dom = await f4Page.evaluate(
  ({ folderSel, eventSel }) => ({
    folders: document.querySelectorAll(folderSel).length,
    painted: document.querySelectorAll(eventSel).length,
  }),
  { folderSel: FOLDER, eventSel: EVENT },
);
await f4Page.close();
check(
  "R4b F4's page draws no folder — the three-row floor still holds",
  f4Dom.folders === 0 && f4Dom.painted === f4Own.length,
  `F4's ${f4Events.length}-row life draws ${f4Dom.folders} folder(s) and ${f4Dom.painted} cards; its longest same-kind stretch is ${longest} and the floor is ${MIN_RUN}`,
);

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
