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
        The borrower sets the interest rate and can change it. Interest is added to the debt as it accrues. Minimum debt
        is 2,000 BOLD.
      </li>
      <li>
        Upfront fee: opening, adding debt, joining a batch, and changing the rate within 7 days of the last change each
        add 7 days of interest at the branch&apos;s average rate to the debt. Opening also holds a 0.0375 WETH reserve,
        returned on close.
      </li>
      <li>
        Redemption: anyone can swap BOLD for $1 of collateral, which holds BOLD at a dollar. Debt and collateral fall
        together and the Trove stays open, even if the whole debt goes (a zombie, below). The redeemer&apos;s fee stays
        in as extra collateral. Lower-rate Troves go first.
      </li>
      <li>Three branches: WETH, wstETH and rETH. Troves are liquidated below 110% (WETH) or 120% (the others).</li>
      <li>
        Delegating: a batch manager sets one rate for its Troves and charges a yearly management fee, added to the debt.
        The manager&apos;s rate change costs every member the upfront fee only if the manager&apos;s previous change was
        within 7 days; a change a day after a Trove joins is free if the manager last moved the rate earlier. Leaving
        means setting a rate of their own again.
      </li>
      <li>
        Zombie: debt left under 2,000 BOLD (usually 0) by a redemption. It leaves the normal queue; the owner can close
        it to collect the collateral left, or borrow again.
      </li>
      <li>
        A Trove also moves without its owner: interest, manager rate changes, redemptions, redistribution from
        others&apos; liquidations, price moves and NFT transfers.
      </li>
    </ul>

    <h2 className={H}>Listing</h2>
    <ul className={UL}>
      <li>One card per Trove: collateral, debt, interest rate, collateral ratio, liquidation price.</li>
      <li>Batches show the manager&apos;s name where Rails knows it. A zombie shows as Open with the zombie mark.</li>
      <li>The bare listing shows Open and Zombie Troves; search a wallet, ENS name or Trove ID to see every status.</li>
      <li>Filters: status, collateral, redeemed or never redeemed, delegated or individual.</li>
    </ul>

    <h2 className={H}>Trove page</h2>
    <ul className={UL}>
      <li>
        The top card shows collateral, debt, collateral ratio, interest rate and the share of the redemption queue ahead
        of this Trove. It names the last owner; the history belongs to the Trove, whoever held it. Its counts cover the
        owner&apos;s transactions and, separately, the redemptions against the Trove; the timeline lists every event,
        including the manager&apos;s rate changes and the redemptions, so its count is higher.
      </li>
      <li>
        Closed: the owner closed it. Liquidated: the whole Trove fell below the branch&apos;s minimum ratio; the
        Stability Pool took the collateral at a 5% penalty, the owner can claim any surplus, and any shortfall in the
        pool went to the branch&apos;s other Troves, raising their debt and collateral with no action of theirs.
      </li>
      <li>Lifetime flows total every borrow, repayment, fee and redemption, net.</li>
      <li>The timeline lists each event, newest first. </li>
    </ul>

    <h2 className={H}>Branches page</h2>
    <ul className={UL}>
      <li>
        Each branch&apos;s debt, collateral, Trove count, rate span, total collateral ratio (TCR) and minimum ratios.
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
      An (i) on the card, the flows panel and each event explains its figures; the ? at the bottom right of the (i)
      panel opens what that kind of event means in Liquity V2, with sources.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="liquity-v2">{intro}</ProtocolInfoPage>;
}
