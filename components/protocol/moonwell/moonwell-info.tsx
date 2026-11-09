// The Moonwell /info page for its two routes (Ethereum, Base), drawn on the typed template
// (rails-ops standards/info-page-template.md). One component so the routes share the glossary
// (content/moonwell/event-prose.yaml) and the page's shape; what differs per chain is the
// markets, the listing's filters and the Base coverage note.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { BaseLendingCoverageNote } from "@/components/shared/base-lending-coverage-banner";
import { moonwellGlossary } from "@/lib/moonwell/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { MoonwellBorrowFrozenNote } from "@/components/protocol/moonwell/moonwell-borrow-frozen-note";

const UL = "list-disc space-y-1 pl-5";

export type MoonwellInfoDeployment = "ethereum" | "base";

export function MoonwellInfoPage({ deployment }: { deployment: MoonwellInfoDeployment }) {
  const base = deployment === "base";
  const chain = base ? "Base" : "Ethereum";
  const route = base ? "/base/moonwell" : "/ethereum/moonwell";
  return (
    <ProtocolInfoPage
      session={base ? "moonwell-base" : "moonwell"}
      tracks={
        <>
          The Rails Moonwell explorer shows every account on Moonwell&apos;s {chain} deployment, whether still open,
          closed or liquidated, and the full history of each one. It also shows{" "}
          <Link href={`${route}/markets`} className={INLINE_LINK}>
            every market
          </Link>
          , with what it holds and how much of it is borrowed.
        </>
      }
      notCovered="Moonwell on Optimism, Moonbeam and Moonriver isn't covered here."
      glossary={moonwellGlossary()}
      howItWorks={[
        <>
          Moonwell is a lending protocol. People supply crypto to a <GlossaryLink term="Market">market</GlossaryLink> to
          earn interest, and others borrow from it. One account on this page is everything one wallet (the address that
          holds the account) has supplied and owes across{" "}
          {base ? "all of Moonwell's markets on Base" : "its four markets: WETH, USDC, USDT and cbBTC"}.
        </>,
        <>
          A supplier receives <GlossaryLink term="mToken">mTokens</GlossaryLink>, a receipt that redeems for more of the
          asset as borrowers pay interest. A supply backs borrowing only once the wallet switches it on as{" "}
          <GlossaryLink term="Collateral">collateral</GlossaryLink>.
        </>,
        <>
          The <GlossaryLink term="Comptroller">Comptroller</GlossaryLink> counts all of a wallet&apos;s collateral
          against all of its debt. One <GlossaryLink term="Health factor">health factor</GlossaryLink> then scores the
          whole account.
        </>,
        <>
          Dollar values use the prices of an <GlossaryLink term="Oracle">oracle</GlossaryLink>. The Comptroller uses the
          same prices to decide <GlossaryLink term="Liquidation">liquidation</GlossaryLink>, when a liquidator repays
          part of the debt and takes some collateral.
        </>,
      ]}
      search="You can search by wallet address. The listing filters by Status (open, closed or liquidated), Debt and Collateral by size in US dollars, Supplying and Borrowing by market, History (liquidated before, which keeps accounts liquidated at least once) and Transactions (which keeps accounts whose transaction count falls in a range), and sorts by recent activity, debt or collateral."
      views={[
        {
          heading: "Listing",
          body: (
            <>
              <ul className={UL}>
                <li>
                  Each card shows one account: the wallet, what it supplied, what it owes and where it stands now. A
                  closed account has been repaid and withdrawn. A liquidated account was liquidated and has since
                  closed.
                  {base ? " Each figure is read from the chain at the block the card names." : ""}
                </li>
                <li>
                  The listing shows open accounts by default. Searching for a wallet shows its accounts of every status.
                </li>
              </ul>
              {base && <BaseLendingCoverageNote route="/api/moonwell-base/coverage" unreadListed={false} restsOnOpen />}
            </>
          ),
        },
        {
          heading: "Position page",
          body: (
            <ul className={UL}>
              <li>
                The top card shows what the wallet supplied, what it owes and its health factor, read live from the
                chain, not from the account's history.
              </li>
              <li>The timeline lists the account&apos;s events, newest first.</li>
            </ul>
          ),
        },
        {
          heading: "Markets view",
          body: (
            <>
              <p>
                The markets view shows each market with what it holds, its borrowed share and its supply and borrow
                rates. A supply cap is the most the market accepts in deposits and a borrow cap is the most that can be
                borrowed, and at a cap new supply or new borrowing is refused.{" "}
                <Link href={`${route}/markets`} className={INLINE_LINK}>
                  Use the markets link
                </Link>{" "}
                to open it.
              </p>
              {base && <MoonwellBorrowFrozenNote className="mt-2" />}
            </>
          ),
        },
      ]}
      docs={{ label: "Moonwell documentation", href: "https://docs.moonwell.fi/moonwell" }}
    />
  );
}
