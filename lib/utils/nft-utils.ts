// NFT contract addresses for different collateral types
const NFT_CONTRACTS: Record<string, string> = {
  WETH: "0x1a0fc0b843afd9140267d25d4e575cb37a838013",
  wstETH: "0x857aecebf75f1012dc18e15020c97096aea31b04",
  rETH: "0x7ae430e25b431e1d1dc048a5bcf24c0873",
};

/**
 * Gets the NFT contract address for a given collateral type
 */
export function getNftContractAddress(collateralType: string): string | null {
  return NFT_CONTRACTS[collateralType] || null;
}

/**
 * Generates an OpenSea URL for a trove NFT
 */
export function getTroveNftUrl(collateralType: string, troveId: string): string | null {
  const contractAddress = getNftContractAddress(collateralType);
  if (!contractAddress || !troveId) {
    return null;
  }

  return `https://opensea.io/item/ethereum/${contractAddress}/${troveId}`;
}
