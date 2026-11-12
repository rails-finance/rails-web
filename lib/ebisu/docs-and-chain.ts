// Where the docs and the contracts differ: rails-ops
// reference/official-docs/ebisu.md, "Docs and chain disagree", entries 1 and 2
// (ui-jobs 609). The blocks and transactions are the register's.

import type { InfoDocsAndChain } from "@/components/shared/protocol-info-page";
import type { Provenance } from "@/components/shared/provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const DOCS = "https://ebisu.gitbook.io/ebisu-money";

const SHUTDOWN_TX = "0xcf1dc077db5a5139e9b0c58ef0726882260e3d1f1c0dfb43b84deaf55894514a";
const WITHDRAWAL_TX = "0x66f27bc34cf779d9fc2d0da56a80883990b166d871b41d24ba6fd77ea40f53b9";
const BORROWER_OPERATIONS_IMPL = "0x28fb5fd228b872c1c808637e8b85935c73e92cfb";
const ADMIN_SAFE = "0x25b85831da750c912ab7f0cf53b9d82f7894ed07";

const shutdownProv: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: 25_799_370, txHash: SHUTDOWN_TX, timestamp: "20 Aug 2026 22:37:59 UTC" },
  contract: { name: "BorrowerOperations implementation", address: BORROWER_OPERATIONS_IMPL },
  summary:
    "Branch shutdown — a Safe transaction at block 25,799,370 (20 Aug 2026 22:37:59 UTC) upgraded the five BorrowerOperations proxies to this implementation and called shutdownByAdmin(). ActivePool.hasBeenShutDown() reads true and shutdownTime() 1787265479 on all five branches, read 12 Nov 2026. The implementation is not verified on Etherscan, so what it does is known from its calls and their results.",
  via: "shutdownByAdmin() in the Safe transaction; ActivePool.hasBeenShutDown() and shutdownTime() on each branch",
  verify: {
    kind: "etherscan",
    href: explorerUrl(MAINNET_CHAIN_ID, "tx", SHUTDOWN_TX),
    text: "The shutdown transaction on Etherscan",
  },
};

const withdrawalProv: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: 26_238_016, txHash: WITHDRAWAL_TX },
  contract: { name: "Ebisu admin Safe", address: ADMIN_SAFE },
  summary:
    "Collateral withdrawal — a Safe transaction at block 26,238,016 (21 Oct 2026) upgraded nine pool proxies and called withdrawCollateral() on each, sending the pools' balances to the admin Safe (2 of 3, the address CollateralRegistry.ebisuAdmin() returns): 1,987.507296796691221496 sUSDe from the sUSDe ActivePool and 14,404.929434772406579198 stcUSD from the stcUSD ActivePool, with dust from the weETH, WBTC and LBTC pools. Every pool holds 0 collateral at blocks 26,399,472 to 26,399,480, read 12 Nov 2026.",
  via: "withdrawCollateral() on nine pools in the Safe transaction",
  inputs: [
    {
      label: "sUSDe withdrawn",
      value: "1,987.507296796691221496 sUSDe",
      kind: "chain",
      pclass: "state",
      contract: { name: "sUSDe ActivePool", address: "0x83a095a74839ad88c24e77f1e9a54baaa7ff5157" },
    },
    {
      label: "stcUSD withdrawn",
      value: "14,404.929434772406579198 stcUSD",
      kind: "chain",
      pclass: "state",
      contract: { name: "stcUSD ActivePool", address: "0xff88be162e679517d9d3729be67495084fb98b69" },
    },
  ],
  verify: {
    kind: "etherscan",
    href: explorerUrl(MAINNET_CHAIN_ID, "tx", WITHDRAWAL_TX),
    text: "The withdrawal transaction on Etherscan",
  },
};

const zombieAdjustProv: Provenance = {
  kind: "chain",
  pclass: "state",
  contract: { name: "BorrowerOperations implementation", address: BORROWER_OPERATIONS_IMPL },
  summary:
    "adjustZombieTrove — the BorrowerOperations implementation behind the sUSDe proxy 0x026Cf854f1e0Adc9fe96f1433436E7bBd0A95af0 contains the selector of adjustZombieTrove, Liquity V2's function for bringing a zombie Trove back above the minimum debt, read 12 Nov 2026. Since the shutdown of 20 Aug 2026 it would revert with every other adjustment.",
  via: "the implementation's code, searched for the adjustZombieTrove selector",
  verify: {
    kind: "recompute",
    text: "To check: ask any Ethereum node for the code at the implementation's address and look for the four-byte selector of adjustZombieTrove.",
  },
};

export const EBISU_DOCS_AND_CHAIN: readonly InfoDocsAndChain[] = [
  {
    claim:
      "The site and docs do not mention a shutdown; the Ethereum deployment was shut down on 20 Aug 2026 and the collateral in its pools withdrawn on 21 Oct 2026.",
    docs: {
      label: "Site",
      lead: "the borrow page lists an Ethereum table with a Borrow button and the rows",
      quotes: [
        { words: "sUSDe 0.00 sUSDe $0 932.59 ebUSD", href: "https://ebisu.money/borrow" },
        { words: "stcUSD 0.00 stcUSD $0 10,804.25 ebUSD", href: "https://ebisu.money/borrow" },
      ],
      read: "12 Nov 2026",
    },
    chain: [
      { words: "all five branches shut down at block 25,799,370 (20 Aug 2026)", prov: shutdownProv },
      { words: "the collateral withdrawn from every pool at block 26,238,016 (21 Oct 2026)", prov: withdrawalProv },
    ],
  },
  {
    claim:
      "The docs say a zombie position cannot be adjusted; the BorrowerOperations contract carries adjustZombieTrove, the function that adjusts one.",
    docs: {
      quotes: [
        {
          words: "A position below the minimum debt (2,000 ebUSD). It cannot be adjusted, only fully closed.",
          href: DOCS + "/faq",
        },
      ],
      read: "12 Nov 2026",
    },
    chain: [{ words: "adjustZombieTrove in the BorrowerOperations implementation", prov: zombieAdjustProv }],
  },
];
