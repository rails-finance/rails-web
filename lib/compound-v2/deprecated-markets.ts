// Compound V2's deprecated markets. The Comptroller's `isDeprecated(cToken)`
// holds when a market's collateral factor is 0, its borrowing is paused
// (borrowGuardianPaused) and its reserve factor is 100%. For a deprecated
// borrowed market `liquidateBorrowAllowed` skips the shortfall check and the
// close factor: anyone may repay up to the whole borrow, whatever the
// account's health (compound-finance/compound-protocol, Comptroller.sol).
//
// The block each market became deprecated, from `isDeprecated` read on the
// Comptroller (0x3d98…Cd3B) and bisected to the first block it holds
// (read 2026-09-30):
//   • cUSDT, cZRX, cCOMP, cTUSD, cUSDP at 23,969,453 (8 Dec 2025): the block
//     that paused their borrowing and set their reserve factor to 100%.
//   • cFEI at 15,761,599 (16 Oct 2022): reserve factor 99% → 100%.
//   • cSAI and cREP at 12,775,112 (6 Jul 2021): the three conditions already
//     held; this is the first block the Comptroller answers `isDeprecated`.
// The other 12 markets are not deprecated at head.

export interface CompoundV2Deprecation {
  block: number;
  /** ISO date (UTC) of that block. */
  date: string;
}

export const COMPOUND_V2_DEPRECATED: Record<string, CompoundV2Deprecation> = {
  usdt: { block: 23_969_453, date: "2025-12-08" },
  zrx: { block: 23_969_453, date: "2025-12-08" },
  comp: { block: 23_969_453, date: "2025-12-08" },
  tusd: { block: 23_969_453, date: "2025-12-08" },
  usdp: { block: 23_969_453, date: "2025-12-08" },
  fei: { block: 15_761_599, date: "2022-10-16" },
  sai: { block: 12_775_112, date: "2021-07-06" },
  rep: { block: 12_775_112, date: "2021-07-06" },
};

/** Was this market (by backend key) deprecated at `block`? Without a block,
 *  whether it is deprecated now. */
export function isCompoundV2Deprecated(marketKey: string | undefined | null, block?: number): boolean {
  if (!marketKey) return false;
  const d = COMPOUND_V2_DEPRECATED[marketKey.toLowerCase()];
  return !!d && (block == null || block >= d.block);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "8 Dec 2025" */
export function deprecationDate(marketKey: string): string | null {
  const d = COMPOUND_V2_DEPRECATED[marketKey.toLowerCase()];
  if (!d) return null;
  const [y, m, day] = d.date.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

/** What makes a market deprecated, in plain words. */
export const DEPRECATED_CONDITIONS = "collateral factor 0, borrowing paused, reserve factor 100%";

/** What it means for a borrower, said once wherever a deprecated market appears. */
export const DEPRECATED_CONSEQUENCE =
  "anyone may repay a borrow in it in full and seize collateral for it, however healthy the account is";
