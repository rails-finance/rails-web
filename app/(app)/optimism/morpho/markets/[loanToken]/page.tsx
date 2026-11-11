// Morpho Blue on Optimism, one loan token's markets (/optimism/morpho/markets/<loan
// token>): the shared page on rails-server's markets read, which the roster
// page shares (components/protocol/morpho-at-block/morpho-at-block-market-routes.tsx).

import type { Metadata } from "next";
import {
  MorphoAtBlockLoanTokenRoute,
  morphoAtBlockLoanTokenMetadata,
} from "@/components/protocol/morpho-at-block/morpho-at-block-market-routes";
import { MORPHO_OPTIMISM } from "@/lib/morpho-at-block/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ loanToken: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return morphoAtBlockLoanTokenMetadata(MORPHO_OPTIMISM, (await params).loanToken);
}

export default async function MorphoOptimismLoanTokenRoute({ params }: Params) {
  return <MorphoAtBlockLoanTokenRoute dep={MORPHO_OPTIMISM} loanToken={(await params).loanToken} />;
}
