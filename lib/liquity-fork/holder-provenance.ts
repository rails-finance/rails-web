// The receipt on a fork Trove page's "last holder": the TroveNFT's
// wallet-to-wallet transfers, oldest first, from the one-Trove read
// (rails-server /api/<fork>/troves?troveId=&former=1, mig 485's
// <fork>_trove_nft_transfers over the branch TroveNFT's Transfer logs). The
// timeline draws each of them as a "Transferred" row.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { CHAINS, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import type { ForkNftTransfer } from "@/lib/liquity-fork/former-holders";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const NAMES = { ebisu: "Ebisu", asymmetry: "Asymmetry", basedollar: "Basedollar" } as const;

export function forkLastHolderProv(
  deployment: keyof typeof NAMES,
  chainId: ChainId,
  transfers: ForkNftTransfer[],
): Provenance {
  const n = transfers.length;
  const explorer = CHAINS[chainId].explorerName;
  const inputs: ProvInput[] = transfers.map((t) => ({
    label: `Transfer, block ${t.block.toLocaleString("en-US")}${t.at != null ? ` (${formatDate(t.at)})` : ""}`,
    value: `${short(t.from)} → ${short(t.to)}`,
    kind: "chain",
    pclass: "emitted",
    note: `The TroveNFT's Transfer log: from ${t.from} to ${t.to}.`,
    contract: { name: "TroveNFT" },
    verify: { kind: "etherscan", href: explorerUrl(chainId, "tx", t.tx), text: `The transaction on ${explorer}` },
  }));
  return {
    kind: "chain-derived",
    pclass: "indexed",
    summary: `The TroveNFT passed between wallets ${n === 1 ? "once" : `${n} times`}. The wallet named here held it when the Trove closed. The inputs list its Transfer logs, mint and burn left out.`,
    contract: { name: "TroveNFT" },
    via: `GET /api/${deployment}/troves?troveId=…&former=1 · ${deployment}_trove_nft_transfers (the ${NAMES[deployment]} branch TroveNFT's Transfer logs)`,
    verify: { kind: "rollup", text: `Each transfer links its transaction on ${explorer}.` },
    inputs,
  };
}
