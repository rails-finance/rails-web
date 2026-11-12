// A Liquity-family branch's shutdown on the page (rails-ops TO-DO-ui-jobs 612):
// the stored record each catalog carries, and the receipts for the shutdown
// date and the collateral withdrawal. The state itself settles in
// lib/liquity-fork/shutdown.ts.

import type { Provenance } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { BranchShutdownRecord, BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { resolveBranch as ebisuBranch } from "@/lib/ebisu/asset-catalog";
import { resolveBranch as asymmetryBranch } from "@/lib/asymmetry/asset-catalog";
import { resolveBranch as basedollarBranch } from "@/lib/basedollar/asset-catalog";

export type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";

type Resolve = (b: string) => { shutdownRecord?: BranchShutdownRecord } | undefined;
const FAMILY: Record<string, { name: string; chainId: ChainId; resolve: Resolve }> = {
  "liquity-v2": { name: "Liquity V2", chainId: MAINNET_CHAIN_ID, resolve: (b) => LIQUITY_V2_BRANCHES[b.toLowerCase()] },
  ebisu: { name: "Ebisu", chainId: MAINNET_CHAIN_ID, resolve: ebisuBranch },
  asymmetry: { name: "Asymmetry", chainId: MAINNET_CHAIN_ID, resolve: asymmetryBranch },
  basedollar: { name: "Basedollar", chainId: BASE_CHAIN_ID, resolve: basedollarBranch },
};

/** The branch's shutdown as its catalog records it; null where it records none. */
export function recordedShutdown(protocol: string, branch: string | null | undefined): BranchShutdownRecord | null {
  if (!branch) return null;
  return FAMILY[protocol]?.resolve(branch)?.shutdownRecord ?? null;
}

const txLink = (chainId: ChainId, tx: string) => ({
  kind: "etherscan" as const,
  href: explorerUrl(chainId, "tx", tx),
  text: "To check: open the transaction on the block explorer.",
});
const utc = (at: number) => `${new Date(at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC`;
const blockOf = (n: number) => n.toLocaleString("en-US");

/** The shutdown date's receipt: the live call and its block where it answered,
 *  with the recorded transaction beside it; the disagreement where the live
 *  read says the branch is live. */
export function shutdownDateProv(protocol: string, symbol: string, s: BranchShutdownState): Provenance {
  const fam = FAMILY[protocol];
  const chainId = fam?.chainId ?? MAINNET_CHAIN_ID;
  const live = s.live;
  const call = live?.source.call ?? "shutdownTime()";
  const contract = live
    ? { name: `${fam?.name ?? protocol} ${symbol} ${live.source.contract}`, address: live.source.address }
    : undefined;
  const liveInput =
    live && live.shutDown != null
      ? [
          {
            label: call,
            value: `${live.raw}${live.source.block != null ? ` at block ${blockOf(live.source.block)}` : ""}`,
            kind: "chain" as const,
            pclass: "state" as const,
            contract,
          },
        ]
      : [];
  const rec = s.record;
  const recInput = rec
    ? [
        {
          label: "shutdown transaction",
          value: rec.shutdown.tx,
          kind: "chain" as const,
          pclass: "emitted" as const,
          note: `block ${blockOf(rec.shutdown.block)}`,
          verify: txLink(chainId, rec.shutdown.tx),
        },
      ]
    : [];
  let summary: string;
  if (rec && s.disagree && live) {
    summary = `Shutdown date — the admin's shutdown transaction at block ${blockOf(rec.shutdown.block)} (${utc(rec.shutdown.at)}). The live read of ${call} at block ${blockOf(live.source.block ?? 0)} returns 0, which says the ${symbol} branch is live: the record and the chain disagree.`;
  } else if (rec && live?.shutDown) {
    summary = `Shutdown date — ${call} on the ${symbol} branch returns ${live.raw} (${utc(live.at ?? rec.shutdown.at)}) at block ${blockOf(live.source.block ?? 0)}, the time of the admin's shutdown transaction at block ${blockOf(rec.shutdown.block)}.`;
  } else if (rec) {
    summary = `Shutdown date — the admin's shutdown transaction at block ${blockOf(rec.shutdown.block)} (${utc(rec.shutdown.at)}). The live read of the ${symbol} branch's shutdownTime() did not answer on this load.`;
  } else {
    summary = `Shutdown date — ${call} on the ${symbol} branch returns ${live?.raw} (${utc(s.at)}) at block ${blockOf(live?.source.block ?? 0)}. A branch's shutdown is permanent.`;
  }
  return {
    kind: "chain",
    pclass: live?.shutDown ? "state" : "emitted",
    summary,
    contract,
    via: live?.shutDown ? `${call} @ head` : "the shutdown transaction",
    inputs: [...liveInput, ...recInput],
    ...(rec ? { verify: txLink(chainId, rec.shutdown.tx) } : {}),
    source:
      live?.shutDown && live.source.block != null
        ? { block: live.source.block }
        : rec
          ? { block: rec.shutdown.block, txHash: rec.shutdown.tx }
          : undefined,
  };
}

/** The withdrawal date's receipt: the admin's transaction, linked. */
export function withdrawalDateProv(protocol: string, symbol: string, rec: BranchShutdownRecord): Provenance | null {
  const w = rec.withdrawal;
  if (!w) return null;
  const chainId = FAMILY[protocol]?.chainId ?? MAINNET_CHAIN_ID;
  return {
    kind: "chain",
    pclass: "emitted",
    summary: w.amount
      ? `Collateral withdrawal — the admin's transaction at block ${blockOf(w.block)} (${utc(w.at)}) sent ${w.amount} ${symbol}, the ${symbol} ActivePool's whole balance, to the admin's Safe.`
      : `Collateral withdrawal — the admin's transaction at block ${blockOf(w.block)} (${utc(w.at)}) emptied the ${symbol} branch's pools to the admin's Safe.`,
    contract: w.pool
      ? { name: `${FAMILY[protocol]?.name ?? protocol} ${symbol} ActivePool`, address: w.pool }
      : undefined,
    via: "the withdrawal transaction",
    inputs: [
      {
        label: "withdrawal transaction",
        value: w.tx,
        kind: "chain",
        pclass: "emitted",
        note: `block ${blockOf(w.block)}`,
        verify: txLink(chainId, w.tx),
      },
    ],
    verify: txLink(chainId, w.tx),
    source: { block: w.block, txHash: w.tx },
  };
}

/** "20 Aug 2026". */
export const shutdownDay = (at: number) => formatDate(at);
