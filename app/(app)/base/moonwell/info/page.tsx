// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — Moonwell on Base. The page is the shared Moonwell info
// component (components/protocol/moonwell/moonwell-info.tsx).

import { MoonwellInfoPage } from "@/components/protocol/moonwell/moonwell-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("moonwell-base");

export default function InfoPage() {
  return <MoonwellInfoPage deployment="base" />;
}
