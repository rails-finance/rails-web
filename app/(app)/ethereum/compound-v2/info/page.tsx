// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("compound-v2");

const intro = (
  <>
    <p>
      Compound V2 is the original pooled-lending protocol, running since 2019. Suppliers deposit a token into a shared
      market and receive cTokens — claim tickets that grow in value as borrowers pay interest. Borrowers draw from those
      markets against their deposits in the others.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s full six-year history: what it supplied and borrowed across every
      market, and where it stands now. Liquidations here are partial by design — an account is trimmed back to health,
      not wiped out — and this book holds 26,639 of them across 5,864 borrowers, each seizure shown leg by leg. Or{" "}
      <Link href="/ethereum/compound-v2/markets" className="text-blue-500 hover:underline">
        see all twenty markets and how little of them is borrowed today
      </Link>
      .
    </p>
    <p>
      One caveat: three markets are priced by a constant stored in the oracle with no feed behind it — the legacy SAI
      market&apos;s constant says $14.43 for a token that targeted a dollar — and they are flagged wherever they appear.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="compound-v2">{intro}</ProtocolInfoPage>;
}
