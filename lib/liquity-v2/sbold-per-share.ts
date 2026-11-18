// sBOLD's derived figure, total assets ÷ shares issued (rails-ops ui-jobs 749).
// Pure: no imports, so scripts/test/sbold-per-share.test.mjs loads it.

/** totalAssets ÷ totalSupply in the asset per whole share, as a plain decimal
 *  cut to `sig` significant digits, so a tiny ratio reads as non-zero (ui-jobs
 *  749). Integer arithmetic on the raw answers; null where the supply is zero. */
export function perShareText(
  assetsRaw: string,
  supplyRaw: string,
  assetDecimals: number,
  shareDecimals: number,
  sig = 4,
): string | null {
  const supply = BigInt(supplyRaw);
  if (supply === BigInt(0)) return null;
  const extra = 60;
  const q = (BigInt(assetsRaw) * BigInt(10) ** BigInt(shareDecimals + extra)) / supply;
  if (q === BigInt(0)) return "0";
  const places = assetDecimals + extra;
  const digits = q.toString().padStart(places + 1, "0");
  const whole = digits.slice(0, digits.length - places);
  const frac = digits.slice(digits.length - places);
  const all = whole + frac;
  const first = all.search(/[1-9]/);
  const keep = Math.max(first + sig, whole.length);
  const cut = all.slice(0, keep).padEnd(whole.length, "0");
  const w = cut.slice(0, whole.length).replace(/^0+(?=\d)/, "");
  const f = cut.slice(whole.length).replace(/0+$/, "");
  const wn = w.length > 3 ? BigInt(w).toLocaleString("en-US") : w;
  return f ? `${wn}.${f}` : wn;
}

/** A raw amount as whole units: null where the integer has at most
 *  `maxDigits` digits, else a mantissa rounded to four significant digits and a power
 *  of ten that is a multiple of three ("43.72", 18). */
export function engineeringParts(
  raw: string,
  decimals: number,
  maxDigits = 12,
): { mantissa: string; exponent: number } | null {
  const whole = (BigInt(raw) / BigInt(10) ** BigInt(decimals)).toString();
  if (whole.length <= maxDigits) return null;
  const exponent = Math.floor((whole.length - 1) / 3) * 3;
  const lead = whole.length - exponent;
  const value = Number(whole.slice(0, 7)) / Math.pow(10, Math.min(7, whole.length) - lead);
  // Rounded to four significant digits; a carry to 1000 moves up a power.
  const text = value.toFixed(Math.max(0, 4 - lead));
  if (Number(text) >= 1000) return { mantissa: "1", exponent: exponent + 3 };
  const mantissa = text.includes(".") ? text.replace(/\.?0+$/, "") : text;
  return { mantissa, exponent };
}
