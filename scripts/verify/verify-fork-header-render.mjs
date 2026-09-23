import { chromium } from "playwright";

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
  ebisuIndividual: {
    url: `/ethereum/ebisu/sUSDe/87142273507301491546594869769469556221191943811042234974226220181932990285269`,
    pill: "2.3%",
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

// ── The run folder's expectation, derived from the served timeline ─────────
// Each constant below is the web's own, named where it lives, because this
// script replays the page's grouping over the page's own history.

/** lib/shared/timeline-opening-balance.ts — the window the trove page asks for. */
const TIMELINE_WINDOW_ROWS = 1000;
/** lib/shared/timeline-chunks.ts — events one folder aims to hold. */
const CHUNK_TARGET = 100;
/** lib/shared/liquity-fork-timeline-runs.tsx — shorter stretches stay as cards. */
const MIN_REDEMPTION_RUN = 4;

/** The transaction a wire event belongs to (lib/shared/timeline-wire.ts): the
 *  envelope names the separator and which segment of `id` is the hash, and a
 *  row the pair does not reconstruct carries its own `h`. */
function txOf(event, wire) {
  if (event.h) return event.h;
  const seg = event.id.split(wire?.hs ?? "-")[wire?.hp ?? 0] ?? event.id;
  return wire?.hx ? `0x${seg}` : seg;
}

/** fmtSpine + fmtHeaderMagnitude (components/shared/activity-timeline.tsx,
 *  lib/shared/header-values.ts) — the compact form the folder header draws. */
function fmtHeaderMagnitude(n) {
  const a = Math.abs(n);
  if (!a || !isFinite(a)) return "";
  if (a < 0.01) return "<0.01";
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) {
    const k = a / 1_000;
    return a >= 10_000 ? `${Math.round(k)}K` : `${parseFloat(k.toFixed(1))}K`;
  }
  if (a >= 1) return a.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return parseFloat(a.toFixed(4)).toString();
}

/** chunkByTransaction (lib/shared/timeline-chunks.ts): ~target events per
 *  folder, the boundary always between transactions, a remnant shorter than
 *  the run floor joining the folder before it. */
function chunkByTransaction(items, wire) {
  const chunks = [];
  let current = [];
  let i = 0;
  while (i < items.length) {
    const tx = txOf(items[i], wire);
    let j = i + 1;
    while (j < items.length && txOf(items[j], wire) === tx) j++;
    for (let k = i; k < j; k++) current.push(items[k]);
    if (current.length >= CHUNK_TARGET) {
      chunks.push(current);
      current = [];
    }
    i = j;
  }
  if (current.length > 0) {
    if (chunks.length > 0 && current.length < MIN_REDEMPTION_RUN) chunks[chunks.length - 1].push(...current);
    else chunks.push(current);
  }
  return chunks;
}

/** Every redemption run folder the page would draw from this history, in
 *  display order (newest first), each with the two Σs its header carries —
 *  Σ |collDelta| cleared to redeemers, Σ |debtDelta| reduced. */
function redemptionFolders(served) {
  const events = [...(served.events ?? [])].sort((a, b) => a.timestamp - b.timestamp).reverse();
  const isRedemption = (e) => e?.context?.data?.eventType === "redeemCollateral";
  const folders = [];
  let i = 0;
  while (i < events.length) {
    if (!isRedemption(events[i])) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < events.length && isRedemption(events[j])) j++;
    if (j - i >= MIN_REDEMPTION_RUN) {
      for (const chunk of chunkByTransaction(events.slice(i, j), served.wire)) {
        let cleared = 0;
        let reduced = 0;
        for (const e of chunk) {
          cleared += Math.abs(Number(e.context.data.collDelta) || 0);
          reduced += Math.abs(Number(e.context.data.debtDelta) || 0);
        }
        folders.push({ count: chunk.length, cleared, reduced });
      }
    }
    i = j;
  }
  return folders;
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

// ── 1. Delegate (batched) pill — pink, with the people glyph, visible at ≥640px ──
await run("fork delegate pill", async (page) => {
  console.log("\n[fork delegate pill — openTroveAndJoinBatch, batched (asymmetry specimen)]");
  const ok = await load(page, SPECIMENS.forkDelegate.url);
  assert(ok, "page rendered cards");
  const ps = await pills(page);
  console.log("    pills:", JSON.stringify(ps.slice(0, 6)));
  // The lozenge is the inline-flex span carrying a background (RatePillShell /
  // DelegateRatePillShell); the delegate variant additionally holds the glyph.
  const delegate = ps.find(
    (p) => p.text === SPECIMENS.forkDelegate.pill && p.display === "inline-flex" && p.bg !== "rgba(0, 0, 0, 0)",
  );
  assert(delegate, `delegate pill lozenge "${SPECIMENS.forkDelegate.pill}" present (2dp, coloured background)`);
  assert(delegate.hasGlyph, "delegate pill carries the people glyph (delegate treatment)");
  // Theme colours are oklch(L C H) — a pink pill is saturated (chroma ≳ 0.1); a
  // neutral individual pill is ~0 chroma. Assert the delegate colour is saturated.
  const chroma = Number((delegate.color.match(/oklch\(\s*[\d.]+\s+([\d.]+)/) || [])[1] || 0);
  assert(chroma > 0.1, `delegate pill colour is saturated/pink (${delegate.color}, chroma ${chroma})`);
  assert(delegate.visible && delegate.display !== "none", "delegate pill visible at 1280px (survives spine hand-off)");
});

// ── 2. Individual rate pill + paired detail stat (receipt identity) ──
await run("ebisu individual pill + detail", async (page) => {
  console.log("\n[ebisu individual rate pill — unbatched Increase interest rate]");
  const ok = await load(page, SPECIMENS.ebisuIndividual.url);
  assert(ok, "page rendered cards");
  const ps = await pills(page);
  const indiv = ps.find((p) => p.text === "2.3%");
  assert(indiv, `individual pill "2.3%" present (1dp)`);
  const m = indiv.color.match(/\d+/g).map(Number);
  assert(!(m[0] > 150 && m[1] < 90), `individual pill NOT pink (neutral ${indiv.color})`);
  assert(indiv.visible, "individual pill visible at 1280px");
  // Expand the "Increase interest rate" card → its detail grid carries the paired
  // "Interest rate" stat with the same 2-dp value (the receipt identity).
  const header = page.locator("text=/Increase interest rate/i").first();
  assert((await header.count()) > 0, 'header reads "Increase interest rate"');
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

// ── 3. Redemption run folder — its header's Σ against the served timeline ──
//
// A redemption run is a FOLDER row: a Σ glyph, the summed Cleared / Reduced
// pairs, the folder's date range, and an aria-label naming the members and the
// toggle ("100 consecutive redemptions — expand the run"), which flips to
// "collapse the run" once open. The words this check used to look for — a
// "Redeemed ×N" label and a "Show all N" / "Collapse" hint — the timeline
// stopped drawing on 2026-09-02 (b87e8087, 207d8ee7): the verbs beside each
// summed pair already name what happened, and the folder's disclosure mark is
// the Finder-style chevron beside its glyph.
//
// NOTHING BELOW IS PINNED. The trove is live and collects redemptions, so the
// expectation is derived from the same history the page reads and grouped the
// way the page groups it: consecutive `redeemCollateral` events, stretches of
// ≥ MIN_REDEMPTION_RUN, sliced into folders of ~CHUNK_TARGET that never split
// a transaction, newest first. A drift between the two is the finding.
await run("asymmetry run folder", async (page) => {
  console.log("\n[asymmetry redemption run folder — header Σ against the served timeline]");
  const ok = await load(page, SPECIMENS.asymRun.url);
  assert(ok, "page rendered cards");

  // Read the history AFTER the page has it, so both sides see the same head.
  const [, , , branch, troveId] = SPECIMENS.asymRun.url.split("/");
  const res = await fetch(
    `${BASE}/api/asymmetry/${branch}/${encodeURIComponent(troveId)}/timeline?recent=${TIMELINE_WINDOW_ROWS}`,
  );
  assert(res.ok, `served timeline answered (${res.status})`);
  const served = await res.json();
  const expected = redemptionFolders(served);
  console.log(
    "    folders from the served timeline:",
    JSON.stringify(expected.slice(0, 3).map((f) => ({ n: f.count, cleared: f.cleared, reduced: f.reduced }))),
  );
  assert(expected.length > 0, `the served window holds at least one redemption run folder (${expected.length})`);

  const rows = page.locator('[aria-label*="consecutive redemptions"]');
  assert((await rows.count()) > 0, `run folder rows rendered, named by their members (${await rows.count()})`);
  const row = rows.first();
  const closedAria = await row.getAttribute("aria-label");
  assert(/expand the run$/.test(closedAria), `closed row offers the expand toggle ("${closedAria}")`);

  const first = expected[0];
  const stated = Number((closedAria.match(/^([\d,]+) consecutive redemptions/) ?? [])[1]?.replace(/,/g, ""));
  assert(stated === first.count, `row states ${stated} members — the count its folder holds (${first.count})`);

  // The header draws the compact form (fmtHeaderMagnitude); the exact figure
  // rides the provenance trace, so the compact form is what is compared.
  const text = await row.innerText();
  const figure = (verb) => (text.match(new RegExp(`${verb}\\s*(<0\\.01|[0-9][0-9.,]*[KM]?)`)) ?? [])[1];
  const cleared = fmtHeaderMagnitude(first.cleared);
  const reduced = fmtHeaderMagnitude(first.reduced);
  assert(
    figure("Cleared") === cleared,
    `"Cleared ${cleared}" is the Σ of the folder's own collateral deltas (row says ${figure("Cleared")})`,
  );
  assert(
    figure("Reduced") === reduced,
    `"Reduced ${reduced}" is the Σ of the folder's own debt deltas (row says ${figure("Reduced")})`,
  );

  await row.click();
  await page.waitForTimeout(600);
  const openAria = await row.getAttribute("aria-label");
  assert(/collapse the run$/.test(openAria), `the click flips the aria to the collapse toggle ("${openAria}")`);
  assert((await row.getAttribute("aria-expanded")) === "true", "aria-expanded reads true while the folder is open");
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
