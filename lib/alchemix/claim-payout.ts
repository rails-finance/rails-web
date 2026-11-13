// The Transmuter pane's payout sentence (ui-jobs 646, call 6). With the
// claim block's convertToAssets in hand it states the payout's value; without
// it (the read failed, ran late or was capped: rails-ops decisions/0054,
// ruling 2) it states the share count alone, so the pane never shows a blank
// or a zero for a value it does not have.
//
// No imports: the unit tests load it as is.

export interface ClaimPayoutValue {
  assetsRaw: string;
  /** The asset under the vault, and its decimals. */
  symbol: string;
  decimals: number;
}

export interface ClaimPayoutParts {
  /** "The claim paid out 2,229.47 mixUSDC" */
  paid: string;
  /** "2,261.35 USDC", the figure the receipt wraps; null without the read. */
  worth: string | null;
  /** The rest of the sentence after the paid part (and the worth, if any). */
  rest: string;
}

const TEN = BigInt(10);

/** A raw integer at `decimals`, to two decimal places, en-US grouped. */
export function fmtRaw2(raw: string, decimals: number): string {
  const v = BigInt(raw.split(".")[0]);
  const scale = TEN ** BigInt(decimals);
  const cents = decimals >= 2 ? (v * BigInt(100) + scale / BigInt(2)) / scale : v * BigInt(100);
  const whole = cents / BigInt(100);
  const frac = Number(cents % BigInt(100));
  const w = Number(whole).toLocaleString("en-US");
  return frac === 0 ? w : `${w}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

export function claimPayoutParts(a: {
  sharesRaw: string;
  mytSymbol: string;
  vestedRaw: string;
  synthetic: string;
  block: number;
  value: ClaimPayoutValue | null;
}): ClaimPayoutParts {
  const paid = `The claim paid out ${fmtRaw2(a.sharesRaw, 18)} ${a.mytSymbol}`;
  const vested = `${fmtRaw2(a.vestedRaw, 18)} ${a.synthetic} vested.`;
  if (!a.value) return { paid, worth: null, rest: ` for ${vested}` };
  return {
    paid,
    worth: `${fmtRaw2(a.value.assetsRaw, a.value.decimals)} ${a.value.symbol}`,
    rest: ` at block ${a.block.toLocaleString("en-US")}, for ${vested}`,
  };
}
