// Where Aerodrome's docs and the contracts differ: rails-ops
// reference/official-docs/aerodrome.md, "Read on chain, no disagreement" and Owner's calls 1
// (ui-jobs 647). The block and values are the register's.

import type { InfoDocsAndChain } from "@/components/shared/protocol-info-page";
import type { Provenance } from "@/components/shared/provenance";
import { AERODROME } from "@/lib/aerodrome/sites";

const REGISTER_BLOCK = 56_875_602;
const SECURITY = "https://aerodrome.finance/security";

const factoryProv = (name: string, nfpm: string, factory: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block: REGISTER_BLOCK },
  contract: { name: `NonfungiblePositionManager, ${name}`, address: nfpm },
  summary: `Factory — the ${name} position manager's factory() returns ${factory}, the factory Rails reads for this deployment.`,
  via: "nfpm.factory() @ block 56,875,602, read 13 Nov 2026",
  verify: {
    kind: "recompute",
    text: `To check: ask any Base archive node for factory() on ${nfpm} at block 56,875,602.`,
  },
});

export const AERODROME_DOCS_AND_CHAIN: readonly InfoDocsAndChain[] = [
  {
    claim:
      "The docs' Slipstream contract table lists one position manager and one pool factory. Rails reads three position managers, each with its factory.",
    docs: {
      label: "Docs",
      lead: "the Security page's Slipstream table lists",
      quotes: [
        { words: "NonfungiblePositionManager", href: SECURITY },
        { words: "PoolFactory", href: SECURITY },
      ],
      read: "13 Nov 2026",
    },
    chain: [
      {
        words: "the gauge caps position manager's factory() returns the gauge caps CLFactory Rails reads",
        prov: factoryProv("gauge caps", AERODROME.nfpm.caps!, AERODROME.factory.caps!),
      },
      {
        words: "the gauges v3 position manager's factory() returns the gauges v3 CLFactory",
        prov: factoryProv("gauges v3", AERODROME.nfpm.gv3!, AERODROME.factory.gv3!),
      },
    ],
  },
];
