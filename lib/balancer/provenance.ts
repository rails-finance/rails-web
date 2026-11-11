// The receipts of a Balancer V3 pool-share page and a wallet's pools (rails-ops
// ui-jobs 569; the figures are lib/balancer/position.ts, the words
// lib/balancer/words.ts): each figure traces to the Vault reads behind it,
// with the blocks they were read at. The past read stands on Ethereum's grid,
// the multiple of 7,200 blocks 30 days below the head. A wallet's pools and a
// pool share's adds and removes come from Rails's position index of the Vault's
// events (rails-ops decision 0063), then the chain's logs above it to the head.
// The surface names no function or block (decision 0059 point 1); this module
// is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { BalPosition } from "@/lib/balancer/position";
import { stakedOf, walletRow } from "@/lib/balancer/position";
import { balChain } from "@/lib/balancer/chains";
import {
  BALANCER_VAULT,
  type BalPositionRead,
  type BalPositionsRead,
  type BalStaked,
  type BlockRef,
} from "@/lib/balancer/types";
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
const thenLine = (c: BalReceiptContext) => (c.r.past ? `, and at ${at(c.r.then)}, ${balChain(c.r.chainId).grid}` : "");

/** A stake's reads beside the Vault balance: each gauge's balanceOf(wallet). */
const stakeInputs = (staked: readonly BalStaked[] | undefined, wallet: string): ProvInput[] =>
  (staked ?? []).map((g) => chain(`${g.gauge}.balanceOf(${wallet})`, g.balance));
/** The wallet's shares: its Vault balance, plus its gauge stakes where it has any. */
const sharesTerm = (staked: readonly BalStaked[] | undefined) =>
  staked?.length ? "(balanceOf(pool, wallet) + Σ gauge.balanceOf(wallet))" : "balanceOf(pool, wallet)";
const sharesWords = (staked: readonly BalStaked[] | undefined) =>
  staked?.length ? "the wallet's pool shares, in the wallet and staked in its gauges," : "the wallet's pool shares";

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
        summary: `Share of pool — ${sharesWords(r.staked)} over all the pool's shares at ${at(r.head)}: ${fig(p.now.share * 100)}%.`,
        contract: vaultC(r),
        via: headVia(c),
        formula: `${sharesTerm(r.staked)} ÷ totalSupply(pool)`,
        inputs: [
          chain(`balanceOf(${r.pool}, ${r.wallet})`, r.balance),
          ...stakeInputs(r.staked, r.wallet),
          chain(`totalSupply(${r.pool})`, r.now.totalSupply),
        ],
      };
    case "holds":
      return {
        kind: "derived",
        pclass: "state",
        source,
        summary: `Holds now — the wallet's part of each token at ${at(r.head)}: the Vault's balance of the token in the pool times ${sharesWords(r.staked)} over all shares.`,
        contract: vaultC(r),
        via: headVia(c),
        formula: `balancesRaw[i] × ${sharesTerm(r.staked)} ÷ totalSupply(pool) ÷ 10^decimals[i]`,
        inputs: [
          chain(`getPoolTokenInfo(${r.pool}) · balancesRaw`, r.now.balancesRaw.join(", ")),
          chain("balanceOf(pool, wallet)", r.balance),
          ...stakeInputs(r.staked, r.wallet),
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
        summary: `First added — the earliest LiquidityAdded the Vault emitted for this pool with this wallet as provider, from Rails's index of the Vault's events from block ${n(balChain(r.chainId).firstBlock)}${r.indexThrough ? ` through block ${n(r.indexThrough)}` : ""}, then the Vault's logs above it to block ${n(r.head.block)}: ${r.flows.length} adds and removes in all.`,
        contract: vaultC(r),
        via: `rails-server · position index${r.indexThrough ? ` through block ${n(r.indexThrough)}` : ""}, then eth_getLogs to ${n(r.head.block)}`,
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
          summary: p.windowWithheld
            ? `Pool shares — ${sharesWords(r.staked)} at ${at(r.head)}. The gauges are read at the head only, so no 30-day change is stated.`
            : `Pool shares — the wallet's shares at ${at(r.head)}${thenLine(c)}.`,
          inputs: p.windowWithheld
            ? [chain("balanceOf · head", r.balance), ...stakeInputs(r.staked, r.wallet)]
            : [chain("balanceOf · head", r.balance), chain("balanceOf · then", r.past?.balance ?? "no answer")],
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
      summary: `Share of pool — ${sharesWords(r.staked)} over all shares at ${at(r.head)}${p.windowWithheld ? "" : thenLine(c)}.`,
      formula: `${sharesTerm(r.staked)} ÷ totalSupply(pool)`,
      inputs: [
        derived("head", `${fig(p.now.share * 100)}%`),
        ...(p.then && !p.windowWithheld ? [derived("then", `${fig(p.then.share * 100)}%`)] : []),
      ],
    };
  if (key.startsWith("token:")) {
    const i = Number(key.slice(6));
    const t = p.tokens[i];
    return part === "yours"
      ? {
          ...base,
          summary: `Your ${t.symbol} — the pool's ${t.symbol} times the wallet's share of the pool at ${at(r.head)}${p.windowWithheld ? "" : thenLine(c)}.`,
          formula: `balancesRaw[i] × ${sharesTerm(r.staked)} ÷ totalSupply(pool)`,
          inputs: [
            derived("head", fig(p.now.holds[i])),
            ...(p.then && !p.windowWithheld ? [derived("then", fig(p.then.holds[i]))] : []),
          ],
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
        "balanceOf(pool, wallet), totalSupply(pool), getPoolTokenInfo(pool), getCurrentLiveBalances(pool), getBptRate(pool), isPoolPaused, isPoolInRecoveryMode, getStaticSwapFeePercentage; LiquidityAdded and LiquidityRemoved events from Rails's index and the chain's logs above it",
    },
    { name: `Pool ${c.p.symbol}`, address: c.r.pool, reads: "name(), symbol()" },
    ...gaugeContracts(c.r.staked),
  ];
}

/** The gauges a wallet's staked shares sit in, for a read stamp. */
export const gaugeContracts = (staked: readonly BalStaked[] | undefined) =>
  (staked ?? []).map((s) => ({ name: "Gauge", address: s.gauge, reads: "lp_token(), balanceOf(wallet)" }));

/** Shares staked in a pool's gauges: each gauge's balance for the wallet, at the head. */
export function stakedProv(a: {
  chainId: number;
  vault: string;
  pool: string;
  wallet: string;
  head: BlockRef;
  totalSupply: string;
  staked: readonly BalStaked[];
}): Provenance {
  const s = stakedOf(a.staked, a.totalSupply);
  return {
    kind: "derived",
    pclass: "state",
    source: { block: a.head.block },
    summary: `Staked in a gauge — the wallet's balance in each gauge whose lp_token is this pool at ${at(a.head)}, over all the pool's shares: ${fig((s?.share ?? 0) * 100)}%.`,
    contract: { name: "Gauge", address: a.staked[0]?.gauge ?? a.vault },
    via: `rails-server · eth_call @ block ${n(a.head.block)}`,
    formula: "Σ gauge.balanceOf(wallet) ÷ totalSupply(pool)",
    inputs: [
      ...a.staked.map((g) => chain(`${g.gauge}.balanceOf(${a.wallet})`, g.balance)),
      chain(`totalSupply(${a.pool})`, a.totalSupply),
    ],
  };
}

/** A wallet page row's share. */
export function walletShareProv(r: BalPositionsRead, row: BalPositionsRead["positions"][number]): Provenance {
  const w = walletRow(row);
  return {
    kind: "derived",
    pclass: "state",
    source: { block: r.head.block },
    summary: `Share of pool — ${sharesWords(row.staked)} over all the pool's shares at ${at(r.head)}: ${fig(w.share * 100)}%.`,
    contract: vaultC(r),
    via: `rails-server · eth_call @ block ${n(r.head.block)}`,
    formula: `${sharesTerm(row.staked)} ÷ totalSupply(pool)`,
    inputs: [
      chain(`balanceOf(${row.pool}, ${r.wallet})`, row.balance),
      ...stakeInputs(row.staked, r.wallet),
      chain(`totalSupply(${row.pool})`, row.totalSupply),
    ],
  };
}

/** The front door's count: Rails's index of the Vault's pool-share transfers. */
export function countProv(
  key: "positions" | "holders",
  c: { chainId: number; through: number; positions: number; holders: number },
): Provenance {
  const what =
    key === "positions"
      ? `Pool-share holdings — the (pool, holder) pairs with a balance above zero: ${n(c.positions)}`
      : `Holders — the addresses holding shares of at least one pool, wallets and contracts both: ${n(c.holders)}`;
  return {
    kind: "derived",
    pclass: "emitted",
    source: { block: c.through },
    summary: `${what}. Counted from Rails's index of the Vault's pool-share Transfer events from block ${n(balChain(c.chainId).firstBlock)} through block ${n(c.through)}.`,
    contract: { name: "Balancer V3 Vault", address: BALANCER_VAULT },
    via: `rails-server · position index through block ${n(c.through)}`,
    inputs: [chain("indexed through", n(c.through)), derived(key, n(key === "positions" ? c.positions : c.holders))],
  };
}

/** The wallet page's search: what was read to find the pools. The index's
 *  rows run from the Vault's first block to the index's reach; the tail's
 *  Transfer logs from the block after it to the head. */
export function finderProv(r: BalPositionsRead): Provenance {
  const idx = r.sources.find((s) => s.source === "index");
  const tail = r.sources.find((s) => s.source === "tail");
  const through = idx?.to ?? r.head.block;
  const parts = [
    idx &&
      `Rails's index of the Vault's pool-share Transfer events naming this wallet, blocks ${n(idx.from)} to ${n(idx.to)}: ${n(idx.logs)} transfers across ${n(idx.pools)} pools`,
    tail &&
      `the Vault's Transfer logs to this wallet, blocks ${n(tail.from)} to ${n(tail.to)}: ${n(tail.logs)} across ${n(tail.pools)} pools`,
  ].filter(Boolean);
  return {
    kind: "chain",
    pclass: "emitted",
    source: { block: r.head.block },
    summary: `Pools found — ${parts.join("; then ")}; ${n(r.checked)} pools checked with balanceOf at ${at(r.head)}.`,
    contract: vaultC(r),
    via: `rails-server · position index through block ${n(through)}, eth_getLogs to ${n(r.head.block)}, then eth_call @ block ${n(r.head.block)}`,
    inputs: [
      chain("index transfers", n(idx?.logs ?? 0)),
      chain("index pools", n(idx?.pools ?? 0)),
      chain("tail logs", n(tail?.logs ?? 0)),
      chain("tail pools", n(tail?.pools ?? 0)),
      chain("pools checked", n(r.checked)),
    ],
  };
}
