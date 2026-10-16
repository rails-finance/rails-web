// pETH at four decimals on the Polaris row head, spine flank and card
// headline: a pETH is worth thousands of USDp, so the house three decimals
// leave several USDp of collateral unstated. A magnitude too small for four
// decimals keeps formatNumber's non-zero rule.

import { formatNumber } from "@/lib/utils/format";

export const formatPeth = (value: number): string => {
  const s = value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return value !== 0 && parseFloat(s.replace(/,/g, "")) === 0 ? formatNumber(value) : s;
};
