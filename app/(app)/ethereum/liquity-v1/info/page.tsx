// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary text lives in
// content/liquity-v1/event-prose.yaml.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { liquityV1Glossary } from "@/lib/liquity-v1/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("liquity-v1");

const UL = "list-disc space-y-1 pl-5";

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="liquity-v1"
      tracks={
        <>
          The Rails Liquity V1 explorer shows every Trove on Ethereum, whether still open or closed, and the full
          history of each one. It also shows the{" "}
          <Link href="/ethereum/liquity-v1/system" className={INLINE_LINK}>
            system as a whole
          </Link>
          : its total collateral ratio, its Stability Pool and the queue of Troves that redemptions reach first.
        </>
      }
      notCovered="Stability Pool deposits and staking of LQTY, Liquity's token, aren't covered here."
      glossary={liquityV1Glossary()}
      howItWorks={[
        <>
          Liquity V1 is a lending protocol where a borrower locks ETH in a{" "}
          <GlossaryLink term="Trove">Trove</GlossaryLink>, a loan held by one{" "}
          <GlossaryLink term="Wallet">wallet</GlossaryLink>, and draws <GlossaryLink term="LUSD">LUSD</GlossaryLink>, a
          dollar stablecoin, against that <GlossaryLink term="Collateral">collateral</GlossaryLink>. Drawing means the
          protocol mints (creates) new LUSD, which holds near a dollar because anyone can swap it for $1 of ETH.
        </>,
        "There is no interest. A borrower pays a one-time fee each time they draw LUSD, and the debt stays at the amount drawn.",
        <>
          The <GlossaryLink term="Collateral ratio">collateral ratio</GlossaryLink> of a Trove is the value of its ETH
          divided by its debt. A <GlossaryLink term="Liquidation">liquidation</GlossaryLink> closes a single Trove whose
          ratio falls below 110%, so the debt is cleared while the ETH still covers it.
        </>,
        <>
          <GlossaryLink term="Recovery Mode">Recovery Mode</GlossaryLink> is the whole system&apos;s line: when all
          Troves together fall below 150%, stricter limits apply. A{" "}
          <GlossaryLink term="Redemption">redemption</GlossaryLink> swaps LUSD for $1 of ETH, so if LUSD trades below $1
          anyone can buy it and redeem it for a profit, which pushes the price back up.
        </>,
        <>
          Liquity V1 has one set of rules for every Trove, and the borrower sets no interest rate. Redemptions reach the
          Troves with the lowest collateral ratio first, and the{" "}
          <GlossaryLink term="Stability Pool">Stability Pool</GlossaryLink>, which holds LUSD that depositors supplied,
          pays off the debt of liquidated Troves in exchange for their ETH.
        </>,
      ]}
      search="Search takes a wallet address. Status filters by Open, Closed or Liquidated. Liquidations (Liquidated before) keeps Troves that were liquidated at some point, and Redemptions (Redeemed before) keeps Troves that were redeemed against at some point. Sort options are Recent activity, Collateral, Debt and Ratio."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>The listing has one card per Trove, showing its ETH collateral, its LUSD debt and its status.</li>
              <li>Open Troves show by default, and searching a wallet shows its Troves in every status.</li>
            </ul>
          ),
        },
        {
          heading: "Trove page",
          body: (
            <ul className={UL}>
              <li>The top card shows the collateral, the debt and the collateral ratio, read from the chain now.</li>
              <li>The timeline lists each event of the Trove, newest first.</li>
            </ul>
          ),
        },
        {
          heading: "System page",
          body: (
            <p>
              The system page shows the total collateral ratio against the 150% line, the Stability Pool against the
              system's debt, and the <GlossaryLink term="Fees">base rate</GlossaryLink> that the fees start from and
              decay from.{" "}
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
