// PWN positions listing — the `api` arm's presentation transform (chain-state tier).
// ----------------------------------------------------------------------------
// The rails-server route (/api/pwn/positions) does the structural work — filter,
// sort, paginate over mv_pwn_positions — and returns the page slice as RAW per-
// loan rows (parties + token addresses + fixed loan economics + status). Unlike
// Spark/Comet a "position" is a DISCRETE loan (one loan_id), not a pooled account,
// so the grain is one row per loan. This builder resolves ERC20/721 symbols (one
// cached multicall over the page's asset universe) and scales the amounts. Chain-
// direct economics only — no HF, no USD (those are layers; the route ships neither).

import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { pwnAssetSymbolOverride } from "@/lib/pwn/asset-catalog";
import type { PwnTokenCategory } from "@/lib/shared/types/event-shape";

export type PwnPositionStatus = "open" | "repaid" | "defaulted";
export type PwnPositionSort = "created" | "events";

/** One side of the loan (collateral locked, or credit advanced), named + scaled. */
export interface PwnAsset {
  category: PwnTokenCategory | null;
  symbol: string;
  /** False when `symbol` is only the truncated address (no on-chain name and no
   *  catalog entry) — the card renders an identifier, not a token symbol. */
  named: boolean;
  address: string;
  /** ERC721/1155 token id (integer string); null for ERC20. */
  tokenId: string | null;
  /** Display amount — scaled by decimals for ERC20, raw integer for NFTs. */
  amount: number;
  amountRaw: string;
}

export interface PwnPositionSummary {
  loanId: string;
  version: string | null;
  status: PwnPositionStatus;
  defaulted: boolean;
  lender: string | null;
  borrower: string | null;
  /** Collateral the borrower locked (null when the loan's terms are unindexed). */
  collateral: PwnAsset | null;
  /** Credit the lender advanced. */
  credit: PwnAsset | null;
  /** Fixed total the borrower must repay = principal + fixed interest. */
  repayAmount: number | null;
  repayAmountRaw: string | null;
  /** v1.2+ accruing rate (APR, integer basis); null / 0 for v1.1 fixed-only. */
  accruingInterestApr: number | null;
  dueKind: "expiration" | "duration" | null;
  dueValue: string | null;
  createdBlock: number | null;
  createdAt: number | null;
  closedBlock: number | null;
  closedAt: number | null;
  eventCount: number;
}

/** One loan's page-slice row from the rails route (pre-presentation). */
export interface RawPwnPositionRow {
  loanId: string;
  version: string | null;
  status: string;
  defaulted: boolean;
  lender: string | null;
  borrower: string | null;
  dueKind: string | null;
  dueValue: string | null;
  collateralCategory: string | null;
  collateralAsset: string | null;
  collateralId: string | null;
  collateralAmountRaw: string | null;
  creditCategory: string | null;
  creditAsset: string | null;
  creditId: string | null;
  creditAmountRaw: string | null;
  loanRepayAmountRaw: string | null;
  fixedInterestAmountRaw: string | null;
  accruingInterestApr: number | null;
  createdBlock: number | null;
  createdAt: number | null;
  closedBlock: number | null;
  closedAt: number | null;
  eventCount: number;
}

const ZERO = BigInt(0);

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

function categoryOf(raw: string | null): PwnTokenCategory | null {
  if (raw === "ERC20" || raw === "ERC721" || raw === "ERC1155") return raw;
  return null;
}

function statusOf(raw: string): PwnPositionStatus {
  return raw === "defaulted" || raw === "repaid" ? raw : "open";
}

/** Assemble the listing rows from the rails route's raw page slice. Filtering,
 *  sorting and pagination already happened server-side, so this only resolves
 *  metadata and shapes the rows — order is preserved. */
export async function buildPwnPositionRows(raw: RawPwnPositionRow[]): Promise<PwnPositionSummary[]> {
  // One cached multicall over every referenced asset address.
  const allAddrs = new Set<string>();
  for (const r of raw) {
    if (r.collateralAsset) allAddrs.add(r.collateralAsset.toLowerCase());
    if (r.creditAsset) allAddrs.add(r.creditAsset.toLowerCase());
  }
  const metas = await resolveErc20Meta([...allAddrs]);
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
  });

  // For an NFT the token id names the asset and the amount is a raw count, so
  // decimals apply ONLY to the fungible ERC20 category (decimals() reverts on an
  // NFT → the meta's 18-dp fallback would otherwise mis-scale a token id).
  const asset = (
    addr: string | null,
    cat: PwnTokenCategory | null,
    id: string | null,
    amountRaw: string | null,
  ): PwnAsset | null => {
    if (!addr) return null;
    const a = addr.toLowerCase();
    const meta = metas.get(a) ?? fallback(a);
    const override = pwnAssetSymbolOverride(a);
    const rawStr = amountRaw ?? "0";
    const decimals = cat === "ERC20" ? meta.decimals : 0;
    return {
      category: cat,
      symbol: override ?? meta.symbol,
      named: override != null || meta.named === true,
      address: a,
      tokenId: cat === "ERC20" ? null : (id ?? null),
      amount: scaleRaw(bigintOf(rawStr), decimals),
      amountRaw: rawStr,
    };
  };

  return raw.map((r) => {
    const creditCat = categoryOf(r.creditCategory);
    const creditMeta = r.creditAsset
      ? (metas.get(r.creditAsset.toLowerCase()) ?? fallback(r.creditAsset.toLowerCase()))
      : undefined;
    const repayDecimals = creditCat === "ERC20" ? (creditMeta?.decimals ?? 18) : 0;
    return {
      loanId: r.loanId,
      version: r.version,
      status: statusOf(r.status),
      defaulted: r.defaulted,
      lender: r.lender,
      borrower: r.borrower,
      collateral: asset(r.collateralAsset, categoryOf(r.collateralCategory), r.collateralId, r.collateralAmountRaw),
      credit: asset(r.creditAsset, creditCat, r.creditId, r.creditAmountRaw),
      repayAmount: r.loanRepayAmountRaw != null ? scaleRaw(bigintOf(r.loanRepayAmountRaw), repayDecimals) : null,
      repayAmountRaw: r.loanRepayAmountRaw,
      accruingInterestApr: r.accruingInterestApr,
      dueKind: r.dueKind === "expiration" || r.dueKind === "duration" ? r.dueKind : null,
      dueValue: r.dueValue,
      createdBlock: r.createdBlock,
      createdAt: r.createdAt,
      closedBlock: r.closedBlock,
      closedAt: r.closedAt,
      eventCount: r.eventCount,
    };
  });
}
