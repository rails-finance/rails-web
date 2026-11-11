// One Uniswap V4 position on Arc (components/protocol/uniswap/uniswap-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { UniswapPositionFocus } from "@/components/protocol/uniswap/uniswap-focus";
import {
  UniswapPositionPage,
  isPositionId,
  loadUniswapPosition,
} from "@/components/protocol/uniswap/uniswap-position-page";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return positionMetadata({
    session: "uniswap-v4-arc",
    subject: id,
    canonicalPath: `/arc/uniswap-v4/position/${id}`,
  });
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  // Focus: the page is gated by the position's two tokens (the read is shared with the page).
  const answer = isPositionId(id) ? await loadUniswapPosition("v4", id, "uniswap", 5042) : null;
  const tokens = answer?.kind === "ok" ? [answer.data.token0.address, answer.data.token1.address] : null;
  return (
    <UniswapPositionFocus tokens={tokens} protocol="uniswap" chain={5042}>
      <UniswapPositionPage version="v4" protocol="uniswap" chainId={5042} id={id} />
    </UniswapPositionFocus>
  );
}
