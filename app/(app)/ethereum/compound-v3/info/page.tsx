// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("compound");

const intro = (
  <>
    <p>
      Compound V3 runs each market as its own world: one base asset (USDC, for example) that is both the lending side
      and the borrowing side, backed by a short roster of collateral assets. Nothing is shared between markets.
      Suppliers earn interest on the base asset; borrowers post collateral and draw the base asset alone.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s account in one market: base supplied or borrowed, collateral posted,
      and its lifecycle. Dollar values use each market&apos;s own prices, the same ones it liquidates with; opening a
      row adds the market&apos;s own verdict on whether the account can be liquidated, read live from its contract. Or{" "}
      <Link href="/ethereum/compound-v3/markets" className="text-blue-500 hover:underline">
        see each market and how heavily it is lent out
      </Link>
      .
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="compound">{intro}</ProtocolInfoPage>;
}
