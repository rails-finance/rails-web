// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("fluid");

const intro = (
  <>
    <p>
      Fluid is a lending protocol organised as vaults: each vault pairs one collateral token with one debt token, and a
      position is an NFT living in exactly one vault. Fluid quotes no dollar prices anywhere — each vault&apos;s oracle
      prices collateral directly in the debt token, the same measure its liquidation engine judges by. Liquidations are
      partial by design: the engine sweeps whole price bands and clears just enough to bring positions back to health.
    </p>
    <p>
      Each row of the listing is one position: its collateral and its debt, stated in the vault&apos;s own token pair,
      with every liquidation that touched it shown on its timeline. Or{" "}
      <Link href="/ethereum/fluid/vaults" className="text-blue-500 hover:underline">
        compare the vaults and their risk ladders
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="fluid">{intro}</ProtocolInfoPage>;
}
