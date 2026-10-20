"use client";

// The catalogue cross-link on an Aave vault holder card: a holder that is
// itself one of Aave's vaults, linked to its own page. It states a mechanism
// and never an identity.

import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { AAVE_FAMILY_SINGULAR } from "@/components/vaults/aave-vault-format";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { aaveVaultCatalogueMemberProv, type AaveVaultCoords } from "@/lib/aave-vaults/vault-provenance";
import { ethereumVaultHref } from "@/lib/vaults/routes";
import type { AaveVaultRef } from "@/lib/sources/chain/aave-ethereum-vault";

/** A vault in this catalogue, linked to its own page. The link exists because
 *  an enumerator returned the address at this block — a chain fact, not a name
 *  — and the receipt on it says exactly that. */
export function CatalogueMemberLink({
  vault,
  coords,
  what,
}: {
  vault: AaveVaultRef;
  coords: AaveVaultCoords;
  what: string;
}) {
  return (
    <>
      <Prov info={aaveVaultCatalogueMemberProv(coords, what)}>
        <Link
          href={ethereumVaultHref(vault.address)}
          className={PAGE_LINK}
          prefetch={false}
          data-link="catalogue-member"
          data-catalogue-member={vault.address}
        >
          {vault.symbol ?? shortAddress(vault.address)}
        </Link>
      </Prov>{" "}
      <span className="text-[11px] text-rb-500">({AAVE_FAMILY_SINGULAR[vault.family]})</span>
    </>
  );
}
