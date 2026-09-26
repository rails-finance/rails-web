import type { Metadata } from "next";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import {
  TransmuterPositionPage,
  transmuterPositionMetadata,
  type TransmuterPositionParams,
} from "@/lib/alchemix/transmuter-route";

// One Transmuter position on Ethereum. Both explorers run the same route body
// (lib/alchemix/transmuter-route.tsx); this file is the deployment it is given.
// force-dynamic because the maturity is stated against the line's indexed
// head, which moves.

interface Props {
  params: Promise<TransmuterPositionParams>;
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return transmuterPositionMetadata(ALCHEMIX_ETHEREUM, await params);
}

export default async function EthereumTransmuterPositionPage({ params }: Props) {
  return <TransmuterPositionPage deployment={ALCHEMIX_ETHEREUM} params={await params} />;
}
