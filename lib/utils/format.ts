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

/** The smallest magnitude a display amount states in digits. */
export const TINY_AMOUNT_FLOOR = 1e-6;
export const TINY_AMOUNT_FLOOR_TEXT = "<0.000001";

/** A sub-precision non-zero magnitude, stated plainly and never in exponent
 *  form. Reached via the false-zero guards in formatNumber / fmtSpine, so it
 *  never touches normally-sized values.
 *
 *  The rule: three significant digits down to 0.000001 (0.00512 cbBTC,
 *  0.00000836 LINK), and "<0.000001" below that (a negative reads
 *  "-<0.000001"). Significant digits keep a BTC-class amount stated: 0.00512
 *  cbBTC reads 0.00512. The floor hides at most 0.000001 of a token: about
 *  $0.08 of BTC at $83,000 (28 Sep 2026), the highest-priced asset listed.
 *  Where the floor applies the exact decimal belongs in a tooltip:
 *  <AmountText> (components/shared/amount-text.tsx) adds one. */
export const formatTinyNonZero = (value: number): string => {
  if (Math.abs(value) < TINY_AMOUNT_FLOOR) return `${value < 0 ? "-" : ""}${TINY_AMOUNT_FLOOR_TEXT}`;
  return value.toLocaleString("en-US", { maximumSignificantDigits: 3 });
};

/** Whether a formatted amount is a floor ("<0.000001", "<0.01") standing in
 *  for a figure too small to state, so its exact value needs a tooltip. */
export const isFloorText = (text: string): boolean => /^[+\-\u2212]?\s*</.test(text.trim());

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

/** BTC-class and gold tokens: a unit is worth thousands of dollars, so
 *  "<0.01" on a headline would hide up to about $830 of BTC or $41 of gold
 *  (28 Sep 2026 prices).
 *  Matches WBTC, cbBTC, tBTC, BTC.b, WBTC18, cbBTC18, LBTC and every other
 *  symbol containing "BTC", plus XAUt, XAUT0 and PAXG. */
export const isHighValueUnit = (symbol: string | null | undefined): boolean =>
  !!symbol && (/btc/i.test(symbol) || /^(xau|paxg)/i.test(symbol));

// Headline form (the timeline card's collapsed header, the share card's flow
// line): a magnitude below 0.01 reads "<0.01" rather than digits. For a
// BTC-class or gold token (isHighValueUnit) the headline keeps formatCompact's
// significant digits instead ("0.00512"), so no material amount hides behind
// "<0.01"; those still floor at "<0.000001". Everywhere else (balances,
// totals, a card's open detail, the explanation) formatNumber's form stands.
export const formatHeadlineAmount = (value: number, symbol?: string | null): string => {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01 && !isHighValueUnit(symbol)) return "<0.01";
  return formatCompact(value);
};

// Plain decimal for a data export (CSV cell): every digit String(n) would
// give, without its exponent form below 1e-6 or above 1e21, and ungrouped.
export const toPlainDecimal = (value: number): string => {
  if (!Number.isFinite(value)) return String(value);
  const s = String(value);
  if (!s.includes("e")) return s;
  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
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

// "A" vs "An" for a display name or symbol dropped into a sentence. Read by
// spelling, with named exceptions for an acronym that spells with a vowel but
// SOUNDS like a consonant (USDaf reads "you-ess-dee-af", so "a", not "an").
const CONSONANT_SOUND_VOWEL_SPELLING = new Set(["USDaf"]);
export const indefiniteArticle = (word: string): "A" | "An" =>
  CONSONANT_SOUND_VOWEL_SPELLING.has(word) || !/^[aeiou]/i.test(word) ? "A" : "An";

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

/** a − b on plain decimal strings, exactly (no float in the path). Null when
 *  either is not a plain decimal. */
export function decimalSub(a: string, b: string): string | null {
  if (!PLAIN_DECIMAL.test(a) || !PLAIN_DECIMAL.test(b)) return null;
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const toInt = (s: string): bigint => {
    const neg = s.startsWith("-");
    const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
    const v = BigInt(i + f.padEnd(scale, "0"));
    return neg ? -v : v;
  };
  const d = toInt(a) - toInt(b);
  const neg = d < BigInt(0);
  const abs = (neg ? -d : d).toString().padStart(scale + 1, "0");
  const whole = scale > 0 ? abs.slice(0, -scale) : abs;
  const frac = scale > 0 ? abs.slice(-scale).replace(/0+$/, "") : "";
  const out = frac ? `${whole}.${frac}` : whole;
  return neg && out !== "0" ? `-${out}` : out;
}

/** An exact plain-decimal string grouped with thousands separators
 *  ("-5205.71498" → "-5,205.71498"): the string's own digits, no float. */
export const formatExactDecimal = (s: string): string => {
  const neg = s.startsWith("-");
  const [int, frac] = (neg ? s.slice(1) : s).split(".");
  return `${neg ? "-" : ""}${BigInt(int).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
};

/** The exact figure for a value that arrives as a decimal string: the string's
 *  own digits when it is a plain decimal (trailing zeros dropped), else the
 *  float's. A float cannot hold what an 18-decimal token carries, so the string
 *  is the source wherever there is one. */
export const formatExactFromString = (s: string | null | undefined, fallback: number): string => {
  if (s == null || !PLAIN_DECIMAL.test(s)) return formatExact(fallback);
  const [int, frac = ""] = s.split(".");
  const trimmed = frac.replace(/0+$/, "");
  const out = formatExactDecimal(trimmed ? `${int}.${trimmed}` : int);
  return out === "-0" ? "0" : out;
};
