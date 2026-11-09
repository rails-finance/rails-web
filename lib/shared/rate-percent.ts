// A rate as a percentage, precise enough that a non-zero rate never reads
// 0.00%: two decimals from 0.01% up, one significant digit below that
// ("0.004%"), and "<0.0001%" under the smallest figure a cell has room for.
// Zero reads "0.00%".

const RATE_PERCENT_FLOOR = 0.0001;

export function ratePercentText(fraction: number): string {
  const p = fraction * 100;
  if (p > 0 && p < RATE_PERCENT_FLOOR) return `<${RATE_PERCENT_FLOOR}%`;
  if (p !== 0 && Math.abs(p) < 0.01)
    return `${p.toLocaleString("en-US", { maximumSignificantDigits: 1, maximumFractionDigits: 4 })}%`;
  return `${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
