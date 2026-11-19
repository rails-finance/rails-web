// A Liquity V2 redeemer: the wire shape of rails-server's GET
// /api/liquity-v2/redeemer/:address (api/src/routes/liquityV2Redeemer.ts,
// mig 496), and the one fetch both halves of the page read it with.
//
// A row is one Trove's share of a redemption the wallet sent: the
// redeemCollateral TroveOperation log. bold_raw is the BOLD redeemed against
// the Trove (−_debtChangeFromOperation), coll_raw the collateral paid out of it
// (−_collChangeFromOperation), raw decimal strings in 1e18 units; the
// redemption fee stays in the Trove and is not in coll_raw. The wallet is the
// transaction's sender; the collateral goes to the caller of
// CollateralRegistry.redeemCollateral. Totals cover every row of the wallet.

export type LiquityV2RedeemerBranch = "WETH" | "wstETH" | "rETH";

export interface LiquityV2RedemptionRow {
  collateral_type: LiquityV2RedeemerBranch;
  trove_id: string;
  bold_raw: string;
  coll_raw: string;
  block_number: string;
  block_timestamp: string;
  transaction_hash: string;
  transaction_index: number;
  log_index: number;
  /** The branch TroveManager that logged it. */
  contract_address: string;
}

export interface LiquityV2RedeemerBranchTotals {
  collateral_type: LiquityV2RedeemerBranch;
  operations: number;
  troves_hit: number;
  transactions: number;
  bold_raw: string;
  coll_raw: string;
  first_block: string;
  last_block: string;
}

export interface LiquityV2RedeemerResponse {
  address: string;
  served_thru_block: string | null;
  totals: {
    transactions: number;
    operations: number;
    troves_hit: number;
    /** BOLD across the branches. */
    bold_raw: string;
    first_block: string | null;
    last_block: string | null;
    branches: LiquityV2RedeemerBranchTotals[];
  };
  pagination: { total: number; limit: number; offset: number; order: "asc" | "desc" };
  rows: LiquityV2RedemptionRow[];
}

/** The params the proxy forwards. */
export const LIQUITY_V2_REDEEMER_PARAMS = ["limit", "offset", "order"] as const;

export function liquityV2RedeemerQuery(params: URLSearchParams | Record<string, string | undefined>): string {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]);
  const qs = new URLSearchParams();
  for (const k of LIQUITY_V2_REDEEMER_PARAMS) {
    const v = get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  return qs.toString();
}

/** One read: through the proxy from the browser (`baseUrl` absent), or the
 *  box from a server render (`boxHop()`'s base and headers). */
export async function readLiquityV2Redeemer(
  address: string,
  params: Record<string, string | undefined>,
  opts: { baseUrl?: string; headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<LiquityV2RedeemerResponse> {
  const url = `${opts.baseUrl ?? ""}/api/liquity-v2/redeemer/${address.toLowerCase()}?${liquityV2RedeemerQuery(params)}`;
  const res = await fetch(url, { cache: "no-store", headers: opts.headers, signal: opts.signal });
  if (!res.ok) throw new Error(`Liquity V2 redeemer read failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as LiquityV2RedeemerResponse;
}
