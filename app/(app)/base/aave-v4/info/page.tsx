// About this explorer — Aave V4 on Base. The intro prose for the rail's info
// page, in the shape of the other Base explorers' (charter §8a).

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";

export const metadata = infoMetadata("aave-v4-base");

const intro = (
  <>
    <p>
      Aave V4&rsquo;s Base deployment is one hub, the Equities hub, and one spoke, Mag7. Seven Coinbase tokenized stocks
      (AAPLc, AMZNc, GOOGLc, METAc, MSFTc, NVDAc, TSLAc) are supplied as collateral there, and USDC is the one asset
      that can be borrowed against them. It is a separate deployment from Aave V4 on Ethereum: its own contracts, its
      own risk parameters, its own oracle.
    </p>
    <p>
      Each row of the listing is one wallet&apos;s account on the spoke: what it has supplied and what it owes, read
      from the spoke itself at the block after the account&apos;s latest event, and valued at the prices the
      spoke&apos;s oracle gives. Those prices are Chainlink feeds that publish from Sunday 20:00 ET to Friday 20:00 ET
      and hold their last value outside those hours, so the position page states when each one was published. Or{" "}
      <Link href="/base/aave-v4/hubs" className="text-blue-500 hover:underline">
        see the hub&apos;s reserves and the risk parameters the spoke enforces
      </Link>
      .
    </p>
    <BaseLendingCoverageNote
      route="/api/aave-v4-base/coverage"
      unreadListed={false}
      subject="this spoke"
      subjectPossessive={"the spoke\u2019s"}
    />
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="aave-v4-base">{intro}</ProtocolInfoPage>;
}
