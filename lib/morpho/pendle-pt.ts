// A Pendle principal token as a Morpho market's collateral, read from its
// symbol: `PT-<underlying>-<DMMMYYYY>` (PT-apxUSD-5NOV2026, PT-sUSDE-27MAR2025).
// Pendle's own definition: 1 PT redeems 1 unit of the underlying at maturity,
// and before then trades below it, the discount being the fixed yield.

export const PENDLE_PT_DOC = {
  label: "Pendle: PT, YT & LP cheatsheet",
  url: "https://docs.pendle.finance/pendle-academy/cheatsheet-for-the-impatient/pt-yt-lp-cheatsheet",
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface PendlePt {
  underlying: string;
  /** Maturity, unix seconds at 00:00 UTC of the day the symbol names. */
  maturity: number;
  /** The maturity as the symbol spells it, in the page's date style. */
  maturityLabel: string;
}

export function parsePendlePt(symbol: string | null | undefined): PendlePt | null {
  const m = symbol?.match(/^PT-(.+)-(\d{1,2})([A-Z]{3})(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[3]);
  if (month < 0) return null;
  const day = Number(m[2]);
  const year = Number(m[4]);
  const maturity = Date.UTC(year, month, day) / 1000;
  const monthName = new Date(maturity * 1000).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return { underlying: m[1], maturity, maturityLabel: `${day} ${monthName} ${year}` };
}

/** One or two sentences on what the token is, for a card T3 or a T4 modal.
 *  `closedAt` (unix seconds) adds whether the position ended before maturity. */
export function pendlePtSentence(pt: PendlePt, symbol: string, closedAt?: number | null): string {
  const base =
    `${symbol} is a Pendle principal token: a claim to 1 ${pt.underlying} at maturity on ${pt.maturityLabel}. ` +
    `Until then it trades below the value of 1 ${pt.underlying}, and its price, which the market's oracle follows, rises toward that value as maturity nears.`;
  if (closedAt == null) return base;
  const days = Math.round((pt.maturity - closedAt) / 86400);
  return days > 0
    ? `${base} This position closed ${days} day${days === 1 ? "" : "s"} before maturity.`
    : `${base} This position closed after maturity.`;
}
