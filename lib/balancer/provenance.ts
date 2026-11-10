// The receipts of a Balancer V3 pool-share page and a wallet's pools (rails-ops
// ui-jobs 569; the figures are lib/balancer/position.ts, the words
// lib/balancer/words.ts): each figure traces to the Vault reads behind it,
// with the blocks they were read at. The past read stands on Ethereum's grid,
// the multiple of 7,200 blocks 30 days below the head. The surface names no
// function or block (decision 0059 point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { BalPosition } from "@/lib/balancer/position";
import { walletRow } from "@/lib/balancer/position";
import { BALANCER_FIRST_BLOCK, type BalPositionRead, type BalPositionsRead, type BlockRef } from "@/lib/balancer/types";
import type { BalLineKey } from "@/lib/balancer/words";

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: BlockRef) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });

export interface BalReceiptContext {
  p: BalPosition;
  r: BalPositionRead;
}

const vaultC = (r: { vault: string }) => ({ name: "Balancer V3 Vault", address: r.vault });
const via = (blocks: string) => `rails-server · eth_call @ ${blocks}`;
const headVia = (c: BalReceiptContext) => via(`block ${n(c.r.head.block)}`);
const bothVia = (c: BalReceiptContext) =>
  c.r.past ? via(`blocks ${n(c.r.then.block)} and ${n(c.r.head.block)}`) : headVia(c);
const chain = (label: string, value: string): ProvInput => ({ label, value, kind: "chain", pclass: "state" });
const derived = (label: string, value: string): ProvInput => ({ label, value, kind: "derived" });
const thenLine = (c: BalReceiptContext) =>
  c.r.past ? `, and at ${at(c.r.then)}, the multiple of 7,200 blocks 30 days below the head` : "";

/** The card's figures. */
export function cardProv(key: "share" | "holds" | "rate" | "added", c: BalReceiptContext): Provenance {
  const { p, r } = c;
  const source = { block: r.head.block };
  switch (key) {
    case "share":
      return {
        kind: "derived",
        pclass: "state",
        source,
        summary: `Share of pool — the wallet's pool shares over all the pool's shares at ${at(r.head)}: ${fig(p.now.share * 100)}%.`,
        contract: vaultC(r),
        via: headVia(c),
        formula: "balanceOf(pool, wallet) ÷ totalSupply(pool)",
        inputs: [
          chain(`balanceOf(${r.pool}, ${r.wallet})`, r.balance),
          chain(`totalSupply(${r.pool})`, r.now.totalSupply),
        ],
      };
    case "holds":
      return {
        kind: "derived",
        pclass: "state",
        source,
        summary: `Holds now — the wallet's part of each token at ${at(r.head)}: the Vault's balance of the token in the pool times the wallet's shares over all shares.`,
        contract: vaultC(r),
        via: headVia(c),
        formula: "balancesRaw[i] × balanceOf(pool, wallet) ÷ totalSupply(pool) ÷ 10^decimals[i]",
        inputs: [
          chain(`getPoolTokenInfo(${r.pool}) · balancesRaw`, r.now.balancesRaw.join(", ")),
          chain("balanceOf(pool, wallet)", r.balance),
          chain("totalSupply(pool)", r.now.totalSupply),
          ...p.tokens.map((t, i) => derived(t.symbol, fig(p.now.holds[i]))),
        ],
      };
    case "rate":
      return {
        kind: "derived",
        pclass: "state",
        source,
        summary: `Value per share, 30 days — the pool's value per share at ${at(r.head)} over the same read${thenLine(c)}, less one.`,
        contract: vaultC(r),
        via: bothVia(c),
        formula: "getBptRate(pool) now ÷ getBptRate(pool) then − 1",
        inputs: [
          chain(`getBptRate(${r.pool}) · head`, r.now.bptRate ?? "no answer"),
          chain(`getBptRate(${r.pool}) · then`, r.past?.bptRate ?? "no answer"),
          ...(p.rateChange == null ? [] : [derived("change", `${fig(p.rateChange * 100)}%`)]),
        ],
      };
    case "added": {
      const first = r.flows.find((f) => f.kind === "add");
      return {
        kind: "chain",
        pclass: "emitted",
        source: first ? { block: first.block, txHash: first.txHash } : source,
        summary: `First added — the earliest LiquidityAdded the Vault emitted for this pool with this wallet as provider, read from block ${n(BALANCER_FIRST_BLOCK)} to ${n(r.head.block)}: ${r.flows.length} adds and removes in all.`,
        contract: vaultC(r),
        via: `rails-server · eth_getLogs ${n(BALANCER_FIRST_BLOCK)}–${n(r.head.block)}`,
        inputs: first
          ? [chain("block", n(first.block)), chain("transaction", first.txHash)]
          : [chain("logs found", "0")],
      };
    }
  }
}

/** A readout line's part. */
export function lineProv(key: BalLineKey, part: "yours" | "pool", c: BalReceiptContext): Provenance | null {
  const { p, r } = c;
  const source = { block: r.head.block };
  const base = { kind: "derived" as const, pclass: "state" as const, source, contract: vaultC(r), via: bothVia(c) };
  if (key === "shares")
    return part === "yours"
      ? {
          ...base,
          summary: `Pool shares — the wallet's shares at ${at(r.head)}${thenLine(c)}.`,
          inputs: [chain("balanceOf · head", r.balance), chain("balanceOf · then", r.past?.balance ?? "no answer")],
        }
      : {
          ...base,
          summary: `All holders — the pool's shares outstanding at ${at(r.head)}${thenLine(c)}.`,
          inputs: [
            chain("totalSupply · head", r.now.totalSupply),
            chain("totalSupply · then", r.past?.totalSupply ?? "no answer"),
          ],
        };
  if (key === "share")
    return {
      ...base,
      summary: `Share of pool — the wallet's shares over all shares at ${at(r.head)}${thenLine(c)}.`,
      formula: "balanceOf(pool, wallet) ÷ totalSupply(pool)",
      inputs: [
        derived("head", `${fig(p.now.share * 100)}%`),
        ...(p.then ? [derived("then", `${fig(p.then.share * 100)}%`)] : []),
      ],
    };
  if (key.startsWith("token:")) {
    const i = Number(key.slice(6));
    const t = p.tokens[i];
    return part === "yours"
      ? {
          ...base,
          summary: `Your ${t.symbol} — the pool's ${t.symbol} times the wallet's share of the pool at ${at(r.head)}${thenLine(c)}.`,
          formula: "balancesRaw[i] × balanceOf(pool, wallet) ÷ totalSupply(pool)",
          inputs: [derived("head", fig(p.now.holds[i])), ...(p.then ? [derived("then", fig(p.then.holds[i]))] : [])],
        }
      : {
          ...base,
          summary: `Pool ${t.symbol} — the Vault's balance of ${t.symbol} (${t.address}) in this pool at ${at(r.head)}${thenLine(c)}.`,
          inputs: [
            chain(`getPoolTokenInfo · balancesRaw[${i}] · head`, r.now.balancesRaw[i]),
            chain(`getPoolTokenInfo · balancesRaw[${i}] · then`, r.past?.balancesRaw[i] ?? "no answer"),
          ],
        };
  }
  if (key === "rate") return cardProv("rate", c);
  if (key === "status")
    return {
      kind: "chain",
      pclass: "state",
      source,
      summary: `Pool — the pool's swap fee and its pause and recovery flags at ${at(r.head)}.`,
      contract: vaultC(r),
      via: headVia(c),
      inputs: [
        chain("getStaticSwapFeePercentage", r.swapFee ?? "no answer"),
        chain("isPoolPaused", String(r.paused)),
        chain("isPoolInRecoveryMode", String(r.recoveryMode)),
      ],
    };
  return null;
}

/** The contracts a pool-share page reads, for its read stamp. */
export function readContracts(c: BalReceiptContext) {
  return [
    {
      name: "Balancer V3 Vault",
      address: c.r.vault,
      reads:
        "balanceOf(pool, wallet), totalSupply(pool), getPoolTokenInfo(pool), getCurrentLiveBalances(pool), getBptRate(pool), isPoolPaused, isPoolInRecoveryMode, getStaticSwapFeePercentage; LiquidityAdded and LiquidityRemoved logs",
    },
    { name: `Pool ${c.p.symbol}`, address: c.r.pool, reads: "name(), symbol()" },
  ];
}

/** A wallet page row's share. */
export function walletShareProv(r: BalPositionsRead, row: BalPositionsRead["positions"][number]): Provenance {
  const w = walletRow(row);
  return {
    kind: "derived",
    pclass: "state",
    source: { block: r.head.block },
    summary: `Share of pool — the wallet's shares over all the pool's shares at ${at(r.head)}: ${fig(w.share * 100)}%.`,
    contract: vaultC(r),
    via: `rails-server · eth_call @ block ${n(r.head.block)}`,
    formula: "balanceOf(pool, wallet) ÷ totalSupply(pool)",
    inputs: [
      chain(`balanceOf(${row.pool}, ${r.wallet})`, row.balance),
      chain(`totalSupply(${row.pool})`, row.totalSupply),
    ],
  };
}

/** The wallet page's search: what was read to find the pools. */
export function finderProv(r: BalPositionsRead): Provenance {
  const s = r.sources[0];
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: r.head.block },
    summary: `Pools found — the Vault's LiquidityAdded logs with this wallet as provider, blocks ${n(s?.from ?? BALANCER_FIRST_BLOCK)} to ${n(s?.to ?? r.head.block)}: ${n(s?.logs ?? 0)} adds across ${n(s?.pools ?? 0)} pools, ${n(r.checked)} checked with balanceOf at ${at(r.head)}.`,
    contract: vaultC(r),
    via: `rails-server · eth_getLogs, then eth_call @ block ${n(r.head.block)}`,
    inputs: [
      chain("adds found", n(s?.logs ?? 0)),
      chain("pools named", n(s?.pools ?? 0)),
      chain("pools checked", n(r.checked)),
    ],
  };
}
