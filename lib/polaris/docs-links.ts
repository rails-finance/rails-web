// Where a Polaris learn-more modal sends a reader next: the protocol's own
// docs, deep-linked to the page that answers the modal's question, with the
// testnet app as the last link in every set (on a testnet the app is where a
// reader goes next). Every path below answered 200 on 2026-09-10; the site's
// own index is https://docs.polaris.finance/llms.txt if one ever moves.

import type { LearnMoreLink } from "@/components/shared/learn-more-modal";

export const POLARIS_DOCS = "https://docs.polaris.finance";
export const POLARIS_APP = "https://testnet.polaris.finance";

export function polarisDocLink(path: string, label: string): LearnMoreLink {
  return { label, url: `${POLARIS_DOCS}${path}` };
}

export const POLARIS_APP_LINK: LearnMoreLink = { label: "Polaris testnet app", url: POLARIS_APP };

export const POLARIS_DOC_LINKS = {
  passetMarkets: polarisDocLink("/architecture/passet-markets", "What a pAsset market is"),
  interestRates: polarisDocLink("/design/interest-rates", "How the interest rate is set"),
  defensiveMode: polarisDocLink("/design/defensive-mode", "Defensive mode and the 150% minimum"),
  peth: polarisDocLink("/core-assets/peth", "pETH, the collateral"),
  liquidations: polarisDocLink("/design/liquidations", "How liquidations work"),
  recoveryMode: polarisDocLink("/design/recovery-mode", "Recovery mode"),
  oracles: polarisDocLink("/design/oracles", "The price feeds"),
  polaris101: polarisDocLink("/polaris-101", "Polaris in one page"),
  conversions: polarisDocLink("/design/conversions", "Conversions and the PSM"),
  bondingCurve: polarisDocLink("/architecture/bonding-curve", "pETH and the bonding curve"),
} as const;
