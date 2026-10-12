// The documentation links of the Lifetime flows panel's "?" (zone Z3, still
// TSX in components/protocol/polaris/polaris-flows-note.tsx). Every other
// Polaris Quick Link resolves through `doc_urls` in
// content/polaris/event-prose.yaml, each an anchored page on docs.polaris.finance.

import type { LearnMoreLink } from "@/components/shared/learn-more-modal";

const POLARIS_DOCS = "https://docs.polaris.finance";

export const POLARIS_APP_LINK: LearnMoreLink = { label: "Polaris testnet app", url: "https://testnet.polaris.finance" };

export const POLARIS_DOC_LINKS = {
  interestRates: { label: "How the interest rate is set", url: `${POLARIS_DOCS}/design/interest-rates` },
  liquidations: { label: "How liquidations work", url: `${POLARIS_DOCS}/design/liquidations` },
  // The PSM is the docs' "Adaptive Peg Defense"; their "Conversions" page is
  // the one-way pETH-to-POLAR auction, a different mechanism.
  pegDefence: { label: "The PSM (Adaptive Peg Defense)", url: `${POLARIS_DOCS}/design/adaptive-peg-defence` },
} as const;
