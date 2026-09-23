// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("aave-v3");

const intro = (
  <>
    <p>
      Aave V3 is a pooled lending market. Suppliers deposit assets to earn interest; borrowers draw other assets against
      those deposits as collateral, and all of a wallet&apos;s positions in one market back each other. Aave runs three
      markets on Ethereum — Core, Prime and EtherFi — each with its own asset roster and terms.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s account in one market: everything it supplies, everything it owes,
      and its health factor — the single number Aave uses to decide when an account can be liquidated. Dollar values use
      Aave&apos;s own prices, the same ones it liquidates with. Or{" "}
      <Link href="/ethereum/aave-v3/market" className="text-blue-500 hover:underline">
        compare the markets and their reserves
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="aave-v3">{intro}</ProtocolInfoPage>;
}
