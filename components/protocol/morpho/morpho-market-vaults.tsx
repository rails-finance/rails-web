// The Morpho market page's "Supplied by vaults" (rails-ops ui-jobs 549 step 4):
// a server component that reads the MetaMorpho vaults with this market in
// their withdraw queue (lib/vaults/supplied-by-read.ts) and hands the plain
// read to the shared section. The page mounts it under a Suspense boundary, so
// the read never holds the market's head; when the page moves onto the
// product shells the same read becomes the shell's `suppliedBy`.

import { SuppliedByVaults } from "@/components/shared/product/supplied-by-vaults";
import { readMorphoSuppliedBy } from "@/lib/vaults/supplied-by-read";
import { suppliedByContent } from "@/lib/vaults/card-words";
import { metaMorphoVaultRosterHref } from "@/lib/vaults/routes";
import type { MetaMorphoChainId } from "@/lib/metamorpho/vault-roster";

export async function MorphoMarketVaults({
  chainId,
  marketId,
  asset,
  pair,
}: {
  chainId: MetaMorphoChainId;
  marketId: string;
  asset: { symbol: string; address: string; decimals: number };
  /** "USDC / cbBTC", for the exports. */
  pair: string;
}) {
  const read = await readMorphoSuppliedBy(chainId, marketId, asset);
  return (
    <SuppliedByVaults
      read={read}
      what={`the ${pair} market on Morpho Blue`}
      line={`${read.rows.length === 1 ? "One MetaMorpho vault has" : `${read.rows.length.toLocaleString("en-US")} MetaMorpho vaults have`} this market in their withdraw queue, largest first.`}
      learnMore={suppliedByContent("morpho")}
      links={[
        {
          item: "vault-roster",
          title: "All MetaMorpho vaults",
          subtitle: `The roster on ${chainId === 1 ? "Ethereum" : "Base"}`,
          href: metaMorphoVaultRosterHref(chainId),
          internal: true,
        },
      ]}
    />
  );
}
