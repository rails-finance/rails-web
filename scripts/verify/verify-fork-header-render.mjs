import { chromium } from "playwright";
import { CLOSED_GROUP, HEADER_IN_GROUP, groupCount, openGroup } from "./lib/group-rows.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SPECIMENS = {
  // ⚠️ The delegate specimen must be an OPEN batched trove — the original
  // ebisu/WBTC one closed on chain (2026-06-11; its closeTrove reached the
  // index with the Run 16 gap fill), and NO open batched trove remains on
  // ebisu. Repointed to asymmetry (same shared fork header) 2026-08-11.
  forkDelegate: {
    url: `/ethereum/asymmetry/ysyBOLD/44200710175298985045867238413926232399816914621841575154462571678280218005739`,
    pill: "3.20%",
  },
  // Rate pills state two places on every family since ui-jobs 309 step 2
  // (Miles, 8 Oct 2026: "two places everywhere"); the fork pill read "2.3%" before.
  ebisuIndividual: {
    url: `/ethereum/ebisu/sUSDe/87142273507301491546594869769469556221191943811042234974226220181932990285269`,
    pill: "2.30%",
  },
  asymRun: {
    url: `/ethereum/asymmetry/sUSDS/8309122898133156698498852897464396224593631760337811282458430493454418132410`,
  },
  v2: {
    url: `/ethereum/liquity-v2/trove/WETH/102036905498439360210701303197562255497830229508729325448634378946648943354674`,
  },
};

function assert(c, m) {
  if (!c) throw new Error("FAIL: " + m);
  console.log("  ok:", m);
}

const browser = await chromium.launch();

async function load(page, url) {
  // Retry: the fork troves/timeline endpoints are intermittently flaky.
  for (let i = 0; i < 3; i++) {
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const cards = await page.locator("text=/Trove state|Plain English|Interest rate/i").count();
    if (cards > 0) return true;
  }
  return false;
}

// ── The run folder's expectation, read off the served folders ──────────────
// Since row-cut batch 7 (web 2026-09-28) rails-server groups the fork
// timelines: the page draws the folders the grouped answer's `rowPlan` names,
// each carrying its member count and its debt and collateral legs in raw units.
// The page words them debt first: "cleared" the debt, "reduced" the collateral.

/** A leg's raw amount at its decimals, as a float for the compact form. */
const legValue = (leg) => Number(BigInt(leg.amount)) / 10 ** leg.decimals;

/** Every redemption folder in the grouped answer, newest first (the page's
 *  order), each with the two sums its header carries. */
function redemptionFolders(served) {
  return (served.rowPlan ?? [])
    .filter((r) => r.kind === "folder" && r.folder.kind === "redemption")
    .map((r) => r.folder)
    .sort((a, b) => b.ordinalLast - a.ordinalLast)
    .map((f) => {
      const leg = (asset) => f.legs.find((l) => l.asset === asset);
      return { count: f.count, cleared: legValue(leg("debt")), reduced: legValue(leg("collateral")) };
    });
}

// Scan every span for a rate-pill: text like "4.30%" / "2.3%", report computed colours.
async function pills(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll("span"))) {
      const t = (el.textContent || "").trim();
      if (!/^\d+\.\d+%$/.test(t)) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // Walk up to the lozenge (the styled background) if this is the inner text.
      let box = el;
      for (let d = 0; d < 3 && box; d++) {
        const bcs = getComputedStyle(box);
        if (bcs.backgroundColor && bcs.backgroundColor !== "rgba(0, 0, 0, 0)") break;
        box = box.parentElement;
      }
      const bcs = box ? getComputedStyle(box) : cs;
      out.push({
        text: t,
        color: cs.color,
        bg: bcs.backgroundColor,
        display: cs.display,
        visible: r.width > 0 && r.height > 0,
        hasGlyph: !!(box && box.querySelector("svg")),
      });
    }
    return out;
  });
}

let failures = 0;
async function run(name, fn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 }, colorScheme: "light" });
  try {
    await fn(page);
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    failures++;
  } finally {
    await page.close();
  }
}

// ── 1. Delegate (batched) pill — pink, the figure alone, visible at ≥640px ──
await run("fork delegate pill", async (page) => {
  console.log("\n[fork delegate pill — openTroveAndJoinBatch, batched (asymmetry specimen)]");
  const ok = await load(page, SPECIMENS.forkDelegate.url);
  assert(ok, "page rendered cards");
  const ps = await pills(page);
  console.log("    pills:", JSON.stringify(ps.slice(0, 6)));
  // The lozenge is the inline-flex span carrying a background (RatePillShell /
  // DelegateRatePillShell).
  const delegate = ps.find(
    (p) => p.text === SPECIMENS.forkDelegate.pill && p.display === "inline-flex" && p.bg !== "rgba(0, 0, 0, 0)",
  );
  assert(delegate, `delegate pill lozenge "${SPECIMENS.forkDelegate.pill}" present (2dp, coloured background)`);
  // ui-jobs 408: the pill carries the figure alone; the people glyph is the
  // badge on the spine node.
  assert(!delegate.hasGlyph, "delegate pill carries no glyph (the figure alone)");
  const badged = await page.locator('[data-spine-node][data-spine-badge="third-party"]').count();
  assert(badged > 0, `a spine node wears the third-party badge (${badged})`);
  // Theme colours are oklch(L C H) — a pink pill is saturated (chroma ≳ 0.1); a
  // neutral individual pill is ~0 chroma. Assert the delegate colour is saturated.
  const chroma = Number((delegate.color.match(/oklch\(\s*[\d.]+\s+([\d.]+)/) || [])[1] || 0);
  assert(chroma > 0.1, `delegate pill colour is saturated/pink (${delegate.color}, chroma ${chroma})`);
  assert(delegate.visible && delegate.display !== "none", "delegate pill visible at 1280px (survives spine hand-off)");
});

// ── 2. Individual rate pill + paired detail stat (receipt identity) ──
await run("ebisu individual pill + detail", async (page) => {
  console.log("\n[ebisu individual rate pill — unbatched Adjusted rate]");
  const ok = await load(page, SPECIMENS.ebisuIndividual.url);
  assert(ok, "page rendered cards");
  const ps = await pills(page);
  const indiv = ps.find((p) => p.text === SPECIMENS.ebisuIndividual.pill);
  assert(indiv, `individual pill "${SPECIMENS.ebisuIndividual.pill}" present (2dp)`);
  const m = indiv.color.match(/\d+/g).map(Number);
  assert(!(m[0] > 150 && m[1] < 90), `individual pill NOT pink (neutral ${indiv.color})`);
  assert(indiv.visible, "individual pill visible at 1280px");
  // Expand the "Adjusted rate" card (the head's participle, rails-ops decision
  // 0045) → its detail grid carries the paired "Interest rate" stat with the
  // same 2-dp value (the receipt identity). The card's hidden label span
  // carries the words too since 309 (`7bfc37d`); the press goes to the visible
  // head.
  const header = page
    .locator('[data-anatomy~="T1"]')
    .getByText(/^Adjusted rate$/)
    .locator("visible=true")
    .first();
  assert((await header.count()) > 0, 'head reads "Adjusted rate"');
  await header.click();
  await page.waitForTimeout(600);
  const rateStat = await page
    .locator("text=/^Interest rate$/i")
    .count()
    .catch(() => 0);
  assert(rateStat > 0, "detail grid shows the paired 'Interest rate' stat (pill+grid one receipt)");
  const stat230 = await page.locator("text=/2\\.30%/").count();
  assert(stat230 > 0, "detail rate stat shows 2.30% (matches the pill's echo key)");
});

// ── 3. Redemption run folder — its header's Σ against the grouped answer ──
//
// A redemption run is a FOLDER row: a Σ glyph, the summed Cleared (debt) / Reduced (collateral)
// pairs, the folder's date range, and an aria-label naming the members and the
// toggle ("100 consecutive redemptions — expand the run"), which flips to
// "collapse the run" once open. The words this check used to look for — a
// "Redeemed ×N" label and a "Show all N" / "Collapse" hint — the timeline
// stopped drawing on 2026-09-02 (b87e8087, 207d8ee7): the verbs beside each
// summed pair already name what happened, and the folder's disclosure mark is
// the Finder-style chevron beside its glyph.
//
// NOTHING BELOW IS PINNED. The trove is live and collects redemptions, so the
// expectation is the newest redemption folder of the grouped answer the page
// reads. A drift between the two is the finding.
await run("asymmetry run folder", async (page) => {
  console.log("\n[asymmetry redemption run folder — header Σ against the grouped answer]");
  const ok = await load(page, SPECIMENS.asymRun.url);
  assert(ok, "page rendered cards");

  // Read the history AFTER the page has it, so both sides see the same head.
  const [, , , branch, troveId] = SPECIMENS.asymRun.url.split("/");
  const res = await fetch(`${BASE}/api/asymmetry/${branch}/${encodeURIComponent(troveId)}/timeline?group=1`);
  assert(res.ok, `served timeline answered (${res.status})`);
  const served = await res.json();
  assert(served.grouped === true, "the timeline answers grouped");
  const expected = redemptionFolders(served);
  console.log(
    "    folders from the grouped answer:",
    JSON.stringify(expected.slice(0, 3).map((f) => ({ n: f.count, cleared: f.cleared, reduced: f.reduced }))),
  );
  assert(expected.length > 0, `the grouped answer holds at least one redemption folder (${expected.length})`);

  // Since ui-jobs 250 (`9301aba`) a folder is a group frame (lib/group-rows.mjs):
  // its header is named "72 redemptions, 1 Sep 2026 to 27 Sep 2026: cleared
  // 2,010 USDaf, reduced 1,798 sUSDS" (the sums at `spokenAmount`'s places),
  // and its ⋮ "Show 72 grouped events" opens the members.
  const frames = page.locator(CLOSED_GROUP, { has: page.locator(`${HEADER_IN_GROUP}[aria-label*=" redemptions, "]`) });
  assert((await frames.count()) > 0, `run folder rows rendered, named by their members (${await frames.count()})`);
  const frame = frames.first();
  const row = frame.locator(HEADER_IN_GROUP).first();
  const closedAria = await row.getAttribute("aria-label");

  const first = expected[0];
  const stated = groupCount(closedAria);
  assert(stated === first.count, `row states ${stated} members — the count its folder holds (${first.count})`);

  const spoken = (v) =>
    Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : 4 });
  const figure = (verb) => (closedAria.match(new RegExp(`${verb} ([0-9][0-9.,]*)`)) ?? [])[1];
  const cleared = spoken(first.cleared);
  const reduced = spoken(first.reduced);
  assert(
    figure("cleared") === cleared,
    `"cleared ${cleared}" is the Σ of the folder's debt deltas (row says ${figure("cleared")})`,
  );
  assert(
    figure("reduced") === reduced,
    `"reduced ${reduced}" is the Σ of the folder's collateral deltas (row says ${figure("reduced")})`,
  );
  assert(
    closedAria.indexOf("cleared") >= 0 && closedAria.indexOf("cleared") < closedAria.indexOf("reduced"),
    "the row names the debt first (cleared before reduced)",
  );

  assert(await openGroup(page, frame), 'the folder\'s ⋮ "Show grouped events" opens the members');
});

// ── 4. V2 regression — the shared-module pills still render on V2 ──
await run("liquity-v2 regression", async (page) => {
  console.log("\n[liquity-v2 regression — moved rate pills still render]");
  await page.goto(BASE + SPECIMENS.v2.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const cards = await page.locator("text=/Trove|Borrow|Open|Interest/i").count();
  assert(cards > 0, "V2 trove page rendered");
  const ps = await pills(page);
  console.log("    v2 pills:", JSON.stringify(ps.slice(0, 5)));
  assert(ps.length > 0, "V2 renders at least one rate pill (UsersGlyph/RatePill moved cleanly)");
  const errors = await page.locator("text=/Application error|Unhandled Runtime/i").count();
  assert(errors === 0, "no runtime error on the V2 page");
});

await browser.close();
if (failures > 0) {
  console.log(`\n❌ ${failures} render check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\n✅ all render checks passed");
}
