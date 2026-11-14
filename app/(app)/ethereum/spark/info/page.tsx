// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — the page on the rail's sub-nav, drawn on the typed
// template (rails-ops standards/info-page-template.md). The glossary text lives in
// content/spark/event-prose.yaml.

import Link from "next/link";
import { GlossaryLink, ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { SPARK_DOCS_AND_CHAIN } from "@/lib/spark/docs-and-chain";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { sparkGlossary } from "@/lib/spark/event-templates";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("spark");

const UL = "list-disc space-y-1 pl-5";

export default function InfoPage() {
  return (
    <ProtocolInfoPage
      session="spark"
      tracks={
        <>
          The Rails SparkLend explorer shows the account of every wallet on SparkLend on Ethereum, whether still open,
          closed or liquidated, and the full history of each one. It also shows the{" "}
          <Link href="/ethereum/spark/markets" className={INLINE_LINK}>
            market as a whole
          </Link>
          : the size of every asset it lists, the interest rates suppliers earn and borrowers pay on it, and its risk
          settings, such as its liquidation threshold.
        </>
      }
      glossary={sparkGlossary()}
      howItWorks={[
        <>
          SparkLend is a lending market on Ethereum, governed by Sky, whose governance sets its supply caps and some of
          its rates. One contract, the Pool, holds every asset supplied. A{" "}
          <GlossaryLink term="Wallet">wallet</GlossaryLink> can <GlossaryLink term="Supply">supply</GlossaryLink> assets
          to earn interest, and <GlossaryLink term="Borrow">borrow</GlossaryLink> other assets against them. One unit on
          this page is an account, which is everything one wallet supplies and owes.
        </>,
        <>
          SparkLend uses the design of Aave V3. Every asset a wallet supplies as{" "}
          <GlossaryLink term="Collateral">collateral</GlossaryLink> backs all of its borrowing together, so the wallet
          has one account with a single health factor. Supplying gives the wallet{" "}
          <GlossaryLink term="spToken">spTokens</GlossaryLink>.
        </>,
        <>
          The <GlossaryLink term="Health factor">health factor</GlossaryLink> shows how safe an account is. When it
          falls below 1, the account can be <GlossaryLink term="Liquidation">liquidated</GlossaryLink>. Anyone can do
          it, because a liquidator, who repays part of the debt, earns a bonus in collateral.
        </>,
        <>
          Every value is priced by an <GlossaryLink term="Oracle price">oracle price</GlossaryLink>. Wallets that borrow
          assets with closely linked prices can switch on <GlossaryLink term="E-mode">E-mode</GlossaryLink> to borrow
          more against their collateral.
        </>,
      ]}
      search="Search takes a wallet address. The filters are Status, which keeps accounts that are Open, Closed or Liquidated; Debt (USD) and Collateral (USD), which keep a range of dollar values; Supplying and Borrowing, which keep wallets that hold a chosen asset; History (Liquidated before), which keeps accounts liquidated at some point; and Transactions, which keeps a range of transaction counts. Sort options are Recent activity, Debt and Collateral."
      views={[
        {
          heading: "Listing",
          body: (
            <ul className={UL}>
              <li>The listing shows one card per wallet, with its collateral, its debt and its status.</li>
              <li>
                Open accounts show by default, and searching a wallet shows its account in every status. A closed
                account has been emptied, and a liquidated account ended in a liquidation.
              </li>
            </ul>
          ),
        },
        {
          heading: "Account page",
          body: (
            <ul className={UL}>
              <li>The top card shows the account&apos;s collateral, debt and health factor, read from the Pool now.</li>
              <li>The timeline lists each event of the account, and each event opens its own page.</li>
            </ul>
          ),
        },
        {
          heading: "Market page",
          body: (
            <p>
              The market page lists every asset in the Pool with its size, its supply and borrow APYs and its risk
              settings, read live.{" "}
              <Link href="/ethereum/spark/markets" className={INLINE_LINK}>
                See the SparkLend market
              </Link>
              .
            </p>
          ),
        },
      ]}
      docsAndChain={SPARK_DOCS_AND_CHAIN}
      docs={{ label: "SparkLend documentation", href: "https://docs.spark.finance/products/sparklend" }}
    />
  );
}
