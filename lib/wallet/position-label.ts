// A counted position's name in the wallet heading's positions menu (H13.2;
// ui-jobs 701): what its page's heading names it by, less the protocol, which
// the row's icon carries. Built from the summary route's fields alone
// (`WalletCountsPosition`), so the menu makes no read of its own. Where a
// family's row lacks what its heading shows, the label is the shortest one
// the row supports. Client-safe, imports nothing.

export interface LabelledPosition {
  family: string;
  positionId: string;
  market?: string;
  collateral?: string;
  debt?: string;
}

/** The families whose position is a Trove, its id `<branch>:<troveId>`. */
const TROVE_FAMILIES = new Set(["liquity-v2", "ebisu", "asymmetry", "basedollar"]);

/** A long id as the Liquity family's cards shorten it: "165719…6943". */
const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

/** An address or hash as "0x3d25…1dcf". */
const shortHex = (h: string) => {
  const x = h.startsWith("0x") ? h : `0x${h}`;
  return `${x.slice(0, 6)}…${x.slice(-4)}`;
};

const afterColon = (id: string) => id.slice(id.lastIndexOf(":") + 1);

/** "WETH #165719…6943" (a Trove), "Core" (an Aave V3 market), "cUSDCv3" (a
 *  Comet), "USDC / ETH #19526" (a Fluid NFT), "ETH-A #2028" (a Maker vault),
 *  "Market 0x3a85…ee49" (a Morpho market whose symbols the row does not
 *  carry); "Account" where the row names nothing but the wallet (Aave V3 on
 *  Base and Arbitrum, SparkLend). */
export function positionLabel(p: LabelledPosition): string {
  if (TROVE_FAMILIES.has(p.family)) {
    const branch = p.market ?? p.positionId.split(":")[0];
    return `${branch} #${shortId(afterColon(p.positionId))}`;
  }
  if (p.family === "morpho") {
    if (p.collateral && p.debt) return `${p.collateral}/${p.debt}`;
    if (p.market && /^(0x)?[0-9a-f]{64}$/i.test(p.market)) return `Market ${shortHex(p.market)}`;
    return p.market ?? "Account";
  }
  if (p.family === "makerdao") {
    const id = /^\d+$/.test(p.positionId) ? `#${p.positionId}` : shortHex(p.positionId);
    return p.market ? `${p.market} ${id}` : id;
  }
  if (p.family === "fluid") {
    const pair = p.market ?? (p.collateral && p.debt ? `${p.collateral} / ${p.debt}` : undefined);
    const id = /^\d+$/.test(p.positionId) ? `#${p.positionId}` : undefined;
    return [pair, id].filter(Boolean).join(" ") || "Account";
  }
  return p.market ?? "Account";
}
