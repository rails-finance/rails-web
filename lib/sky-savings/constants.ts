// Sky Savings (sUSDS on Ethereum): the addresses, routes and official sources
// every surface of the explorer names. The pipeline behind the figures is
// rails-ops reference/sky-savings-pipeline.md.

import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export const SKY_CHAIN_ID = MAINNET_CHAIN_ID;

export const SUSDS = {
  symbol: "sUSDS",
  address: "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd",
  decimals: 18,
  /** First log of the proxy (September 2024). */
  firstBlock: 20_677_434,
} as const;

export const USDS = {
  symbol: "USDS",
  address: "0xdc035d45d973e3ec169d2276ddab16f1e407384f",
  decimals: 18,
} as const;

/** The LitePSM whose `tout` prices USDS in USDC, and the wrapper USDS routes through. */
export const LITE_PSM = "0xf6e72db5454dd049d0788e411b06cfaf16853042";
export const USDS_PSM_WRAPPER = "0xa188eec8f81263234da3622a406892f3d630f98c";

export const SKY_BASE_PATH = "/ethereum/sky-savings";
export const SKY_RATES_PATH = `${SKY_BASE_PATH}/rates`;

export function skyPositionHref(holder: string): string {
  return `${SKY_BASE_PATH}/${holder.toLowerCase()}`;
}

/** Official sources for the T4 lessons: Sky's developer docs and the verified
 *  contract sources Sky publishes. */
export const SKY_DOCS = {
  susds: { label: "Sky developer docs: sUSDS", href: "https://developers.skyeco.com/protocol/tokens/susds/" },
  usds: { label: "Sky developer docs: USDS", href: "https://developers.skyeco.com/protocol/tokens/usds/" },
  source: {
    label: "SUsds.sol, the sUSDS contract source",
    href: "https://github.com/sky-ecosystem/sdai/blob/susds/src/SUsds.sol",
  },
  referral: {
    label: "Savings USDS README: referral code",
    href: "https://github.com/sky-ecosystem/sdai/tree/susds#referral-code",
  },
  psm: {
    label: "DssLitePsm.sol, the PSM contract source",
    href: "https://github.com/sky-ecosystem/dss-lite-psm/blob/main/src/DssLitePsm.sol",
  },
  vat: {
    label: "vat.sol: suck, the debt booked for new USDS",
    href: "https://github.com/sky-ecosystem/dss/blob/master/src/vat.sol",
  },
  jug: {
    label: "jug.sol: stability fees paid to the Vow",
    href: "https://github.com/sky-ecosystem/dss/blob/master/src/jug.sol",
  },
  vow: {
    label: "vow.sol: the surplus buffer, where debt and surplus settle",
    href: "https://github.com/sky-ecosystem/dss/blob/master/src/vow.sol",
  },
  wrapper: {
    label: "UsdsPsmWrapper.sol, the USDS side of the PSM",
    href: "https://github.com/sky-ecosystem/usds-wrappers/blob/dev/src/UsdsPsmWrapper.sol",
  },
} as const;
