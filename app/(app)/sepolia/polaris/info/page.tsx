// focus: the explorer's explainer; the shell's gate stands over the explorer
// About this explorer — the intro prose on the rail's sub-nav. The anatomy
// lives in ProtocolInfoShell; this file is the copy (Miles's text, 16 Oct 2026,
// in the Liquity V2 page's shape). It is also where the assets are explained:
// the card's tooltips no longer carry it (ui-jobs 356).

import Link from "next/link";
import { ProtocolInfoShell } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { POLARIS_LOANS_PATH, POLARIS_MARKETS_PATH, POLARIS_SP_PATH } from "@/lib/polaris/routes";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

export const metadata = infoMetadata("polaris");

const H = "mt-5 text-sm font-semibold text-foreground";
const UL = "mt-1.5 list-disc space-y-1 pl-5";

const intro = (
  <>
    <p>
      Every Polaris position on Sepolia, with its history. A position is a loan: pETH locked as collateral, a stablecoin
      borrowed against it. All numbers are test numbers, not money. Stability Pool deposits and reserve loans have pages
      of their own.
    </p>

    <h2 className={H}>How it works</h2>
    <ul className={UL}>
      <li>
        Two markets: USDp tracks the dollar, GOLDp tracks gold. You lock pETH in one and mint that market&apos;s
        stablecoin against it.
      </li>
      <li>
        pETH is Polaris&apos;s collateral token. You buy it with ETH from a bonding curve, and its price rises as more
        ETH goes in.
      </li>
      <li>
        Nobody chooses an interest rate. The primary rate moves with the PSM&apos;s mints and redemptions. A secondary
        rate rises as the market&apos;s debt-to-reserve ratio climbs.
      </li>
      <li>
        The PSM is the peg module: anyone can mint USDp or GOLDp directly against pETH, or redeem them for pETH. Nobody
        picks a position, so every open position takes a share.
      </li>
      <li>A position is an NFT, so it can change hands without being closed.</li>
      <li>
        A position also moves without its holder doing anything: interest is added to the debt, stability gains are
        credited against it, reward pETH is added to the collateral, and PSM activity applies its share.
      </li>
    </ul>

    <h2 className={H}>Listing</h2>
    <ul className={UL}>
      <li>One row per position: pETH collateral, debt, and current holder.</li>
      <li>
        Search by wallet or ENS name to see the positions that address holds on Sepolia. Names resolve on Ethereum
        mainnet, since Sepolia has no name registry this site reads.
      </li>
    </ul>

    <h2 className={H}>Position page</h2>
    <ul className={UL}>
      <li>
        Opening a position shows every touch the market&apos;s contracts recorded. Each shows what the holder moved,
        plus everything the protocol applied at the same moment: interest, stability gains, reward pETH and the PSM
        share.
      </li>
      <li>
        Live figures come from the contracts at the latest block: collateral ratio against the minimum, current rate,
        and what has built up since the last touch. The collateral&apos;s dollar value comes from the protocol&apos;s
        price feed.
      </li>
    </ul>

    <h2 className={H}>Markets page</h2>
    <ul className={UL}>
      <li>
        Puts the two markets side by side.{" "}
        <Link href={POLARIS_MARKETS_PATH} className={INLINE_LINK}>
          See the markets view
        </Link>
        .
      </li>
    </ul>

    <h2 className={H}>Testnet note</h2>
    <ul className={UL}>
      <li>Tokens are test tokens, and ETH and gold prices come from the protocol&apos;s testnet medianisers.</li>
    </ul>

    <h2 className={H}>Stability Pool deposits</h2>
    <ul className={UL}>
      <li>
        Each market has a stability pool that repays the debt of liquidated positions. A deposit in it is an NFT, named
        by its market and number. Each liquidation burns a share of every deposit and pays pETH in its place, and the
        deposit also earns the market&apos;s stablecoin as yield.
      </li>
      <li>
        The pool writes what changed only when the holder touches the deposit. A deposit&apos;s page reads the rest from
        the pool at the latest block: the deposit now, and the pETH and yield the next touch would pay.{" "}
        <Link href={POLARIS_SP_PATH} className={INLINE_LINK}>
          See the deposits
        </Link>
        .
      </li>
      <li>Deposit #2 in each pool is held by the market&apos;s savings vault (sUSDp, sGOLDp).</li>
    </ul>

    <h2 className={H}>Reserve loans</h2>
    <ul className={UL}>
      <li>
        A reserve loan borrows WETH from the protocol&apos;s reserve against fpETH, the floor part of pETH. Its price in
        WETH only rises, so a loan against it can&apos;t be liquidated.
      </li>
      <li>
        The debt is a number of shares, and each fee the reserve charges raises the debt per share. A loan&apos;s page
        states its debt, its cost so far, and its collateral at the floor price beside the debt.{" "}
        <Link href={POLARIS_LOANS_PATH} className={INLINE_LINK}>
          See the loans
        </Link>
        .
      </li>
    </ul>

    <h2 className={H}>How Rails reads it</h2>
    <ul className={UL}>
      <li>The USDp and GOLDp stability pools: every deposit operation and its getters at the latest block.</li>
      <li>The reserve loans manager: every loan opened, adjusted and closed, and the debt per share.</li>
      <li>The loan NFT: who holds each loan.</li>
      <li>The bonding curve&apos;s floorPrice(): fpETH in WETH.</li>
    </ul>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoShell session="polaris">{intro}</ProtocolInfoShell>;
}
