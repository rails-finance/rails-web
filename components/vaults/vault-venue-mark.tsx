// The venue mark beside a vault's family word — on a position card, and on a
// directory row.
// ----------------------------------------------------------------------------
// WHY IT IS STILL ON THE ROW AND NOT ONLY ON THE RAIL. Every vault now sits
// under the protocol whose factory deployed it (rails-ops decision 0028), so
// the rail above already names the venue — but this mark is a claim about ONE
// vault rather than about the surface, and the two come apart on the surfaces
// that draw rows from more than one venue: a position card is the same
// component on both chains, and the cross-protocol vault index (0028 point 8)
// will list Morpho's, Aave's and Yearn's in one table. The mark is the same
// chain-proven attribution the family word carries — deployed by Aave's own
// factory, or created by a MetaMorpho factory — and it travels with the row.
//
// DECORATION, NOT TEXT. It is `aria-hidden` and carries no alt text: the family
// word beside it already names the venue's standard in words, and a screen
// reader hearing the mark would hear it twice.

import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import type { VaultPositionFamily } from "@/lib/aave-vaults/vault-position";

/** Every venue this mark stands for. WIDER than `VaultPositionFamily`, which is
 *  the census's vocabulary: the census counts positions, and Yearn has no
 *  position lane here — a Yearn venue reaches this component from a roster row
 *  and from nowhere else. A census family is assignable to this, so the position
 *  surfaces pass what they have always passed. */
export type VaultVenue = VaultPositionFamily | "yearn";

/** Which explorer's mark stands for the venue each family was deployed by.
 *  Aave's three families are all Aave deployments and take the Aave mark; a
 *  MetaMorpho vault takes Morpho's; a Yearn V3 vault takes Yearn's, and the
 *  caller draws it only where the Registry endorses that vault at the block it
 *  read (rails-ops decision 0027 call 1). */
const FAMILY_VENUE: Record<VaultVenue, string> = {
  sgho: "aave-v3",
  stata: "aave-v3",
  "umbrella-stake": "aave-v3",
  morpho: "morpho",
  yearn: "yearn",
};

export function VaultVenueMark({ family, className = "" }: { family: VaultVenue; className?: string }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center ${className}`}>
      <ProtocolIcon id={FAMILY_VENUE[family]} className="h-3.5 w-3.5" />
    </span>
  );
}
