// The Morpho Blue Base tower's receipts — the shared swept-lane vocabulary,
// bound to this deployment. See lib/morpho/swept-tower-provenance.ts for why
// the swept lane cannot reuse Ethereum's.

import { makeSweptMorphoTowerVocabulary } from "@/lib/morpho/swept-tower-provenance";
import { MORPHO_BASE_CHAIN_ID, MORPHO_BASE_DEPLOY_BLOCK } from "./asset-catalog";

export const MORPHO_BASE_TOWER_VOCABULARY = makeSweptMorphoTowerVocabulary({
  chainId: MORPHO_BASE_CHAIN_ID,
  deployBlock: MORPHO_BASE_DEPLOY_BLOCK,
});
