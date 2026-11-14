// Where the docs and the contracts differ: rails-ops
// reference/official-docs/asymmetry.md, "Docs and chain disagree", entries 1 and 2
// (ui-jobs 609). The figures are the register's, read at block 26,399,084.

import type { InfoDocsAndChain } from "@/components/shared/protocol-info-page";
import type { ProvInput, Provenance } from "@/components/shared/provenance";

const DOCS = "https://docs.asymmetry.finance/usdaf-stablecoin";

const REGISTER_BLOCK = 26_399_084;

const BRANCHES = {
  stable: [
    { name: "ysyBOLD", bo: "0x57bd20aE68F845b35B76FE6e0239C9929EB48469" },
    { name: "scrvUSD", bo: "0x9e601005deaaEE8294c686e28E1AFfd04Cc13830" },
    { name: "sUSDS", bo: "0x336D9C5ecb9D6ce79C8C077D35426e714969b41d" },
    { name: "sfrxUSD", bo: "0x2538cD346429eA59902e02448BB7A7c098e4554E" },
  ],
  btc: [
    { name: "tBTC", bo: "0xDA9af112eDfD837EebC1780433481426a52556e0" },
    { name: "WBTC18", bo: "0x664507f1445657D36D8064663653B7810971F411" },
    { name: "cbBTC18", bo: "0xD00182E777f6DA3220355965412c9605Fcd80aA5" },
  ],
} as const;

const mcrInputs = (branches: readonly { name: string; bo: string }[], mcr: string): ProvInput[] =>
  branches.map((b) => ({
    label: `${b.name} MCR()`,
    value: mcr,
    kind: "chain",
    pclass: "state",
    contract: { name: `${b.name} BorrowerOperations`, address: b.bo },
  }));

const maxLtvStableProv: Provenance = {
  kind: "chain-derived",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  summary:
    "Max LTV, stablecoin branches — 1 ÷ MCR, where MCR() on the BorrowerOperations of ysyBOLD, scrvUSD, sUSDS and sfrxUSD reads 110% at block 26,399,084, read 12 Nov 2026. A Trove on these branches is liquidatable above 90.91% LTV. The docs' 83.33% equals 1 ÷ CCR (120%), the level below which a branch restricts new borrowing.",
  via: "BorrowerOperations.MCR() on each branch @ block 26,399,084",
  formula: "1 ÷ MCR",
  inputs: mcrInputs(BRANCHES.stable, "110%"),
  verify: {
    kind: "recompute",
    text: "To check: ask any Ethereum archive node for MCR() on each branch's BorrowerOperations at block 26,399,084, and divide 1 by it.",
  },
};

const maxLtvBtcProv: Provenance = {
  kind: "chain-derived",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  summary:
    "Max LTV, BTC branches — 1 ÷ MCR, where MCR() on the BorrowerOperations of tBTC, WBTC18 and cbBTC18 reads 120% at block 26,399,084, read 12 Nov 2026. A Trove on these branches is liquidatable above 83.33% LTV. The docs' 66.67% equals 1 ÷ CCR (150%), the level below which a branch restricts new borrowing.",
  via: "BorrowerOperations.MCR() on each branch @ block 26,399,084",
  formula: "1 ÷ MCR",
  inputs: mcrInputs(BRANCHES.btc, "120%"),
  verify: {
    kind: "recompute",
    text: "To check: ask any Ethereum archive node for MCR() on each branch's BorrowerOperations at block 26,399,084, and divide 1 by it.",
  },
};

const branchesProv: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  summary:
    "Branches deployed — seven at block 26,399,084, read 12 Nov 2026: ysyBOLD, scrvUSD, sUSDS and sfrxUSD, then tBTC, WBTC18 and cbBTC18, each with a BorrowerOperations contract.",
  via: "each branch's BorrowerOperations @ block 26,399,084",
  inputs: [...BRANCHES.stable, ...BRANCHES.btc].map((b) => ({
    label: b.name,
    kind: "chain",
    pclass: "state",
    contract: { name: `${b.name} BorrowerOperations`, address: b.bo },
  })),
  verify: {
    kind: "recompute",
    text: "To check: ask any Ethereum archive node for MCR() on each of the seven BorrowerOperations at block 26,399,084; each answers.",
  },
};

export const ASYMMETRY_DOCS_AND_CHAIN: readonly InfoDocsAndChain[] = [
  {
    claim:
      "The docs give a Max LTV of 83.33% for the stablecoin branches and 66.67% for the BTC branches; the contracts set 90.91% and 83.33%.",
    docs: {
      quotes: [
        {
          words:
            "Maximum LTVs are limited to what is on the dApp front-end displays: 83.33% for Stablecoins and 66.67% for BTC options.",
          href: `${DOCS}/borrowing`,
        },
      ],
      read: "12 Nov 2026",
    },
    chain: [
      { words: "90.91% on ysyBOLD, scrvUSD, sUSDS and sfrxUSD", prov: maxLtvStableProv },
      { words: "83.33% on tBTC, WBTC18 and cbBTC18", prov: maxLtvBtcProv },
    ],
  },
  {
    claim:
      "The docs count six collaterals on some pages and eight on others; the deployment this explorer covers has seven branches.",
    docs: {
      quotes: [
        { words: "six collaterals", href: `${DOCS}/redemptions` },
        { words: "USDaf can be minted by borrowing against the 8 collateral assets", href: `${DOCS}/borrowing` },
      ],
      read: "12 Nov 2026",
    },
    chain: [{ words: "seven branches", prov: branchesProv }],
  },
];
