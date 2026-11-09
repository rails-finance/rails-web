// One Compound V3 market on Base (/base/compound-v3/markets/<comet>, the Comet's
// roster key: usdc, weth, ...), archetype A2 on the shared product shell
// (rails-ops ui-jobs 549/550; decision 0059): the Comet's head as on the
// roster, then its collateral, each section with its own ⋮.
//
// ISR, ten minutes, as the roster.

import { notFound } from "next/navigation";
import { CompoundCometPage } from "@/lib/compound/product";
import { cometData, cometMetadata, isComet, loadComets } from "@/lib/compound/product-routes";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";

export const revalidate = 600;
// Rendered on first request and kept ten minutes, never at build: each Comet
// page reads the whole deployment, and prerendering them all ran the build's
// chain reads past the 60 s static-generation limit (9 Nov 2026). The route
// guard below 404s an unknown key.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ comet: string }> }) {
  const { comet } = await params;
  return cometMetadata("base", comet);
}

export default async function CompoundBaseCometRoute({ params }: { params: Promise<{ comet: string }> }) {
  const { comet } = await params;
  if (!isComet("base", comet)) notFound();
  const data = await loadComets("base");
  return (
    <>
      <CompoundCometPage data={cometData(data, comet)} chain="base" comet={comet} />
      <ProvInspectorLayer />
    </>
  );
}
