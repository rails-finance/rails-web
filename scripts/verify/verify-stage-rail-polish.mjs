import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
// Screenshots are a debugging aid, not an assertion. They used to hard-code an
// absolute path into one long-dead session's scratchpad directory, which throws
// ENOENT anywhere else — and here the throw landed in the catch that sets a
// failing exit code, so decoration could sink the verdict. Opt in with
// SHOT=/some/dir/name.png; each shot appends its own suffix.
async function shoot(target, suffix, opts) {
  if (!process.env.SHOT) return;
  const path = process.env.SHOT.replace(/(\.png)?$/i, `-${suffix}.png`);
  try {
    await target.screenshot({ path, ...opts });
  } catch (e) {
    console.log("  (screenshot skipped:", e.message, ")");
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ok:", msg);
}

const EXPECT_COPY = [
  "DeFi protocols run here as public contracts. Every deposit, loan and repayment is on the record.",
  "Rails reads every event in order and explains each in plain English.",
  "Rails asks those same contracts what the position holds and owes today.",
  "Lifetime totals are checked against live state. Anything that doesn’t reconcile is left out rather than guessed.",
  "Every figure shows its source, so you can check it on a block explorer that isn’t ours.",
];
const EXPECT_EYEBROWS = ["Ethereum / Base", "Historic events", "Live state", "Reconciled", "On the page"];
// lucide adds a `lucide-<kebab>` class to the rendered <svg>.
const EXPECT_ICONS = ["lucide-box", "lucide-history", "lucide-radio", "lucide-circle-check", "lucide-layout-grid"];

const browser = await chromium.launch();

async function check(theme) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 }, colorScheme: theme });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), theme);
  await page.waitForTimeout(300);

  const h2 = page.getByRole("heading", { name: "What Rails Does" });
  await h2.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  // Locate the rail via its section heading, not a station string — the
  // eyebrows are copy and have churned twice; the heading is stable.
  const ol = page.locator("section", { has: h2 }).locator("ol").first();
  // Station <li>s carry an eyebrow; the mobile connector <li>s are decorative.
  const stages = ol.locator("> li").filter({ has: page.locator("p.font-semibold") });
  assert((await stages.count()) === 5, "rail still a 5-stage <ol>");

  // Eyebrows (uppercase via CSS; DOM text is the raw string).
  const eyebrows = (await ol.locator("li p.font-semibold").allTextContents()).map((s) => s.trim());
  assert(JSON.stringify(eyebrows) === JSON.stringify(EXPECT_EYEBROWS), "eyebrows: " + eyebrows.join(" · "));

  // Copy strings, per station body.
  const bodies = (await ol.locator("li p.body-text").allTextContents()).map((s) => s.replace(/\s+/g, " ").trim());
  for (let i = 0; i < EXPECT_COPY.length; i++) {
    assert(bodies[i] === EXPECT_COPY[i], `station ${i + 1} copy exact`);
  }
  assert(!bodies.join(" ").includes("19 protocols"), "no stale protocol-count copy");
  assert(!bodies.join(" ").includes("or contract read"), "no stale 'or contract read' tail");

  // Vertical rhythm: every station card renders the SAME height, so the fork
  // column's pair and the three single cards align top and bottom rather than
  // merely sharing a centre line. The lg:min-h-[184px] floor holds five lines
  // of body copy in a 1fr column at the 1280 cap; copy that wraps to six
  // overflows it and the rail goes ragged. This is the assertion that catches
  // that — copy edits are exactly what breaks it.
  const cardHeights = await ol.evaluate((el) =>
    Array.from(el.querySelectorAll("li > div.rounded-xl")).map((d) => Math.round(d.getBoundingClientRect().height)),
  );
  assert(cardHeights.length === 5, `five station cards measured (got ${cardHeights.length})`);
  assert(new Set(cardHeights).size === 1, "all station cards share one height: " + cardHeights.join(" · "));

  // Connector alignment — the whole point of the rail is that the line meets the
  // card it joins. Two things have broken this before: the overlay being sized
  // to a wrapper that also held the footer (it drew ~38px low), and the arms
  // using 25%/75% while the <ol> carries a 24px row gap (6px low). Assert the
  // overlay box matches the <ol> box, then that every horizontal run's centre
  // lands on a card centre.
  const align = await page.evaluate(() => {
    const ol = Array.from(document.querySelectorAll("ol")).find((o) => /Historic events/.test(o.textContent));
    const ov = Array.from(document.querySelectorAll('[aria-hidden="true"]')).find(
      (o) => typeof o.className === "string" && /lg:grid/.test(o.className),
    );
    const r = (el) => el.getBoundingClientRect();
    const centres = Array.from(ol.querySelectorAll("li > div.rounded-xl")).map((d) =>
      Math.round(r(d).top + r(d).height / 2),
    );
    const runs = Array.from(ov.querySelectorAll("div"))
      .filter((d) => r(d).height <= 2 && r(d).width >= 8)
      .map((d) => Math.round(r(d).top));
    return {
      olH: Math.round(r(ol).height),
      ovH: Math.round(r(ov).height),
      orphans: runs.filter((y) => !centres.some((c) => Math.abs(c - y) <= 1)),
    };
  });
  assert(align.olH === align.ovH, `connector overlay is the rail's height (ol ${align.olH} / overlay ${align.ovH})`);
  assert(align.orphans.length === 0, "every connector run meets a card centre; strays at: " + align.orphans.join(", "));

  // Icons — each expected lucide class present inside the rail.
  const iconClasses = await ol.evaluate((el) =>
    Array.from(el.querySelectorAll("li > div svg")).map((s) => s.getAttribute("class") || ""),
  );
  for (const want of EXPECT_ICONS) {
    assert(
      iconClasses.some((c) => c.split(/\s+/).includes(want)),
      `icon ${want} rendered`,
    );
  }
  // The old icons must be gone.
  for (const gone of [
    "lucide-database",
    "lucide-git-merge",
    "lucide-list-check",
    "lucide-boxes",
    "lucide-radio-tower",
    "lucide-receipt",
  ]) {
    assert(!iconClasses.some((c) => c.split(/\s+/).includes(gone)), `old icon ${gone} removed`);
  }

  // Width: the What-Rails-Does <section> now matches the persona band width.
  const widths = await page.evaluate(() => {
    const bandH2 = Array.from(document.querySelectorAll("h2")).find((h) => /DeFi/.test(h.textContent || ""));
    const railH2 = Array.from(document.querySelectorAll("h2")).find(
      (h) => (h.textContent || "").trim() === "What Rails Does",
    );
    // persona band inner container = the h2's grandparent (div.max-w-7xl)
    const persona = bandH2?.closest("div.max-w-7xl") || bandH2?.parentElement?.parentElement;
    const railSection = railH2?.closest("section");
    return {
      persona: persona ? Math.round(persona.getBoundingClientRect().width) : null,
      rail: railSection ? Math.round(railSection.getBoundingClientRect().width) : null,
      railClass: railSection ? railSection.className : null,
    };
  });
  console.log("    widths:", JSON.stringify(widths));
  assert(widths.railClass && /max-w-7xl/.test(widths.railClass), "rail section is max-w-7xl");
  assert(
    widths.persona && widths.rail && Math.abs(widths.persona - widths.rail) <= 2,
    "rail width == persona band width",
  );

  // Connectors still paint (fork intact) — spot-check one horizontal line.
  const linePaints = await page.evaluate(() => {
    const ov = Array.from(document.querySelectorAll('[aria-hidden="true"]')).find((o) =>
      /lg:grid/.test(o.className || ""),
    );
    if (!ov) return false;
    return Array.from(ov.querySelectorAll("div")).some((d) => {
      const r = d.getBoundingClientRect();
      return r.height <= 2 && r.width >= 8 && getComputedStyle(d).backgroundColor !== "rgba(0, 0, 0, 0)";
    });
  });
  assert(linePaints, "desktop connector still paints");

  await shoot(page, `polish-desktop-${theme}`, { clip: await clip(page, h2) });

  // Mobile
  await page.setViewportSize({ width: 390, height: 1700 });
  await page.waitForTimeout(300);
  await h2.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shoot(page, `polish-mobile-${theme}`, { clip: await clip(page, h2) });

  await page.close();
  console.log(`  [${theme}] PASS`);
}

async function clip(page, h2) {
  const box = await h2.boundingBox();
  const vp = page.viewportSize();
  return { x: 0, y: Math.max(0, box.y - 24), width: vp.width, height: Math.min(vp.height, 1000) };
}

try {
  await check("light");
  await check("dark");
  console.log("\nALL CHECKS PASSED");
} catch (e) {
  console.error("\n" + e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
