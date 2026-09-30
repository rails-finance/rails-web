// How a loan's NFT collateral came back to its borrower after an earlier
// loan's default (app/api/chain/pwn/collateral-transfer). Detail page only.

export interface PwnCollateralTransferRow {
  from: string;
  to: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

export async function fetchPwnCollateralTransfers(p: {
  asset: string;
  category: "ERC721" | "ERC1155";
  id: string;
  lender: string;
  borrower: string;
  fromBlock: number;
  toBlock: number;
}): Promise<PwnCollateralTransferRow[]> {
  const qs = new URLSearchParams({
    asset: p.asset,
    category: p.category,
    id: p.id,
    lender: p.lender,
    borrower: p.borrower,
    fromBlock: String(p.fromBlock),
    toBlock: String(p.toBlock),
  });
  const res = await fetch(`/api/chain/pwn/collateral-transfer?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchPwnCollateralTransfers failed: ${res.status}`);
  return ((await res.json()) as { transfers: PwnCollateralTransferRow[] }).transfers;
}
