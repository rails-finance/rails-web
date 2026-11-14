// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary text lives in
// content/frankencoin/event-prose.yaml.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { frankencoinGlossary } from "@/lib/frankencoin/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("frankencoin");

const UL = "list-disc space-y-1 pl-5";

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="frankencoin"
      tracks={
        <>
          The Rails Frankencoin explorer shows every position that has minted Frankencoin (ZCHF) on Ethereum, whether
          still open or closed, and the full history of each one. It also shows{" "}
          <Link href="/ethereum/frankencoin/system" className={INLINE_LINK}>
            the system as a whole
          </Link>
          : its equity reserve and every challenge raised against a position.
        </>
      }
      notCovered="Frankencoin savings, governance and ZCHF on other chains aren't covered here."
      glossary={frankencoinGlossary()}
      howItWorks={[
        <>
          Frankencoin has no price oracle, so no outside service tells it what collateral is worth. Each position&apos;s
          owner declares a <GlossaryLink term="Liquidation price">liquidation price</GlossaryLink>, and anyone who
          thinks that price is too high can start a <GlossaryLink term="Challenge">challenge</GlossaryLink> by putting
          up collateral.
        </>,
        "Rails shows no dollar value and no health factor, which is a single score of how close a position is to liquidation, because the protocol has neither. Collateral appears in its own token and debt in ZCHF.",
        <>
          A position can mint ZCHF up to the value of its collateral at its liquidation price. A minting limit also caps
          the total that an <GlossaryLink term="Original and clone">original and its clones</GlossaryLink> can mint.
        </>,
        <>
          A position ends when its owner repays it, when a challenge sells its collateral, when it is vetoed, or when a{" "}
          <GlossaryLink term="Forced sale">forced sale</GlossaryLink> follows its expiry.
        </>,
      ]}
      search="You can search by owner address. The listing filters by status, collateral, hub, history, debt and transactions, and sorts by recent activity, debt or collateral."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>
                Each card shows one position: its owner, its hub, whether it is an original or a clone, and a triangle
                showing how many challenges the position has faced.
              </li>
              <li>
                The card also shows the position&apos;s collateral in its own token and its debt in ZCHF. The debt is
                the full amount minted. The wallet received less, because the reserve share and the interest for the
                remaining term are taken when the ZCHF is minted.
              </li>
              <li>A position that has ended shows its highest recorded collateral and debt, and how it ended.</li>
              <li>
                The listing shows open positions by default. Searching for an owner shows positions of every status.
              </li>
            </ul>
          ),
        },
        {
          heading: "Position page",
          body: (
            <ul className={UL}>
              <li>
                The top card shows the position&apos;s collateral, debt, liquidation price, interest, expiry and any
                running challenge, read from the chain now.
              </li>
              <li>
                Lifetime flows show, day by day, how much ZCHF was minted and repaid and how much collateral was
                deposited and withdrawn.
              </li>
              <li>
                The timeline lists the position&apos;s events, newest first. One transaction can record several events.
              </li>
            </ul>
          ),
        },
        {
          heading: "System page",
          body: (
            <p>
              The system page shows the ZCHF supply, the equity and reserve behind it, the base rate and the opening
              fee, and the list of minting positions, with every challenge and forced sale.{" "}
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
