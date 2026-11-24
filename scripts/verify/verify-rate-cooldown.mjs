// The rate-change cooldown row on Trove pages (rails-ops TO-DO-ui-jobs 831;
// anatomy L7.3; components/protocol/liquity-family/rate-cooldown-row.tsx).
//
// A cooldown lasts 7 days, so no fixed Trove stays inside one. The samples
// come from the listing the Trove pages link from: Liquity V2 Troves opened in
// the last 7 days (one individual, one batched), the open Trove idle longest
// (outside any cooldown), and on each fork the open Trove touched last. For
// each, the expected deadline is worked out here from the Trove's timeline
// answer, independently of the page's code (open, rate change, join and leave
// set the Trove's clock; a batched Trove's leave test reads the later of that
// and the delegate's newest rate change since the join), and the page is
// opened once:
//
//   - inside a cooldown, `[data-note-item="rate-cooldown"]` stands in the head
//     slot with `data-rate-cooldown-ends` equal to the deadline, the words
//     ("A rate change before …" / "Leaving the batch at another rate before …"),
//     the time left, the hourglass node and no number; opened, the fee, the
//     same-rate line and the link to the event that set the clock, and the timeline's
//     `data-market-notes` count does not include it;
//   - outside one, no row.
//
// Usage: BASE=http://localhost:3831 node scripts/verify/verify-rate-cooldown.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders, hostFetch } from "./lib/host.mjs";

const COOLDOWN = 7 * 86_400;
const now = () => Math.floor(Date.now() / 1000);

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (cond) console.log("    ok:", msg);
  else {
    console.log("    FAIL:", msg);
    failures++;
  }
}

async function json(path) {
  const res = await hostFetch(BASE + path);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const TROVE_CLOCK = new Set([
  "openTrove",
  "openTroveAndJoinBatch",
  "adjustTroveInterestRate",
  "setInterestBatchManager",
  "removeFromBatch",
]);
const JOINS = new Set(["openTroveAndJoinBatch", "setInterestBatchManager"]);

/** The deadline from the timeline's rows, or null where none runs. */
function expected(events, opOf) {
  const rows = [...events].sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      a.blockNumber - b.blockNumber ||
      (opOf(a) === "removeFromBatch" ? 0 : 1) - (opOf(b) === "removeFromBatch" ? 0 : 1),
  );
  const clock = rows.filter((e) => TROVE_CLOCK.has(opOf(e))).at(-1);
  if (!clock) return null;
  let ends = clock.timestamp + COOLDOWN;
  const batched = JOINS.has(opOf(clock));
  if (batched) {
    const batchRate = rows
      .filter((e) => opOf(e) === "setBatchManagerAnnualInterestRate" && e.timestamp >= clock.timestamp)
      .at(-1);
    if (batchRate) ends = Math.max(ends, batchRate.timestamp + COOLDOWN);
  }
  return ends > now() ? { ends, batched } : null;
}

/** The samples: { label, path, events, opOf }. */
async function samples() {
  const out = [];
  const week = 7 * 86_400_000;
  const v2 = async (q, label) => {
    const d = await json(`/api/troves?${q}&limit=1`);
    const t = d.data?.[0];
    if (!t) return console.log(`  (no ${label} Trove in the listing)`);
    const tl = await json(`/api/trove/${t.collateralType}/${t.id}/timeline`);
    out.push({
      label: `Liquity V2 ${label}`,
      path: `/ethereum/liquity-v2/trove/${t.collateralType}/${t.id}`,
      events: tl.events ?? [],
      opOf: (e) => e.context?.data?.operation,
      want: label === "idle" ? "none" : "inside",
    });
  };
  await v2(`createdWithin=${week}&individualOnly=true&sortBy=created&sortOrder=desc`, "individual, opened this week");
  await v2(`createdWithin=${week}&batchOnly=true&sortBy=created&sortOrder=desc`, "batched, opened this week");
  await v2(`individualOnly=true&sortBy=lastActivity&sortOrder=asc&status=open`, "idle");
  for (const [proto, chain] of [
    ["ebisu", "ethereum"],
    ["asymmetry", "ethereum"],
    ["basedollar", "base"],
  ]) {
    const d = await json(`/api/${proto}/troves?status=open&sortBy=lastActivity&sortOrder=desc&limit=1`);
    const rows = d.data ?? d.troves ?? [];
    const t = rows[0];
    if (!t) continue;
    const tl = await json(`/api/${proto}/${t.collateralType}/${t.id}/timeline`);
    out.push({
      label: `${proto} touched last`,
      path: `/${chain}/${proto}/${t.collateralType}/${t.id}`,
      events: tl.events ?? [],
      opOf: (e) => e.context?.data?.eventType,
      want: "either",
    });
  }
  return out;
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ extraHTTPHeaders: bypassHeaders() });
let inside = 0;
let outside = 0;
let batchedSeen = 0;

for (const s of await samples()) {
  console.log(`\n=== ${s.label}: ${s.path}`);
  const exp = expected(s.events, s.opOf);
  if (s.want === "inside" && !exp) console.log("    (its timeline holds no running cooldown; checked as outside)");
  if (s.want === "none") assert(!exp, "the idle Trove's timeline holds no running cooldown");
  const page = await context.newPage();
  await page.goto(BASE + s.path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-market-notes], [data-event-number]", { timeout: 60_000 });
  const row = page.locator('[data-note-item="rate-cooldown"]');
  if (!exp) {
    outside++;
    // The row draws after mount; give the clock its first tick.
    await page.waitForTimeout(1500);
    assert((await row.count()) === 0, "no cooldown row outside a cooldown");
    await page.close();
    continue;
  }
  inside++;
  if (exp.batched) batchedSeen++;
  await row.waitFor({ timeout: 30_000 });
  assert((await row.count()) === 1, "one cooldown row in the head slot");
  assert(
    Number(await row.getAttribute("data-rate-cooldown-ends")) === exp.ends,
    `deadline ${exp.ends} matches the timeline`,
  );
  assert((await row.getAttribute("data-anatomy")) === "L7.3", "anatomy L7.3");
  assert(
    (await page.locator('[data-note-gap="head"] [data-note-item="rate-cooldown"]').count()) === 0,
    "drawn as the head slot's live window, outside the notes' gap",
  );
  const words = (await row.locator("[data-head-kind]").innerText()).trim();
  assert(
    exp.batched
      ? /^Leaving the batch at another rate before .+ UTC costs an Upfront Borrowing Fee$/.test(words)
      : /^A rate change before .+ UTC costs an Upfront Borrowing Fee$/.test(words),
    `words: "${words}"`,
  );
  const left = (await row.locator("[data-rate-cooldown-left]").innerText()).trim();
  assert(/^(\d+d( \d+h)?|\d+h( \d+m)?|\d+m|under 1m)$/.test(left), `time left "${left}"`);
  assert((await row.locator("[data-spine-cooldown-glyph]").count()) === 1, "the hourglass node");
  assert((await row.locator("[data-event-number]").count()) === 0, "no event number");
  const notesRoot = page.locator("[data-market-notes]");
  const notes = (await notesRoot.count()) ? await notesRoot.first().getAttribute("data-market-notes") : null;
  assert(notes == null || notes === "0", `left out of the notes count (data-market-notes=${notes})`);
  await row.locator('[role="button"]').first().click();
  await row.locator("[data-rate-cooldown-fee]").waitFor({ timeout: 10_000 });
  const fee = await row.locator("[data-rate-cooldown-fee]").innerText();
  assert(/7 days of interest on the Trove's whole debt at the branch's average rate/.test(fee), "the fee rule");
  assert(/premature adjustment fee/.test(fee), "the docs' other name");
  const same = await row.locator("[data-rate-cooldown-same]").innerText();
  assert(
    exp.batched
      ? same === "Leaving at the batch's rate pays nothing."
      : same === "A change to the same rate pays nothing.",
    `same-rate line "${same}"`,
  );
  assert((await row.locator("[data-rate-cooldown-event]").count()) >= 1, "the clock links the event that set it");
  await page.close();
}

await browser.close();
assert(inside >= 1, `at least one Trove inside a cooldown (${inside})`);
assert(outside >= 1, `at least one Trove outside a cooldown (${outside})`);
if (batchedSeen === 0) console.log("\n  (no batched Trove inside a cooldown in the samples)");
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
