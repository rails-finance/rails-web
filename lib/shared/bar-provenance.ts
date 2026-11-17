// The receipt behind a stretch of the timeline's side bar (anatomy P3.1.1):
// which contract the row's transaction entered, and whose it is. The chain
// leaf is the transaction's `to` and, past a smart account, the first call
// that account made (rails-server services/tx-entry-decode.ts reads it from
// the transaction's input); the name leaves are the registry's. The words
// claim the contract and nothing past it: never which app the person used.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { barOwnerOf } from "@/lib/shared/bar-owners";
import { counterpartyNameInputs } from "@/lib/aave-v3/event-provenance";
import type { TxEntry } from "@/lib/shared/tx-entry";

/** What the account the call went through is, for the sentence's "through
 *  this Safe". */
export type BarAccountKind = "safe" | "account";

/** A swap paired on a CoW Trade log: the evidence a row names CoW's settlement by, whatever its `to`. */
export interface CowTradeEvidence {
  orderUid: string;
  /** The Trade log's owner. */
  owner?: string;
}

export function barSubjectProv(args: {
  address: string;
  entry?: TxEntry;
  wallet: string;
  txHash?: string;
  chainId: ChainId;
  accountKind?: BarAccountKind;
  cowTrade?: CowTradeEvidence;
}): Provenance | null {
  const { address, entry, wallet, txHash, chainId, accountKind, cowTrade } = args;
  if (cowTrade) return cowTradeBarProv({ address, entry, txHash, chainId, cowTrade });
  const a = address.toLowerCase();
  const registry = getProtocolContract(a, chainId);
  const owner = barOwnerOf(a, chainId);
  const subject = registry?.bar ?? owner?.subject;
  if (!subject) return null;
  // "Zerion's router", "DeFi Saver's recipe executor".
  const role = owner ? `${subject.name}'s ${owner.role}` : `${subject.name}'s ${roleNoun(registry?.kind)}`;
  const inner = !!entry?.contract && entry.contract === a;
  const through =
    inner && entry?.account === wallet.toLowerCase()
      ? accountKind === "safe"
        ? " through this Safe"
        : " through this account"
      : "";
  // The weak case: a route many wallets and apps send through.
  const shared =
    subject.shared === "batch"
      ? ` ${subject.name} settles signed orders in batches; a solver sent this transaction.`
      : subject.shared
        ? ` ${subject.name} is a ${subject.shared === "swap-bridge" ? "swap and bridge" : "swap"} route many wallets and apps quote from; the bar names the contract.`
        : "";
  // "Summer.fi deactivated its app in 2026; the contract stays on chain."
  const closed = subject.closed
    ? ` ${subject.name} deactivated its app in ${subject.closed.since}; the contract stays on chain.`
    : "";
  const chainLeaves: ProvInput[] = [
    ...(entry
      ? [
          {
            label: "to",
            value: entry.to,
            kind: "chain" as const,
            pclass: "indexed" as const,
            note: "The transaction's `to`",
          },
        ]
      : []),
    ...(inner
      ? [
          {
            label: "inner call",
            value: a,
            kind: "chain" as const,
            pclass: "indexed" as const,
            note: "The first contract the account called, read from the transaction's input",
          },
        ]
      : []),
  ];
  const nameLeaves: ProvInput[] = [
    ...(registry ? counterpartyNameInputs(registry, explorerUrl(chainId, "address", a)) : []),
    ...(owner
      ? [
          {
            label: registry ? "owner" : "name",
            value: subject.name,
            kind: "offchain" as const,
            pclass: "offchain" as const,
            note: `${owner.source} · \`${owner.contractName}\``,
            verify: {
              kind: "link" as const,
              href: owner.href,
              text: owner.hrefText ?? "Confirm in the owner's deployments",
            },
          },
        ]
      : []),
    ...(subject.closed
      ? [
          {
            label: "closed",
            value: subject.closed.since,
            kind: "offchain" as const,
            pclass: "offchain" as const,
            note: `${subject.name}'s page says the app is deactivated`,
            verify: { kind: "link" as const, href: subject.closed.source, text: `Read ${subject.name}'s page` },
          },
        ]
      : []),
  ];
  return {
    kind: "chain",
    pclass: "indexed",
    summary: `The contract this transaction entered. The transaction was sent to ${role}${through}.${closed}${shared}`,
    contract: { name: registry?.name ?? owner?.contractName ?? subject.name, address: a },
    via: inner ? `transaction · to ${entry!.to} · first call ${a}` : "transaction · to",
    ...(txHash
      ? {
          verify: {
            kind: "etherscan" as const,
            href: explorerUrl(chainId, "tx", txHash),
            text: "Confirm on the explorer",
          },
          source: { txHash },
        }
      : {}),
    inputs: [...chainLeaves, ...nameLeaves],
  };
}

/** The bar's receipt for a swap paired on a CoW Trade log: the log, and the transaction's `to` where it is known.
 *  The transaction may enter a flash-loan router or a solver contract; the Trade log is what names CoW. */
function cowTradeBarProv(args: {
  address: string;
  entry?: TxEntry;
  txHash?: string;
  chainId: ChainId;
  cowTrade: CowTradeEvidence;
}): Provenance | null {
  const a = args.address.toLowerCase();
  const registry = getProtocolContract(a, args.chainId);
  const subject = registry?.bar;
  if (!subject) return null;
  const toSentence = args.entry?.to
    ? args.entry.to.toLowerCase() === a
      ? " The transaction was sent to the settlement contract."
      : " The transaction was sent to another contract, which called the settlement contract."
    : "";
  return {
    kind: "chain",
    pclass: "emitted",
    summary: `The swap's order went through ${subject.name}. A Trade log of ${subject.name}'s settlement contract in this transaction names the order's owner, and the row is paired to that log.${toSentence} ${subject.name} settles signed orders in batches; a solver sent this transaction.`,
    contract: { name: registry.name, address: a },
    via: "Trade log · orderUid and owner",
    ...(args.txHash
      ? {
          verify: {
            kind: "etherscan" as const,
            href: explorerUrl(args.chainId, "tx-logs", args.txHash),
            text: "Confirm in the transaction's logs",
          },
          source: { txHash: args.txHash },
        }
      : {}),
    inputs: [
      { label: "orderUid", value: args.cowTrade.orderUid, kind: "chain", pclass: "emitted", note: "Trade `orderUid`" },
      ...(args.cowTrade.owner
        ? [
            {
              label: "order owner",
              value: args.cowTrade.owner,
              kind: "chain" as const,
              pclass: "emitted" as const,
              note: "Trade `owner`",
            },
          ]
        : []),
      ...(args.entry
        ? [
            {
              label: "to",
              value: args.entry.to,
              kind: "chain" as const,
              pclass: "indexed" as const,
              note: "The transaction's `to`",
            },
          ]
        : []),
      ...counterpartyNameInputs(registry, explorerUrl(args.chainId, "address", a)),
    ],
  };
}

function roleNoun(kind: string | undefined): string {
  switch (kind) {
    case "router":
      return "router";
    case "settlement":
      return "settlement contract";
    case "adapter":
      return "adapter";
    case "gateway":
      return "gateway";
    default:
      return "contract";
  }
}
