// Where the holder label (anatomy C7.1) sends a reader: the vault's factsheet
// on the chain the label matched on, only once that page is launched, so a
// launched explorer never links into an unlaunched one (as the asset page's
// explorer chips filter them).

import { isUnlaunchedPath } from "@/lib/shared/protocols";
import { iporFusionVaultHref } from "@/lib/vaults/routes";

export function holderLabelHref(chainId: number, wallet: string): string | null {
  const href = iporFusionVaultHref(chainId, wallet);
  return href && !isUnlaunchedPath(href) ? href : null;
}
