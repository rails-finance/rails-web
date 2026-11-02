// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary text lives in
// content/liquity-v1/event-prose.yaml.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { liquityV1Glossary } from "@/lib/liquity-v1/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("liquity-v1");

const UL = "list-disc space-y-1 pl-5";

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="liquity-v1"
      name="Liquity V1"
      tracks="Every Liquity V1 Trove on Ethereum, open or closed, with its history, and the system's state. Stability Pool deposits and LQTY staking are not shown."
      glossary={liquityV1Glossary()}
      howItWorks={[
        "There is no interest. A borrower pays a one-time fee on each draw of LUSD, and the debt stays what was drawn.",
        "Three things keep LUSD at a dollar: liquidation below 110%, redemption at $1 of ETH, and Recovery Mode below 150% across the system.",
        "There is one market and no rate to set. Redemptions reach Troves in order of collateral ratio.",
      ]}
      search="Search takes a wallet address. Filters: status, liquidated before, redeemed before. Sort: recent activity, collateral, debt, ratio."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>One card per Trove: its ETH collateral, its LUSD debt and its status.</li>
              <li>Open Troves show by default. Searching a wallet shows every status.</li>
            </ul>
          ),
        },
        {
          heading: "Trove page",
          body: (
            <ul className={UL}>
              <li>The top card shows collateral, debt and the collateral ratio read from the chain now.</li>
              <li>The timeline lists each event of the Trove, newest first.</li>
            </ul>
          ),
        },
        {
          heading: "System page",
          body: (
            <p>
              The total collateral ratio against the 150% line, the Stability Pool against system debt, and the base
              rate the fees decay from.{" "}
              <Link href="/ethereum/liquity-v1/system" className={INLINE_LINK}>
                See the system state and redemption queue
              </Link>
              .
            </p>
          ),
        },
      ]}
      docs={{ label: "Liquity V1 documentation", href: "https://docs.liquity.org/liquity-v1" }}
    />
  );
}
