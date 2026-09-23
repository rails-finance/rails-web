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

const browser = await chromium.launch();

// NB (2026-07-20 polish `a7fee3e`): the chain station copy was generalised and no
// longer interpolates a protocol count, so the old `/coverage` count cross-check
// is gone. `verify-stage-rail-polish.mjs` covers the icons/copy/width in detail;
// this script is the STRUCTURAL verifier (fork geometry, connector paint, mobile
// spine), which the polish pass left unchanged.

async function checkHome(theme) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1400 },
    colorScheme: theme === "dark" ? "dark" : "light",
  });
  await page.emulateMedia({ colorScheme: theme === "dark" ? "dark" : "light" });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  // Force the theme attribute the app uses (html.dark), in case it keys off a stored pref.
  await page.evaluate((t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
  }, theme);
  await page.waitForTimeout(300);

  // Locate the "What Rails Does" section, then the rail's <ol>.
  const h2 = page.getByRole("heading", { name: "What Rails Does" });
  await h2.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  // Locate the rail via its section heading, not a station string — the
  // eyebrows are copy and have churned twice; the heading is stable.
  const ol = page.locator("section", { has: h2 }).locator("ol").first();
  // Station <li>s carry the eyebrow (p.font-semibold); the mobile connector <li>s
  // are decorative (aria-hidden, no eyebrow), so filter them out of the count.
  const stages = ol.locator("> li").filter({ has: page.locator("p.font-semibold") });
  const count = await stages.count();
  assert(count === 5, `rail is a 5-stage <ol> (got ${count})`);

  // Eyebrows present, in pipeline order.
  const eyebrows = await ol.locator("li p.font-semibold").allTextContents();
  const norm = eyebrows.map((s) => s.trim());
  assert(
    JSON.stringify(norm) ===
      JSON.stringify(["Ethereum / Base", "Historic events", "Live state", "Reconciled", "On the page"]),
    "stage eyebrows in pipeline order: " + norm.join(" · "),
  );

  // The Ethereum station reads the newcomer copy, not the old roster line.
  const chainCopy = await ol.locator("li").first().textContent();
  assert(chainCopy.includes("public contracts"), "Ethereum station renders the newcomer chain copy");
  assert(!/\bprotocols'/.test(chainCopy), "no stale roster-count copy on the chain station");

  // The connector IS the design — assert computed style, not mere presence.
  // Grab the desktop overlay's straight-run line div and confirm it paints.
  const railWrap = h2.locator("xpath=following-sibling::*[1]");
  const lineInfo = await page.evaluate(() => {
    // Find a desktop connector line: a thin div inside the aria-hidden lg overlay.
    const overlays = Array.from(document.querySelectorAll('[aria-hidden="true"]'));
    let best = null;
    for (const ov of overlays) {
      if (!ov.className || typeof ov.className !== "string") continue;
      if (!/lg:grid/.test(ov.className)) continue;
      // horizontal line divs: height 1px, visible width, non-transparent bg.
      const lines = Array.from(ov.querySelectorAll("div"));
      for (const d of lines) {
        const r = d.getBoundingClientRect();
        const cs = getComputedStyle(d);
        if (r.height <= 2 && r.width >= 8 && cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
          best = { w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor };
          break;
        }
      }
      if (best) break;
    }
    // Also grab an elbow border colour.
    let elbow = null;
    for (const ov of overlays) {
      if (!/lg:grid/.test(ov.className || "")) continue;
      const cand = Array.from(ov.querySelectorAll("div")).find((d) =>
        /rounded-tl-\[10px\]|rounded-tr-\[10px\]/.test(d.className),
      );
      if (cand) {
        const cs = getComputedStyle(cand);
        elbow = { borderTopColor: cs.borderTopColor, borderTopWidth: cs.borderTopWidth };
        break;
      }
    }
    return { best, elbow };
  });
  assert(lineInfo.best, "desktop connector has a painted horizontal line (computed bg, not transparent)");
  console.log("    line:", JSON.stringify(lineInfo.best), "elbow:", JSON.stringify(lineInfo.elbow));
  assert(
    lineInfo.elbow &&
      parseFloat(lineInfo.elbow.borderTopWidth) >= 1 &&
      lineInfo.elbow.borderTopColor !== "rgba(0, 0, 0, 0)",
    "desktop fork elbow has a painted rounded border",
  );

  // Node knockout halo present (boxShadow using the background var).
  const halo = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll("span:not(.rail-pulse)")).filter((s) =>
      /rounded-full/.test(s.className || ""),
    );
    for (const d of dots) {
      const cs = getComputedStyle(d);
      if (cs.boxShadow && cs.boxShadow !== "none") return cs.boxShadow;
    }
    return null;
  });
  assert(halo, "station node has a knockout halo boxShadow: " + halo);

  await shoot(page, `stage-rail-desktop-${theme}`, {
    fullPage: false,
    clip: await railClip(page, railWrap),
  });

  // Mobile: the fork rotates 90° CW — the two branch cards sit SIDE BY SIDE, and
  // the connector runs top→bottom. The desktop overlay is display:none here, so
  // the only visible rounded dots are the mobile connectors: one where each line
  // ENTERS a station (indexed, live, reconciled, frontend) — the chain is the
  // origin and carries none, so 4 in all.
  await page.setViewportSize({ width: 390, height: 1600 });
  await page.waitForTimeout(300);
  await h2.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const mob = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll("ol span")).filter(
      (s) => /rounded-full/.test(s.className || "") && s.getBoundingClientRect().width > 0,
    );
    const cards = Array.from(document.querySelectorAll("ol > li")).filter((li) => li.querySelector("p.font-semibold"));
    const byName = (n) =>
      cards
        .find((c) => c.querySelector("p.font-semibold").textContent.toLowerCase().includes(n))
        .getBoundingClientRect();
    const idx = byName("historic events");
    const live = byName("live state");
    return { dotCount: dots.length, sameRow: Math.abs(idx.top - live.top) < 4, liveLeft: live.left < idx.left };
  });
  assert(mob.dotCount === 4, `mobile rail shows 4 station dots (got ${mob.dotCount})`);
  assert(mob.sameRow, "mobile fork cards sit side by side (shared row)");
  assert(mob.liveLeft, "mobile fork places Live state left of Historic events (90° CW rotation)");
  await shoot(page, `stage-rail-mobile-${theme}`, {
    fullPage: false,
    clip: await railClip(page, railWrap),
  });

  await page.close();
  console.log(`  [${theme}] PASS`);
}

async function railClip(page, wrap) {
  const box = await wrap.boundingBox();
  if (!box) return undefined;
  const vp = page.viewportSize();
  return {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 40),
    width: Math.min(vp.width, box.width + 16),
    height: Math.min(vp.height, box.height + 120),
  };
}

try {
  await checkHome("light");
  await checkHome("dark");
  console.log("\nALL CHECKS PASSED");
} catch (e) {
  console.error("\n" + e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
