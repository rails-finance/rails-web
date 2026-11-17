// A deposit's and a loan's head read, assembled from one multicall's results.
// Pure: no imports, so scripts/test/polaris-sp-loans.test.mjs loads it.
//
// RULE: every figure the page states from the chain is the getter's answer.
// When any of them fails inside the multicall, the whole read is stale and
// the page states none of them: a failed getter never becomes a zero.

export type ChainResult = { status: string; result?: unknown };

const ok = <T>(r: ChainResult | undefined): T | null =>
  r?.status === "success" && r.result != null ? (r.result as T) : null;

export interface DepositHeadFigures {
  compoundedRaw: string;
  recordedRaw: string;
  snapshotP: string;
  stableGainRaw: string;
  bcGainRaw: string;
  stashedRaw: string;
  owner: string | null;
  p: string;
  /** The feed's price; the page drops what it values where this failed. */
  pethInStableRaw: string | null;
}

/** Results in the order the source reads them: compounded, deposits,
 *  depositSnapshots, the stable gain with pending, the pETH gain, the stash,
 *  ownerOf, P, the feed's previewPrice. Null when a stated figure failed. */
export function depositHeadFigures(res: ChainResult[]): DepositHeadFigures | null {
  const compounded = ok<bigint>(res[0]);
  const recorded = ok<bigint>(res[1]);
  const snaps = ok<readonly bigint[]>(res[2]);
  const stableGain = ok<bigint>(res[3]);
  const bcGain = ok<bigint>(res[4]);
  const stashed = ok<bigint>(res[5]);
  const p = ok<bigint>(res[7]);
  if (
    compounded == null ||
    recorded == null ||
    snaps == null ||
    stableGain == null ||
    bcGain == null ||
    stashed == null ||
    p == null
  )
    return null;
  const price = ok<bigint>(res[8]);
  return {
    compoundedRaw: compounded.toString(),
    recordedRaw: recorded.toString(),
    snapshotP: snaps[1].toString(),
    stableGainRaw: stableGain.toString(),
    bcGainRaw: bcGain.toString(),
    stashedRaw: stashed.toString(),
    owner: ok<string>(res[6])?.toLowerCase() ?? null,
    p: p.toString(),
    pethInStableRaw: price == null ? null : price.toString(),
  };
}

export interface LoanHeadFigures {
  collRaw: string;
  sharesRaw: string;
  debtRaw: string;
  debtPerShareRaw: string;
  floorPriceRaw: string;
  owner: string | null;
}

/** Results in the order: loans(id), getLoanDebt(id), debtPerShare(),
 *  ownerOf(id), floorPrice(). Null when a stated figure failed (ownerOf
 *  reverts on a closed loan, and the page then names the index's holder). */
export function loanHeadFigures(res: ChainResult[]): LoanHeadFigures | null {
  const loan = ok<readonly bigint[]>(res[0]);
  const debt = ok<bigint>(res[1]);
  const dps = ok<bigint>(res[2]);
  const floor = ok<bigint>(res[4]);
  if (loan == null || debt == null || dps == null || floor == null) return null;
  return {
    collRaw: loan[0].toString(),
    sharesRaw: loan[1].toString(),
    debtRaw: debt.toString(),
    debtPerShareRaw: dps.toString(),
    floorPriceRaw: floor.toString(),
    owner: ok<string>(res[3])?.toLowerCase() ?? null,
  };
}
