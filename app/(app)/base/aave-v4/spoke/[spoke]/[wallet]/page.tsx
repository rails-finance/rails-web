import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { resolveSpokeSegment } from "@/lib/aave-v4/spoke-meta";
import { loadAaveV4CardPrices, loadAaveV4SpokeTail } from "@/lib/aave-v4/spoke-position-page-data";
import { AAVE_V4_BASE_API_ROOT } from "@/lib/aave-v4/deployment-routes";
import AaveV4SpokeView from "@/components/protocol/aave-v4/aave-v4-spoke-view";

// Aave V4 on Base: one account on one spoke. The Ethereum spoke page's server
// half against /api/aave-v4-base; the client half is the same component, told
// which deployment it is by app/(app)/base/aave-v4/layout.tsx.

interface Props {
  params: Promise<{ spoke: string; wallet: string }>;
}

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SPOKE_BASE_PATH = "/base/aave-v4/spoke";

function resolveSpoke(rawSpoke: string, wallet: string) {
  const { slug, name } = resolveSpokeSegment(rawSpoke);
  return { slug, name, canonicalPath: `${SPOKE_BASE_PATH}/${slug ?? rawSpoke}/${wallet}` };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { spoke, wallet } = await params;
  const { name, canonicalPath } = resolveSpoke(spoke, wallet);
  return positionMetadata({ session: "aave-v4-base", subject: wallet, market: name, canonicalPath, image: "dynamic" });
}

export default async function AaveV4BaseSpokePage({ params }: Props) {
  const { spoke: rawSpoke, wallet: rawWallet } = await params;
  if (!ADDRESS.test(rawWallet)) notFound();
  const wallet = rawWallet.toLowerCase();
  const { slug, name: spokeName, canonicalPath } = resolveSpoke(rawSpoke, rawWallet);
  if (slug && slug !== rawSpoke) permanentRedirect(canonicalPath);
  const spokeSlug = slug ?? rawSpoke;

  const [tail, prices] = await Promise.all([
    loadAaveV4SpokeTail(wallet, spokeName, AAVE_V4_BASE_API_ROOT),
    loadAaveV4CardPrices(),
  ]);

  return (
    <AaveV4SpokeView
      key={`${spokeSlug}:${wallet}`}
      wallet={wallet}
      spokeName={spokeName}
      spokeSlug={spokeSlug}
      initialPositions={tail.spokePositions}
      initialChain={tail.chain}
      initialEvents={tail.events}
      initialSpokeTotalEvents={tail.spokeTotalEvents}
      initialPrices={prices}
    />
  );
}
