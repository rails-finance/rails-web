// The receipts of a Uniswap position page (rails-ops ui-jobs 556; the figures
// are lib/uniswap/position.ts, the words lib/uniswap/words.ts): each card
// figure and each readout line traces to the contract reads behind it, with
// the blocks they were read at. The surface names no function or block
// (decision 0059 point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { uniDeployment, type UniDeployment } from "@/lib/uniswap/deployments";
import type { PoolPosition } from "@/lib/uniswap/position";
import { dayGridPhrase, type UniPositionRead } from "@/lib/uniswap/types";
import { TERMS, type RowKey } from "@/lib/uniswap/words";

/** The contracts a deployment's receipts name (lib/uniswap/deployments.ts). */
function uniContracts(d: UniDeployment) {
  return { v3Npm: d.v3Npm, v4PositionManager: d.v4PositionManager ?? "", v4StateView: d.v4StateView ?? "" };
}

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: { block: number; time: number }) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });

/** The facts every receipt of a page shares. */
export interface UniReceiptContext {
  p: PoolPosition;
  r: UniPositionRead;
}

const dep = (c: UniReceiptContext) => uniDeployment(c.p.protocol, c.p.chainId);
const contracts = (c: UniReceiptContext) => uniContracts(dep(c));

function positionContract(c: UniReceiptContext) {
  return c.p.version === "v3"
    ? { name: "NonfungiblePositionManager", address: contracts(c).v3Npm }
    : { name: "PositionManager", address: contracts(c).v4PositionManager };
}
function poolContract(c: UniReceiptContext) {
  return c.p.version === "v3"
    ? { name: `${dep(c).protocolName} V3 pool ${c.p.base.symbol}/${c.p.quote.symbol}`, address: c.p.pool }
    : { name: "StateView", address: contracts(c).v4StateView };
}
function farmContract(c: UniReceiptContext) {
  return { name: "MasterChefV3", address: dep(c).masterChef ?? "" };
}
const positionCall = (c: UniReceiptContext) =>
  c.p.version === "v3" ? `positions(${c.p.id})` : `getPoolAndPositionInfo(${c.p.id})`;
const slot0 = (c: UniReceiptContext) => (c.p.version === "v3" ? "slot0()" : `getSlot0(${c.p.pool.slice(0, 10)}…)`);
const insideCall = (c: UniReceiptContext) =>
  c.p.version === "v3"
    ? "feeGrowthGlobal0/1X128 and ticks(lower/upper).feeGrowthOutside, worked as the pool works them"
    : "getFeeGrowthInside(poolId, tickLower, tickUpper)";
const via = (c: UniReceiptContext, blocks: string) => `rails-server · eth_call @ ${blocks}`;
const both = (c: UniReceiptContext) => `${at(c.r.head)} and ${at(c.r.then)}`;

const chain = (label: string, value: string): ProvInput => ({ label, value, kind: "chain", pclass: "state" });
const derived = (label: string, value: string): ProvInput => ({ label, value, kind: "derived" });

/** The card's figures. */
export function cardProv(
  key: "price" | "holds" | "worth" | "uncollected" | "opened" | "range" | "cake",
  c: UniReceiptContext,
): Provenance {
  const { p, r } = c;
  const head = { block: r.head.block };
  const Q = p.quote.symbol;
  switch (key) {
    case "price":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Pool price — the pool's square-root price at ${at(r.head)}, squared and scaled by the tokens' decimals: ${fig(p.price)} ${Q} per ${p.base.symbol}.`,
        contract: poolContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        formula: "(sqrtPriceX96 ÷ 2^96)² × 10^(decimals0 − decimals1)",
        inputs: [chain(`${slot0(c)} · sqrtPriceX96`, r.now.sqrtPriceX96)],
      };
    case "holds":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Tokens — the two amounts the position's liquidity ${r.liquidity} holds between ticks ${r.tickLower} and ${r.tickUpper} at the pool's square-root price at ${at(r.head)}.`,
        contract: positionContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        formula: "Uniswap's amounts for liquidity L over [√Pa, √Pb] at √P",
        inputs: [
          chain(`${positionCall(c)} · liquidity`, r.liquidity),
          chain("tickLower, tickUpper", `${r.tickLower}, ${r.tickUpper}`),
          chain(`${slot0(c)} · sqrtPriceX96`, r.now.sqrtPriceX96),
          derived(p.base.symbol, fig(p.holds.base)),
          derived(Q, fig(p.holds.quote)),
        ],
      };
    case "worth":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Value — the position's two amounts valued in ${Q} at the pool's price at ${at(r.head)}: ${fig(p.valueNow)} ${Q}.`,
        contract: poolContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        formula: "base amount × price + quote amount",
        inputs: [
          derived(`price, ${Q} per ${p.base.symbol}`, fig(p.price)),
          derived(p.base.symbol, fig(p.holds.base)),
          derived(Q, fig(p.holds.quote)),
        ],
      };
    case "uncollected":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `${TERMS[p.protocol].uncollected} — the fees owed on record plus the liquidity times the growth of fees inside the range since the position last settled, at ${at(r.head)}, valued in ${Q} at the pool's price.`,
        contract: positionContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        formula: "tokensOwed + L × (feeGrowthInside − feeGrowthInsideLast) ÷ 2^128, per token",
        inputs: [
          chain("tokensOwed0, tokensOwed1", `${r.now.tokensOwed0}, ${r.now.tokensOwed1}`),
          chain(
            `feeGrowthInside0/1X128 · ${insideCall(c)}`,
            `${r.now.feeGrowthInside0X128}, ${r.now.feeGrowthInside1X128}`,
          ),
          chain(
            "feeGrowthInside0/1LastX128",
            `${r.now.positionFeeGrowthInside0LastX128}, ${r.now.positionFeeGrowthInside1LastX128}`,
          ),
          derived(p.base.symbol, fig(p.uncollectedAmounts.base)),
          derived(Q, fig(p.uncollectedAmounts.quote)),
        ],
      };
    case "opened":
      return {
        kind: "chain",
        pclass: "emitted",
        source: { block: r.opened?.block ?? r.head.block },
        summary:
          p.version === "v3"
            ? `Minted — the position's first IncreaseLiquidity log on the NonfungiblePositionManager, filtered by token id ${p.id}, is at ${r.opened ? at(r.opened) : "no block"}.`
            : `Minted — the PositionManager's Transfer log from the zero address for token id ${p.id}, its mint, is at ${r.opened ? at(r.opened) : "no block"}.`,
        contract: positionContract(c),
        via: "rails-server · getLogs by token id",
      };
    case "cake": {
      const st = p.staked;
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: st
          ? `Pending CAKE — MasterChefV3's pendingCake(${p.id}) at ${at(r.head)}, ${r.staked?.pendingCake ?? "0"} in CAKE's ${st.cake.decimals} decimals: ${fig(st.pendingCake)} ${st.cake.symbol}. The farm holds the position for its staker ${st.user}.`
          : `Not staked — ownerOf(${p.id}) on the NonfungiblePositionManager at ${at(r.head)} is ${r.owner}, not MasterChefV3, so the farm pays it no CAKE.`,
        contract: st ? farmContract(c) : positionContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        inputs: st
          ? [
              chain(`pendingCake(${p.id})`, r.staked?.pendingCake ?? "0"),
              chain(`userPositionInfos(${p.id}) · user`, st.user),
              chain(`ownerOf(${p.id})`, r.owner),
            ]
          : [chain(`ownerOf(${p.id})`, r.owner), chain("MasterChefV3", farmContract(c).address)],
      };
    }
    case "range":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Range — the position's ticks ${r.tickLower} to ${r.tickUpper} from ${positionCall(c)}, and the pool's tick ${r.now.tick} at ${at(r.head)}; a tick's price is 1.0001^tick, scaled by the tokens' decimals.`,
        contract: positionContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        formula: "in range when tickLower ≤ tick < tickUpper",
        inputs: [
          chain("tickLower, tickUpper", `${r.tickLower}, ${r.tickUpper}`),
          chain(`${slot0(c)} · tick`, String(r.now.tick)),
          derived("low, high", `${fig(p.range.low)}, ${fig(p.range.high)}`),
        ],
      };
  }
}

/** A readout row's receipt; null where the row states no read. */
export function lineProv(key: RowKey, c: UniReceiptContext): Provenance | null {
  switch (key) {
    case "token:0":
    case "token:1":
      return holdsProv(c);
    case "days":
      return partProv("range", "yours", c);
    case "earned":
      return c.p.fees30d === null ? null : partProv("fees", "yours", c);
    case "against":
    case "withEarned":
      return partProv("against", "yours", c);
    case "deposits":
      return partProv("against", "pool", c);
    case "share":
      return partProv("size", "yours", c);
    case "withdrawals":
      return partProv("withdrawals", "yours", c);
    case "subscriber":
      return partProv("withdrawals", "pool", c);
    case "minted":
      return c.p.opened ? cardProv("opened", c) : null;
    case "price":
    case "move":
      return c.r.past ? partProv("range", "pool", c) : cardProv("price", c);
    case "balance:0":
    case "balance:1":
    case "balances":
      return partProv("size", "pool", c);
    case "fullRange":
      return partProv("fees", "pool", c);
    case "lpFee":
    case "protocolFee":
      return partProv("steward", "pool", c);
    default:
      return null;
  }
}

/** The position's two amounts now and at the past block, each its liquidity at that block's price. */
function holdsProv(c: UniReceiptContext): Provenance {
  const { p, r } = c;
  const now = cardProv("holds", c);
  const past = r.past;
  if (!past || past.positionLiquidity === null || !p.holdsThen) return now;
  return {
    ...now,
    summary: `Tokens — the two amounts the position's liquidity holds between ticks ${r.tickLower} and ${r.tickUpper}: ${r.liquidity} at the pool's square-root price at ${at(r.head)}, and ${past.positionLiquidity} at the square-root price at ${at(r.then)}.`,
    via: via(c, `blocks ${n(r.then.block)} and ${n(r.head.block)}`),
    inputs: [
      ...(now.inputs ?? []),
      chain(`${positionCall(c)} · liquidity · ${at(r.then)}`, past.positionLiquidity),
      chain(`sqrtPriceX96 · ${at(r.then)}`, past.sqrtPriceX96),
      derived(`${p.base.symbol} then`, fig(p.holdsThen.base)),
      derived(`${p.quote.symbol} then`, fig(p.holdsThen.quote)),
    ],
  };
}

/** One part of the readout's facts; null where it states no read. */
function partProv(key: string, part: "yours" | "pool", c: UniReceiptContext): Provenance | null {
  const { p, r } = c;
  const head = { block: r.head.block };
  const Q = p.quote.symbol;
  const past = r.past;
  switch (`${key}:${part}`) {
    case "range:yours": {
      // As the line: no daily count for a position younger than the window with no opening day.
      const d = p.openedInWindow && !p.opened ? null : p.daysInRange;
      return {
        ...cardProv("range", c),
        summary: `Range — the position's ticks ${r.tickLower} to ${r.tickUpper} against the pool's tick ${r.now.tick} at ${at(r.head)}${d ? `; the pool's tick was inside the range at ${d.inRange} of ${d.read} daily reads from block ${n(d.from)} to block ${n(d.to)}, ${dayGridPhrase(r.chainId)}, kept in rails-server's at-block store` : ""}.`,
        inputs: [
          ...(cardProv("range", c).inputs ?? []),
          ...(d ? [derived("daily reads in range", `${d.inRange} of ${d.read}`)] : []),
        ],
      };
    }
    case "range:pool":
      if (!past) return null;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Price change — the pool's square-root price at ${at(r.then)} and at ${at(r.head)}, squared and scaled by the tokens' decimals.`,
        contract: poolContract(c),
        via: via(c, `blocks ${n(r.then.block)} and ${n(r.head.block)}`),
        formula: "price now ÷ price then − 1",
        inputs: [
          chain(`sqrtPriceX96 · ${at(r.then)}`, past.sqrtPriceX96),
          chain(`sqrtPriceX96 · ${at(r.head)}`, r.now.sqrtPriceX96),
        ],
      };
    case "fees:yours": {
      if (p.fees30d === null) return p.uncollected > 0 ? cardProv("uncollected", c) : null;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Swap fees — the position's liquidity ${r.liquidity}, the same at both blocks, times the growth of fees inside its range between ${both(c)}, valued in ${Q} at the pool's price now.`,
        contract: poolContract(c),
        via: via(c, `blocks ${n(r.then.block)} and ${n(r.head.block)}`),
        formula: "L × (feeGrowthInside now − feeGrowthInside then) ÷ 2^128, per token",
        inputs: [
          chain(`${insideCall(c)} · ${at(r.head)}`, `${r.now.feeGrowthInside0X128}, ${r.now.feeGrowthInside1X128}`),
          chain(
            `${insideCall(c)} · ${at(r.then)}`,
            past ? `${past.feeGrowthInside0X128}, ${past.feeGrowthInside1X128}` : "–",
          ),
          derived(p.base.symbol, fig(p.fees30dAmounts?.base ?? 0)),
          derived(Q, fig(p.fees30dAmounts?.quote ?? 0)),
          derived(`fees, ${Q}`, fig(p.fees30d)),
        ],
      };
    }
    case "fees:pool":
      if (!past || p.pool30d.fullRangeFees === null) return null;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Full range fees — the growth of the pool's global fee counters between ${both(c)}, as a share of a full-range position's value at the price now. A donation to the pool raises these counters as a fee does.`,
        contract: poolContract(c),
        via: via(c, `blocks ${n(r.then.block)} and ${n(r.head.block)}`),
        formula: "(Δg0 × P + Δg1) ÷ (2 × √P), with g in units of 2^128",
        inputs: [
          chain(
            `feeGrowthGlobal0/1X128 · ${at(r.head)}`,
            `${r.now.feeGrowthGlobal0X128}, ${r.now.feeGrowthGlobal1X128}`,
          ),
          chain(`feeGrowthGlobal0/1X128 · ${at(r.then)}`, `${past.feeGrowthGlobal0X128}, ${past.feeGrowthGlobal1X128}`),
          derived("share of value", `${(p.pool30d.fullRangeFees * 100).toFixed(4)}%`),
        ],
      };
    case "against:yours":
      if (p.againstHolding === null || p.holdThen === null) return null;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Impermanent loss — how much less the position is worth now than the tokens the same liquidity held at ${at(r.then)}, valued at the pool's price at ${at(r.head)}, before and after its 30-day fees.`,
        contract: poolContract(c),
        via: via(c, `blocks ${n(r.then.block)} and ${n(r.head.block)}`),
        formula: "1 − worth now ÷ held then valued now; with fees, 1 − (worth now + fees) ÷ the same",
        inputs: [
          chain(`sqrtPriceX96 · ${at(r.then)}`, past?.sqrtPriceX96 ?? "–"),
          derived(`held then, valued now, ${Q}`, fig(p.holdThen)),
          derived(`worth now, ${Q}`, fig(p.valueNow)),
          derived(`fees, 30 days, ${Q}`, fig(p.fees30d ?? 0)),
        ],
      };
    case "against:pool": {
      const sd = p.sinceDeposit;
      if (!sd) return null;
      return {
        kind: "derived",
        pclass: "emitted",
        source: head,
        summary: `Against deposits — ${sd.events.increase} IncreaseLiquidity, ${sd.events.decrease} DecreaseLiquidity and ${sd.events.collect} Collect logs on the NonfungiblePositionManager for token id ${p.id}, up to ${at(r.head)}. What was put in is valued at the pool's price now; Collect pays out withdrawn tokens and fees together.`,
        contract: positionContract(c),
        via: "rails-server · getLogs by token id",
        formula: "(worth now + uncollected + every Collect) ÷ deposits valued now − 1",
        inputs: [
          derived(`put in, ${p.base.symbol} and ${Q}`, `${fig(sd.deposited.base)}, ${fig(sd.deposited.quote)}`),
          derived(`collected, ${p.base.symbol} and ${Q}`, `${fig(sd.collected.base)}, ${fig(sd.collected.quote)}`),
          derived(`if held, ${Q}`, fig(sd.holdValue)),
          derived(`all of it now, ${Q}`, fig(sd.nowWithEverything)),
        ],
      };
    }
    case "size:yours":
      if (!p.inRange) return null;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Active liquidity share — the position's liquidity over the pool's liquidity in range at ${at(r.head)}.`,
        contract: poolContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        formula: "L ÷ pool liquidity",
        inputs: [
          chain("position liquidity", r.liquidity),
          chain(p.version === "v3" ? "liquidity()" : "getLiquidity(poolId)", r.now.activeLiquidity),
        ],
      };
    case "size:pool": {
      const b = p.pool30d.balances;
      if (!b) return null;
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Pool balances — each token's balanceOf the pool ${p.pool} at ${at(r.head)}${p.pool30d.balancesThen ? ` and at ${at(r.then)}` : ""}.`,
        contract: poolContract(c),
        via: via(c, `blocks ${n(r.then.block)} and ${n(r.head.block)}`),
        inputs: [
          chain(`balanceOf · ${at(r.head)}`, `${r.now.balance0}, ${r.now.balance1}`),
          ...(past?.balance0 != null ? [chain(`balanceOf · ${at(r.then)}`, `${past.balance0}, ${past.balance1}`)] : []),
        ],
      };
    }
    case "withdrawals:yours":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: p.hooks
          ? `Hook permissions — the pool's hook ${p.hooks}, from the PoolKey, carries its permissions in the low 14 bits of its address (v4-core Hooks.sol): ${p.hookPermissions.join(", ") || "none"}.`
          : p.version === "v3"
            ? `No hook — a ${dep(c).protocolName} V3 pool has no hook and no pause; its burn and collect take no permission.${p.staked ? ` ownerOf(${p.id}) is MasterChefV3, whose decreaseLiquidity, collect and withdraw answer only the staker it records, ${p.staked.user}.` : ""}`
            : "No hook — the pool's PoolKey.hooks is the zero address, so nothing runs on a withdrawal.",
        contract: positionContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        ...(p.hooks ? { inputs: [chain("PoolKey.hooks", p.hooks)] } : {}),
      };
    case "withdrawals:pool":
      if (!p.hasSubscriber) return null;
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Subscriber — the low byte of the position's PositionInfo from the PositionManager marks a subscriber at ${at(r.head)}.`,
        contract: positionContract(c),
        via: via(c, `block ${n(r.head.block)}`),
      };
    case "steward:pool":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary:
          p.protocolCut.version === "pancake-v3"
            ? `Fee and protocol cut — the pool's fee tier is fixed at creation; slot0().feeProtocol at ${at(r.head)} is ${r.now.protocolFee}, two 16-bit shares of the swap fee in ten-thousandths, ${p.protocolCut.s0} for token0 and ${p.protocolCut.s1} for token1 (PancakeV3Pool: feeProtocol % 65536 and feeProtocol >> 16).`
            : p.version === "v3"
              ? `Fee and protocol cut — the pool's fee tier is fixed at creation; slot0().feeProtocol at ${at(r.head)} is ${r.now.protocolFee}, a denominator per token in its two 4-bit halves.`
              : `Fee and protocol fee — getSlot0 at ${at(r.head)} gives lpFee ${r.now.lpFee} and protocolFee ${r.now.protocolFee}, two 12-bit amounts in millionths, one per direction; the PoolKey fee is ${r.fee}${p.dynamicFee ? ", the flag that hands the fee to the hook" : ""}.`,
        contract: poolContract(c),
        via: via(c, `block ${n(r.head.block)}`),
        inputs: [
          chain(p.version === "v3" ? "feeProtocol" : "protocolFee", String(r.now.protocolFee)),
          chain(p.version === "v3" ? "fee" : "lpFee", String(p.version === "v3" ? r.fee : r.now.lpFee)),
        ],
      };
    default:
      return null;
  }
}

/** What the section's read stamp lists as read. */
export function readContracts(c: UniReceiptContext) {
  const k = contracts(c);
  return c.p.version === "v3"
    ? [
        { name: "NonfungiblePositionManager", address: k.v3Npm, reads: "positions(id), ownerOf(id)" },
        {
          name: `${dep(c).protocolName} V3 pool ${c.p.base.symbol}/${c.p.quote.symbol}`,
          address: c.p.pool,
          reads: "slot0(), liquidity(), feeGrowthGlobal0/1X128(), ticks(lower), ticks(upper)",
        },
        ...(c.p.staked !== undefined
          ? [
              {
                name: "MasterChefV3",
                address: farmContract(c).address,
                reads: "userPositionInfos(id), pendingCake(id)",
              },
            ]
          : []),
      ]
    : [
        {
          name: "PositionManager",
          address: k.v4PositionManager,
          reads: "getPoolAndPositionInfo(id), getPositionLiquidity(id), ownerOf(id)",
        },
        {
          name: "StateView",
          address: k.v4StateView,
          reads: "getSlot0, getLiquidity, getFeeGrowthGlobals, getFeeGrowthInside, getPositionInfo",
        },
      ];
}
