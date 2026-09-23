type FormatOptions = {
  style?: "decimal" | "currency" | "percent";
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  prefix?: string;
  suffix?: string;
};

export const toLocaleStringHelper = (value: number, options: FormatOptions = {}): string => {
  const {
    style = "decimal",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
    prefix = "",
    suffix = "",
  } = options;

  const formatOptions: Intl.NumberFormatOptions = {
    style,
    minimumFractionDigits,
    maximumFractionDigits,
  };

  if (style === "currency" && currency) {
    formatOptions.currency = currency;
  }

  const formatted = value.toLocaleString("en-US", formatOptions);
  return `${prefix}${formatted}${suffix}`;
};

export const formatPrice = (value: number): string => {
  return toLocaleStringHelper(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatUsdValue = (value: number): string => {
  return toLocaleStringHelper(value, {
    prefix: "$",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatNumber = (value: number): string => {
  const s = toLocaleStringHelper(value);
  // Strict chain-state: a non-zero magnitude must never collapse to "0". The
  // default 3-dp rounding renders anything below ~5e-4 as "0" — a false zero for
  // a balance the chain says is non-zero. Divert ONLY that case (the normal
  // render parses back to 0 while the value isn't) to its real magnitude.
  if (value !== 0 && Number.isFinite(value) && parseFloat(s) === 0) return formatTinyNonZero(value);
  return s;
};

// Faithful rendering of a sub-precision non-zero magnitude — significant digits
// down to ~1e-6, scientific below. Only reached via the false-zero guards in
// formatNumber / fmtSpine, so it never touches normally-sized values.
export const formatTinyNonZero = (value: number): string =>
  Math.abs(value) < 1e-6 ? value.toExponential(2) : value.toLocaleString("en-US", { maximumSignificantDigits: 3 });

// Exact scaled value from an integer wei string — no float rounding, so the
// reveal-on-hover shows the chain's precise balance (the exact
// figure behind the compact headline). Trims trailing zeros. Integer input only
// (numeric(78,0) balances); any fractional tail is dropped.
export const formatUnitsExact = (raw: string | null | undefined, decimals: number): string => {
  let s = (raw ?? "").trim().split(".")[0];
  if (!s) return "0";
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  s = s.replace(/^0+/, "") || "0";
  if (decimals <= 0) return (neg && s !== "0" ? "-" : "") + s;
  if (s.length <= decimals) s = "0".repeat(decimals - s.length + 1) + s;
  const cut = s.length - decimals;
  let out = (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
  if (out === "" || out === "-") out = "0";
  return (neg && out !== "0" ? "-" : "") + out;
};

// Full-precision float rendering for the provenance trace: every decimal the
// pipeline actually delivered — String(n) is the shortest round-trip form, so
// there's no invented 3-dp rounding and no float noise — regrouped with
// thousands separators. Where the source is an integer-wei string, prefer
// formatUnitsExact (no float in the path at all).
export const formatExact = (value: number): string => {
  if (!Number.isFinite(value)) return String(value);
  const neg = value < 0;
  const s = String(Math.abs(value));
  // Off the plain-decimal range (≥1e21 or <1e-6) String() goes exponential;
  // hand those to Intl at max precision instead of parsing the exponent.
  if (s.includes("e")) return value.toLocaleString("en-US", { maximumFractionDigits: 20 });
  const [int, frac] = s.split(".");
  const grouped = BigInt(int).toLocaleString("en-US");
  return `${neg ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
};

// Compact headline form for big values: 170,177,469 → "170.18M", 195,000 →
// "195K", 8,100 → "8.1K". Sub-1000 values are already short, so they pass
// through formatNumber unchanged (e.g. 4.973, 0.262) — the exact value lives in
// the reveal-on-hover tooltip (see RevealTip / AssetAmount).
export const formatCompact = (value: number): string => {
  if (Math.abs(value) >= 1_000) {
    return value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
  }
  return formatNumber(value);
};

// Headline form: a magnitude below the displayed precision reads "<0.01"
// rather than the scientific notation formatCompact would otherwise surface
// (e.g. "1.94e-12"). For headlines only — the receipt (a card's open detail,
// the explanation) keeps the exact magnitude, and formatNumber's false-zero
// guard is untouched everywhere else it's reached directly.
export const formatHeadlineAmount = (value: number): string => {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return "<0.01";
  return formatCompact(value);
};

// Swap Intl's ASCII hyphen for the real U+2212 minus on a value that can
// render negative — a valuation or net figure (an underwater equity), never
// a balance, which can never be negative. Idempotent on an already-positive
// string.
export const withRealMinus = (s: string): string => s.replace(/^-/, "−");

export const formatApproximate = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return formatPrice(value);
};
