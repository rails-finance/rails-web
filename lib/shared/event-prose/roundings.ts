// How a placeholder's figure is printed: one function per rounding a strings
// file's `roundings` section names (./types.ts `Rounding`). Pure TypeScript,
// so the scripts load it with type stripping.

import { fmtAccrued, fmtColl, fmtCr, fmtDebt, fmtRate, fmtRateChange, fmtUsdWhole } from "@/lib/liquity/figure-format";
import { ledgerFigure } from "@/lib/shared/coll-figure";
import { fmtHeaderMagnitude } from "@/lib/shared/spine-format";
import { formatDate, formatMonthDay } from "@/lib/date";
import { formatNumber } from "@/lib/utils/format";
import { hfLabelV4 } from "@/lib/aave-v4/format";
import type { ProseValue, Rounding } from "./types";

/** The values one sentence is filled from, and the collateral ledger's decimals. */
export interface FmtEnv {
  values: Record<string, ProseValue>;
  collDecimals: number | null;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const num = (v: ProseValue): number => (typeof v === "number" ? v : Number(v));

/** The old explanation's free figure: whole from 1,000, four places from 1. */
function fmtAmount(n: number): string {
  if (!isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const decimals = Math.min(8, Math.ceil(-Math.log10(abs)) + 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtUsdCents(value: number): string {
  if (value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDay(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  const base = formatMonthDay(d);
  return sameYear ? base : `${base}, ${String(d.getUTCFullYear()).slice(-2)}`;
}

function fmtSpan(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 24) {
    const h = Math.max(1, Math.round(hours));
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${(hours / 24).toFixed(1)} days`;
}

/** A collateral figure at the ledger's decimals. */
const collAt = (n: number, dec: number | null) => ledgerFigure(n, dec, fmtColl(n));

/** Each rounding, as a file's `roundings` section describes it. */
export const ROUNDING: Record<Rounding, (v: ProseValue, name: string, env: FmtEnv) => string> = {
  coll: (v, _n, env) => collAt(num(v), env.collDecimals),
  coll_trim: (v, _n, env) => {
    const t = collAt(num(v), env.collDecimals);
    return t.includes(".") ? t.replace(/\.?0+$/, "") : t;
  },
  debt: (v) => fmtDebt(num(v)),
  accrued: (v) => fmtAccrued(num(v)),
  accrued_signed: (v) => `${num(v) >= 0 ? "+" : "−"}${fmtAccrued(Math.abs(num(v)))}`,
  amount: (v) => fmtAmount(num(v)),
  usd: (v) => fmtUsdWhole(num(v)),
  usd_about: (v) =>
    num(v) >= 10_000 ? `about $${(Math.round(num(v) / 1000) * 1000).toLocaleString("en-US")}` : fmtUsdWhole(num(v)),
  usd_cents: (v) => fmtUsdCents(num(v)),
  ratio: (v) => fmtCr(num(v)),
  ratio_whole: (v, _n, env) => {
    const b = env.values.cr_before_same_price;
    const a = env.values.cr_after;
    const alike = typeof b === "number" && typeof a === "number" && Math.round(b) === Math.round(a);
    return alike ? fmtCr(num(v)) : `${Math.round(num(v))}%`;
  },
  ratio_pair: (v) => `${fmtCr(num(v))} (LTV ${(10000 / num(v)).toFixed(2)}%)`,
  rate: (v) => fmtRate(num(v)),
  rate_step: (v, name, env) => {
    const step = fmtRateChange(num(env.values.rate_before), num(env.values.rate_after));
    return name === "rate_before" ? step.before : step.after;
  },
  pct_whole: (v) => `${Math.round(Math.abs(num(v)) * 100)}%`,
  pct3: (v) => `${num(v).toFixed(3)}%`,
  count: (v) => num(v).toLocaleString("en-US"),
  compact: (v) => fmtHeaderMagnitude(Math.abs(num(v))),
  date: (v) => formatDate(num(v)),
  day_short: (v) => fmtDay(num(v)),
  span: (v) => fmtSpan(num(v)),
  manager: (v, name, env) => {
    const n = env.values[`${name}_name`];
    return typeof n === "string" && n ? `${n} (${short(String(v))})` : short(String(v));
  },
  address: (v) => short(String(v)),
  text: (v) => String(v ?? ""),
  units4: (v, _n, env) =>
    ledgerFigure(
      num(v),
      env.collDecimals,
      num(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 }),
    ),
  units2: (v) => num(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ratio_frac: (v) =>
    `${(num(v) * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
  number: (v) => formatNumber(Math.abs(num(v))),
  pct_plain: (v) => `${num(v) < 0 ? "−" : ""}${Number((Math.abs(num(v)) * 100).toFixed(2))}%`,
  hf: (v) => hfLabelV4(num(v)),
};
