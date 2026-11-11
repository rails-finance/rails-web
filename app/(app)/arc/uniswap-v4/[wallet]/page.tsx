// A wallet's Uniswap V4 positions on Arc (components/protocol/uniswap/uniswap-wallet-positions.tsx).

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
  return positionMetadata({
    session: "uniswap-v4-arc",
    subject: wallet,
    canonicalPath: `/arc/uniswap-v4/${wallet}`,
  });
}

export default async function Page({ params }: Props) {
  const { wallet } = await params;
  // Focus: each row is kept where one of its position's tokens is in focus.
  return (
    <UniswapWalletPositions
      version="v4"
      protocol="uniswap"
      chainId={5042}
      wallet={wallet}
      focusRow={(tokens, row) => (
        <UniswapRowFocus tokens={tokens} protocol="uniswap" chain={5042}>
          {row}
        </UniswapRowFocus>
      )}
    />
  );
}
