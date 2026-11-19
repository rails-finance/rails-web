// The sBOLD pages' header (rails-ops ui-jobs 765): sBOLD is no explorer's
// product, so no protocol identity heads it. "Vaults", linking to the vault
// index, and Ethereum's glyph, as the rail's title row draws a chain.

import Link from "next/link";
import { ChainLabel } from "@/components/shared/rail-header";
import { VAULT_INDEX_HREF } from "@/lib/vaults/routes";

export function SboldPageHeader() {
  return (
    <div className="flex items-center gap-3" data-sbold-header="">
      <Link
        href={VAULT_INDEX_HREF}
        className="text-2xl font-semibold text-foreground hover:underline"
        prefetch={false}
        data-link="vault-index"
      >
        Vaults
      </Link>
      <ChainLabel chainId={1} />
    </div>
  );
}
