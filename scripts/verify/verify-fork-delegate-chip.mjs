// Verify the Liquity-fork DELEGATE chip — the party-pink "delegate 0x12…34"
// beside the deltas, naming the interest-batch manager the owner handed rate
// control to (backend mig 152/153 → batch_manager on the events MVs).
//
// What it asserts, per specimen:
//   · the chip renders, in the party-pink COMPUTED colour, in BOTH themes
//   · it reads the manager's registry name (lib/shared/fork-batch-managers.ts)
//     where one is evidenced, and the truncated 0x1234…abcd where none is
//   · its address matches the manager the API row carries
//   · it is SCOPED: present on the batch-JOIN rows (openTroveAndJoinBatch /
//     setInterestBatchManager), absent on plain adjustTrove rows of the SAME
//     batched trove, and absent on the liquidation row (is_batched=false there)
//   · it carries a provenance receipt (the chip is <Prov>-wrapped, not an orphan)
//
// Plus a NARROW-WIDTH pass (§2): the chip is the widest thing ever added to a
// header row that already carries a label, two deltas and a rate pill, so the
// risk is horizontal overflow, clipping, or a collision. That pass measures
// geometry — page scrollWidth, the chip's box against its row's, and pairwise
// overlap between the row's children — rather than mere presence.
//
// Run: BASE=http://localhost:3007 node scripts/verify/verify-fork-delegate-chip.mjs
// (RAILS_API_URL and API_BEARER_TOKEN come from .env.local, never printed.)

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { armInspector } from "./lib/prov-inspector.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(path.join(REPO, ".env.local"));
} catch {
  /* the env must already carry RAILS_API_URL and API_BEARER_TOKEN */
}
const BASE = process.env.BASE ?? "http://localhost:3007";
const API = process.env.RAILS_API_URL;
const TOKEN = process.env.API_BEARER_TOKEN;
if (!API || !TOKEN) {
  console.error("needs RAILS_API_URL and API_BEARER_TOKEN (from .env.local)");
  process.exit(2);
}

const SPECIMENS = [
  {
    name: "ebisu WBTC — join + owner adjusts",
    path: "/ethereum/ebisu/WBTC/10430546781573984271232430163492407870250369747281491621041278404354507430384",
    api: "/api/ebisu/wbtc/10430546781573984271232430163492407870250369747281491621041278404354507430384/timeline",
  },
  {
    name: "ebisu LBTC — join, adjusts, then liquidation",
    path: "/ethereum/ebisu/LBTC/13394052393926264620262889431625395565724519184663421606841245358793097616197",
    api: "/api/ebisu/lbtc/13394052393926264620262889431625395565724519184663421606841245358793097616197/timeline",
  },
  {
    name: "ebisu LBTC — setInterestBatchManager",
    path: "/ethereum/ebisu/LBTC/104254006700864943255603234929125797097152208837729256885375646209538498275888",
    api: "/api/ebisu/lbtc/104254006700864943255603234929125797097152208837729256885375646209538498275888/timeline",
  },
  {
    name: "asymmetry ysyBOLD — join + set-manager + redemptions",
    path: "/ethereum/asymmetry/ysyBOLD/3457046546134533088834575299190675281071325494127881427191953071703289454996",
    api: "/api/asymmetry/ysybold/3457046546134533088834575299190675281071325494127881427191953071703289454996/timeline",
  },
];

// The events whose header carries the chip — the same set the rate pill uses.
const CHIP_EVENTS = new Set([
  "openTrove",
  "openTroveAndJoinBatch",
  "adjustTroveInterestRate",
  "setInterestBatchManager",
  "removeFromBatch",
]);

let failures = 0;
function assert(c, m) {
  if (c) console.log("  ok:", m);
  else {
    console.log("  ❌ FAIL:", m);
    failures++;
  }
}

async function apiRows(path) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`api ${res.status}`);
  return (await res.json()).rows;
}

const trunc = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// The verifier's OWN statement of the fork name registry — a deliberate mirror
// of lib/shared/fork-batch-managers.ts, not an import of it. Asserting against
// an independently written expectation is the point: importing the map under
// test would make the assertion pass by construction. Managers absent here are
// expected to render as their truncated address (the unidentified Ebisu EOA
// 0x322efa… is the live case).
const NAMES = {
  "0x50bc0287b722929b3b8dc8582d50e08ffa0f6009": "Bolder",
  "0x50bc01bd11fe19d6f896518a7fa1ae413d8eab0f": "Bolder",
  "0x50bc02599ae74fde4ee2c769586626977ccccc05": "Bolder",
  "0x25bc01216b2602e80ab527ed73c7821ecb526586": "Bolder",
  "0x75bc029949c56ef36f68c6569e4f983be4697158": "Bolder",
  "0x25bc020c042ea6a5a5b93b847f17ccd003415e95": "Bolder",
  "0x50bc01e46710abaacf5db45f0838b9fe7b9aedef": "Bolder",
};
// What a chip for `m` must read: its resolved name, else the truncated address.
const label = (m) => NAMES[m.toLowerCase()] ?? trunc(m);

// Every rendered chip: the "delegate" prefix span's sibling address span, with
// its COMPUTED colour — presence alone would not prove the party-pink tone.
async function chips(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll("span"))) {
      if ((el.textContent || "").trim() !== "delegate") continue;
      const addr = el.nextElementSibling;
      if (!addr) continue;
      const cs = getComputedStyle(addr);
      const r = addr.getBoundingClientRect();
      out.push({
        text: (addr.textContent || "").trim(),
        color: cs.color,
        visible: r.width > 0 && r.height > 0,
        // The chip is <Prov>-wrapped when its box carries `prov-locate-box` —
        // the class Prov puts on a scoped value, which is what registers it
        // into the card's receipt registry (the inspector then reaches it,
        // asserted separately below).
        hasReceipt: !!el.parentElement?.classList.contains("prov-locate-box"),
      });
    }
    return out;
  });
}

// oklch(L C H) or rgb(r g b) → is this the party pink, not a neutral?
function isPink(color) {
  const ok = color.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (ok) {
    const chroma = Number(ok[2]);
    const hue = Number(ok[3]);
    // Party pink sits either side of the hue origin — Tailwind's pink-600
    // resolves near hue 0.6 in light, pink-400 near 350 in dark. A neutral
    // rb-* token is ~0 chroma, so chroma is what separates them.
    return chroma > 0.08 && (hue > 300 || hue < 30);
  }
  const rgb = (color.match(/\d+/g) || []).map(Number);
  return rgb.length >= 3 && rgb[0] > 140 && rgb[0] - rgb[1] > 40 && rgb[2] - rgb[1] > 20;
}

async function load(page, path) {
  for (let i = 0; i < 3; i++) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    // `networkidle` + a fixed pause is not a load gate: on a slower-hydrating
    // page (measured on ebisu/LBTC) the event-count line renders while the
    // cards are still mounting, so this returned true with zero chips on the
    // page. Wait for a provenance box — the cards themselves — not the count.
    try {
      await page.waitForSelector("span.prov-locate-box", { timeout: 45000 });
    } catch {
      continue;
    }
    await page.waitForTimeout(1500);
    if ((await page.locator("text=/\\d+ events?/i").count()) > 0) return true;
  }
  return false;
}

const browser = await chromium.launch();

console.log("\n════ §1 — chip presence, colour, scope, receipt (1280px) ════");

for (const spec of SPECIMENS) {
  console.log(`\n[${spec.name}]`);
  let rows;
  try {
    rows = await apiRows(spec.api);
  } catch (e) {
    console.log(`  ❌ FAIL: API unreachable (${e.message})`);
    failures++;
    continue;
  }

  // What the scope rule says SHOULD render, straight off the API rows.
  const expected = rows.filter((r) => r.batch_manager && CHIP_EVENTS.has(r.action));
  const suppressed = rows.filter((r) => r.batch_manager && !CHIP_EVENTS.has(r.action));
  const managers = [...new Set(expected.map((r) => r.batch_manager))];
  console.log(
    `    api: ${rows.length} rows · ${expected.length} chip-bearing · ${suppressed.length} manager-carrying but out of scope`,
  );

  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 2000 }, colorScheme: scheme });
    try {
      if (!(await load(page, spec.path))) {
        assert(false, `[${scheme}] page rendered cards`);
        continue;
      }
      const found = await chips(page);
      console.log(`    [${scheme}] chips:`, JSON.stringify(found.slice(0, 4)));

      assert(found.length === expected.length, `[${scheme}] chip count ${found.length} = expected ${expected.length}`);

      // Guard on FOUND, not just expected. `found.every(...)` is vacuously true
      // on an empty array, so gating these on `expected.length` alone let a
      // page that rendered zero chips report five green assertions underneath a
      // single red count. Measured live: the LBTC page did exactly that.
      if (expected.length > 0 && found.length > 0) {
        assert(
          found.every((c) => managers.some((m) => c.text === label(m))),
          `[${scheme}] every chip reads its manager's registry name, else the truncated address (${managers.map(label).join(", ")})`,
        );
        // An unidentified manager must stay an address — never a name the
        // registry cannot source. Named chips must match the registry exactly.
        assert(
          found.every((c) =>
            /^0x[0-9a-f]{4}…[0-9a-f]{4}$/.test(c.text)
              ? managers.some((m) => !NAMES[m.toLowerCase()] && trunc(m) === c.text)
              : Object.values(NAMES).includes(c.text),
          ),
          `[${scheme}] chips are either a registry name or the address of an UNnamed manager`,
        );
        assert(
          found.every((c) => isPink(c.color)),
          `[${scheme}] every chip renders party-pink (${found.map((c) => c.color).join(", ")})`,
        );
        assert(
          found.every((c) => c.visible),
          `[${scheme}] every chip is visible at 1280px`,
        );
        assert(
          found.every((c) => c.hasReceipt),
          `[${scheme}] every chip is a scoped <Prov> value (registers into the card's receipt registry)`,
        );

        // The registry claim, proven end-to-end: arm the page-level provenance
        // inspector (the per-card receipts panel is retired — the inspector
        // popover is THE receipt surface now), pick the chip, and read the
        // batch-manager receipt back off the popover.
        assert(await armInspector(page), `[${scheme}] page mounts the provenance inspector`);
        const chip = page.locator("span.prov-locate-box").filter({ hasText: "delegate" }).first();
        await chip.scrollIntoViewIfNeeded();
        await chip.click();
        await page.waitForTimeout(500);
        const pop = page.locator(".prov-inspect-pop");
        const popText = (await pop.count()) > 0 ? await pop.innerText() : "";
        // What the popover renders is not the vocabulary summary verbatim: the
        // head takes its name clause ("Batch manager at this event") and the
        // embedded receipt renders the REST, capitalised — so a check that
        // pastes a mid-sentence phrase out of the vocabulary misses on the
        // first letter. Read the two surfaces as the popover builds them, and
        // prove the pin is THIS chip's receipt by its manager operand rather
        // than by prose alone.
        assert(
          popText.includes("Batch manager at this event") &&
            popText.includes("handed control of the Trove's interest rate to") &&
            managers.some((m) => popText.toLowerCase().includes(m.toLowerCase())),
          `[${scheme}] picking the chip pins its batch-manager receipt in the inspector popover (chip is not an orphan)`,
        );
        // Escape ladder: first press closes the popover, second disarms — the
        // tool must be down before the runtime-error scan and screenshot below.
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }

      // Scope: the manager-carrying rows outside the rate set must NOT chip —
      // count equality above already proves it, but name it explicitly.
      if (suppressed.length > 0) {
        assert(
          found.length === expected.length,
          `[${scheme}] ${suppressed.length} manager-carrying ${[...new Set(suppressed.map((r) => r.action))].join("/")} row(s) correctly show NO chip`,
        );
      }
      // A liquidation is is_batched=false → no manager → no chip, even on a
      // trove that was batched. The delegate did not liquidate the trove.
      if (rows.some((r) => r.action === "liquidate")) {
        assert(
          rows.filter((r) => r.action === "liquidate").every((r) => !r.batch_manager),
          `[${scheme}] liquidation row carries no manager (correct — the delegate did not liquidate)`,
        );
      }

      assert(
        (await page.locator("text=/Application error|Unhandled Runtime/i").count()) === 0,
        `[${scheme}] no runtime error`,
      );
      await page.screenshot({
        path: `/tmp/delegate-chip-${spec.path.split("/")[1]}-${spec.path.split("/")[3].slice(0, 6)}-${scheme}.png`,
        fullPage: false,
      });
    } finally {
      await page.close();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 — NARROW WIDTHS
//
// The header row already carried a label, two signed deltas and a rate pill;
// the delegate chip makes it the widest that row has ever been. The widths are
// chosen around the 640px (sm) hand-off that `lib/shared/header-values.ts`
// governs: with the default-on "Timeline values" preference, header amounts
// hide at ≥sm so the SpineColumn can carry them. So the CROWDED case is just
// BELOW 640, where the deltas are still inline AND the chip is present — the
// wide case is lighter, not heavier. 600px is therefore the real stress test
// and 640px the control; the assertions below prove the two differ, so a green
// result cannot come from having measured the same layout twice.
//
// Presence proves nothing here — a chip can render and still push the page
// sideways. These are geometry assertions.

const NARROW = [
  { w: 390, label: "390px (phone)" },
  { w: 600, label: "600px (just below the sm hand-off — deltas still inline)" },
  { w: 640, label: "640px (sm — deltas hand off to the spine)" },
];

// The chip-bearing specimens: an openTroveAndJoinBatch row (label + BOTH deltas
// + rate pill + chip = the widest header this grammar can produce) and an
// Asymmetry setInterestBatchManager row.
const NARROW_SPECIMENS = [
  { name: "ebisu WBTC — openTroveAndJoinBatch (widest header)", path: SPECIMENS[0].path },
  { name: "asymmetry ysyBOLD — setInterestBatchManager", path: SPECIMENS[3].path },
];

// Measure the chip's header row: page overflow, the chip's box against its
// row's, clipping, and whether any two children of the row overlap.
async function geometry(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const chip = [...document.querySelectorAll("span")].find((e) => (e.textContent || "").trim() === "delegate");
    if (!chip) return { found: false, pageScroll: de.scrollWidth, pageClient: de.clientWidth };
    const box = chip.parentElement; // the Prov locate-box wrapping prefix + address
    const row = chip.closest("div.flex.flex-wrap");
    const bb = box.getBoundingClientRect();
    const rb = row.getBoundingClientRect();
    // innerText, not textContent: the sm hand-off hides the header deltas with
    // `sm:hidden`, so they stay in the DOM with display:none and textContent
    // would still report them — reading them as "inline" at every width and
    // making the breakpoint assertion below unfalsifiable.
    const kids = [...row.children].map((c) => {
      const r = c.getBoundingClientRect();
      return {
        text: (c.innerText || "").trim().slice(0, 24),
        visible: r.width > 0 && r.height > 0,
        x: r.x,
        right: r.right,
        y: r.y,
        bottom: r.bottom,
      };
    });
    // Two children collide if their boxes intersect on BOTH axes. Wrapped rows
    // sit on different y-bands, so a graceful wrap produces no intersections.
    const collisions = [];
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i];
        const b = kids[j];
        if (a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5)
          collisions.push(`${a.text} × ${b.text}`);
      }
    return {
      found: true,
      pageScroll: de.scrollWidth,
      pageClient: de.clientWidth,
      chip: { x: bb.x, right: bb.right, width: bb.width },
      row: { x: rb.x, right: rb.right, width: rb.width, height: rb.height },
      // A flex row that cannot wrap would squeeze or overflow instead.
      flexWrap: getComputedStyle(row).flexWrap,
      clipped: box.scrollWidth > box.clientWidth + 1,
      collisions,
      // Are the deltas still inline in the header at this width? (the sm
      // hand-off). Two live delta shapes: a signed value child ("+16.84",
      // U+2212 minus included) and the open-row verb chip whose magnitude
      // rides its own second line ("Add\n0.39", "Borrow\n23K") — the
      // magnitude line is what hands off to the spine at ≥sm, so a
      // bare-number line is the test. The rate pill ("4.30%") and the
      // clock ("08:18") both carry trailing glyphs the pattern refuses.
      deltasInline: kids.some((k) => k.visible && /(^|\n)[+−-]?\d[\d,.]*[KMB]?(\n|$)/.test(k.text)),
      rowText: row.innerText.replace(/\n/g, " · ").slice(0, 110),
    };
  });
}

console.log("\n════ §2 — narrow widths: overflow, clipping, collisions ════");

for (const spec of NARROW_SPECIMENS) {
  console.log(`\n[${spec.name}]`);
  const seen = {};
  for (const { w, label } of NARROW) {
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width: w, height: 1600 }, colorScheme: scheme });
      try {
        if (!(await load(page, spec.path))) {
          assert(false, `[${label} ${scheme}] page rendered`);
          continue;
        }
        const g = await geometry(page);
        if (!g.found) {
          assert(false, `[${label} ${scheme}] chip present at this width`);
          continue;
        }
        if (scheme === "light") {
          seen[w] = g;
          console.log(`    ${label}: row h=${Math.round(g.row.height)} · ${g.rowText}`);
        }

        // The headline risk: the page must never scroll sideways.
        assert(
          g.pageScroll <= g.pageClient,
          `[${label} ${scheme}] page does not scroll sideways (scrollWidth ${g.pageScroll} ≤ clientWidth ${g.pageClient})`,
        );
        assert(
          g.chip.right <= g.row.right + 0.5 && g.chip.x >= g.row.x - 0.5,
          `[${label} ${scheme}] chip stays inside its header row (chip ${Math.round(g.chip.x)}–${Math.round(
            g.chip.right,
          )} within row ${Math.round(g.row.x)}–${Math.round(g.row.right)})`,
        );
        assert(!g.clipped, `[${label} ${scheme}] chip text is not clipped (address stays legible)`);
        assert(
          g.collisions.length === 0,
          `[${label} ${scheme}] no two header items overlap${g.collisions.length ? ` — ${g.collisions.join(", ")}` : ""}`,
        );
        assert(
          g.flexWrap === "wrap",
          `[${label} ${scheme}] header row can wrap (flex-wrap: ${g.flexWrap}) — it reflows rather than squeezing`,
        );
        if (scheme === "light")
          await page.screenshot({ path: `/tmp/delegate-chip-narrow-${w}-${spec.path.split("/")[1]}.png` });
      } finally {
        await page.close();
      }
    }
  }

  // Prove the two sides of the sm breakpoint are genuinely different layouts —
  // otherwise a green 600px result might just be the lighter ≥sm layout again.
  if (seen[600] && seen[640]) {
    assert(
      seen[600].deltasInline && !seen[640].deltasInline,
      `the sm hand-off is real: deltas inline at 600px, handed to the spine at 640px (so 600px IS the crowded case)`,
    );
  }
  // And that the crowded width reflows onto more lines rather than compressing.
  if (seen[390] && seen[640]) {
    assert(
      seen[390].row.height > seen[640].row.height,
      `390px wraps onto more lines than 640px (h ${Math.round(seen[390].row.height)} > ${Math.round(
        seen[640].row.height,
      )}) — the row grows downward, never sideways`,
    );
  }
}

await browser.close();
if (failures > 0) {
  console.log(`\n❌ ${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\n✅ all delegate-chip checks passed");
}
