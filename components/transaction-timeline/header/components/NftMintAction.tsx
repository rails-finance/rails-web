"use client";

import { Image, Link2 } from "lucide-react";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";

interface NftMintActionProps {
  collateralType: string;
  troveId: string;
}

export function NftMintAction({ collateralType, troveId }: NftMintActionProps) {
  const nftUrl = getTroveNftUrl(collateralType, troveId);

  if (!nftUrl) {
    return null;
  }

  return (
    <div className="flex items-center space-x-1">
      <span className="text-slate-400 mr-1">Mint</span>
      <Image size={16} className="text-slate-300" />
    </div>
  );
}
