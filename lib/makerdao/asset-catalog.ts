// MakerDAO asset catalog — ilk → collateral display + the core MCD addresses.
// ----------------------------------------------------------------------------
// The chain-state-tier explorer needs only: a display symbol for each ilk (the
// `ink` collateral is always wad-normalized to 1e18 by the GemJoin, so the symbol
// is purely cosmetic), and the canonical contract addresses so the provenance
// dock can name where every value came from. Governance constants (mat, line,
// dust) are deliberately absent — those are interpreted layers, not baseline.

/** Canonical MCD contracts (mainnet, lowercase). Mirror of the decoder's ADDR
 *  in scripts/makerdao-lognote-decode.mjs — kept here for the TS read side.
 *  Verify against changelog.makerdao.com chainlog. */
export const MAKER_ADDRESSES = {
  VAT: "0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b",
  CDP_MANAGER: "0x5ef30b9986345249bc32d8928b7ee64de9435e39",
  DOG: "0x135954d155898d42c90d2a57824c690e0c7bef1b",
  SPOTTER: "0x65c79fcb50ca1594b025960e539ed7a9a6d434a3",
  JUG: "0x19c0976f590d67707e62397c87829d896dc0f1f1",
  DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
  // Sky LockStake Engine v2 (decision 0013 — LSE borrower urns render inside
  // this explorer). Token addresses read from the engine's own sky()/usds()
  // getters and symbol()-verified on-chain 2026-07-14.
  LOCKSTAKE_ENGINE: "0xce01c90de7fd1bcfa39e237fe6d8d9f569e8a6a3",
  LOCKSTAKE_CLIPPER: "0x836f56750517b1528b5078cba4ac4b94fbe4a399",
  USDS: "0xdc035d45d973e3ec169d2276ddab16f1e407384f",
  SKY: "0x56072c95faa701256059aa122697b133aded9279",
  // The system lane (/makerdao/system) — the Vat's balance sheet decomposed by
  // ilk. Chain-verified at block 25,539,122 (2026-07-15).
  //
  // ILK_REGISTRY is the protocol's own ilk enumerator; the Vat itself keeps no
  // iterable list (`ilks` is a bare mapping, reachable only if you already know
  // the key). See UNLISTED_ILKS — the registry is the only enumerator there is,
  // and it is NOT complete.
  ILK_REGISTRY: "0x5a464c28d19848f44199d003bef5ecc87d090f87",
  /** Where every ilk's `sin` is charged and the surplus buffer accrues. */
  VOW: "0xa950524441892a31ebddf91d3ceefa04bf454466",
  /** DssAutoLine — moves an ilk's `line` on demand, so `line` is not a constant. */
  DSS_AUTO_LINE: "0xc7bdd1f2b16447dcf3de045c4a039a60ec2f0ba3",
} as const;

/**
 * Ilks that carry Vat state but are ABSENT from the IlkRegistry's `list()`.
 *
 * The registry is Maker's only ilk enumerator, and it is a curated list, not the
 * Vat's own truth: governance removes an ilk from it on wind-down while the Vat
 * keeps the ilk's slot forever. So a sum over `list()` alone silently omits
 * whatever was delisted — the exact failure the system view's reconcile exists
 * to catch.
 *
 * These three each hold `Art = 1` (one wei of normalized debt) — dust that will
 * never be repaid, since repaying costs more gas than it clears. Together they
 * are 3.16e-18 DAI against a $12bn system, which is precisely why they are worth
 * naming: without them the Vat's own identity misses by exactly their sum, and a
 * reconcile that is off by three wei is indistinguishable from one that is off
 * because the read is wrong.
 *
 * SAI is the original Single-Collateral Dai ilk — the system Maker migrated away
 * from in 2019. RWA012-A and RWA013-A are delisted real-world-asset vaults.
 *
 * This list is NOT load-bearing for correctness: `residualRad` is computed live
 * against `Vat.debt` regardless, so a fourth delisting would surface as a
 * non-zero residual on the page rather than hide. It is load-bearing for the
 * reconcile CLOSING — found by probing every historical ilk name against the Vat
 * (scripts/verify-makerdao-chain.mjs §5) at block 25,539,122.
 */
export const UNLISTED_ILKS = ["SAI", "RWA012-A", "RWA013-A"] as const;

/**
 * What an ilk IS — the split the system view groups by, and the reason the
 * explorer's vault roster covers ~5.6% of Maker's debt.
 *
 * `IlkRegistry.info().class` is the chain's own tag but does NOT answer this on
 * its own: the three legacy PSMs sit in class 1 (`CLASS_GEM`) beside ETH-A,
 * because a PSM really is a GemJoin — just one no user borrows through. So the
 * class is the spine and the ilk's own name discriminates within it. Both
 * operands are chain values; the grouping is our reading of them, which is why
 * the provenance ships it as `chain-derived` with the rule on its face.
 */
export type MakerIlkGroup = "vault" | "psm" | "allocator" | "d3m" | "rwa" | "delisted";

/** Registry class → group, for the classes that map cleanly. */
const CLASS_GROUP: Record<number, MakerIlkGroup> = {
  3: "rwa", // CLASS_RWA
  4: "d3m", // CLASS_D3M — also carries TELEPORT-FW-A
  5: "allocator",
  6: "psm", // LITE-PSM
  7: "vault", // LockStake engine (decision 0013 — LSE borrower urns are vaults here)
};

/**
 * Group an ilk by its registry class and its own name. `cls` is null for an ilk
 * the registry doesn't list — those are delisted by definition (see
 * UNLISTED_ILKS).
 */
export function ilkGroup(ilk: string, cls: number | null): MakerIlkGroup {
  if (cls == null) return "delisted";
  // Name beats class where the class is deliberately coarse: a PSM is a GemJoin
  // (class 1) that no user can open a vault in, and calling it a vault type
  // would put $5.1bn of module inventory in the "user borrowing" bucket.
  if (ilk.startsWith("PSM-") || ilk.startsWith("LITE-PSM-")) return "psm";
  if (ilk.startsWith("ALLOCATOR-")) return "allocator";
  if (ilk.startsWith("DIRECT-") || ilk.startsWith("TELEPORT-")) return "d3m";
  if (ilk.startsWith("RWA")) return "rwa";
  return CLASS_GROUP[cls] ?? "vault";
}

/** Is this an ilk a user can hold a vault in — i.e. what /makerdao indexes? */
export const isUserVaultIlk = (group: MakerIlkGroup): boolean => group === "vault";

/** The lifecycle-status dust line (mig 156): a vault reads open only while ink
 *  or art stands above 1e12 wei = 1e-6 tokens. A terminal vault can therefore
 *  still carry a wei-scale trace in either slot — the residue the tower shows
 *  at true magnitude and the pane/receipts explain. */
export const MAKER_STATUS_DUST = 1e-6;

/** DAI — the debt token every CdpManager vault draws. `art × rate` resolves to this. */
export const DAI_META = { symbol: "DAI", decimals: 18, address: MAKER_ADDRESSES.DAI } as const;

/** USDS — the debt token LockStake urns draw (same Vat dai accounting, minted
 *  1:1 through the UsdsJoin instead of the DaiJoin). */
export const USDS_META = { symbol: "USDS", decimals: 18, address: MAKER_ADDRESSES.USDS } as const;

/** A LockStake Engine ilk (v2 today; the dormant v1 LSE-MKR-A would also match
 *  the prefix if it ever surfaces). */
export function isLseIlk(ilk: string): boolean {
  return ilk.startsWith("LSEV2-") || ilk.startsWith("LSE-");
}

/** The debt token a vault's `art × rate` resolves to. Same Vat unit either way;
 *  what differs is which join mints the ERC-20 — mislabeling an LSE vault's
 *  drawn USDS as DAI would be a provenance error, not a cosmetic one. */
export function ilkDebtMeta(ilk: string): typeof DAI_META | typeof USDS_META {
  return isLseIlk(ilk) ? USDS_META : DAI_META;
}

/** Shorthand for the symbol alone — the common render-site need. */
export function ilkDebtSymbol(ilk: string): string {
  return ilkDebtMeta(ilk).symbol;
}

// Display-symbol overrides where the ilk prefix isn't the nice token symbol.
const SYMBOL_OVERRIDES: Record<string, string> = {
  WSTETH: "wstETH",
  RETH: "rETH",
  WBTC: "WBTC",
  WETH: "ETH",
  ETH: "ETH",
  MATIC: "POL",
  GUSD: "GUSD",
  USDC: "USDC",
  PAX: "USDP",
  USDP: "USDP",
  TUSD: "TUSD",
};

/** Human display symbol for an ilk's collateral, e.g. "ETH-C" → "ETH",
 *  "WSTETH-B" → "wstETH", "PSM-USDC-A" → "USDC". Falls back to the ilk's leading
 *  segment, then the raw ilk — never guesses beyond the chain's own ilk string. */
export function ilkToCollateralSymbol(ilk: string): string {
  if (!ilk) return "";
  // Peg-Stability-Module and Direct-Deposit (D3M) ilks name the asset in segment 2.
  if (ilk.startsWith("PSM-")) {
    const seg = ilk.split("-")[1] ?? "";
    return SYMBOL_OVERRIDES[seg] ?? seg;
  }
  if (ilk.startsWith("UNIV2")) return "UNI-V2 LP";
  if (ilk.startsWith("CRV") || ilk.startsWith("GUNIV3")) return "LP";
  if (ilk.startsWith("RWA")) return "RWA";
  if (ilk.startsWith("DIRECT-")) return "DAI";
  // LockStake: staked SKY collateral (v2); the dormant v1 engine staked MKR.
  if (ilk.startsWith("LSEV2-")) return "SKY";
  if (ilk.startsWith("LSE-")) return "MKR";
  const head = ilk.split("-")[0];
  return SYMBOL_OVERRIDES[head] ?? head;
}
