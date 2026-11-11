// Morpho Blue on Arc, one loan token's markets (/arc/morpho/markets/<loan
// token>): the shared page (lib/morpho/roster.tsx) on rails-server's markets
// read, which the roster page shares (held 30 s on the server).

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MorphoLoanTokenPage } from "@/lib/morpho/roster";
import { loanTokenViewData } from "@/lib/morpho/markets-shape";
import { fetchMorphoArcMarkets } from "@/lib/api/fetch-morpho-arc";
import { arcMarketsResponse } from "@/lib/morpho-arc/markets";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";

export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-f]{40}$/;
const load = cache(async () => {
  const a = await fetchMorphoArcMarkets();
  return a.kind === "ok" ? arcMarketsResponse(a.data) : null;
});

type Params = { params: Promise<{ loanToken: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { loanToken } = await params;
  const token = loanToken.toLowerCase();
  if (!ADDRESS.test(token)) return { title: "Morpho Blue markets on Arc" };
  const g = (await load())?.groups.find((x) => x.loanToken === token);
  const name = g?.loanNamed ? g.loanSymbol : `${token.slice(0, 6)}…${token.slice(-4)}`;
  return {
    title: `${name} markets · Morpho Blue on Arc`,
    description: `Every Morpho Blue market on Arc that lends ${name}: its collateral, LLTV, size, rates and utilisation.`,
    alternates: { canonical: `/arc/morpho/markets/${token}` },
    robots: { index: false },
  };
}

export default async function MorphoArcLoanTokenRoute({ params }: Params) {
  const { loanToken } = await params;
  const token = loanToken.toLowerCase();
  if (!ADDRESS.test(token)) notFound();
  const data = await load();
  if (!data)
    return (
      <p className="py-12 text-center text-sm text-rb-500">
        The market roster could not be read from the chain. Reload to try again.
      </p>
    );
  const g = data.groups.find((x) => x.loanToken === token);
  if (!g) notFound();
  return (
    <MorphoLoanTokenPage
      g={loanTokenViewData(data, g)}
      block={data.blockNumber}
      fromLogs={false}
      chainId={ARC_CHAIN_ID}
    />
  );
}
