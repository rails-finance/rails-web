import type { Metadata } from "next";
import { ALCHEMIX_ETHEREUM } from "@/lib/alchemix/lines";
import {
  AlchemixV2PositionPage,
  alchemixV2PositionMetadata,
  type AlchemixV2PositionParams,
} from "@/lib/alchemix/v2-route";

// One Alchemix V2 position on Ethereum, closed on 2026-04-02
// (lib/alchemix/v2-route.tsx carries the route body).

interface Props {
  params: Promise<AlchemixV2PositionParams>;
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return alchemixV2PositionMetadata(ALCHEMIX_ETHEREUM, await params);
}

export default async function EthereumAlchemixV2PositionPage({ params }: Props) {
  return <AlchemixV2PositionPage deployment={ALCHEMIX_ETHEREUM} params={await params} />;
}
