// About this explorer — the intro prose on the rail's sub-nav. The anatomy
// lives in ProtocolInfoPage; this file is the copy (Miles's text, 16 Oct 2026,
// in the Liquity V2 page's shape). It is also where the assets are explained:
// the card's tooltips no longer carry it (ui-jobs 356).

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { POLARIS_MARKETS_PATH } from "@/lib/polaris/routes";

export const metadata = infoMetadata("polaris");

const H = "mt-5 text-sm font-semibold text-foreground";
const UL = "mt-1.5 list-disc space-y-1 pl-5";
const LINK = "text-blue-500 hover:underline";

const intro = (
  <>
    <p>
      Every Polaris CDP on Sepolia, with its history. A CDP is a loan: pETH locked as collateral, a stablecoin borrowed
      against it. All numbers are test numbers, not money. Reserve loans and Stability Pool deposits are not shown yet.
    </p>

    <h2 className={H}>How it works</h2>
    <ul className={UL}>
      <li>
        Two markets: USDp tracks the dollar, GOLDp tracks gold. You lock pETH in one and mint that market&apos;s
        stablecoin against it.
      </li>
      <li>
        pETH is Polaris&apos;s own collateral token. You buy it with ETH from a bonding curve, and its price rises as
        more ETH goes in.
      </li>
      <li>
        Nobody chooses an interest rate. The primary rate moves with the PSM&apos;s mints and redemptions. A secondary
        rate rises as the market&apos;s debt-to-reserve ratio climbs.
      </li>
      <li>
        The PSM is the peg module: anyone can mint USDp or GOLDp directly against pETH, or redeem them for pETH. Nobody
        picks a CDP, so every open CDP takes a share.
      </li>
      <li>A CDP is an NFT, so it can change hands without being closed.</li>
      <li>
        A CDP also moves without its holder doing anything: interest is added to the debt, stability gains are credited
        against it, reward pETH is added to the collateral, and PSM activity applies its share.
      </li>
    </ul>

    <h2 className={H}>Listing</h2>
    <ul className={UL}>
      <li>One row per CDP: pETH collateral, debt, and current holder.</li>
      <li>
        Search by wallet or ENS name to see the CDPs that address holds on Sepolia. Names resolve on Ethereum mainnet,
        since Sepolia has no name registry this site reads.
      </li>
    </ul>

    <h2 className={H}>CDP page</h2>
    <ul className={UL}>
      <li>
        Opening a CDP shows every touch the market&apos;s contracts recorded. Each shows what the holder moved, plus
        everything the protocol applied at the same moment: interest, stability gains, reward pETH and the PSM share.
      </li>
      <li>
        Live figures come straight from the contracts at the latest block: collateral ratio against the minimum, current
        rate, and what has built up since the last touch. The collateral&apos;s dollar value comes from the
        protocol&apos;s own price feed.
      </li>
    </ul>

    <h2 className={H}>Markets page</h2>
    <ul className={UL}>
      <li>
        Puts the two markets side by side.{" "}
        <Link href={POLARIS_MARKETS_PATH} className={LINK}>
          Open the markets view
        </Link>
        .
      </li>
    </ul>

    <h2 className={H}>Testnet note</h2>
    <ul className={UL}>
      <li>Tokens are test tokens, and ETH and gold prices come from the protocol&apos;s own testnet medianisers.</li>
    </ul>

    <h2 className={H}>Not shown yet</h2>
    <ul className={UL}>
      <li>
        Reserve loans lend ETH against fpETH, the floor part of pETH. Its price in ETH is guaranteed only to rise, so a
        loan against it can&apos;t be liquidated. The index records these loans, but no page shows them.
      </li>
      <li>Stability-pool deposits are positions of their own kind, and they aren&apos;t shown either.</li>
    </ul>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="polaris">{intro}</ProtocolInfoPage>;
}
