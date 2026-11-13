// Where f(x)'s docs and the contracts differ: rails-ops
// reference/official-docs/fx.md, "Docs and chain disagree", entry 3
// (ui-jobs 638). The block and values are the register's.

import type { InfoDocsAndChain } from "@/components/shared/protocol-info-page";
import type { Provenance } from "@/components/shared/provenance";
import { FX_ADDRESSES } from "@/lib/fx/asset-catalog";

const REGISTER_BLOCK = 26_404_532;
const DOCS = "https://fxprotocol.gitbook.io/fx-docs";

const rangeProv = (name: string, address: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  contract: { name, address },
  summary: `The ${name}'s borrowing ceiling — getDebtRatioRange() at block 26,404,532, read 13 Nov 2026: the maximum is 855,000,000,000,000,000, an LTV of 85.5% at the 1e18 scale. A position at that LTV holds collateral worth 1 ÷ (1 − 0.855) = 6.9 times its equity.`,
  via: `pool.getDebtRatioRange() · maximum ÷ 1e18 @ block 26,404,532`,
  verify: {
    kind: "recompute",
    text: `To check: ask any Ethereum archive node for getDebtRatioRange() on ${address} at block 26,404,532, and divide the second value by 1e18.`,
  },
});

export const FX_DOCS_AND_CHAIN: readonly InfoDocsAndChain[] = [
  {
    claim:
      "The docs give the leverage ceiling as 7x on three pages and 10x on three others. Both pools stop borrowing at an LTV of 85.5%, which is 6.9x, in line with the 7x pages.",
    docs: {
      quotes: [
        { words: "Up to 7x leverage on ETH and BTC", href: `${DOCS}/overview/abstract` },
        { words: "1.1x - 7x", href: `${DOCS}/risk-management/risk-parameters` },
        { words: "A leveraged position that delivers up to 10x leverage on ETH", href: DOCS },
        {
          words: "xPOSITIONS offer up to 10x leverage on ETH.",
          href: `${DOCS}/guides/how-to-open-a-leverage-position-xposition`,
        },
      ],
      read: "13 Nov 2026",
    },
    chain: [
      {
        words: "the wstETH pool's getDebtRatioRange maximum is 85.5% at block 26,404,532",
        prov: rangeProv("wstETH pool", FX_ADDRESSES.WSTETH_POOL),
      },
      {
        words: "the WBTC pool's is 85.5% at the same block",
        prov: rangeProv("WBTC pool", FX_ADDRESSES.WBTC_POOL),
      },
    ],
  },
];
