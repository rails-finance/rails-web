import Link from "next/link";
import { ProtocolInfoPage } from "@/components/shared/protocol-info-page";
import { infoMetadata } from "@/lib/shared/page-metadata";
import { SKY_RATES_PATH } from "@/lib/sky-savings/constants";
import { protocolForSession } from "@/lib/shared/protocols";

export const metadata = infoMetadata("sky-savings");

const MAKERDAO = protocolForSession("makerdao")!.href;

const intro = (
  <>
    <p>
      Sky Savings is the savings module of Sky, the protocol that was MakerDAO. A saver deposits USDS, Sky&rsquo;s
      stablecoin, and receives sUSDS, a share token. The number of shares stays the same while they are held, and what
      each share redeems for rises every second at the Savings Rate, which Sky governance sets. Withdrawing burns the
      shares and pays out the USDS they are worth at that moment. Sky mints the interest as new USDS and books the same
      amount as debt at the Vow, its surplus buffer, where borrowers&rsquo; stability fees on Sky vaults are paid in.
    </p>
    <p>
      Each row of the listing is one address that holds or has held sUSDS on Ethereum: its balance, what the balance is
      worth in USDS, and the interest it has earned. Interest earned is what the position is worth now, plus every USDS
      amount that left it, less every USDS amount that came in; shares received from another address count at their
      worth on arrival. Opening a position shows every deposit, withdrawal and transfer that names the address, the
      Savings Rate changes between them, and Lifetime flows, where the interest is the dashed part of the bar.
    </p>
    <p>
      Every figure is stated at one sealed block, and a check every six hours compares the ledger with the sUSDS
      contract for every holder. A page shows no figure unless the latest check passed, and each position&rsquo;s card
      names the check&rsquo;s block. Sky runs no USDS price feed, so figures are in USDS; the dollar axis of Lifetime
      flows values USDS at the exit rate of the PSM, Sky&rsquo;s contract that swaps USDS and USDC: one USDC for the
      whole life of sUSDS. Referral codes appear as numbers, because no public list names the front ends behind them.
    </p>
    <p>
      The{" "}
      <Link href={SKY_RATES_PATH} className="text-blue-500 hover:underline">
        Savings Rate history
      </Link>{" "}
      lists every rate change. Morpho Blue and Sky&rsquo;s bridge escrows for Arbitrum One, Base and OP Mainnet are left
      out of the listing, because their sUSDS backs positions elsewhere; each still opens by its address. Borrowing
      against collateral in Sky&rsquo;s vaults is on the{" "}
      <Link href={MAKERDAO} className="text-blue-500 hover:underline">
        MakerDAO explorer
      </Link>
      . sDAI and the sUSDS on other chains are not covered yet.
    </p>
  </>
);

export default function InfoPage() {
  return <ProtocolInfoPage session="sky-savings">{intro}</ProtocolInfoPage>;
}
