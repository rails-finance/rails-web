// IPOR Fusion on Ethereum — the explorer root: a redirect to its roster (components/vaults/ipor-fusion-routes.tsx).
import { iporFusionRootRedirect } from "@/components/vaults/ipor-fusion-routes";

// focus: a redirect to the explorer's first sub-page, which declares itself.

export default function IporFusionExplorerRoot() {
  iporFusionRootRedirect(1);
}
