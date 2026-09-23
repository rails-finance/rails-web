// PWN timeline — the `api` arm's presentation transform (chain-state tier).
// ----------------------------------------------------------------------------
// rails-server returns the raw mv_pwn_events rows (one per lifecycle event, LEFT
// JOINed to the decoded loan terms for parties + economics). Unlike Spark/Comet
// there is NO running-balance replay — a PWN loan is a DISCRETE fixed-term
// agreement, so each event stands alone (created → minted → paid_back | claimed →
// extended? → burned). This transform maps each row to a BaseActivityEvent +
// PwnContext the chain-state cards consume, resolving ERC20/721 symbol/decimals
// (one multicall). Amounts-only — no USD, no health factor (those are layers).
//
// A wallet is a LENDER or a BORROWER (dual role); `viewerRole` records which side
// the viewed wallet sits on, so the card can frame the loan from its perspective.
//
// SERVER-ONLY — imported from the /api/pwn/* route handlers.

import type {
  BaseActivityEvent,
  AssetFlow,
  PwnContext,
  PwnEventType,
  PwnTokenCategory,
} from "@/lib/shared/types/event-shape";
import { resolveErc20Meta, scaleRaw, type Erc20Meta } from "@/lib/sources/chain/erc20-meta";
import { pwnAssetSymbolOverride } from "@/lib/pwn/asset-catalog";

import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface PwnTimelineResult {
  wallet: string;
  events: BaseActivityEvent[];
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch (see
   *  lib/shared/timeline-row-ceiling.ts): what was served against what the
   *  position actually holds. The route attaches it; absent means uncapped. */
  rowCeiling?: TimelineRowCeiling;
}

/** One row of mv_pwn_events, exactly as the rails /api/pwn/timeline route
 *  projects it. numeric/bigint columns arrive as strings from pg. */
export interface MvRow {
  event_key: string;
  loan_id: string;
  action: string;
  version: string | null;
  block_timestamp: string;
  block_number: string;
  tx_index: number | null;
  log_index: number;
  tx_hash: string;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  defaulted: boolean | null;
  original_default_timestamp: string | null;
  extended_default_timestamp: string | null;
  lender: string | null;
  borrower: string | null;
  due_kind: string | null;
  due_value: string | null;
  collateral_category: string | null;
  collateral_asset: string | null;
  collateral_id: string | null;
  collateral_amount: string | null;
  credit_category: string | null;
  credit_asset: string | null;
  credit_amount: string | null;
  loan_repay_amount: string | null;
}

const LABELS: Record<PwnEventType, string> = {
  created: "Created",
  minted: "Minted",
  paid_back: "Repaid",
  claimed: "Claimed",
  extended: "Extended",
  burned: "Burned",
};

const ZERO = BigInt(0);

function bigintOf(raw: string | null): bigint {
  if (raw == null || raw === "") return ZERO;
  try {
    return BigInt(raw.split(".")[0]);
  } catch {
    return ZERO;
  }
}

/** Exact raw → decimal string for a token's decimals (trims trailing zeros). */
function fmtUnits(raw: bigint, decimals: number): string {
  const neg = raw < ZERO;
  const a = neg ? -raw : raw;
  if (decimals <= 0) return `${neg ? "-" : ""}${a.toString()}`;
  const div = BigInt("1" + "0".repeat(decimals));
  const whole = (a / div).toString();
  const frac = (a % div).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Normalize the stored category text to the MultiToken enum label. */
function categoryOf(raw: string | null): PwnTokenCategory | undefined {
  if (raw === "ERC20" || raw === "ERC721" || raw === "ERC1155") return raw;
  return undefined;
}

/** A token amount is scaled by decimals ONLY for fungible ERC20 collateral/credit;
 *  ERC721/1155 amounts are raw integer counts (and the token id names the asset),
 *  so treat them as 0-decimals. resolveErc20Meta reads `decimals()` which reverts
 *  on an NFT (→ its 18-dp fallback) — the category, not the read, decides. */
function displayAmount(raw: bigint, category: PwnTokenCategory | undefined, meta: Erc20Meta | undefined): string {
  const decimals = category === "ERC20" ? (meta?.decimals ?? 18) : 0;
  return fmtUnits(raw, decimals);
}

/**
 * Transform raw mv_pwn_events rows → { wallet, events, totalEvents }. Each event
 * is discrete (no fold); only chain-direct presentation (symbols, amounts) here.
 */
export async function buildPwnTimeline(rows: MvRow[], walletRaw: string): Promise<PwnTimelineResult> {
  const wallet = walletRaw.toLowerCase();

  // One batched ERC20/721 multicall over every asset referenced (symbol resolves
  // for NFTs too; decimals is only trusted for the ERC20 category, see above).
  const addrs = new Set<string>();
  for (const r of rows) {
    for (const a of [r.collateral_asset, r.credit_asset]) {
      if (a) addrs.add(a.toLowerCase());
    }
  }
  const metas = await resolveErc20Meta([...addrs]);
  const fallback = (addr: string): Erc20Meta => ({
    address: addr,
    symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
    decimals: 18,
  });
  const meta = (a: string | null): Erc20Meta | undefined => {
    if (a == null) return undefined;
    const addr = a.toLowerCase();
    const base = metas.get(addr) ?? fallback(addr);
    // Protocol-own assets (the Token Bundler) carry a catalog name the chain
    // cannot provide (ERC-1155 has no symbol()/name()).
    const override = pwnAssetSymbolOverride(addr);
    return override ? { ...base, symbol: override, named: true } : base;
  };

  const events: BaseActivityEvent[] = rows.map((r) => {
    const tx = r.tx_hash;
    const kind = r.action as PwnEventType;
    const collCat = categoryOf(r.collateral_category);
    const creditCat = categoryOf(r.credit_category);
    const collMeta = meta(r.collateral_asset);
    const creditMeta = meta(r.credit_asset);

    const lender = r.lender?.toLowerCase() ?? undefined;
    const borrower = r.borrower?.toLowerCase() ?? undefined;
    const viewerRole: "lender" | "borrower" | undefined =
      wallet === lender ? "lender" : wallet === borrower ? "borrower" : undefined;

    const creditRaw = bigintOf(r.credit_amount);
    const repayRaw = bigintOf(r.loan_repay_amount);
    const collRaw = bigintOf(r.collateral_amount);

    const ctx: PwnContext = {
      eventType: kind,
      loanId: r.loan_id,
      version: r.version,
      lender,
      borrower,
      viewerRole,
      collateralCategory: collCat,
      collateralSymbol: collMeta?.symbol,
      collateralAsset: r.collateral_asset?.toLowerCase(),
      collateralId: r.collateral_id ?? undefined,
      collateralAmount: r.collateral_amount != null ? displayAmount(collRaw, collCat, collMeta) : undefined,
      creditSymbol: creditMeta?.symbol,
      creditAsset: r.credit_asset?.toLowerCase(),
      creditAmount: r.credit_amount != null ? displayAmount(creditRaw, creditCat, creditMeta) : undefined,
      loanRepayAmount: r.loan_repay_amount != null ? displayAmount(repayRaw, creditCat, creditMeta) : undefined,
      dueKind: r.due_kind === "expiration" || r.due_kind === "duration" ? r.due_kind : undefined,
      dueValue: r.due_value ?? undefined,
      originalDefaultTimestamp: r.original_default_timestamp ?? undefined,
      extendedDefaultTimestamp: r.extended_default_timestamp ?? undefined,
      defaulted: kind === "claimed" ? (r.defaulted ?? undefined) : undefined,
      isOpen: kind === "created",
    };

    // Flows model the value that MOVED at this event, signed toward the viewer:
    //   created    — the lender advances credit to the borrower
    //   paid_back  — the borrower repays (principal + fixed interest)
    //   claimed+default — the lender seizes the collateral
    // minted / burned (the LOAN-NFT) and extended (a term change) move no value.
    const flows: AssetFlow[] = [];
    const push = (m: Erc20Meta | undefined, cat: PwnTokenCategory | undefined, raw: bigint, toBorrower: boolean) => {
      if (!m || raw === ZERO) return;
      // "in" = toward the viewed wallet. If the viewer is the borrower and the
      // value flows to the borrower, it's "in"; symmetric for the lender.
      const dir: "in" | "out" =
        viewerRole === "borrower"
          ? toBorrower
            ? "in"
            : "out"
          : viewerRole === "lender"
            ? toBorrower
              ? "out"
              : "in"
            : toBorrower
              ? "in"
              : "out";
      const decimals = cat === "ERC20" ? m.decimals : 0;
      flows.push({
        token: m.address,
        tokenSymbol: m.symbol,
        tokenDecimals: decimals,
        amount: raw.toString(),
        amountFormatted: Number(fmtUnits(raw, decimals)),
        direction: dir,
      });
    };
    if (kind === "created") push(creditMeta, creditCat, creditRaw, true);
    else if (kind === "paid_back") push(creditMeta, creditCat, repayRaw, false);
    else if (kind === "claimed" && r.defaulted) push(collMeta, collCat, collRaw, false);

    return {
      id: r.event_key ?? `${tx}-${r.log_index}`,
      txHash: tx,
      blockNumber: Number(r.block_number),
      timestamp: Number(r.block_timestamp),
      wallet,
      actionType: kind,
      actionLabel: LABELS[kind] ?? kind,
      flows,
      etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", tx),
      context: { protocol: "pwn", data: ctx },
    };
  });

  return { wallet, events, totalEvents: events.length };
}
