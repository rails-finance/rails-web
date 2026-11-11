// The receipts of Lido's pages (rails-ops ui-jobs 570; the figures are
// lib/lido/stake.ts, the words lib/lido/words.ts): each figure traces to the
// stETH, wstETH and withdrawal-queue reads behind it, with the blocks they were
// read at. The past read stands on Ethereum's grid, the multiple of 7,200
// blocks 30 days below the head. The surface names no function or block
// (decision 0059 point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { LidoRequestRow, LidoStake, LidoTotals } from "@/lib/lido/stake";
import type { BlockRef, LidoProtocolRead, LidoStakeRead } from "@/lib/lido/types";
import { GRID } from "@/lib/lido/types";

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: BlockRef) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 10 });

export interface LidoReceiptContext {
  s: LidoStake;
  r: LidoStakeRead;
}

const stethC = (r: { steth: string }) => ({ name: "Lido stETH", address: r.steth });
const wstethC = (r: { wsteth: string }) => ({ name: "Lido wstETH", address: r.wsteth });
const queueC = (r: { queue: string }) => ({ name: "Lido WithdrawalQueueERC721", address: r.queue });
const via = (blocks: string) => `rails-server · eth_call @ ${blocks}`;
const headVia = (r: { head: BlockRef }) => via(`block ${n(r.head.block)}`);
const bothVia = (r: { head: BlockRef; then: BlockRef }) => via(`blocks ${n(r.then.block)} and ${n(r.head.block)}`);
const chain = (label: string, value: string): ProvInput => ({ label, value, kind: "chain", pclass: "state" });
const derived = (label: string, value: string): ProvInput => ({ label, value, kind: "derived" });
const thenAt = (r: { then: BlockRef }) => `${at(r.then)}, ${GRID}`;

/** The stake card's figures. */
export function cardProv(key: "stake" | "steth" | "wsteth" | "rate", c: LidoReceiptContext): Provenance {
  const { s, r } = c;
  const source = { block: r.head.block };
  switch (key) {
    case "stake":
      return {
        kind: "chain-derived",
        pclass: "state",
        source,
        summary: `Stake now — the wallet's stETH shares and its wstETH, one share each, valued in ETH by stETH at ${at(r.head)}: ${fig(s.now.eth)} ETH.`,
        contract: stethC(r),
        via: headVia(r),
        formula: "getPooledEthByShares(sharesOf(wallet) + wstETH.balanceOf(wallet))",
        inputs: [
          chain(`stETH.sharesOf(${r.wallet})`, r.now.stethShares),
          { ...chain(`wstETH.balanceOf(${r.wallet})`, r.now.wstethBalance), contract: wstethC(r) },
          chain("getPooledEthByShares(total shares)", r.now.totalEth),
        ],
      };
    case "steth":
      return {
        kind: "chain",
        pclass: "state",
        source,
        summary: `stETH — the wallet's stETH balance and shares at ${at(r.head)}. The balance is the ETH its shares are worth.`,
        contract: stethC(r),
        via: headVia(r),
        inputs: [
          chain(`balanceOf(${r.wallet})`, r.now.stethBalance),
          chain(`sharesOf(${r.wallet})`, r.now.stethShares),
        ],
      };
    case "wsteth":
      return {
        kind: "chain-derived",
        pclass: "state",
        source,
        summary: `wstETH — the wallet's wstETH at ${at(r.head)}, one stETH share each, valued in ETH by stETH at the same block.`,
        contract: wstethC(r),
        via: headVia(r),
        formula: "stETH.getPooledEthByShares(wstETH.balanceOf(wallet))",
        inputs: [
          chain(`balanceOf(${r.wallet})`, r.now.wstethBalance),
          { ...chain("stETH.getPooledEthByShares(balance)", r.now.wstethEth), contract: stethC(r) },
        ],
      };
    case "rate":
      return rateProv(r, s.rateGrowth);
  }
}

function rateProv(r: LidoStakeRead | LidoProtocolRead, g: number): Provenance {
  return {
    kind: "derived",
    pclass: "state",
    source: { block: r.head.block },
    summary: `Share rate — the ETH per stETH share at ${at(r.head)}, and its change since ${thenAt(r)}.`,
    contract: stethC(r),
    via: bothVia(r),
    formula: "getPooledEthByShares(1e18) now ÷ getPooledEthByShares(1e18) then − 1",
    inputs: [
      chain("getPooledEthByShares(1e18) · head", r.now.rate),
      chain("getPooledEthByShares(1e18) · then", r.past.rate),
      derived("change", `${fig(g * 100)}%`),
    ],
  };
}

/** A readout line. */
export function lineProv(key: "shares" | "rate" | "earned", c: LidoReceiptContext): Provenance {
  const { s, r } = c;
  const source = { block: r.head.block };
  if (key === "rate") return rateProv(r, s.rateGrowth);
  if (key === "shares")
    return {
      kind: "derived",
      pclass: "state",
      source,
      summary: `Shares — the wallet's stETH shares plus its wstETH at ${at(r.head)} and at ${thenAt(r)}.`,
      contract: stethC(r),
      via: bothVia(r),
      formula: "sharesOf(wallet) + wstETH.balanceOf(wallet), now less then",
      inputs: [
        chain("sharesOf · head", r.now.stethShares),
        { ...chain("wstETH.balanceOf · head", r.now.wstethBalance), contract: wstethC(r) },
        chain("sharesOf · then", r.past.stethShares),
        { ...chain("wstETH.balanceOf · then", r.past.wstethBalance), contract: wstethC(r) },
        derived("change", fig(s.shareChange)),
      ],
    };
  return {
    kind: "derived",
    pclass: "state",
    source,
    summary: `Earned — the shares the wallet held at ${thenAt(r)}, times the share rate at ${at(r.head)} less the rate then.`,
    contract: stethC(r),
    via: bothVia(r),
    formula: "(sharesOf + wstETH.balanceOf) then × (getPooledEthByShares(1e18) now − then) ÷ 1e18",
    inputs: [
      derived("shares then", fig(s.then.shares)),
      chain("getPooledEthByShares(1e18) · head", r.now.rate),
      chain("getPooledEthByShares(1e18) · then", r.past.rate),
      derived("earned, ETH", fig(s.earned)),
    ],
  };
}

/** A withdrawal request's row. */
export function requestProv(q: LidoRequestRow, r: LidoStakeRead): Provenance {
  const raw = r.requests.rows.find((x) => x.id === q.id)!;
  const claim = q.state === "claimable";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: r.head.block },
    summary: `Withdrawal request ${q.id} — its stETH and shares when it was made, its time, and whether the queue has finalized it and it was claimed, at ${at(r.head)}.${claim ? " Its claimable ETH is read with the checkpoint hint the queue gives for it." : ""}`,
    contract: queueC(r),
    via: headVia(r),
    inputs: [
      chain(`getWithdrawalStatus([${q.id}]) · amountOfStETH`, raw.amountOfStETH),
      chain("amountOfShares", raw.amountOfShares),
      chain("timestamp", String(raw.timestamp)),
      chain("isFinalized", String(raw.isFinalized)),
      chain("isClaimed", String(raw.isClaimed)),
      ...(raw.hint ? [chain(`findCheckpointHints([${q.id}], 1, ${r.requests.lastCheckpointIndex})`, raw.hint)] : []),
      ...(claim ? [chain(`getClaimableEther([${q.id}], [${raw.hint}])`, raw.claimableEth ?? "no answer")] : []),
    ],
  };
}

/** The requests section's finder: the ids the queue holds for the wallet. */
export function requestsFinderProv(r: LidoStakeRead): Provenance {
  return {
    kind: "chain",
    pclass: "state",
    source: { block: r.head.block },
    summary: `Requests found — the withdrawal request ids the queue holds for this wallet at ${at(r.head)}: ${n(r.requests.count)}.`,
    contract: queueC(r),
    via: headVia(r),
    inputs: [
      chain(`getWithdrawalRequests(${r.wallet})`, n(r.requests.count)),
      chain("getLastFinalizedRequestId", r.requests.lastFinalizedRequestId),
    ],
  };
}

/** The contracts a stake page reads, for its read stamp. */
export function readContracts(r: LidoStakeRead) {
  return [
    {
      name: "Lido stETH",
      address: r.steth,
      reads: "sharesOf(wallet), balanceOf(wallet), getPooledEthByShares(shares)",
    },
    { name: "Lido wstETH", address: r.wsteth, reads: "balanceOf(wallet)" },
    {
      name: "Lido WithdrawalQueueERC721",
      address: r.queue,
      reads:
        "getWithdrawalRequests(wallet), getWithdrawalStatus(ids), getLastFinalizedRequestId, getLastCheckpointIndex, findCheckpointHints, getClaimableEther",
    },
  ];
}

/** The front door's totals. */
export function totalsProv(
  key: "pooled" | "shares" | "rate" | "queue",
  r: LidoProtocolRead,
  t: LidoTotals,
): Provenance {
  const source = { block: r.head.block };
  switch (key) {
    case "pooled":
      return {
        kind: "chain",
        pclass: "state",
        source,
        summary: `Ether staked — all the ether stETH accounts for at ${at(r.head)}: ${fig(t.pooledEth)} ETH.`,
        contract: stethC(r),
        via: headVia(r),
        inputs: [chain("getTotalPooledEther()", r.now.totalPooledEther)],
      };
    case "shares":
      return {
        kind: "chain",
        pclass: "state",
        source,
        summary: `Shares — all stETH shares outstanding at ${at(r.head)}: ${fig(t.shares)}.`,
        contract: stethC(r),
        via: headVia(r),
        inputs: [chain("getTotalShares()", r.now.totalShares)],
      };
    case "rate":
      return rateProv(r, t.rateGrowth);
    case "queue":
      return {
        kind: "chain",
        pclass: "state",
        source,
        summary: `Waiting to withdraw — the stETH in requests the withdrawal queue has not finalized at ${at(r.head)}, and their count.`,
        contract: queueC(r),
        via: headVia(r),
        formula: "requests waiting = getLastRequestId − getLastFinalizedRequestId",
        inputs: [
          chain("unfinalizedStETH()", r.now.unfinalizedStETH),
          chain("getLastRequestId()", r.now.lastRequestId),
          chain("getLastFinalizedRequestId()", r.now.lastFinalizedRequestId),
        ],
      };
  }
}
