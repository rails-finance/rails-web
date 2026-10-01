#!/usr/bin/env node
// anatomy-shots — the annotated screenshots of the app anatomy key, and its drift check.
// ----------------------------------------------------------------------------
// The key is rails-ops `reference/app-anatomy.md`: a short code for every part
// of the UI (P1 position card, C3 the card's Explanation, T2 an opened event
// card…). Each coded part carries `data-anatomy="<code>"` on its outermost
// element (several codes, space-separated, where one element is two parts: the
// card frame is `P1 C1`). This script opens a list of pages in headless
// Chromium, sets the UI states the key names (card opened, Explanation open,
// an event card opened, the "?" modal, Apply on a day with no events, …),
// outlines every coded element with a badge naming its code, and writes one PNG
// per shot plus `shots.json` (which codes each shot shows).
//
//   BASE=http://localhost:3951 node scripts/anatomy-shots.mjs
//   node scripts/anatomy-shots.mjs --check      # drift check, no browser
//
// Options (env):
//   BASE   the app to shoot (default http://localhost:3931)
//   OUT    where the PNGs go (default ../rails-ops/reference/app-anatomy)
//   KEY    the key file for --check (default ../rails-ops/reference/app-anatomy.md)
//   ONLY   comma-separated shot names, to regenerate a few
//
// Parts that cannot carry the attribute are reached by selector instead
// (FALLBACKS below): the tower files frozen under ui-jobs item 206, a pill each
// protocol renders itself, and the "?" that protocol event cards pass in.
//
// The check (`--check`) lists codes used in the code that the key lacks, and
// key codes that no element or fallback carries (retired codes excepted). It
// exits 1 on any gap. A change that adds, moves, renames or removes a UI part
// updates the key and reruns this script in the same commit.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE ?? "http://localhost:3931").replace(/\/$/, "");
const OUT = resolve(process.env.OUT ?? join(ROOT, "..", "rails-ops", "reference", "app-anatomy"));
const KEY = resolve(process.env.KEY ?? join(ROOT, "..", "rails-ops", "reference", "app-anatomy.md"));
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;

/** A code: region letter, number, dotted sub-parts, optional ·protocol tag. */
const CODE = /\b[A-Z]\d+(?:\.\d+)*(?:·[a-z0-9-]+)?(?![\w.])/g;

/** Parts reached by selector, not by attribute. */
const FALLBACKS = {
  // Each protocol renders its own mode-word pill into OpenPositionStats' status slot.
  C6: '[data-anatomy~="C5"] > span > :first-child:not([data-anatomy])',
  // Protocol event cards pass their own <LearnMore> into the footer.
  T4: '[data-anatomy~="T6"] button[aria-label="Learn more"]',
  // The economics tower: components/shared/chain-truth-tower.tsx, frozen under item 206.
  F15: '[data-skel-section="detail-economics"]:not([data-lifetime-flows-panel])',
};

const REGION_HUE = {
  P: "#f97316",
  C: "#3b82f6",
  F: "#22c55e",
  L: "#eab308",
  T: "#ec4899",
  N: "#06b6d4",
  H: "#a855f7",
  I: "#14b8a6",
  S: "#f43f5e",
};

// ── The drift check ─────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if ([".tsx", ".ts", ".jsx", ".js"].includes(extname(name))) out.push(p);
  }
  return out;
}

/** Codes the code carries: every code-shaped string on a non-comment line that
 *  sets `data-anatomy`, an `anatomy` prop, or an anatomy object. */
function codesInCode() {
  const found = new Map();
  for (const dir of ["app", "components", "lib"]) {
    for (const file of walk(join(ROOT, dir))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return;
        if (!/anatomy/i.test(line)) return;
        for (const m of line.matchAll(CODE)) {
          if (!found.has(m[0])) found.set(m[0], `${file.slice(ROOT.length + 1)}:${i + 1}`);
        }
      });
    }
  }
  for (const code of Object.keys(FALLBACKS))
    if (!found.has(code)) found.set(code, "scripts/anatomy-shots.mjs (selector)");
  return found;
}

/** The key's codes: the first cell of each table row, in backticks. */
function codesInKey() {
  const rows = new Map();
  for (const line of readFileSync(KEY, "utf8").split("\n")) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    rows.set(m[1], { retired: /retired/i.test(cells[cells.length - 1] ?? "") });
  }
  return rows;
}

function check() {
  if (!existsSync(KEY)) {
    console.error(`No key at ${KEY} (set KEY=…).`);
    process.exit(2);
  }
  const code = codesInCode();
  const key = codesInKey();
  const notInKey = [...code.keys()].filter((c) => !key.has(c)).sort();
  const notInCode = [...key.entries()]
    .filter(([c, r]) => !r.retired && !code.has(c))
    .map(([c]) => c)
    .sort();
  const retiredInCode = [...key.entries()]
    .filter(([c, r]) => r.retired && code.has(c))
    .map(([c]) => c)
    .sort();
  console.log(`anatomy: ${code.size} codes in the code, ${key.size} rows in the key (${KEY})`);
  for (const c of notInKey) console.log(`  in the code, missing from the key: ${c}  (${code.get(c)})`);
  for (const c of notInCode) console.log(`  in the key, missing from the code: ${c}`);
  for (const c of retiredInCode) console.log(`  retired in the key, still in the code: ${c}  (${code.get(c)})`);
  const gaps = notInKey.length + notInCode.length + retiredInCode.length;
  console.log(gaps === 0 ? "anatomy: no drift" : `anatomy: ${gaps} gap(s)`);
  process.exit(gaps === 0 ? 0 : 1);
}

if (process.argv.includes("--check")) check();

// ── The shots ───────────────────────────────────────────────────────────────

const AAVE = "/ethereum/aave-v3/0xfb9395e0b216823c9a60d5dfcb8c6ef458232a71";
const TROVE =
  "/ethereum/liquity-v2/trove/WETH/22412517865912344610666591322850826630726594253808037974356128721405243892759";

const sel = (code) => `[data-anatomy~="${code}"]`;
const DIALOG = '[role="dialog"][aria-modal="true"]';

/** Wait for a selector to be visible, quietly: a state a page cannot reach is
 *  left out of the shot, never a failure of the run. */
async function seen(page, selector, timeout = 30000) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

async function click(page, selector) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click({ timeout: 10000 });
  await page.waitForTimeout(400);
}

const openCard = async (page) => {
  if (await seen(page, `${sel("P1")}${sel("C1")}`, 5000)) await click(page, `${sel("P1")} ${sel("C9")}`);
};
const openCardExplanation = async (page) => {
  await openCard(page);
  await click(page, `${sel("P1")} button${sel("C3")}`);
};
const openFlowsExplanation = async (page) => {
  await click(page, `${sel("P2")} button${sel("F8")}`);
};
/** The first event card with a detail to open: opened, and its Explanation open. */
const openEvent = async (page) => {
  // Pressed at its left end: the day mark and chevron on the right stop the press.
  const header = page.locator(`${sel("P3")} ${sel("T1")} [role="button"]`).first();
  await header.scrollIntoViewIfNeeded();
  await header.click({ position: { x: 12, y: 12 } });
  await seen(page, sel("T2"));
  if (await seen(page, `${sel("T2")} button${sel("T3")}`, 5000)) await click(page, `${sel("T2")} button${sel("T3")}`);
};
/** Open a "?" and give the modal the trigger's code where it has none. */
const openModal = (code, scope) => async (page) => {
  const trigger = FALLBACKS[code]
    ? `${scope} ${FALLBACKS[code]}`
    : `${scope} ${sel(code)} button[aria-label="Learn more"]`;
  await click(page, trigger);
  await seen(page, DIALOG);
  await page.evaluate(
    ([c, d]) => {
      const el = document.querySelector(d);
      if (el && !el.hasAttribute("data-anatomy")) el.setAttribute("data-anatomy", c);
    },
    [code, DIALOG],
  );
};
/** Freeze the flows cursor on a day with no events and press Apply: the
 *  timeline opens with the state card (L4). Tries points along the line until
 *  one lands on such a day. */
const applyNoEventDay = async (page) => {
  const strip = page.locator(sel("F4")).first();
  await strip.scrollIntoViewIfNeeded();
  const box = await strip.boundingBox();
  if (!box) return;
  for (const f of [0.35, 0.5, 0.62, 0.2, 0.75, 0.42, 0.28, 0.55, 0.68, 0.15]) {
    await page.mouse.click(box.x + box.width * f, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const apply = page.locator(`${sel("F6")}:not([disabled])`).first();
    if (!(await apply.count())) continue;
    await apply.click();
    await page.waitForTimeout(1200);
    if (await page.locator(sel("L4")).count()) return;
  }
};
const openDates = async (page) => {
  await click(page, sel("L1.7"));
  await seen(page, sel("L1.8"), 10000);
};

/**
 * One entry per shot. `codes` names the region prefixes (or codes) annotated;
 * `crop` the codes whose union, padded, is the image (absent: the viewport top).
 */
const SHOTS = [
  { name: "detail-top", path: AAVE, widths: [1280, 390], codes: ["H", "P1", "C"], crop: ["H3", "H7", "P1"] },
  {
    name: "card-opened",
    path: AAVE,
    widths: [1280, 390],
    codes: ["C"],
    crop: ["P1"],
    setup: openCardExplanation,
  },
  {
    name: "card-modal",
    path: AAVE,
    widths: [1280],
    codes: ["C4"],
    crop: [DIALOG],
    viewportOnly: true,
    setup: async (page) => {
      await openCardExplanation(page);
      await openModal("C4", sel("P1"))(page);
    },
  },
  { name: "flows", path: AAVE, widths: [1280, 390], codes: ["P2", "F"], crop: ["P2"] },
  {
    name: "flows-explained",
    path: AAVE,
    widths: [1280],
    codes: ["F"],
    crop: ["P2"],
    setup: openFlowsExplanation,
  },
  { name: "timeline", path: AAVE, widths: [1280, 390], codes: ["P3", "L", "T"], crop: ["L1"], cropBelow: 520 },
  {
    name: "event-opened",
    path: AAVE,
    widths: [1280, 390],
    codes: ["T", "L3"],
    crop: ['[data-skel-section="detail-event"]:has([data-anatomy~="T2"])'],
    setup: openEvent,
  },
  {
    name: "event-modal",
    path: AAVE,
    widths: [1280],
    codes: ["T4"],
    crop: [DIALOG],
    viewportOnly: true,
    setup: async (page) => {
      await openEvent(page);
      await openModal("T4", sel("T2"))(page);
    },
  },
  { name: "timeline-dates", path: AAVE, widths: [1280], codes: ["L1"], crop: ["L1"], setup: openDates },
  {
    name: "apply-state-card",
    path: AAVE,
    widths: [1280],
    codes: ["F6", "L2", "L4", "L3"],
    crop: ["F6", "L4"],
    setup: applyNoEventDay,
  },
  { name: "trove-top", path: TROVE, widths: [1280, 390], codes: ["P1", "C"], crop: ["P1"] },
  {
    name: "trove-card-opened",
    path: TROVE,
    widths: [1280, 390],
    codes: ["C"],
    crop: ["P1"],
    setup: openCardExplanation,
  },
  {
    name: "trove-flows",
    path: TROVE,
    widths: [1280],
    codes: ["F"],
    crop: ["P2"],
    setup: openFlowsExplanation,
  },
  { name: "trove-timeline", path: TROVE, widths: [1280, 390], codes: ["L", "T"], crop: ["L1"], cropBelow: 640 },
  { name: "listing", path: "/ethereum/aave-v3", widths: [1280, 390], codes: ["H", "N", "C"], cropTop: 900 },
  { name: "listing-foot", path: "/ethereum/aave-v3", widths: [1280], codes: ["N3", "H8"], crop: ["N3", "H8"] },
  { name: "info", path: "/ethereum/liquity-v2/info", widths: [1280, 390], codes: ["H", "I"], cropTop: 760 },
  { name: "home", path: "/", widths: [1280, 390], codes: ["S", "H"], full: true },
  {
    // Morpho's tower went with its Lifetime flows panel (1 Oct 2026), and
    // Fluid's token-pair positions' with theirs; a smart-vault position still
    // draws one.
    name: "fluid-tower",
    path: "/ethereum/fluid/2397",
    widths: [1280],
    codes: ["F15"],
    crop: ["F15"],
  },
];

/** Outline and badge every coded element the shot names. Runs in the page. */
function annotate({ want, fallbacks, hues }) {
  document.querySelectorAll("[data-anatomy-overlay]").forEach((n) => n.remove());
  const wanted = (code) => want.some((w) => code === w || (w.length === 1 ? code[0] === w : code.startsWith(`${w}.`)));
  const tagged = new Map();
  const add = (code, el) => {
    if (!tagged.has(code)) tagged.set(code, []);
    if (!tagged.get(code).includes(el)) tagged.get(code).push(el);
  };
  for (const el of document.querySelectorAll("[data-anatomy]")) {
    for (const code of el.getAttribute("data-anatomy").split(/\s+/)) if (code && wanted(code)) add(code, el);
  }
  for (const [code, s] of Object.entries(fallbacks))
    if (wanted(code)) document.querySelectorAll(s).forEach((el) => add(code, el));

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  const fixedOf = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement)
      if (getComputedStyle(n).position === "fixed") return true;
    return false;
  };
  const taggedAncestor = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) if (n.hasAttribute("data-anatomy")) return n;
    return null;
  };
  const layer = document.createElement("div");
  layer.setAttribute("data-anatomy-overlay", "");
  layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none";
  document.body.appendChild(layer);
  const fixedLayer = layer.cloneNode();
  fixedLayer.style.position = "fixed";
  document.body.appendChild(fixedLayer);
  // Badges ride their own layers, above every outline.
  const badgeLayer = layer.cloneNode();
  document.body.appendChild(badgeLayer);
  const fixedBadgeLayer = fixedLayer.cloneNode();
  document.body.appendChild(fixedBadgeLayer);

  const placed = [];
  const shown = [];
  const sx = window.scrollX;
  const sy = window.scrollY;
  // Outer parts first, so an inner part's badge lands beside its parent's.
  const order = [...tagged.keys()].sort(
    (a, b) => a.split(".").length - b.split(".").length || a.localeCompare(b, "en", { numeric: true }),
  );
  for (const code of order) {
    // An open modal's instance leads: it is what a modal shot is of.
    const els = tagged
      .get(code)
      .filter(visible)
      .sort((a, b) => Number(!!b.closest('[role="dialog"]')) - Number(!!a.closest('[role="dialog"]')));
    if (!els.length) continue;
    // The first instance, and a sibling instance under the same tagged parent
    // (the Explanation's button and pane), at most two: a part on every row
    // is marked once.
    const home = taggedAncestor(els[0]);
    const group = els.filter((el, i) => i === 0 || taggedAncestor(el) === home).slice(0, 2);
    const hue = hues[code[0]] ?? "#f5f5f5";
    group.forEach((el, i) => {
      const fixed = fixedOf(el);
      const r = el.getBoundingClientRect();
      const x = r.left + (fixed ? 0 : sx);
      const y = r.top + (fixed ? 0 : sy);
      const box = document.createElement("div");
      box.style.cssText = `position:absolute;left:${x - 2}px;top:${y - 2}px;width:${r.width + 4}px;height:${r.height + 4}px;border:2px solid ${hue};border-radius:6px;box-sizing:border-box`;
      (fixed ? fixedLayer : layer).appendChild(box);
      if (i > 0) return;
      const badge = document.createElement("div");
      badge.textContent = code;
      badge.style.cssText = `position:absolute;font:700 11px/16px ui-monospace,SFMono-Regular,Menlo,monospace;padding:0 5px;border-radius:4px;background:${hue};color:#0b0d12;white-space:nowrap;box-shadow:0 0 0 1.5px #0b0d12`;
      (fixed ? fixedBadgeLayer : badgeLayer).appendChild(badge);
      const w = badge.offsetWidth;
      const h = 16;
      let bx = Math.max(x - 4, 0);
      let by = Math.max(y - 9, 0);
      for (let k = 0; k < 40; k++) {
        const hit = placed.find(
          (p) => p.fixed === fixed && bx < p.x + p.w + 2 && bx + w + 2 > p.x && by < p.y + p.h && by + h > p.y,
        );
        if (!hit) break;
        bx = hit.x + hit.w + 3;
        if (bx + w > document.documentElement.scrollWidth - 2) {
          bx = Math.max(x - 4, 0);
          by += h + 2;
        }
      }
      badge.style.left = `${bx}px`;
      badge.style.top = `${by}px`;
      placed.push({ x: bx, y: by, w, h, fixed });
      shown.push({ code, x, y, w: r.width, h: r.height });
    });
  }
  return shown;
}

/** The padded union of the named codes' rects (a raw selector where the entry
 *  starts with "["), in page coordinates, or viewport ones for a viewport shot. */
function cropBox({ codes, fallbacks, pad, above, below, viewport }) {
  let box = null;
  const ox = viewport ? 0 : scrollX;
  const oy = viewport ? 0 : scrollY;
  for (const code of codes) {
    const s = code.startsWith("[") ? code : (fallbacks[code] ?? `[data-anatomy~="${code}"]`);
    const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().height > 1);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const b = { x0: r.left + ox, y0: r.top + oy, x1: r.right + ox, y1: r.bottom + oy };
    box = box
      ? {
          x0: Math.min(box.x0, b.x0),
          y0: Math.min(box.y0, b.y0),
          x1: Math.max(box.x1, b.x1),
          y1: Math.max(box.y1, b.y1),
        }
      : b;
  }
  if (!box) return null;
  const W = viewport ? innerWidth : document.documentElement.scrollWidth;
  const H = viewport ? innerHeight : document.documentElement.scrollHeight;
  const x = Math.max(0, box.x0 - pad);
  const y = Math.max(0, box.y0 - pad - (above ?? 0));
  const bottom = below != null ? box.y1 + below : box.y1 + pad;
  return { x, y, width: Math.min(W, box.x1 + pad) - x, height: Math.min(H, bottom) - y };
}

async function shoot() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    ({ chromium } = await import("/Users/r4/Documents/Repos/rails-web-review/node_modules/playwright/index.mjs"));
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const manifest = [];
  const resolved = new Map();
  for (const shot of SHOTS) {
    if (ONLY && !ONLY.has(shot.name)) continue;
    for (const width of shot.widths) {
      const ctx = await browser.newContext({
        viewport: { width, height: width < 640 ? 844 : 900 },
        colorScheme: "dark",
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" && /hydrat/i.test(m.text())) errors.push(m.text().slice(0, 200));
      });
      let path = shot.path;
      if (shot.resolve) {
        if (!resolved.has(shot.name)) {
          await page.goto(BASE + shot.path, { waitUntil: "networkidle", timeout: 180000 }).catch(() => {});
          await seen(page, sel("N2"), 60000);
          resolved.set(shot.name, await shot.resolve(page));
        }
        path = resolved.get(shot.name);
        if (!path) {
          console.log(`${shot.name}@${width}: nothing to open`);
          await ctx.close();
          continue;
        }
      }
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 180000 }).catch(() => {});
      await page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" });
      // The page's three sections, or the listing's rows, are what "loaded" means.
      await seen(page, [sel("P3"), sel("N2"), sel("I1"), sel("S1"), sel("F15")].join(", "), 120000);
      if (path.includes("/aave-v3/0x") || path.includes("/trove/")) await seen(page, sel("F4"), 60000);
      await page.waitForTimeout(1500);
      try {
        if (shot.setup) await shot.setup(page);
      } catch (e) {
        console.log(`${shot.name}@${width}: setup stopped: ${e.message.split("\n")[0]}`);
      }
      await page.waitForTimeout(600);
      // A full-page shot is taken from the top, so the fixed parts (the brand
      // rail) and the page agree on where they are.
      if (!shot.viewportOnly) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
      }
      const shown = await page.evaluate(annotate, { want: shot.codes, fallbacks: FALLBACKS, hues: REGION_HUE });
      let clip = null;
      if (shot.crop) {
        clip = await page.evaluate(cropBox, {
          codes: shot.crop,
          fallbacks: FALLBACKS,
          pad: 14,
          above: shot.cropAbove,
          below: shot.cropBelow,
          viewport: !!shot.viewportOnly,
        });
        // A state the page did not reach: the top of the page, not all of it.
        if (!clip && !shot.viewportOnly) clip = { x: 0, y: 0, width, height: 900 };
      } else if (shot.cropTop) {
        clip = { x: 0, y: 0, width, height: shot.cropTop };
      }
      const file = `${shot.name}-${width}.png`;
      await page.screenshot({ path: join(OUT, file), fullPage: !shot.viewportOnly, ...(clip ? { clip } : {}) });
      // The codes the image shows: a part whose box meets the crop.
      const inClip = (b) =>
        !clip || (b.x < clip.x + clip.width && b.x + b.w > clip.x && b.y < clip.y + clip.height && b.y + b.h > clip.y);
      const codes = [...new Set(shown.filter(inClip).map((b) => b.code))];
      manifest.push({ shot: shot.name, width, file, path, codes });
      console.log(`${file}: ${codes.join(" ")}${errors.length ? `  [errors: ${errors.join(" | ")}]` : ""}`);
      await ctx.close();
    }
  }
  await browser.close();
  // A partial run (ONLY) keeps the other shots' entries.
  const manifestFile = join(OUT, "shots.json");
  const kept =
    ONLY && existsSync(manifestFile)
      ? JSON.parse(readFileSync(manifestFile, "utf8")).filter((m) => !ONLY.has(m.shot))
      : [];
  writeFileSync(manifestFile, JSON.stringify([...kept, ...manifest], null, 2) + "\n");
  // Palette PNGs are a third the size; PIL does it where it is installed. Only
  // this run's files: OUT may hold others'.
  try {
    execFileSync(
      "python3",
      [
        "-c",
        "import sys\nfrom PIL import Image\nfor f in sys.argv[1:]:\n  im=Image.open(f).convert('RGB')\n  im.quantize(colors=128,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).save(f,optimize=True)",
        ...manifest.map((m) => join(OUT, m.file)),
      ],
      { stdio: "ignore" },
    );
  } catch {
    console.log("(PNGs left uncompressed: python3 with PIL not found)");
  }
}

await shoot();
