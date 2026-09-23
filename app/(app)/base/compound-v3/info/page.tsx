// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";

export const metadata = infoMetadata("compound-base");

const intro = (
  <>
    <p>
      Compound V3&rsquo;s Base deployment runs each of its five markets as its own world: one base asset that is both
      the lending side and the borrowing side, backed by a short roster of collateral assets, nothing shared between
      markets — and nothing shared with the Ethereum markets of the same names.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s account in one market: base supplied or borrowed and collateral
      posted, every figure read from that Comet itself at the block the row names, with dollar values from the feeds the
      market liquidates with. Opening a row shows the wallet across every market at once, with its whole history. Or{" "}
      <Link href="/base/compound-v3/market" className="text-blue-500 hover:underline">
        see each market and how heavily it is lent out
      </Link>
      .
    </p>
    <BaseLendingCoverageNote route="/api/compound-base/coverage" unreadListed={false} />
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="compound-base">{intro}</ProtocolInfoPage>;
}
