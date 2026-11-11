// A wallet's Uniswap V3 positions on Base (components/protocol/uniswap/uniswap-wallet-positions.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { UniswapRowFocus } from "@/components/protocol/uniswap/uniswap-focus";
import { UniswapWalletPositions } from "@/components/protocol/uniswap/uniswap-wallet-positions";

interface Props {
  params: Promise<{ wallet: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  return positionMetadata({ session: "uniswap-v3-base", subject: wallet, canonicalPath: `/base/uniswap-v3/${wallet}` });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  // Focus: each row is kept where one of its position's tokens is in focus.
  return (
    <UniswapWalletPositions
      version="v3"
      protocol="uniswap"
      chainId={8453}
      wallet={wallet}
      focusRow={(tokens, row) => (
        <UniswapRowFocus tokens={tokens} protocol="uniswap" chain={8453}>
          {row}
        </UniswapRowFocus>
      )}
    />
  );
}
