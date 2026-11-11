// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Lido on Ethereum (components/protocol/lido/lido-info.tsx).
// Unlaunched with the explorer: infoMetadata adds noindex and the root layout's
// strip covers this route.

import { LidoInfo } from "@/components/protocol/lido/lido-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("lido");

export default function InfoPage() {
  return <LidoInfo />;
}
