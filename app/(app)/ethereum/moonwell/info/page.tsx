// About this explorer — Moonwell on Ethereum. The page is the shared Moonwell info
// component (components/protocol/moonwell/moonwell-info.tsx).

import { MoonwellInfoPage } from "@/components/protocol/moonwell/moonwell-info";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("moonwell");

export default function InfoPage() {
  return <MoonwellInfoPage deployment="ethereum" />;
}
