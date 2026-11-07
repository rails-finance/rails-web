// Pure BigInt-safe scaling of a raw token amount; the browser and the server both use it.

/** BigInt-safe scale of a raw token amount to a display Number (ES2017 — no
 *  `10n ** n` literal). Mirrors lib/sources/chain/aave-v3-tokens.ts `scaleV3`. */
export function scaleRaw(raw: bigint, decimals: number): number {
  if (raw === BigInt(0)) return 0;
  const neg = raw < BigInt(0);
  const a = neg ? -raw : raw;
  if (decimals <= 0) return neg ? -Number(a) : Number(a);
  const divisor = BigInt("1" + "0".repeat(decimals));
  const whole = a / divisor;
  const frac = a % divisor;
  const v = Number(whole) + Number(frac) / Number(divisor);
  return neg ? -v : v;
}
