// sBOLD's derived figure, total assets ÷ shares issued (rails-ops ui-jobs 749).
// Pure: no imports, so scripts/test/sbold-per-share.test.mjs loads it.

/** totalAssets ÷ totalSupply in the asset per whole share, as a plain decimal
 *  rounded half-up to `sig` significant digits, so a tiny ratio reads as
 *  non-zero (ui-jobs 749). Integer arithmetic on the raw answers; null where
 *  the supply is zero. */
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
  let kept = all.slice(0, keep);
  let point = whole.length;
  // Half-up on the next digit; a carry that adds a digit moves the point.
  if (all.length > keep && all[keep] >= "5") {
    const up = (BigInt(kept) + BigInt(1)).toString().padStart(keep, "0");
    if (up.length > keep) point += 1;
    kept = up;
  }
  const cut = kept.padEnd(point, "0");
  const w = cut.slice(0, point).replace(/^0+(?=\d)/, "");
  const f = cut.slice(point).replace(/0+$/, "");
  const wn = w.length > 3 ? BigInt(w).toLocaleString("en-US") : w;
  return f ? `${wn}.${f}` : wn;
}

/** A raw amount as whole units: null where the integer has at most
 *  `maxDigits` digits, else four significant digits, rounded half-up, as a
 *  mantissa from 1 to below 1000 and a power of ten that is a multiple of
 *  three ("43.72", 18). A carry past the mantissa's range moves up a power. */
export function engineeringParts(
  raw: string,
  decimals: number,
  maxDigits = 12,
): { mantissa: string; exponent: number } | null {
  const whole = (BigInt(raw) / BigInt(10) ** BigInt(decimals)).toString();
  if (whole.length <= maxDigits) return null;
  let exponent = Math.floor((whole.length - 1) / 3) * 3;
  let lead = whole.length - exponent;
  let digits = whole.slice(0, 4);
  if (whole[4] >= "5") {
    const up = (BigInt(digits) + BigInt(1)).toString();
    if (up.length > 4) {
      digits = up.slice(0, 4);
      lead += 1;
      if (lead > 3) {
        lead = 1;
        exponent += 3;
      }
    } else digits = up;
  }
  return { mantissa: lead < 4 ? `${digits.slice(0, lead)}.${digits.slice(lead)}` : digits, exponent };
}
