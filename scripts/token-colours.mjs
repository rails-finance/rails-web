// Each token icon's dominant saturated colour, for the vault mock's donuts
// (lib/shared/slice-colours.ts): public/icons/tokens/*.png, keyed as
// lib/shared/local-token-icons.ts keys them (the lowercased file name without
// .png), written to lib/shared/token-colours.json. Near-white, near-black,
// grey and transparent pixels are skipped; an icon whose saturated pixels are
// under a sixth of its opaque ones (a black or white mark) maps to null.
//
//   node scripts/token-colours.mjs
//
// sharp is next's own dependency (not one of this package's): it is resolved
// through next.

import { createRequire } from "node:module";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

const DIR = "public/icons/tokens";
const OUT = "lib/shared/token-colours.json";
/** Pixels that count: alpha at or over this. */
const OPAQUE = 200;
/** OKLCH bounds of a "saturated" pixel. */
const MIN_L = 0.2;
const MAX_L = 0.93;
const MIN_C = 0.06;
/** Under this share of opaque pixels saturated, the mark has no colour. */
const MIN_SATURATED = 1 / 6;
/** Hue bins. */
const BINS = 24;

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toLab(r8, g8, b8) {
  const r = s2l(r8 / 255);
  const g = s2l(g8 / 255);
  const b = s2l(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, l2s(Math.min(1, Math.max(0, c))))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

async function dominant(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let saturatedCount = 0;
  const bins = Array.from({ length: BINS }, () => ({ n: 0, L: 0, a: 0, b: 0 }));
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < OPAQUE) continue;
    opaque++;
    const [L, a, b] = toLab(data[i], data[i + 1], data[i + 2]);
    const C = Math.hypot(a, b);
    if (L < MIN_L || L > MAX_L || C < MIN_C) continue;
    saturatedCount++;
    const h = (Math.atan2(b, a) / (2 * Math.PI) + 1) % 1;
    const bin = bins[Math.floor(h * BINS) % BINS];
    // Weighted by chroma: an icon's anti-aliased edge, paler than its fill,
    // counts for less than the fill.
    bin.n += C;
    bin.L += L * C;
    bin.a += a * C;
    bin.b += b * C;
  }
  if (opaque === 0 || saturatedCount / opaque < MIN_SATURATED) return null;
  // The busiest bin with its two neighbours, so a hue on a bin edge is not split.
  let best = 0;
  let bestN = -1;
  for (let i = 0; i < BINS; i++) {
    const n = bins[(i + BINS - 1) % BINS].n + bins[i].n + bins[(i + 1) % BINS].n;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  }
  const pick = [bins[(best + BINS - 1) % BINS], bins[best], bins[(best + 1) % BINS]];
  const n = pick.reduce((t, x) => t + x.n, 0);
  const sum = (k) => pick.reduce((t, x) => t + x[k], 0) / n;
  return labToHex([sum("L"), sum("a"), sum("b")]);
}

const out = {};
for (const f of readdirSync(DIR).sort()) {
  if (!/\.png$/i.test(f)) continue;
  const key = f.replace(/\.png$/i, "").toLowerCase();
  try {
    out[key] = await dominant(join(DIR, f));
  } catch (e) {
    console.warn(`${f}: ${e.message}`);
    out[key] = null;
  }
}
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
const coloured = Object.values(out).filter(Boolean).length;
console.log(`${OUT}: ${Object.keys(out).length} icons, ${coloured} with a colour`);
