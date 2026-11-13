// Where Alchemix's docs and the Base Transmuter differ: rails-ops
// reference/official-docs/alchemix.md, "Docs and chain disagree", entry 2
// (ui-jobs 646, chain read 5). The blocks and values are the register's.

import type { InfoDocsAndChain } from "@/components/shared/protocol-info-page";
import type { Provenance } from "@/components/shared/provenance";

const BASE_TRANSMUTER = { name: "Transmuter V3", address: "0x5b1c7180c630d3b2b6782df70f43ae5ea80425ba" };
const DOCS = "https://docs.alchemix.fi";
const TERM_SET_BLOCK = 53_552_820;
const TERM_SET_TX = "0xa601101c10a56721c69467f1c7e436d0e365eb593b8d34baad2486aee82e3c88";

const termSetProv: Provenance = {
  kind: "chain",
  pclass: "emitted",
  source: { block: TERM_SET_BLOCK, txHash: TERM_SET_TX },
  contract: BASE_TRANSMUTER,
  summary:
    "The Base Transmuter's term — TransmutationTimeUpdated(12,096,000) at block 53,552,820, the one such log between position 161's deposit (block 53,546,284) and position 162's (block 53,707,578), read 13 Nov 2026. Positions 131 to 161 carry the term before it, 1,209,600 blocks.",
  via: "eth_getLogs on the Base Transmuter, blocks 53,546,284 to 53,707,578 · TransmutationTimeUpdated",
  verify: {
    kind: "recompute",
    text: `To check: ask any Base node for the Transmuter ${BASE_TRANSMUTER.address}'s logs from block 53,546,284 to 53,707,578, and read the TransmutationTimeUpdated value.`,
  },
};

const shortTermProv: Provenance = {
  kind: "chain",
  pclass: "state",
  source: { block: 54_749_242 },
  contract: BASE_TRANSMUTER,
  summary:
    "Position 160's term in time — the timestamps of block 53,539,642 (its deposit, 1,793,868,631) and block 54,749,242 (its maturity, 1,794,140,224), 1,209,600 blocks apart, read 13 Nov 2026: 271,593 seconds, 3 days 3 hours.",
  via: "eth_getBlockByNumber(53,539,642) and (54,749,242) · timestamp difference",
  formula: "1,794,140,224 − 1,793,868,631 = 271,593 s",
  verify: {
    kind: "recompute",
    text: "To check: ask any Base node for the timestamps of blocks 53,539,642 and 54,749,242 and subtract.",
  },
};

const BASE_ALCHEMIST = { name: "Alchemist V3", address: "0xeb380d86eed275c9f2ed77745ab1b2ccf364bf7a" };

const feeProv = (block: number, bps: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block },
  contract: BASE_ALCHEMIST,
  summary: `The Base Alchemist's protocolFee — ${bps} basis points at block ${block.toLocaleString("en-US")}, read 13 Nov 2026. The Alchemist set it from 10 to 0 at block 53,552,996.`,
  via: `protocolFee() @ block ${block.toLocaleString("en-US")}`,
  verify: {
    kind: "recompute",
    text: `To check: ask any Base archive node for protocolFee() on ${BASE_ALCHEMIST.address} at block ${block.toLocaleString("en-US")}.`,
  },
});

const feeChangeProv: Provenance = {
  kind: "chain",
  pclass: "emitted",
  source: { block: 53_552_996, txHash: "0x018e252984d2d8a7a8cb75c63ab8c718063b1b0c83f95bdbb8ba3a4f4e742fee" },
  contract: BASE_ALCHEMIST,
  summary:
    "The Base Alchemist's fee change — ProtocolFeeUpdated(0) at block 53,552,996 (5 Nov 2026 16:15:39 UTC), the one such log in blocks 52,992,080 to 53,638,118, read 13 Nov 2026. protocolFee() read 10 at block 52,992,079 and 0 at 53,638,119.",
  via: "eth_getLogs on the Base Alchemist, blocks 52,992,080 to 53,638,118 · ProtocolFeeUpdated",
  verify: {
    kind: "recompute",
    text: `To check: ask any Base node for the Alchemist ${BASE_ALCHEMIST.address}'s ProtocolFeeUpdated logs from block 52,992,080 to 53,638,118.`,
  },
};

export const ALCHEMIX_BASE_DOCS_AND_CHAIN: readonly InfoDocsAndChain[] = [
  {
    claim:
      "The docs give the Base borrower redemption fee as 0.00% on the fees page and 0.10% in the FAQ. The Alchemist charges 0 now; it charged 10 basis points until it was set to 0 at block 53,552,996 on 5 Nov 2026.",
    docs: {
      quotes: [
        { words: "0.00% on Base", href: `${DOCS}/user/concepts/fees#borrower-redemption-fee` },
        { words: "Borrower Redemption Fee: 0.25% (0.10% on Base)", href: `${DOCS}/user/faq` },
      ],
      read: "13 Nov 2026",
    },
    chain: [
      { words: "protocolFee is 0 at block 56,868,319", prov: feeProv(56_868_319, 0) },
      { words: "ProtocolFeeUpdated(0) at block 53,552,996", prov: feeChangeProv },
    ],
  },
  {
    claim:
      "The docs give the Base Transmuter a four-week term. Positions 131 to 161 were opened under a term of 1,209,600 blocks, which for position 160 ran 3 days 3 hours; positions from 162 on carry a term of 12,096,000 blocks.",
    docs: {
      quotes: [
        {
          words: "The Base Transmuter redeems alUSDb for USDC 1:1 after a four-week term",
          href: `${DOCS}/user/concepts/alAssets#alusdb-on-base`,
        },
      ],
      read: "13 Nov 2026",
    },
    chain: [
      { words: "the Transmuter set 12,096,000 blocks at block 53,552,820", prov: termSetProv },
      { words: "position 160's 1,209,600 blocks took 271,593 seconds", prov: shortTermProv },
    ],
  },
];
