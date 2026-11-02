// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary text lives in
// content/frankencoin/event-prose.yaml.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { frankencoinGlossary } from "@/lib/frankencoin/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("frankencoin");

const UL = "list-disc space-y-1 pl-5";

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="frankencoin"
      name="Frankencoin"
      tracks="Every Frankencoin minting position on Ethereum, open or ended, with its history, and the system's capital and challenge record. Savings, FCS governance and ZCHF on other chains are not shown."
      glossary={frankencoinGlossary()}
      howItWorks={[
        "There is no price oracle. Each owner declares a liquidation price, and anyone who thinks it too high can post collateral and force a challenge.",
        "No dollar figure or health factor appears, because neither exists on chain; collateral is shown in its token and debt in ZCHF.",
        "A position can mint ZCHF while its collateral, valued at the liquidation price, covers the debt, up to its family's minting limit.",
        "A position ends by repayment, a challenge sale, a veto or a forced sale after expiry.",
      ]}
      search="Search takes an owner address. Filters: status, collateral, hub, history, debt, transactions. Sort: recent activity, debt, collateral."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>
                One card per position: its owner, its hub, original or clone, and a triangle with a count if challenged.
              </li>
              <li>Collateral, in the position&apos;s token.</li>
              <li>
                Debt, the gross ZCHF minted. The wallet received less, because the reserve share and the interest for
                the remaining term are taken at minting.
              </li>
              <li>An ended position shows its highest recorded collateral and debt, and how it ended.</li>
              <li>Open positions show by default. Searching an owner shows every status.</li>
            </ul>
          ),
        },
        {
          heading: "Position page",
          body: (
            <ul className={UL}>
              <li>
                The card shows collateral, debt, liquidation price, interest, expiry and any running challenge, read
                from the chain now.
              </li>
              <li>
                Lifetime flows show the ZCHF minted and repaid and the collateral deposited and withdrawn, day by day.
              </li>
              <li>The timeline lists each event of the position, newest first. One transaction can record several.</li>
            </ul>
          ),
        },
        {
          heading: "System page",
          body: (
            <p>
              The ZCHF supply, the equity and reserve behind it, the base rate and opening fee, and the minting book
              with every challenge and forced sale.{" "}
              <Link href="/ethereum/frankencoin/system" className={INLINE_LINK}>
                See the system view
              </Link>
              .
            </p>
          ),
        },
      ]}
      docs={{ label: "Frankencoin documentation", href: "https://docs.frankencoin.com/" }}
    />
  );
}
