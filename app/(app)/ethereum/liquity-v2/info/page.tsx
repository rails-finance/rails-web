// About this explorer — the intro prose that lived behind the listing's (i)
// drawer, now a page of its own on the rail's sub-nav. The copy is the swept
// intro (charter §8a), reframed for a standalone page; the anatomy lives in ProtocolInfoPage.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";

export const metadata = infoMetadata("liquity-v2");

const H = "mt-5 text-sm font-semibold text-foreground";
const UL = "mt-1.5 list-disc space-y-1 pl-5";
const LINK = "text-blue-500 hover:underline";

const intro = (
  <>
    <p>
      Every Liquity V2 Trove on Ethereum, open or closed, with its history. A Trove is a loan: collateral locked, BOLD
      borrowed. BOLD is the protocol&apos;s stablecoin. Stability Pool deposits are not shown.
    </p>

    <h2 className={H}>How it works</h2>
    <ul className={UL}>
      <li>The borrower sets the Trove&apos;s interest rate and can change it.</li>
      <li>
        Redemption: anyone can swap BOLD for $1 of collateral, lowest-rate Troves first. That holds BOLD at a dollar.
      </li>
      <li>Three branches: WETH, wstETH and rETH. Troves are liquidated below 110% (WETH) or 120% (the others).</li>
      <li>A manager can set the rate for a batch of Troves, for a fee. The pages call this delegating.</li>
      <li>A Trove redeemed below the minimum debt is a zombie. It keeps its collateral.</li>
    </ul>

    <h2 className={H}>Listing</h2>
    <ul className={UL}>
      <li>One card per Trove: collateral, debt, interest rate, collateral ratio, liquidation price.</li>
      <li>Status: Open, Zombie, Closed or Liquidated.</li>
      <li>The bare listing shows Open and Zombie Troves.</li>
      <li>Search a wallet, ENS name or Trove ID to see every status.</li>
      <li>Filters: status, collateral, redeemed or never redeemed, delegated or individual.</li>
    </ul>

    <h2 className={H}>Trove page</h2>
    <ul className={UL}>
      <li>The top card shows collateral, debt, collateral ratio and the interest rate.</li>
      <li>Closed and liquidated Troves show an outcome instead: when, and how long it was open.</li>
      <li>Lifetime flows total every borrow, repayment, fee and redemption, with the net result.</li>
      <li>The timeline lists each event. Open one for the detail.</li>
    </ul>

    <h2 className={H}>Branches page</h2>
    <ul className={UL}>
      <li>Each branch&apos;s debt, collateral, Trove count and span of rates.</li>
      <li>Its total collateral ratio (TCR) and minimum ratios, read from the contracts.</li>
      <li>
        A queue link per branch opens its Troves in redemption order.{" "}
        <Link href="/ethereum/liquity-v2/branches" className={LINK}>
          Open the branches
        </Link>
        .
      </li>
    </ul>

    <p className="mt-5">The (i) and ? marks give the detail for the figure beside them.</p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="liquity-v2">{intro}</ProtocolInfoPage>;
}
