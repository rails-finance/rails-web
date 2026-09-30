// About this explorer — the intro prose on the rail's sub-nav. The anatomy
// lives in ProtocolInfoPage; this file is the copy.

import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { POLARIS_MARKETS_PATH } from "@/lib/polaris/routes";

export const metadata = infoMetadata("polaris");

const intro = (
  <>
    <p>
      Polaris is a Liquity-lineage CDP protocol running on the Sepolia testnet. A borrower posts pETH into a CDP in one
      of two markets and mints that market&rsquo;s stablecoin against it: USDp tracks the dollar, GOLDp tracks gold.
      pETH is the protocol&rsquo;s own collateral token, bought with ETH from its bonding curve at a price that rises as
      ETH enters the curve. The CDP is an NFT, so a position can change hands without being closed. Rates are
      algorithmic and no holder chooses one: a primary rate that moves with the PSM&rsquo;s mints and redemptions, plus
      a secondary rate that rises with the market&rsquo;s debt-to-reserve ratio.
    </p>
    <p>
      Each row of the listing is one CDP: its pETH collateral, its debt in the market&rsquo;s stablecoin, and its
      current holder. Opening one shows every touch the market&rsquo;s own contracts recorded for it — what the holder
      moved, and every leg the protocol applied at the same moment: interest written into the debt, stability gains
      credited against it, reward pETH added to the collateral, and the CDP&rsquo;s pro-rata share of the PSM&rsquo;s
      mints and redemptions. The PSM is the protocol&rsquo;s peg module, where a trader mints USDp or GOLDp directly
      against pETH or redeems it for pETH; nobody picks a CDP, and every open CDP takes a share. The live figures — the
      collateral ratio against the minimum in force, the rate, and what is pending since the last touch — come from the
      contracts at the latest block, and the collateral&rsquo;s dollar value from the protocol&rsquo;s own price feed.
      The{" "}
      <Link href={POLARIS_MARKETS_PATH} className="text-blue-500 hover:underline">
        markets view
      </Link>{" "}
      puts the two markets side by side. An ENS name typed into the search resolves on Ethereum mainnet, since Sepolia
      has no name registry the site reads, and the listing then shows the CDPs held by that address on this testnet.
    </p>
    <p>
      Every number on this explorer is a Sepolia testnet number: the tokens are test tokens and the ETH and gold prices
      come from the protocol&rsquo;s own testnet medianisers, so none of it is money. Two things the protocol has are
      not shown yet — the reserve loans, which lend ETH against fpETH and which the index captures but no page renders,
      and the stability-pool deposits, which are positions of their own kind. fpETH is the floor part of pETH: the
      component whose price in ETH the protocol guarantees can only rise, so a loan against it cannot be liquidated.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="polaris">{intro}</ProtocolInfoPage>;
}
