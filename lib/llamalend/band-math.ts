// LlamaLend band math — the ONE consolidated primitive.
// ----------------------------------------------------------------------------
// p_oracle_up(n) = base_price · ((A−1)/A)^n, computed EXACTLY as the deployed
// Vyper pair computes it:
//
//   • LOG_A_RATIO — the Vault's `ln_int(A·1e18/(A−1))`: an integer binary-log
//     loop scaled to natural log by ÷ 1442695040888963328, all uint256 floor
//     division.
//   • the AMM's `_p_oracle_up(n)` — the solmate `expWad` port embedded in the
//     AMM: int256 two's-complement arithmetic, 2^96 fixed point, truncating
//     signed division, and a final left/right shift by (k − 195).
//
// Ported verbatim from the deployed sources and verified BigInt-EXACT against
// the AMMs' own `p_oracle_up(n)` / `p_oracle_down(n)` reads across markets
// spanning A ∈ {10 … 500} and n ∈ [−50, 300], negatives included (scratchpad
// probe 03, 2026-07-16). p_oracle_down(n) ≡ p_oracle_up(n+1), also verified.
//
// EVERY RENDERED band figure comes from this exact math (or the AMM's own
// read); a float Math.pow is fine for POSITIONING pixels and is provided
// separately, labeled as such. viem targets ES2017 — no BigInt literals.

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const E18 = BigInt("1000000000000000000");
const UINT = ONE << BigInt(256);
const INT_MAX = (ONE << BigInt(255)) - ONE;
const TWO95 = ONE << BigInt(95);
const TWO96 = ONE << BigInt(96);

// ── exact integer helpers (EVM two's-complement int256 semantics) ────────────
function wrapU(x: bigint): bigint {
  x %= UINT;
  return x < ZERO ? x + UINT : x;
}
function wrapI(x: bigint): bigint {
  x = wrapU(x);
  return x > INT_MAX ? x - UINT : x;
}
// EVM SDIV truncates toward zero — BigInt `/` already does.
const sdiv = (a: bigint, b: bigint): bigint => a / b;
const uMul = (a: bigint, b: bigint): bigint => wrapU(a * b);
const iMul = (a: bigint, b: bigint): bigint => wrapI(a * b);
const iAdd = (a: bigint, b: bigint): bigint => wrapI(a + b);
const iSub = (a: bigint, b: bigint): bigint => wrapI(a - b);

/**
 * The deployed `ln_int(x)` (x at 1e18): binary log by repeated squaring, all
 * uint256 floor division, scaled to natural log. Verbatim port.
 */
export function lnInt(x0: bigint): bigint {
  let x = x0;
  let res = ZERO;
  for (let i = BigInt(0); i < BigInt(8); i++) {
    const t = TWO ** (BigInt(7) - i);
    const p = TWO ** t;
    if (x >= p * E18) {
      x /= p;
      res += t * E18;
    }
  }
  let d = E18;
  for (let i = 0; i < 59; i++) {
    if (x >= TWO * E18) {
      res += d;
      x /= TWO;
    }
    x = (x * x) / E18;
    d /= TWO;
  }
  return (res * E18) / BigInt("1442695040888963328");
}

/** LOG_A_RATIO = ln_int(A·1e18 / (A−1)) — the AMM's immutable, re-derived
 *  exactly from A (the derivation reproduces the deployed constant). */
export function logARatio(A: bigint): bigint {
  return lnInt((E18 * A) / (A - ONE));
}

// solmate expWad constants, as deployed (PUSH32 values in the AMM bytecode).
const EXP_MIN = BigInt("-42139678854452767551");
const EXP_MAX = BigInt("135305999368893231589");
const LN2_96 = BigInt("54916777467707473351141471128");
const P0 = BigInt("1346386616545796478920950773328");
const P1 = BigInt("57155421227552351082224309758442");
const P2 = BigInt("94201549194550492254356042504812");
const P3 = BigInt("28719021644029726153956944680412240");
const P4 = BigInt("4385272521454847904659076985693276");
const Q0 = BigInt("2855989394907223263936484059900");
const Q1 = BigInt("50020603652535783019961831881945");
const Q2 = BigInt("533845033583426703283633433725380");
const Q3 = BigInt("3604857256930695427073651918091429");
const Q4 = BigInt("14423608567350463180887372962807573");
const Q5 = BigInt("26449188498355588339934803723976023");
const EXP_SCALE = BigInt("3822833074963236453042738258902158003155416615667");
const K_SHIFT = BigInt(195);

/**
 * The AMM's own `_p_oracle_up(n)` — base_price · exp(−n · LOG_A_RATIO), via
 * the deployed solmate expWad port. BigInt-exact against the chain read.
 */
export function pOracleUp(n: bigint, LOG_A_RATIO: bigint, basePrice: bigint): bigint {
  const power = iMul(-n, LOG_A_RATIO);
  if (!(power > EXP_MIN && power < EXP_MAX)) throw new Error(`band power out of exp domain: ${power}`);
  let x = sdiv(iMul(power, TWO96), E18);
  const k = sdiv(iAdd(sdiv(iMul(x, TWO96), LN2_96), TWO95), TWO96);
  x = iSub(x, iMul(k, LN2_96));
  let y = iAdd(x, P0);
  y = iAdd(sdiv(iMul(y, x), TWO96), P1);
  let p = iSub(iAdd(y, x), P2);
  p = iAdd(sdiv(iMul(p, y), TWO96), P3);
  p = iAdd(iMul(p, x), P4 * TWO96);
  let q = iSub(x, Q0);
  q = iAdd(sdiv(iMul(q, x), TWO96), Q1);
  q = iSub(sdiv(iMul(q, x), TWO96), Q2);
  q = iAdd(sdiv(iMul(q, x), TWO96), Q3);
  q = iSub(sdiv(iMul(q, x), TWO96), Q4);
  q = iAdd(sdiv(iMul(q, x), TWO96), Q5);
  const pq = sdiv(p, q); // signed division truncating toward zero
  if (pq < ZERO) throw new Error("band exp p/q negative — the deployed convert() would revert");
  let expResult = uMul(pq, EXP_SCALE);
  const sh = k - K_SHIFT; // shift(): left when positive, LOGICAL right when negative
  expResult = sh >= ZERO ? wrapU(expResult << sh) : expResult >> -sh;
  return (basePrice * expResult) / E18; // unsafe_div, uint
}

export interface BandPrices {
  /** p_oracle_up(n1) — the soft-liquidation ONSET price (the band's top;
   *  1e18, borrowed-token units). Raw integer, exact. */
  pUpRaw: bigint;
  /** p_oracle_down(n2) = p_oracle_up(n2 + 1) — the FULLY-liquidated price
   *  (the band's bottom; 1e18). Raw integer, exact. */
  pDownRaw: bigint;
}

/**
 * The band a position occupies: [pDown, pUp] from its tick pair (n1, n2) —
 * SIGNED ints, negatives valid. The one primitive the prototype triplicated;
 * exact against the AMM's own p_oracle_up / p_oracle_down reads.
 */
export function bandPrices(A: bigint, basePrice: bigint, n1: bigint, n2: bigint): BandPrices {
  const lar = logARatio(A);
  return {
    pUpRaw: pOracleUp(n1, lar, basePrice),
    pDownRaw: pOracleUp(n2 + ONE, lar, basePrice),
  };
}

/** 1e18 raw → display Number (no precision claim — hover text carries the
 *  exact integer). */
export function scale1e18(raw: bigint): number {
  const whole = raw / E18;
  const frac = raw % E18;
  return Number(whole) + Number(frac) / 1e18;
}

// `bandPriceFloat` lived here — a Math.pow band price for POSITIONING PIXELS
// ONLY, whose one caller drew the interior band edges on the axis. The axis no
// longer draws them (they are sub-pixel at the meter's width, and the band
// COUNT is a caption figure now), so the helper went with its call site rather
// than staying in the tree looking live. See dead-code-reads-as-live.
