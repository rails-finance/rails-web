// Frankencoin figure formats, one per unit, shared by the opened card's grid and
// its explanation so the two state a figure the same way: ZCHF at two places, a
// declared price at up to two, collateral at up to eight (a WBTC amount to the
// satoshi).

import { formatTinyNonZero } from "@/lib/utils/format";

export const fmtZchf = (n: number): string =>
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtFcPrice = (n: number): string =>
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const fmtFcColl = (n: number): string => {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 8 });
  return n !== 0 && Number(s.replace(/,/g, "")) === 0 ? formatTinyNonZero(Math.abs(n)) : s;
};

export const fmtFcPct = (ratio: number): string =>
  `${(ratio * 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
