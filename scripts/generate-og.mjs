// ============================================================================
// generate-og — render every share card in public/og/ from the protocol roster
// ============================================================================
//
// Two kinds of card, one renderer:
//
//   • public/og/home.png — the site card. It makes a coverage claim, so the
//     protocol count and the icon row are read straight from
//     `lib/shared/protocols.ts`, the same roster the home directory and the nav
//     dropdown render. (The previous card was a hand-made PNG that named two
//     protocols and stayed untrue for thirteen more.)
//
//   • public/og/explore-<id>.png — one card PER EXPLORER, keyed by the roster
//     `id` (the icon basename). `lib/shared/page-metadata.ts` points every
//     listing and position page at its explorer's card, so a shared Maple
//     position previews as Maple, not as the generic site card. Before this,
//     only Aave V4 and Liquity V2 had cards (hand-drawn), and the other
//     explorers all shared home.png.
//
// The roster is the single input. Add an explorer there, re-run this, and both
// the home card's count and the new explorer's own card exist. The page
// metadata resolves its image from the same roster, so a card that was never
// rendered is a broken <og:image> — `check:og` (below) is the guard.
//
// What no card claims is depth. The explorers do not all go equally deep (see
// `lib/shared/coverage.ts` / /coverage); what IS true of every one of them is
// the foundation, so that is what the home subline states.
//
// Run:   node scripts/generate-og.mjs            (writes all cards)
//        node scripts/generate-og.mjs --check    (exits 1 if a roster card is missing)
// Needs: playwright (devDependency) + network, for the DM Sans webfont.
// ============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OG_DIR = join(ROOT, "public/og");
const HOME_OUT = join(OG_DIR, "home.png");
// Mirrors `protocolShareImage` in lib/shared/page-metadata.ts — the two must agree.
const cardOut = (id) => join(OG_DIR, `explore-${id}.png`);

// ── The roster ───────────────────────────────────────────────────────────────
// Read from the source module rather than re-listed here: this script is a
// renderer, not a second place that decides what Rails covers. The regex wants
// `id: "…"` followed (within the same object literal) by `label: "…"`, which is
// the shape every SPECS entry has (PROTOCOLS is derived from SPECS, so the
// written-down literal is the one to read). A silently-wrong roster is the exact
// failure this script exists to end, so the shape is asserted, not trusted.
function readRoster() {
  const src = readFileSync(join(ROOT, "lib/shared/protocols.ts"), "utf8");
  const start = src.indexOf("const SPECS: ProtocolSpec[] = [");
  const end = src.indexOf("export const PROTOCOLS");
  if (start < 0 || end < 0 || end < start) {
    throw new Error("can't locate the SPECS literal in lib/shared/protocols.ts — has the module been restructured?");
  }
  // A card is words, so a non-Ethereum explorer's says its chain in words
  // ("Aave V3 on Base") the way a tab title does — on screen the chain is a
  // mark beside the label, and a second-chain entry's label is the bare
  // protocol name. The chain's NAME is read from lib/shared/chains.ts rather
  // than restated here, so a third chain (Sepolia) needs no edit in this file.
  const chainNames = readChainNames();
  const entries = [
    ...src.slice(start, end).matchAll(/id:\s*"([^"]+)",[\s\S]*?label:\s*"([^"]+)",[\s\S]*?chainId:\s*(\d+)/g),
  ].map((m) => {
    const chainId = Number(m[3]);
    const chainName = chainNames.get(chainId);
    if (!chainName)
      throw new Error(`roster entry "${m[1]}" is on chain ${chainId}, which lib/shared/chains.ts does not name`);
    return { id: m[1], label: chainId === 1 ? m[2] : `${m[2]} on ${chainName}` };
  });
  if (entries.length < 2) throw new Error("roster parse found <2 protocols — has PROTOCOLS' shape changed?");
  return entries;
}

/** Chain id → display name, read from lib/shared/chains.ts the same way
 *  scripts/check-explorer-routes.mjs reads the slugs. */
function readChainNames() {
  const src = readFileSync(join(ROOT, "lib/shared/chains.ts"), "utf8");
  const body = src.slice(src.indexOf("export const CHAINS"));
  const names = new Map();
  for (const m of body.matchAll(/^ {2}(\d+): \{[\s\S]*?name: "([^"]+)"/gm)) names.set(Number(m[1]), m[2]);
  if (names.size < 2)
    throw new Error("chain parse found <2 chains in lib/shared/chains.ts — has CHAINS' shape changed?");
  return names;
}

// A second-chain roster entry (`aave-v3-base`, `compound-base`, …) has no colour
// PNG of its own — same brand, same mark — so it renders its parent's, the way
// `protocol-glyphs.tsx` aliases the same ids to the parent's glyph.
const iconPath = (id) => {
  const own = join(ROOT, `public/icons/protocols/${id}.png`);
  if (existsSync(own)) return own;
  const parent = join(ROOT, `public/icons/protocols/${id.replace(/-base$/, "")}.png`);
  if (id.endsWith("-base") && existsSync(parent)) return parent;
  throw new Error(`no colour icon for roster id "${id}" at public/icons/protocols/`);
};
const iconDataUri = (id) => `data:image/png;base64,${readFileSync(iconPath(id)).toString("base64")}`;

// ── Monochrome glyphs ────────────────────────────────────────────────────────
// The nav dropdown/sheet, home row and /coverage all render the monochrome
// glyph for a protocol when one exists and fall back to the colour PNG only
// when it doesn't (`hasProtocolGlyph` / `ProtocolIcon` in protocol-glyphs.tsx).
// OG cards now mirror that exact rule, so a share card matches the mark the
// reader sees everywhere else in the product instead of the louder colour logo.
//
// `protocol-glyphs.tsx` is read as text rather than imported: this script runs
// under plain Node with no TSX/JSX transform, and the module's exports are
// React components. Its `GLYPHS` registry, though, is nothing but object/array
// literals with two TS type annotations — so those are stripped and the
// literal is evaluated, the same "read the source, don't re-list it" stance
// as `readRoster()` above.
function readGlyphs() {
  const src = readFileSync(join(ROOT, "components/icons/protocol-glyphs.tsx"), "utf8");
  const start = src.indexOf("const COMPOUND_MARK");
  const end = src.indexOf("export function hasProtocolGlyph");
  if (start < 0 || end < 0 || end < start) {
    throw new Error(
      "can't locate the GLYPHS literal in components/icons/protocol-glyphs.tsx — has the module been restructured?",
    );
  }
  const body = src
    .slice(start, end)
    .replace(/:\s*Glyph\b/g, "")
    .replace(/:\s*Record<string,\s*Glyph>/g, "");
  const glyphs = new Function(`"use strict";\n${body}\nreturn GLYPHS;`)();
  if (!glyphs || Object.keys(glyphs).length < 10) {
    throw new Error("glyph parse produced too few entries — has protocol-glyphs.tsx's GLYPHS shape changed?");
  }
  return glyphs;
}

// Renders a glyph's path/rect geometry as a standalone <svg>. Glyphs normally
// paint `fill="currentColor"` so they inherit surrounding text colour, but a
// screenshot has no surrounding text to inherit — so the fill is fixed to a
// literal instead (ICON_ON_DARK, since these marks sit directly on the dark
// canvas with no tile behind them; see `.tile`/`.mark` below).
// Mirrors `insetTransform` in protocol-glyphs.tsx's ProtocolGlyph: a
// scale-about-centre matrix for `Glyph.inset`, in viewBox space.
function insetTransform(viewBox, inset) {
  const [minX, minY, width, height] = viewBox.split(/\s+/).map(Number);
  const cx = minX + width / 2;
  const cy = minY + height / 2;
  const scale = 1 - inset;
  return `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`;
}

function glyphSvg(glyph, fill) {
  const paths = (glyph.paths ?? [])
    .map(
      (p) =>
        `<path d="${p.d}"${p.fillRule ? ` fill-rule="${p.fillRule}"` : ""}${
          p.opacity !== undefined ? ` opacity="${p.opacity}"` : ""
        } />`,
    )
    .join("");
  const rects = (glyph.rects ?? [])
    .map((r) => `<rect x="${r.x ?? 0}" y="${r.y ?? 0}" width="${r.width}" height="${r.height}" />`)
    .join("");
  const drawn = glyph.transform ? `<g transform="${glyph.transform}">${paths}${rects}</g>` : paths + rects;
  const geometry = glyph.inset ? `<g transform="${insetTransform(glyph.viewBox, glyph.inset)}">${drawn}</g>` : drawn;
  return `<svg class="icon" viewBox="${glyph.viewBox}" fill="${fill}" xmlns="http://www.w3.org/2000/svg">${geometry}</svg>`;
}

// The glyph-or-PNG fallback, mirrored from protocol-glyphs.tsx's ProtocolIcon:
// a card renders whichever mark the rest of the product renders for this id.
const iconMarkup = (id, glyphs, label) =>
  glyphs[id] ? glyphSvg(glyphs[id], ICON_ON_DARK) : `<img class="icon" src="${iconDataUri(id)}" alt="${label}" />`;

// ── The marquee ──────────────────────────────────────────────────────────────
// The roster row stops rendering every logo (19 tiles no longer fits the 1060px
// content column at 56px + 12px gap each) and instead shows a fixed, recognizable
// subset plus a "+N more" chip. This is presentational only — the coverage claim
// is the protocol count in the headline, which stays live off the parsed roster,
// so a curated visual subset doesn't become a second place that decides what
// Rails covers. Distinct brands only: no slot goes to a version pair of the same
// logo (e.g. Aave V3 next to Aave V4) — that would waste marquee space on a
// near-identical mark instead of another brand.
const MARQUEE = [
  "aave-v4",
  "makerdao",
  "spark",
  "morpho",
  "compound",
  "liquity",
  "fluid",
  "maple",
  "llamalend",
  "moonwell",
  "frankencoin",
  "fx",
];

// Truth guard: a renamed or removed id must fail the render, not silently show
// a stale logo. Mirrors readRoster()'s "shape is asserted, not trusted" stance.
function assertMarqueeInRoster(protocols) {
  const ids = new Set(protocols.map((p) => p.id));
  const missing = MARQUEE.filter((id) => !ids.has(id));
  if (missing.length > 0) {
    throw new Error(
      `MARQUEE names id(s) not in the roster: ${missing.join(", ")} — rename or remove it from MARQUEE in scripts/generate-og-home.mjs`,
    );
  }
}

// ── The track-lines graphic ──────────────────────────────────────────────────
// Ported from `components/home/track-lines.tsx` — same path geometry, minus the
// draw-on animation (a still frame has no animation) and with the casing colour
// resolved to a literal: the casing must match the surface behind it so line
// crossings read as gaps, and here that surface is the card itself.
function trackLinesSvg(casing) {
  const group = (colors, d) =>
    colors
      .map(
        (color, i) => `
      <path fill="none" stroke-width="12" stroke-linecap="round" opacity="0.5" stroke="${casing}" d="${d(i)}" />
      <path fill="none" stroke-width="7" stroke-linecap="round" opacity="0.5" stroke="${casing}" d="${d(i)}" />
      <path fill="none" stroke-width="7" stroke-linecap="round" stroke="${color}" d="${d(i)}" />`,
      )
      .join("");

  const blue = (i) => {
    const r = 60 + i * 12;
    return `M0,${222 - r} L565,${222 - r} A${r},${r} 0 0,1 ${565 + r},222 L${565 + r},377`;
  };
  const green = (i) => {
    const r = 60 + i * 12;
    return `M0,${432 - i * 12} L195,${432 - i * 12} A${110 - i * 12},${110 - i * 12} 0 0,0 ${365 - r},322 L${365 - r},297 A${r},${r} 0 0,1 365,${297 - r} L375,${297 - r} A${r},${r} 0 0,1 ${375 + r},297 L${375 + r},537`;
  };
  const red = (i) => {
    const r = 60 + i * 12;
    return `M1400,${252 - i * 12} L815,${252 - i * 12} A${110 - i * 12},${110 - i * 12} 0 0,1 ${645 + r},142 L${645 + r},117 A${r},${r} 0 0,0 645,${117 - r} L635,${117 - r} A${r},${r} 0 0,0 ${635 - r},117 L${635 - r},357`;
  };

  const BLUE = ["#89C7F0", "#4FAEEA", "#4090D1", "#3270B8", "#2F56A8"];
  const GREEN = ["#D5E38D", "#C0D651", "#71A450", "#79A950", "#507D49"];
  const RED = ["#F8D94C", "#EDC64A", "#E0773D", "#D64033", "#A72D22"];

  return `<svg viewBox="0 0 1100 300" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="green-right"><rect x="370" y="0" width="700" height="500" /></clipPath>
      <clipPath id="green-mirror-left"><rect x="0" y="0" width="640" height="500" /></clipPath>
    </defs>
    ${group(BLUE, blue)}
    ${group(GREEN, green)}
    <g clip-path="url(#green-right)">${group(GREEN, green)}</g>
    ${group(RED, red)}
    <g clip-path="url(#green-mirror-left)">${group(RED, red)}</g>
  </svg>`;
}

// ── The card ─────────────────────────────────────────────────────────────────
// Colours are the dark-theme literals from app/globals.css: the canvas is the
// `--background` / rb-800 value the site's own dark theme paints, `--marketing`
// is the single marketing accent hue, and rb-500 dark is the muted text set.
const CANVAS = "rgb(20 22 30)";
const MARKETING = "rgb(50 120 255)";
const MUTED = "rgb(104 119 144)";
// The glyph fill: no tile sits behind a mark any more (see .tile/.mark below),
// so a glyph paints near-white directly on the dark canvas — the same
// currentColor-on-dark look the nav gets in dark mode, fixed to a literal
// since a screenshot has no theme to inherit from.
const ICON_ON_DARK = "rgba(255, 255, 255, 0.92)";

function shellHtml(body) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=block" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: ${CANVAS};
    font-family: "DM Sans", sans-serif;
    color: #fff;
    position: relative;
  }

  /* Track lines — the brand graphic, bottom band, cropped by the card edge
     exactly as it is cropped by its container on the home page. The top fade
     lets it rise behind the subline without colliding with it. */
  .tracks {
    position: absolute; left: 0; right: 0; bottom: -72px; width: 1200px;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 18%);
    mask-image: linear-gradient(to bottom, transparent 0%, black 18%);
  }
  .tracks svg { display: block; width: 1200px; height: auto; }

  .content { position: relative; padding: 56px 70px; }

  header { display: flex; align-items: center; justify-content: space-between; }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo span { font-size: 34px; font-weight: 700; letter-spacing: 0.025em; }
  .domain { font-size: 28px; font-weight: 500; color: ${MUTED}; }

  /* The coverage claim, made visually: every explorer on the roster, one icon
     each. No tile behind it — the mark sits directly on the canvas, the way a
     glyph sits directly on the surface behind it in the nav (no rounded chip,
     no reflection); .tile is a sizing box only, invisible itself. */
  .roster { display: flex; gap: 12px; margin-top: 48px; }
  .tile {
    width: 56px; height: 56px; flex: none;
    display: flex; align-items: center; justify-content: center;
  }
  .tile .icon { width: 100%; height: 100%; object-fit: contain; display: block; }

  /* The "+N more" chip: same geometry as .tile, but a ghost style so it reads
     as a counter, not a logo — the roster row's cap, not another mark. */
  .more {
    width: 56px; height: 56px; border-radius: 13px; flex: none;
    background: transparent;
    border: 1px solid ${MUTED};
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 600; color: ${MUTED};
  }

  h1 { font-size: 46px; font-weight: 700; letter-spacing: -0.02em; margin-top: 40px; }
  h1 em { font-style: normal; color: ${MARKETING}; }
  .sub { font-size: 24px; font-weight: 400; color: ${MUTED}; margin-top: 16px; }

  /* The explorer card: one mark, one name. Same sizing-box-only .tile stance
     as the home roster, scaled up, no frame or reflection under it; the
     headline breaks after the name so "on Rails" always lands on its own
     line and the name never wraps mid-word. */
  .explorer {
    position: absolute; left: 70px; right: 70px; top: 150px;
    display: flex; align-items: center; justify-content: center; gap: 44px;
  }
  .mark {
    width: 128px; height: 128px; flex: none;
    display: flex; align-items: center; justify-content: center;
  }
  .mark .icon { width: 100%; height: 100%; object-fit: contain; display: block; }
  .explorer h1 { margin-top: 0; font-size: 58px; line-height: 1.15; white-space: nowrap; }
</style>
</head>
<body>
  <div class="tracks">${trackLinesSvg(CANVAS)}</div>
  <div class="content">
    <header>
      <div class="logo">
        <svg width="44" height="44" viewBox="0 0 200 200" fill="none">
          <path fill="#fff" fill-opacity="0.85" d="M 79.763 159.671 L 111.637 159.671 L 52.168 41.625 L 20.295 41.625 L 79.763 159.671 Z" />
          <path fill="#fff" fill-opacity="0.85" d="M 98.578 97.056 L 130.451 97.056 L 105.044 47.853 L 73.171 47.853 L 98.578 97.056 Z" />
          <path fill="#fff" d="M 148.892 142.388 L 180.766 142.388 L 155.359 93.185 L 123.486 93.185 L 148.892 142.388 Z" />
        </svg>
        <span>Rails</span>
      </div>
      <div class="domain">rails.finance</div>
    </header>

    ${body}
  </div>
</body>
</html>`;
}

function homeHtml(protocols, glyphs) {
  const byId = new Map(protocols.map((p) => [p.id, p]));
  const shown = MARQUEE.map((id) => byId.get(id));
  const moreCount = protocols.length - shown.length;

  const tiles = (moreCount > 0 ? shown : protocols)
    .map((p) => `<div class="tile" title="${p.label}">${iconMarkup(p.id, glyphs, p.label)}</div>`)
    .join("");
  const chip = moreCount > 0 ? `<div class="more">+${moreCount}</div>` : "";

  return shellHtml(`
    <div class="roster">${tiles + chip}</div>

    <h1>Explore <em>${protocols.length} DeFi protocols</em> on Rails</h1>
    <p class="sub">Every position replayed from the protocol&rsquo;s own on-chain events</p>`);
}

function explorerHtml(p, glyphs) {
  return shellHtml(`
    <div class="explorer">
      <div class="mark">${iconMarkup(p.id, glyphs, p.label)}</div>
      <h1>Explore <em>${p.label}</em><br />on Rails</h1>
    </div>`);
}

// ── Render ───────────────────────────────────────────────────────────────────
const protocols = readRoster();
const glyphs = readGlyphs();
assertMarqueeInRoster(protocols);
console.log(`roster: ${protocols.length} protocols — ${protocols.map((p) => p.label).join(", ")}`);

// `--check`: no rendering, no browser. Every roster entry must already have its
// card on disk, because page metadata will point at it either way.
if (process.argv.includes("--check")) {
  const missing = protocols.filter((p) => !existsSync(cardOut(p.id))).map((p) => p.id);
  if (missing.length > 0) {
    console.error(
      `missing share card(s) for: ${missing.join(", ")} — run \`node scripts/generate-og.mjs\` and commit public/og/`,
    );
    process.exit(1);
  }
  console.log(`ok: ${protocols.length} explorer cards present`);
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

async function render(html, out) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ type: "png" });
  writeFileSync(out, shot);
  console.log(`wrote ${out.slice(ROOT.length + 1)} (${(shot.length / 1024).toFixed(1)} kB)`);
}

await render(homeHtml(protocols, glyphs), HOME_OUT);
for (const p of protocols) await render(explorerHtml(p, glyphs), cardOut(p.id));
await browser.close();
