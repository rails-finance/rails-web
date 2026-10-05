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
      (the protocol&apos;s stablecoin) borrowed. Stability Pool deposits are not shown.
    </p>

    <h2 className={H}>How it works</h2>
    <ul className={UL}>
      <li>
        The borrower sets the interest rate and can change it. Interest is added to the debt as it accrues, so the debt
        on a page grows between events. Minimum debt is 2,000 BOLD.
      </li>
      <li>
        Upfront fee: opening, adding debt, joining a batch, and changing the rate within 7 days of the last change each
        add 7 days of interest at the branch&apos;s average rate to the debt. Opening also holds a 0.0375 WETH
        liquidation reserve, returned on close.
      </li>
      <li>
        Redemption: anyone can swap BOLD for $1 of collateral, which holds BOLD at a dollar. The Trove&apos;s debt and
        collateral fall together and it stays open; the redeemer&apos;s fee stays in it as extra collateral. Lower-rate
        Troves are redeemed first.
      </li>
      <li>Three branches: WETH, wstETH and rETH. Troves are liquidated below 110% (WETH) or 120% (the others).</li>
      <li>
        Delegating: a batch manager sets one rate for its Troves and charges a yearly management fee, added to the debt.
        A manager&apos;s rate change within 7 days of its last costs every member the upfront fee. Leaving means
        choosing an own rate.
      </li>
      <li>
        Zombie: a Trove left with debt under 2,000 BOLD (usually 0) after a redemption. It stays open with its
        collateral and leaves the normal redemption queue; the owner can close it or borrow again.
      </li>
      <li>
        Without the owner acting, a Trove moves with interest, the manager&apos;s rate changes, redemptions,
        redistribution from others&apos; liquidations, price moves, and a transfer of its NFT (a Trove is an NFT, so it
        can change hands).
      </li>
    </ul>

    <h2 className={H}>Listing</h2>
    <ul className={UL}>
      <li>One card per Trove: collateral, debt, interest rate, collateral ratio, liquidation price.</li>
      <li>
        Batches show the manager&apos;s name where Rails knows it (ARM, Bolder). A zombie shows as Open with the zombie
        mark.
      </li>
      <li>The bare listing shows Open and Zombie Troves; search a wallet, ENS name or Trove ID to see every status.</li>
      <li>Filters: status, collateral, redeemed or never redeemed, delegated or individual.</li>
    </ul>

    <h2 className={H}>Trove page</h2>
    <ul className={UL}>
      <li>
        The top card shows collateral, debt, collateral ratio, interest rate and the share of the redemption queue ahead
        of this Trove.
      </li>
      <li>
        Closed: the owner closed it, including collecting the collateral after a full redemption. Liquidated: the whole
        Trove fell below the branch&apos;s minimum ratio; the Stability Pool took the collateral at a 5% penalty and the
        owner can claim any surplus. If the pool was short, the rest went to the branch&apos;s other Troves, raising
        their debt and collateral with no action of theirs.
      </li>
      <li>Lifetime flows total every borrow, repayment, fee and redemption, with the net result.</li>
      <li>The timeline lists each event, newest first. Open one for the detail.</li>
    </ul>

    <h2 className={H}>Branches page</h2>
    <ul className={UL}>
      <li>
        Each branch&apos;s debt, collateral, Trove count, span of rates, total collateral ratio (TCR) and minimum
        ratios, read from the contracts.
      </li>
      <li>
        Below its shutdown ratio, or with a failed price feed, a branch shuts down: borrowing and rate changes stop;
        closing and redemptions continue.
      </li>
      <li>
        A queue link per branch opens its Troves in redemption order.{" "}
        <Link href="/ethereum/liquity-v2/branches" className={LINK}>
          Open the branches
        </Link>
        .
      </li>
    </ul>

    <p className="mt-5">
      An (i) on the card, the flows panel and each event explains its figures; Learn more inside it opens the
      protocol-level explanation with sources.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="liquity-v2">{intro}</ProtocolInfoPage>;
}
