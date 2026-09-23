// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("moonwell");

const intro = (
  <>
    <p>
      Moonwell&apos;s Ethereum deployment is a young pooled-lending market, built on Compound V2&apos;s design and live
      since May 2026. Suppliers deposit a token into a shared market and receive mTokens — claim tickets that grow in
      value as borrowers pay interest. Borrowers draw from the markets against their deposits.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s account: what it supplied and borrowed across the four markets, and
      where it stands now. Dollar values use the same prices Moonwell itself liquidates with. Or{" "}
      <Link href="/ethereum/moonwell/markets" className="text-blue-500 hover:underline">
        see all four markets and how far each sits below its cap
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="moonwell">{intro}</ProtocolInfoPage>;
}
