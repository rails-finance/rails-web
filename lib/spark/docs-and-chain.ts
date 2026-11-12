// Where the docs and the contracts differ: rails-ops
// reference/official-docs/spark.md, "Docs and chain disagree", entries 1 and 2
// (ui-jobs 609). The figures are the register's, read at block 26,400,276.

import type { InfoDocsAndChain } from "@/components/shared/protocol-info-page";
import type { Provenance } from "@/components/shared/provenance";
import { SPARK_POOL_IDENTITY } from "./pool-identity";

const REGISTER_BLOCK = 26_400_276;
const MARKETS_DOCS = "https://docs.spark.finance/products/sparklend/guides/overview-of-markets";
const POOL = { name: SPARK_POOL_IDENTITY.name, address: SPARK_POOL_IDENTITY.address };

const deprecatedEmodeProv: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  contract: POOL,
  summary:
    'sDAI and sUSDS in E-mode — Pool.getConfiguration at block 26,400,276, read 12 Nov 2026: sDAI and sUSDS have a base LTV of 0 and a liquidation threshold of 80%, and both sit in E-mode category 2 ("USD"), which gives them an LTV of 91% and a liquidation threshold of 92%. An account in that category can borrow against them. LBTC has a base LTV of 0, a liquidation threshold of 75% and no E-mode category.',
  via: "Pool.getConfiguration(asset) @ block 26,400,276",
  verify: {
    kind: "recompute",
    text: "To check: ask any Ethereum archive node for Pool.getConfiguration of sDAI and of sUSDS at block 26,400,276, and decode the LTV, liquidation threshold and E-mode category bits.",
  },
};

const daiThresholdProv: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  contract: POOL,
  summary:
    "DAI's liquidation threshold — Pool.getConfiguration at block 26,400,276, read 12 Nov 2026: DAI's base LTV is 0 and its liquidation threshold 0.01% (1 basis point). The other borrow-only reserves, USDC, USDT, PYUSD, USDS, USDG and RLUSD, have 0.",
  via: "Pool.getConfiguration(DAI) @ block 26,400,276",
  verify: {
    kind: "recompute",
    text: "To check: ask any Ethereum archive node for Pool.getConfiguration of DAI at block 26,400,276, and decode the LTV and liquidation threshold bits.",
  },
};

export const SPARK_DOCS_AND_CHAIN: readonly InfoDocsAndChain[] = [
  {
    claim:
      "The docs mark sDAI and sUSDS deprecated as collateral, with an LTV of 0; E-mode category 2 gives them an LTV of 91% and a liquidation threshold of 92%.",
    docs: {
      quotes: [{ words: "Deprecated as collateral: sDAI, sUSDS, LBTC … LTV set to 0", href: MARKETS_DOCS }],
      read: "12 Nov 2026",
    },
    chain: [{ words: "LTV 91% and liquidation threshold 92% in E-mode category 2", prov: deprecatedEmodeProv }],
  },
  {
    claim: "The docs list DAI as borrow-only; its reserve on the Pool carries a liquidation threshold of 0.01%.",
    docs: {
      quotes: [{ words: "Cannot be used as collateral", href: MARKETS_DOCS }],
      read: "12 Nov 2026",
    },
    chain: [{ words: "base LTV 0 and liquidation threshold 0.01%", prov: daiThresholdProv }],
  },
];
