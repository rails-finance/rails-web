// ============================================================================
// FETCH PWN BUNDLE CONTENTS (chain state)
// ============================================================================
//
// What a PWN Token Bundler bundle — the protocol's own ERC-1155 that wraps
// several assets into one token, the shape multi-asset collateral takes on
// PWN — contained, read from the bundler's own tokensInBundle(id) view at the
// loan's creation block. The bundle is emptied when unwrapped after the loan
// closes, so the head state of a closed loan's bundle is empty: the
// creation-block state is the loan's truth. Detail page only — the listing
// does no per-row chain reads.

export interface PwnBundleAsset {
  category: "ERC20" | "ERC721" | "ERC1155" | "unknown";
  /** Lowercased contract address. */
  address: string;
  /** On-chain symbol()/name() when the contract has one, else the truncated address. */
  symbol: string;
  named: boolean;
  /** Token id for ERC721/1155 contents; null for ERC20. */
  tokenId: string | null;
  /** Scaled amount for ERC20; integer count for NFTs (an ERC721 entry is 1). */
  amount: number;
}

export interface PwnBundleContentsResponse {
  bundleId: string;
  atBlock: number;
  assets: PwnBundleAsset[];
}

export interface FetchPwnBundleParams {
  bundleId: string;
  /** The loan's creation block — the read is pinned there (see above). */
  block: number;
  baseUrl?: string;
}

export async function fetchPwnBundleContents(p: FetchPwnBundleParams): Promise<PwnBundleContentsResponse> {
  const qs = new URLSearchParams({ id: p.bundleId, block: String(p.block) });
  const url = `${p.baseUrl ?? ""}/api/chain/pwn/bundle?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchPwnBundleContents failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as PwnBundleContentsResponse;
}
