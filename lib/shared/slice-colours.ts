// The colours of a share chart's slices (a MetaMorpho vault page's holders, a
// components/shared/asset-donut.tsx `ShareDonut`, and its markets, a
// components/shared/segment-bar.tsx `SegmentBar`).
//
// - Holders: the categorical palette in order, largest first.
// - Assets: each slice its token's colour (lib/shared/token-colours.ts),
//   brought into the palette's lightness band per theme. A slice whose colour
//   sits within COLLISION_DELTA_E of one already given, or whose token has no
//   colour, takes the next unused palette colour that clears every colour
//   given. A second slice of the same token keeps its hue a lightness step
//   away.
// - The merged rest ("others") is the breakdown's neutral grey.
//
// The palette is the dataviz skill's categorical set without its red and
// green (up/down), with a teal for its aqua (a sea green) and a brown and a
// plum added, ordered by enumeration through the skill's validator: every
// adjacent pair clears CVD ΔE 15 and normal-vision ΔE 19 on this site's
// light (#ffffff) and dark (#171b24) grounds. Yellow and magenta sit under
// 3:1 on white; every slice is named in the table beside it.
//
// A colour is a CSS `light-dark()` of its two theme values (the page sets
// `color-scheme` per theme). Imports nothing through `@/` (npm test).

export interface ThemePair {
  light: string;
  dark: string;
}

export const PALETTE: readonly ThemePair[] = [
  { light: "#2a78d6", dark: "#3987e5" }, // blue
  { light: "#eb6834", dark: "#d95926" }, // orange
  { light: "#1a9fa8", dark: "#1a9aa3" }, // teal
  { light: "#eda100", dark: "#c98500" }, // yellow
  { light: "#a24ea8", dark: "#b665bb" }, // plum
  { light: "#a0652a", dark: "#b07434" }, // brown
  { light: "#6250d6", dark: "#9085e9" }, // violet
  { light: "#e87ba4", dark: "#d55181" }, // magenta
];

/** The merged rest: asset-donut.tsx's "Other" grey. */
export const OTHER_COLOUR = "var(--donut-other, var(--color-rb-400))";

/** Two colours closer than this (OKLab ΔE ×100, the nearer of the two
 *  themes) are too close to share a donut: the dataviz normal-vision floor. */
export const COLLISION_DELTA_E = 15;

/** A same-token sibling's lightness step (OKLCH L), and the least ΔE it
 *  must keep from its sibling (the dataviz CVD target). */
export const SIBLING_STEP = 0.12;
export const SIBLING_DELTA_E = 8;

/** The lightness band a token colour is brought into, per theme (OKLCH L):
 *  the dataviz bands, the dark one raised to clear 3:1 on the dark ground. */
const BAND = { light: [0.5, 0.72], dark: [0.56, 0.7] } as const;
/** Under this chroma a hue reads as grey. */
const CHROMA_FLOOR = 0.1;

export const cssOf = (p: ThemePair) => `light-dark(${p.light}, ${p.dark})`;

// -- OKLab ----------------------------------------------------------------------

type Lab = [number, number, number];

const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToLab(hex: string): Lab {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => s2l(parseInt(h.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToRgb([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

function lchToHex(L: number, C: number, h: number): string {
  // Chroma down until the colour is in sRGB.
  let c = C;
  let rgb = labToRgb([L, c * Math.cos(h), c * Math.sin(h)]);
  while (!inGamut(rgb) && c > 0) {
    c = Math.max(0, c - 0.004);
    rgb = labToRgb([L, c * Math.cos(h), c * Math.sin(h)]);
  }
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, l2s(Math.min(1, Math.max(0, v))))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** OKLab ΔE ×100. */
export const deltaE = (x: string, y: string) => {
  const [a, b] = [hexToLab(x), hexToLab(y)];
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

/** Of two theme pairs, the nearer theme's ΔE. */
const pairDelta = (x: ThemePair, y: ThemePair) => Math.min(deltaE(x.light, y.light), deltaE(x.dark, y.dark));

/** A token colour in each theme's band, `step` lightness away (clamped). */
export function inBand(hex: string, step = 0): ThemePair {
  const [L, a, b] = hexToLab(hex);
  const C = Math.max(CHROMA_FLOOR, Math.hypot(a, b));
  const h = Math.atan2(b, a);
  const at = (mode: "light" | "dark") => {
    const [lo, hi] = BAND[mode];
    const base = Math.min(hi, Math.max(lo, L));
    // A step that would leave the band goes the other way.
    let l = base + step;
    if (l > hi || l < lo) l = base - step;
    return lchToHex(Math.min(hi, Math.max(lo, l)), C, h);
  };
  return { light: at("light"), dark: at("dark") };
}

// -- assignment -----------------------------------------------------------------

/** A slice to colour, largest first. */
export interface ColourSlice {
  /** The merged rest: grey. */
  rest?: boolean;
  /** The token's identity (its address), so two slices of one token are
   *  known as siblings. */
  token?: string | null;
  /** The token's colour (`tokenColour`), null where it has none. */
  colour?: string | null;
}

/** The next palette colour not yet given that clears every given colour;
 *  else the unused (or, the palette spent, any stepped) colour farthest from
 *  them. */
function fromPalette(given: ThemePair[], used: Set<number>): ThemePair {
  const minTo = (p: ThemePair) => given.reduce((m, g) => Math.min(m, pairDelta(p, g)), Infinity);
  for (let i = 0; i < PALETTE.length; i++) {
    if (used.has(i)) continue;
    if (minTo(PALETTE[i]) >= COLLISION_DELTA_E) {
      used.add(i);
      return PALETTE[i];
    }
  }
  const unused = PALETTE.map((p, i) => ({ p, i })).filter(({ i }) => !used.has(i));
  const pool = unused.length
    ? unused
    : PALETTE.flatMap((p, i) => [
        { p: inBand(p.light, SIBLING_STEP), i },
        { p: inBand(p.light, -SIBLING_STEP), i },
      ]);
  let best = pool[0];
  for (const c of pool) if (minTo(c.p) > minTo(best.p)) best = c;
  used.add(best.i);
  return best.p;
}

/** Each slice's colour (CSS), by token, with collisions moved to the palette. */
export function assetSliceColours(slices: readonly ColourSlice[]): string[] {
  const given: ThemePair[] = [];
  /** Each given colour's token, beside it. */
  const givenTokens: (string | null)[] = [];
  const used = new Set<number>();
  /** Per token: its slices so far, for the sibling's step. */
  const seen = new Map<string, number>();
  return slices.map((s) => {
    if (s.rest) return OTHER_COLOUR;
    const key = s.token?.toLowerCase() ?? null;
    const nth = key ? (seen.get(key) ?? 0) : 0;
    if (key) seen.set(key, nth + 1);
    let pick: ThemePair | null = null;
    if (s.colour) {
      // Siblings alternate: the token's colour, a step lighter or darker, a
      // step the other way; past three, the palette.
      const step = nth === 0 ? 0 : nth === 1 ? SIBLING_STEP : nth === 2 ? -SIBLING_STEP : null;
      if (step != null) {
        const c = inBand(s.colour, step);
        // A sibling keeps SIBLING_DELTA_E from its own token's slices and the
        // full COLLISION_DELTA_E from every other colour.
        const clear = given.every(
          (g, i) => pairDelta(c, g) >= (nth > 0 && givenTokens[i] === key ? SIBLING_DELTA_E : COLLISION_DELTA_E),
        );
        if (clear) pick = c;
      }
    }
    if (!pick) pick = fromPalette(given, used);
    given.push(pick);
    givenTokens.push(key);
    return cssOf(pick);
  });
}

/** Holders: the palette in order, the rest grey. */
export function holderSliceColours(slices: readonly { rest?: boolean }[]): string[] {
  const given: ThemePair[] = [];
  const used = new Set<number>();
  return slices.map((s) => {
    if (s.rest) return OTHER_COLOUR;
    const i = given.length;
    const p = i < PALETTE.length ? PALETTE[i] : fromPalette(given, used);
    if (i < PALETTE.length) used.add(i);
    given.push(p);
    return cssOf(p);
  });
}
