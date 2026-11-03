// PWN's two loan-page chain reads, asked of rails-server's at-block routes.
// ----------------------------------------------------------------------------
// `GET /api/at-block/pwn/bundle` answers TokenBundler.tokensInBundle(id) at a
// block as MultiToken structs (category number, address, id and amount as
// decimal strings); `GET /api/at-block/pwn/collateral-transfer` answers the
// token's transfers of an id from the lender or to the borrower, in the shape
// and order lib/sources/chain/pwn-collateral-transfer.ts returns
// (rails-server api/src/routes/atBlockPwn.ts; rails-ops decisions/0056). Null
// where the route cannot answer: the web route then reads the chain as before.
// After a 5xx, 429, refusal or timeout the chain is read for 30 s without
// asking (`route-gate.ts`).
//
// SERVER-ONLY.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { PWN_ADDRESSES } from "@/lib/pwn/asset-catalog";
import type { PwnCollateralTransfer } from "@/lib/sources/chain/pwn-collateral-transfer";
import { routeGate } from "./route-gate";

/** One MultiToken.Asset as tokensInBundle returns it. */
export interface RawBundleAsset {
  category: number;
  assetAddress: string;
  id: bigint;
  amount: bigint;
}

const gate = routeGate();
const UINT = /^\d+$/;

/** The bundle's contents at `block`, or null. */
export async function fetchPwnBundleAssets(bundleId: string, block: number): Promise<RawBundleAsset[] | null> {
  const qs = new URLSearchParams({ id: bundleId, block: String(block) });
  const r = await gate.json<{ bundler?: unknown; id?: unknown; block?: unknown; assets?: unknown }>(
    "bundle",
    `${process.env.RAILS_API_URL}/api/at-block/pwn/bundle?${qs}`,
    createAuthFetchOptions(),
  );
  if (!r || r.id !== bundleId || r.block !== block || !Array.isArray(r.assets)) return null;
  if (String(r.bundler).toLowerCase() !== PWN_ADDRESSES.TOKEN_BUNDLER.toLowerCase()) return null;
  const out: RawBundleAsset[] = [];
  for (const a of r.assets as Record<string, unknown>[]) {
    if (a == null || typeof a.category !== "number" || typeof a.assetAddress !== "string") return null;
    if (typeof a.id !== "string" || !UINT.test(a.id) || typeof a.amount !== "string" || !UINT.test(a.amount))
      return null;
    out.push({ category: a.category, assetAddress: a.assetAddress, id: BigInt(a.id), amount: BigInt(a.amount) });
  }
  return out;
}

/** The collateral's transfers between two loans, oldest first, or null. */
export async function fetchPwnCollateralTransfers(p: {
  asset: string;
  category: "ERC721" | "ERC1155";
  id: string;
  lender: string;
  borrower: string;
  fromBlock: number;
  toBlock: number;
}): Promise<PwnCollateralTransfer[] | null> {
  const qs = new URLSearchParams({
    asset: p.asset,
    category: p.category,
    id: p.id,
    lender: p.lender,
    borrower: p.borrower,
    fromBlock: String(p.fromBlock),
    toBlock: String(p.toBlock),
  });
  const r = await gate.json<{ transfers?: unknown }>(
    "collateral-transfer",
    `${process.env.RAILS_API_URL}/api/at-block/pwn/collateral-transfer?${qs}`,
    createAuthFetchOptions(),
  );
  if (!r || !Array.isArray(r.transfers)) return null;
  const rows = r.transfers as Record<string, unknown>[];
  const ok = rows.every(
    (t) =>
      t != null &&
      typeof t.from === "string" &&
      typeof t.to === "string" &&
      typeof t.txHash === "string" &&
      typeof t.blockNumber === "number" &&
      typeof t.timestamp === "number",
  );
  if (!ok) return null;
  return rows.map((t) => ({
    from: (t.from as string).toLowerCase(),
    to: (t.to as string).toLowerCase(),
    txHash: t.txHash as string,
    blockNumber: t.blockNumber as number,
    timestamp: t.timestamp as number,
  }));
}
