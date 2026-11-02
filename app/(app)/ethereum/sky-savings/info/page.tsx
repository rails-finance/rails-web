// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary sits in this
// file: Sky Savings keeps no content/sky-savings/event-prose.yaml.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage, type InfoTerm } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { SKY_RATES_PATH, SKY_DOCS } from "@/lib/sky-savings/constants";
import { protocolForSession } from "@/lib/shared/protocols";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("sky-savings");

const MAKERDAO = protocolForSession("makerdao")!.href;
const SUSDS = { label: "Sky developer docs: sUSDS", href: SKY_DOCS.susds.href };
const VOW = { label: SKY_DOCS.vow.label, href: SKY_DOCS.vow.href };
const PSM = { label: SKY_DOCS.psm.label, href: SKY_DOCS.psm.href };
const USDS = { label: "Sky developer docs: USDS", href: SKY_DOCS.usds.href };

const GLOSSARY: readonly [InfoTerm, ...InfoTerm[]] = [
  {
    term: "USDS",
    definition:
      "USDS is Sky's stablecoin, the token a saver deposits. Sky runs no USDS price feed, so every figure on this page is stated in USDS.",
    sources: [USDS],
  },
  {
    term: "sUSDS",
    definition:
      "sUSDS is the savings token of Sky, a share in the savings module. A holder's number of sUSDS changes only when the holder deposits, withdraws or transfers.",
    sources: [SUSDS],
  },
  {
    term: "Savings Rate",
    definition:
      "The Savings Rate is the rate at which one sUSDS grows in USDS. Only addresses that Sky has authorised can change it, and a change applies to every holder from its block.",
    sources: [SUSDS],
  },
  {
    term: "Share price",
    definition:
      "The share price is the amount of USDS that one sUSDS redeems for. It grows every second at the Savings Rate, and the contract calls it chi.",
    sources: [SUSDS],
  },
  {
    term: "Vow",
    definition:
      "The Vow is Sky's balance sheet, the account that receives its surplus and its debt. Borrowers pay their stability fees into it, and the interest Sky mints for savers is booked there as debt, so the two settle against each other.",
    sources: [VOW],
  },
  {
    term: "PSM",
    definition:
      "The PSM, short for peg stability module, is the Sky contract that swaps USDS and USDC, a dollar stablecoin from another issuer. Its exit fee has been zero for the whole life of sUSDS, so it has priced one USDS at one USDC.",
    sources: [PSM],
  },
  {
    term: "Referral code",
    definition:
      "A referral code is a number that a front end, meaning the website or app a saver uses, attaches to a deposit to mark that it sent the deposit. Sky publishes no list of which front end uses which code.",
    sources: [SUSDS],
  },
];

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="sky-savings"
      tracks={
        <>
          The Rails Sky Savings explorer shows every address that has held sUSDS, Sky&apos;s savings token, on Ethereum,
          whether it still holds some or has withdrawn all, and the full history of each one. It also shows{" "}
          <Link href={SKY_RATES_PATH} className={INLINE_LINK}>
            the Savings Rate history
          </Link>
          , which lists every change made to the rate.
        </>
      }
      notCovered="Borrowing against collateral in Sky vaults, sDAI and sUSDS on other chains aren't covered here."
      howItWorks={[
        <>
          Sky Savings is the savings module of Sky, the protocol that was MakerDAO. A saver deposits{" "}
          <GlossaryLink term="USDS">USDS</GlossaryLink> from a wallet (an account address) and receives{" "}
          <GlossaryLink term="sUSDS">sUSDS</GlossaryLink>, a share token that grows in value. One position on this page
          is one wallet that holds or has held sUSDS.
        </>,
        <>
          The number of sUSDS a wallet holds stays the same while it is held, and each sUSDS is worth more USDS every
          second. This growth follows the <GlossaryLink term="Savings Rate">Savings Rate</GlossaryLink>, and the{" "}
          <GlossaryLink term="Share price">share price</GlossaryLink> is the USDS that one sUSDS redeems for.
          Withdrawing burns the sUSDS and pays out the USDS they are worth at that moment.
        </>,
        <>
          The interest comes from borrowers. A borrower locks collateral (assets held as security) in a Sky vault (a
          contract that holds the collateral) to borrow USDS, and pays a stability fee (the interest on that borrowing)
          into the <GlossaryLink term="Vow">Vow</GlossaryLink>, Sky&apos;s surplus account. Sky mints the savers&apos;
          interest as new USDS and books the same amount as debt at the Vow, so the fees and the debt settle against
          each other. Borrowing is on the{" "}
          <Link href={MAKERDAO} className={INLINE_LINK}>
            MakerDAO explorer
          </Link>
          .
        </>,
        <>
          Every figure is stated at a sealed block, a fixed block of the chain (the chain&apos;s unit of time) that the
          figures are read at. Every six hours, a check compares the ledger, which is Rails&apos; own record of each
          holder&apos;s balance history, with the sUSDS contract for every holder. A page shows no figure unless the
          latest check passed.
        </>,
      ]}
      glossary={GLOSSARY}
      views={[
        {
          heading: "Listing",
          body: (
            <>
              <p>
                The listing shows one card for each position, with its Worth (the USDS its sUSDS redeems for), its
                Interest earned, the Savings Rate, its number of events and its last activity. A position is Open while
                the wallet still holds sUSDS and Closed once it has withdrawn or sent all of it.
              </p>
              <p className="mt-2">
                Without a filter, the listing shows only Open positions, so Closed ones appear when you filter by Closed
                or search their address. Morpho Blue and Sky&apos;s bridge escrows for Arbitrum One, Base and OP Mainnet
                are contracts that hold sUSDS on behalf of others, so they are not savers and the listing leaves them
                out. Each of them still opens by its address.
              </p>
              <p className="mt-2">
                You can search by the address of a holder or by an ENS name, which is a name ending in .eth. The listing
                filters by Status (Open or Closed) and Transactions (a range for the number of transactions the holder
                has made), and sorts by Value, Interest earned, Recent activity or Events (the deposits, withdrawals and
                transfers recorded for the holder).
              </p>
            </>
          ),
        },
        {
          heading: "Position page",
          body: (
            <>
              <p>
                The position page shows the Balance in sUSDS, the share price and the interest earned. Interest earned
                is the position&apos;s value now, plus all the USDS it has paid out, minus all the USDS paid in. A share
                received from another address counts at its value on arrival.
              </p>
              <p className="mt-2">
                Lifetime flows draws the deposits and withdrawals over time, and the interest is the dashed part of its
                bars. The timeline lists every deposit, withdrawal and transfer that names the address, with the Savings
                Rate changes between them. The chart&apos;s dollar values count one USDS as one USDC, the price of the{" "}
                <GlossaryLink term="PSM">PSM</GlossaryLink>, and each deposit shows its{" "}
                <GlossaryLink term="Referral code">referral code</GlossaryLink> as a number.
              </p>
            </>
          ),
        },
        {
          heading: "Savings Rate history",
          body: (
            <p>
              The{" "}
              <Link href={SKY_RATES_PATH} className={INLINE_LINK}>
                Savings Rate history
              </Link>{" "}
              lists every change to the rate since sUSDS launched, each at the block that made it.
            </p>
          ),
        },
      ]}
      docs={{ label: "Sky developer documentation", href: "https://developers.skyeco.com" }}
    />
  );
}
