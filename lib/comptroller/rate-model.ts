// A Comptroller-family market's interest rate model (Compound V2 and its fork
// Moonwell; rails-ops ui-jobs 549 step 3), read from the contract each cToken
// or mToken names, as annual fractions.
// ----------------------------------------------------------------------------
// Three shapes run on the two rosters:
//   • JumpRateModel (V2 and Moonwell's): base + multiplier × U up to the kink,
//     then the jump multiplier × (U − kink) on top. Its terms are stored per
//     block (Compound V2) or per second (Moonwell) and annualised on the
//     model's blocksPerYear() or timestampsPerYear().
//   • A flat model (Moonwell Base): a jump-rate model with kink, multiplier and
//     jump all zero, so the rate is the base rate at every utilisation.
//   • WhitePaperInterestRateModel, the first V2 model (five legacy markets):
//     baseRate() and multiplier() stored a year, no kink, and a utilisation of
//     borrows ÷ (cash + borrows) that leaves reserves out.
// Utilisation in the other two is borrows ÷ (cash + borrows − reserves).
//
// Pure: imported by the server loaders and the client adapter.

export interface ComptrollerRateModel {
  /** "jump" turns at the kink; "linear" has none (flat, or the white-paper model). */
  shape: "jump" | "linear";
  /** The rate at zero utilisation, a year. */
  base: number;
  /** The rate added per unit of utilisation below the kink, a year. */
  multiplier: number;
  /** The rate added per unit of utilisation above the kink, a year; null without one. */
  jump: number | null;
  /** The utilisation the curve turns at; null without one. */
  kink: number | null;
  /** True where the model's utilisation subtracts reserves (all but the white-paper model). */
  reservesInUtil: boolean;
}

const E18 = 1e18;

/** A jump-rate model's per-period terms (1e18 mantissas) as annual fractions. */
export function jumpRateModel(
  raw: { base: bigint | null; multiplier: bigint | null; jump: bigint | null; kink: bigint | null },
  periodsPerYear: number | null,
): ComptrollerRateModel | null {
  if (raw.base == null || raw.multiplier == null || periodsPerYear == null) return null;
  const a = (v: bigint) => (Number(v) / E18) * periodsPerYear;
  const kink = raw.kink != null ? Number(raw.kink) / E18 : 0;
  const jump = raw.jump != null ? a(raw.jump) : 0;
  if (kink <= 0 || kink >= 1)
    return {
      shape: "linear",
      base: a(raw.base),
      multiplier: a(raw.multiplier),
      jump: null,
      kink: null,
      reservesInUtil: true,
    };
  return { shape: "jump", base: a(raw.base), multiplier: a(raw.multiplier), jump, kink, reservesInUtil: true };
}

/** The white-paper model's terms, stored a year (1e18 mantissas). */
export function whitePaperModel(raw: {
  baseRate: bigint | null;
  multiplier: bigint | null;
}): ComptrollerRateModel | null {
  if (raw.baseRate == null || raw.multiplier == null) return null;
  return {
    shape: "linear",
    base: Number(raw.baseRate) / E18,
    multiplier: Number(raw.multiplier) / E18,
    jump: null,
    kink: null,
    reservesInUtil: false,
  };
}

/** The model's utilisation from the market's cash, borrows and reserves. */
export function modelUtilisation(
  m: Pick<ComptrollerRateModel, "reservesInUtil">,
  cash: number,
  borrows: number,
  reserves: number,
): number | null {
  if (borrows <= 0) return 0;
  const d = cash + borrows - (m.reservesInUtil ? reserves : 0);
  return d > 0 ? borrows / d : null;
}

/** The two-slope constants the shared rate curve takes (`RateCurveModel`):
 *  below the kink the rate climbs multiplier × kink, above it jump × (1 − kink). */
export function curveConstants(m: ComptrollerRateModel): {
  optimal: number;
  base: number;
  slope1: number;
  slope2: number;
  noKink: boolean;
} {
  if (m.shape === "jump" && m.kink != null)
    return {
      optimal: m.kink,
      base: m.base,
      slope1: m.multiplier * m.kink,
      slope2: (m.jump ?? 0) * (1 - m.kink),
      noKink: false,
    };
  return { optimal: 1, base: m.base, slope1: m.multiplier, slope2: 0, noKink: true };
}
