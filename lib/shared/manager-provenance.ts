// The receipt behind the wallet heading's manager chip (anatomy H13; rails-ops
// ui-jobs 440): who runs the account, from the account's state at the
// address-kind read's block. The chain leaves are that read's calls, each
// with the contract it asked and what it answered; the name leaf is the
// product's deployments, which name the contract. The claim is the account's
// state and nothing past it: never which app the person used.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { MANAGER_SOURCES } from "@/lib/shared/account-managers";
import type { AddressKind } from "@/lib/api/fetch-address-kind";

type Managed = Extract<AddressKind, { kind: "safe" } | { kind: "contract" }>;

/** The receipt's one-sentence claim, by product and account kind. */
function claim(k: Managed): string {
  const m = k.manager!;
  switch (m.product) {
    case "defisaver":
      return k.kind === "safe"
        ? "This Safe has DeFi Saver's automation module enabled."
        : "This DSProxy's authority lets DeFi Saver's automation call it.";
    case "instadapp":
      return `Instadapp's account list numbers this account as DSA ${m.read.calls[0]?.answer}.`;
    case "summerfi":
      return "This account is a Summer.fi DPM account: its guard is Summer.fi's account guard.";
  }
}

export function managerProv(k: Managed, chainId: ChainId): Provenance | null {
  const m = k.manager;
  if (!m) return null;
  const chain = chainMeta(chainId).name;
  const closed = m.closed
    ? ` ${m.name} deactivated its app in ${m.closed.since}; the account and its position stay on chain.`
    : "";
  const source = MANAGER_SOURCES[m.product];
  const calls = m.read.calls;
  const chainLeaves: ProvInput[] = calls.map((c) => ({
    label: c.call.replace(/\(.*$/, "()"),
    value: c.answer,
    kind: "chain" as const,
    pclass: "state" as const,
    note: `${c.contractName} · ${c.call} at block ${m.read.block.toLocaleString("en-US")}`,
    contract: { name: c.contractName, address: c.contract },
    verify: {
      kind: "etherscan" as const,
      href: explorerUrl(chainId, "address", c.contract),
      text: `Open the ${c.contractName} on the explorer`,
    },
  }));
  const nameLeaves: ProvInput[] = [
    {
      label: "name",
      value: m.name,
      kind: "offchain",
      pclass: "offchain",
      note: `${source.text} · \`${m.contractName}\` ${m.contract}`,
      verify: { kind: "link", href: source.href, text: "Confirm in the owner's deployments" },
    },
    ...(m.closed
      ? [
          {
            label: "closed",
            value: m.closed.since,
            kind: "offchain" as const,
            pclass: "offchain" as const,
            note: `${m.name}'s page says the app is deactivated`,
            verify: { kind: "link" as const, href: m.closed.source, text: `Read ${m.name}'s page` },
          },
        ]
      : []),
  ];
  const asks = calls.map((c) => `the ${c.contractName}'s ${c.call}`).join(", then ");
  return {
    kind: "chain",
    pclass: "state",
    summary: `Who runs this account — ${lower(claim(k))}${closed}`,
    contract: { name: m.contractName, address: m.contract },
    via: calls.map((c) => `${c.contractName}.${c.call.replace(/\(.*$/, "()")}`).join(" + "),
    verify: {
      kind: "recompute",
      text: `To check: ask any ${chain} archive node for ${asks} at block ${m.read.block}.`,
    },
    source: { block: m.read.block },
    inputs: [...chainLeaves, ...nameLeaves],
  };
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
