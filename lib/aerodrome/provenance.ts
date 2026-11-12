// The receipts of an Aerodrome position page (rails-ops ui-jobs 566; the
// figures are lib/aerodrome/position.ts, the words lib/aerodrome/words.ts):
// each card figure and each readout line traces to the contract reads behind
// it, with the blocks they were read at. Past reads stand on Base's day grid,
// UTC midnights. The surface names no function or block (decision 0059
// point 1); this module is where they live.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import type { AeroPosition, AeroPriceRoute } from "@/lib/aerodrome/position";
import { AERODROME, type SlipstreamSite } from "@/lib/aerodrome/sites";
import type { AeroPositionRead } from "@/lib/aerodrome/types";
import type { RowKey } from "@/lib/uniswap/words";

const n = (v: number) => v.toLocaleString("en-US");
const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const at = (b: { block: number; time: number }) => `block ${n(b.block)} (${date(b.time)})`;
const fig = (x: number) => x.toLocaleString("en-US", { maximumSignificantDigits: 8 });

/** The facts every receipt of a page shares. */
export interface AeroReceiptContext {
  p: AeroPosition;
  r: AeroPositionRead;
}

const nfpm = (c: AeroReceiptContext) => ({ name: "Slipstream NonfungiblePositionManager", address: c.r.nfpm });
const poolC = (c: AeroReceiptContext) => ({
  name: `Slipstream pool ${c.p.base.symbol}/${c.p.quote.symbol}`,
  address: c.p.pool,
});
const gaugeC = (c: AeroReceiptContext) => ({ name: "Slipstream gauge", address: c.r.staked?.gauge ?? c.r.owner });
const via = (blocks: string) => `rails-server · eth_call @ ${blocks}`;
const headVia = (c: AeroReceiptContext) => via(`block ${n(c.r.head.block)}`);
const bothVia = (c: AeroReceiptContext) => via(`blocks ${n(c.r.then.block)} and ${n(c.r.head.block)}`);
const both = (c: AeroReceiptContext) =>
  `${at(c.r.head)} and ${at(c.r.then)}, the UTC midnight 30 days before the head's last one`;
const INSIDE = "feeGrowthGlobal0/1X128 and ticks(lower/upper).feeGrowthOutside, worked as the pool works them";
const REWARD_INSIDE =
  "rewardGrowthGlobalX128 brought up to the block's time and ticks(lower/upper).rewardGrowthOutsideX128, worked as Tick.getRewardGrowthInside does";

const chain = (label: string, value: string): ProvInput => ({ label, value, kind: "chain", pclass: "state" });
const derived = (label: string, value: string): ProvInput => ({ label, value, kind: "derived" });

/** How AERO (VELO on Optimism) was priced, for a receipt. */
export function routeText(route: AeroPriceRoute, q: string, base: string, site: SlipstreamSite = AERODROME): string {
  const R = site.reward.symbol;
  const P = site.label;
  switch (route.via) {
    case "usdc-leg":
      return `${R} is priced in USDC through ${P}'s ${R}/USDC volatile pool ${route.leg.pool}, its reserves at the head.`;
    case "weth-leg":
      return `${R} is priced in WETH through ${P}'s ${R}/WETH volatile pool ${route.leg.pool}, its reserves at the head.`;
    case "is-quote":
      return `${R} is this pool's quote token.`;
    case "pool":
      return `${R} is this pool's base token, priced in ${q} by the pool.`;
    case "weth-then-pool":
      return `${R} is priced in WETH through ${P}'s ${R}/WETH volatile pool ${route.leg.pool}, then in ${q} at this pool's price for ${base}.`;
    case "usdc-then-pool":
      return `${R} is priced in USDC through ${P}'s ${R}/USDC volatile pool ${route.leg.pool}, then in ${q} at this pool's price for ${base}.`;
    case "none":
      return `Neither ${R} pool reaches ${q}, so ${R} has no price here.`;
  }
}

/** The price route's sentence on this page's site. */
const routeOf = (c: AeroReceiptContext) => routeText(c.p.aeroPrice.route, c.p.quote.symbol, c.p.base.symbol, c.p.site);

function routeInputs(c: AeroReceiptContext): ProvInput[] {
  const route = c.p.aeroPrice.route;
  const out: ProvInput[] = [];
  if ("leg" in route)
    out.push(chain(`getReserves() · ${route.leg.pool}`, `${route.leg.now.reserve0}, ${route.leg.now.reserve1}`));
  if (c.p.aeroPrice.price !== null)
    out.push(derived(`${c.p.site.reward.symbol} in ${c.p.quote.symbol}`, fig(c.p.aeroPrice.price)));
  return out;
}

/** The card's figures. */
export function cardProv(
  key: "price" | "holds" | "worth" | "uncollected" | "claimable" | "owner" | "range",
  c: AeroReceiptContext,
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
        contract: poolC(c),
        via: headVia(c),
        formula: "(sqrtPriceX96 ÷ 2^96)² × 10^(decimals0 − decimals1)",
        inputs: [chain("slot0() · sqrtPriceX96", r.now.sqrtPriceX96)],
      };
    case "holds":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Tokens — the two amounts the position's liquidity ${r.liquidity} holds between ticks ${r.tickLower} and ${r.tickUpper} at the pool's square-root price at ${at(r.head)}.`,
        contract: nfpm(c),
        via: headVia(c),
        formula: "Uniswap V3's amounts for liquidity L over [√Pa, √Pb] at √P, which Slipstream keeps",
        inputs: [
          chain(`positions(${p.id}) · liquidity`, r.liquidity),
          chain("tickLower, tickUpper", `${r.tickLower}, ${r.tickUpper}`),
          chain("slot0() · sqrtPriceX96", r.now.sqrtPriceX96),
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
        contract: poolC(c),
        via: headVia(c),
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
        summary: `Uncollected fees — the fees owed on record plus the liquidity times the growth of fees inside the range since the position last settled, at ${at(r.head)}, valued in ${Q} at the pool's price. The pool's fee growth counts unstaked liquidity only, after the unstaked fee.`,
        contract: nfpm(c),
        via: headVia(c),
        formula: "tokensOwed + L × (feeGrowthInside − feeGrowthInsideLast) ÷ 2^128, per token",
        inputs: [
          chain("tokensOwed0, tokensOwed1", `${r.now.tokensOwed0}, ${r.now.tokensOwed1}`),
          chain(`feeGrowthInside0/1X128 · ${INSIDE}`, `${r.now.feeGrowthInside0X128}, ${r.now.feeGrowthInside1X128}`),
          chain(
            "feeGrowthInside0/1LastX128",
            `${r.now.positionFeeGrowthInside0LastX128}, ${r.now.positionFeeGrowthInside1LastX128}`,
          ),
          derived(p.base.symbol, fig(p.uncollectedAmounts?.base ?? 0)),
          derived(Q, fig(p.uncollectedAmounts?.quote ?? 0)),
        ],
      };
    case "claimable": {
      const s = r.staked;
      const a = p.aero;
      const R = p.site.reward.symbol;
      return {
        kind: a?.claimableFrom === "earned" ? "chain" : "derived",
        pclass: "state",
        source: head,
        summary: `${R} to claim — ${
          a?.claimableFrom === "earned"
            ? `the gauge's earned(depositor, ${p.id}) at ${at(r.head)}: the rewards settled at its last update, plus the liquidity times the reward growth inside the range since, less any early-unstake penalty. The same arithmetic from the reads gives ${fig(a.claimableArithmetic)} ${R}.`
            : `${p.site.namesDepositor ? "no depositor was found" : `on ${p.site.chainName} Rails does not yet look up the wallet that staked a position`}, so the gauge's earned() cannot be asked; this is its arithmetic at ${at(r.head)}: the rewards settled at the last update, plus the liquidity times the reward growth inside the range since, less any early-unstake penalty.`
        } ${routeOf(c)}`,
        contract: gaugeC(c),
        via: headVia(c),
        formula: "rewards + L × (rewardGrowthInside now − rewardGrowthInside at last update) ÷ 2^128, less penalty",
        inputs: [
          ...(s?.earned != null ? [chain("earned(depositor, id)", s.earned)] : []),
          chain("rewards(id)", s?.rewards ?? "–"),
          chain(`rewardGrowthInside · ${REWARD_INSIDE}`, r.now.rewardGrowthInsideX128),
          chain("gauge rewardGrowthInside(id), at the last update", s?.rewardGrowthInsideLastX128 ?? "–"),
          ...(s?.penaltyBps != null
            ? [chain("penaltyRate(), minStakeTimes(pool)", `${s.penaltyBps} bps, ${s.minStakeSeconds ?? "–"} s`)]
            : []),
          ...(s?.depositTimestamp != null ? [chain("depositTimestamp(id)", String(s.depositTimestamp))] : []),
          derived(R, fig(a?.claimable ?? 0)),
          ...routeInputs(c),
        ],
      };
    }
    case "owner": {
      const s = r.staked;
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: s?.depositor
          ? `Staked by — ownerOf(${p.id}) at ${at(r.head)} is the pool's gauge ${s.gauge}. The gauge keeps no list from position to wallet, so the wallet is found from the gauge's Deposit and ClaimRewards logs and the position manager's Transfer logs at the block of ${s.depositTimestamp !== null ? "its depositTimestamp" : "its last update"}, and confirmed by the gauge's stakedContains(wallet, ${p.id}) at the head.`
          : p.site.namesDepositor
            ? `Staked in the gauge — ownerOf(${p.id}) at ${at(r.head)} is the pool's gauge ${r.owner}. No wallet in the gauge's logs at the deposit's block passed stakedContains at the head.`
            : `Staked in the gauge — ownerOf(${p.id}) at ${at(r.head)} is the pool's gauge ${r.owner}. The gauge keeps no list from position to wallet, and on ${p.site.chainName} Rails does not yet read the deposit's logs to name the wallet.`,
        contract: gaugeC(c),
        via: headVia(c),
        inputs: [
          chain(`ownerOf(${p.id})`, r.owner),
          chain("pool.gauge()", s?.gauge ?? "–"),
          ...(s?.depositor ? [chain("stakedContains(depositor, id)", "true")] : []),
        ],
      };
    }
    case "range":
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Range — the position's ticks ${r.tickLower} to ${r.tickUpper} from positions(${p.id}), and the pool's tick ${r.now.tick} at ${at(r.head)}; a tick's price is 1.0001^tick, scaled by the tokens' decimals.`,
        contract: nfpm(c),
        via: headVia(c),
        formula: "in range when tickLower ≤ tick < tickUpper",
        inputs: [
          chain("tickLower, tickUpper", `${r.tickLower}, ${r.tickUpper}`),
          chain("slot0() · tick", String(r.now.tick)),
          derived("low, high", `${fig(p.range.low)}, ${fig(p.range.high)}`),
        ],
      };
  }
}

/** The 30-day earnings figure's receipt: fees for an unstaked position, AERO for a staked one, or why
 *  there is no figure. */
function earnedProv(c: AeroReceiptContext): Provenance | null {
  const { p, r } = c;
  const past = r.past;
  const head = { block: r.head.block };
  const Q = p.quote.symbol;
  const w = p.window;
  if (w.kind !== "whole" || !past) {
    const why =
      w.kind === "minted"
        ? `positions(${p.id}) at ${at(r.then)} shows no position: it was minted inside the window. The daily reads at UTC midnights first show it at ${w.firstSeen !== null ? date(w.firstSeen) : "no read"}.`
        : w.kind === "liquidity-changed"
          ? `positions(${p.id}) gives liquidity ${past?.positionLiquidity ?? "–"} at ${at(r.then)} and ${r.liquidity} at ${at(r.head)}; the window's growth times one liquidity would misstate it.`
          : w.kind === "staked-inside"
            ? `ownerOf(${p.id}) at ${at(r.then)} is not the gauge, and at ${at(r.head)} it is: the position was staked inside the window${w.at !== null ? `, at ${date(w.at)} by the gauge's depositTimestamp` : ""}. Reward growth before the stake was not the position's, and no read stands at the stake's block.`
            : w.kind === "unstaked-inside"
              ? `ownerOf(${p.id}) at ${at(r.then)} is the gauge, and at ${at(r.head)} it is not: the position left the gauge inside the window, and fee growth while staked was not the position's.`
              : `The pool had no state at ${at(r.then)}.`;
    return {
      kind: "derived",
      pclass: "state",
      source: head,
      summary: `No 30-day figure — ${why}`,
      contract: nfpm(c),
      via: bothVia(c),
      inputs: [
        chain(`positions(${p.id}) · liquidity · ${at(r.then)}`, past?.positionLiquidity ?? "none"),
        chain(`ownerOf(${p.id}) is the gauge · ${at(r.then)}`, String(r.stakedThen)),
      ],
    };
  }
  if (p.aero) {
    const a = p.aero;
    const R = p.site.reward.symbol;
    return {
      kind: "derived",
      pclass: "state",
      source: head,
      summary: `${R}, 30 days — the position's liquidity ${r.liquidity}, the same at both blocks and staked at both, times the growth of ${R} per unit of staked liquidity inside its range between ${both(c)}. ${routeOf(c)}`,
      contract: poolC(c),
      via: bothVia(c),
      formula: "L × (rewardGrowthInside now − rewardGrowthInside then) ÷ 2^128 ÷ 10^18",
      inputs: [
        chain(`rewardGrowthInside · ${at(r.head)}`, r.now.rewardGrowthInsideX128),
        chain(`rewardGrowthInside · ${at(r.then)}`, past.rewardGrowthInsideX128),
        derived(R, fig(a.earned30d ?? 0)),
        ...routeInputs(c),
        ...(a.earned30dValue !== null ? [derived(`${R}, ${Q}`, fig(a.earned30dValue))] : []),
      ],
    };
  }
  return {
    kind: "derived",
    pclass: "state",
    source: head,
    summary: `Swap fees — the position's liquidity ${r.liquidity}, the same at both blocks and unstaked at both, times the growth of fees inside its range between ${both(c)}, valued in ${Q} at the pool's price now.`,
    contract: poolC(c),
    via: bothVia(c),
    formula: "L × (feeGrowthInside now − feeGrowthInside then) ÷ 2^128, per token",
    inputs: [
      chain(`${INSIDE} · ${at(r.head)}`, `${r.now.feeGrowthInside0X128}, ${r.now.feeGrowthInside1X128}`),
      chain(`${INSIDE} · ${at(r.then)}`, `${past.feeGrowthInside0X128}, ${past.feeGrowthInside1X128}`),
      derived(p.base.symbol, fig(p.fees30dAmounts?.base ?? 0)),
      derived(Q, fig(p.fees30dAmounts?.quote ?? 0)),
      derived(`fees, ${Q}`, fig(p.fees30d ?? 0)),
    ],
  };
}

const L = (x: bigint | null) => (x === null ? "–" : x.toString());

/** A readout row's receipt; null where the row states no read. */
export function lineProv(key: RowKey, c: AeroReceiptContext): Provenance | null {
  switch (key) {
    case "token:0":
    case "token:1":
      return holdsProv(c);
    case "days":
      return partProv("range", "yours", c);
    case "earned":
      return partProv("fees", "yours", c);
    case "against":
    case "withEarned":
      return c.p.againstHolding === null ? earnedProv(c) : partProv("against", "yours", c);
    case "share":
      return partProv("size", "yours", c);
    case "penalty":
    case "withdrawals":
      return partProv("withdrawals", "yours", c);
    case "price":
    case "move":
      return c.r.past ? partProv("range", "pool", c) : cardProv("price", c);
    case "balance:0":
    case "balance:1":
      return partProv("size", "pool", c);
    case "fullRange":
    case "fullRangeReward":
      return partProv("fees", "pool", c);
    case "swapFee":
    case "protocolFee":
      return partProv("steward", "pool", c);
    default:
      return null;
  }
}

/** The position's two amounts now and at the past block, each its liquidity at that block's price. */
function holdsProv(c: AeroReceiptContext): Provenance {
  const { p, r } = c;
  const now = cardProv("holds", c);
  const past = r.past;
  if (!past || past.positionLiquidity === null || !p.holdsThen) return now;
  return {
    ...now,
    summary: `Tokens — the two amounts the position's liquidity holds between ticks ${r.tickLower} and ${r.tickUpper}: ${r.liquidity} at the pool's square-root price at ${at(r.head)}, and ${past.positionLiquidity} at the square-root price at ${at(r.then)}.`,
    via: bothVia(c),
    inputs: [
      ...(now.inputs ?? []),
      chain(`positions(${p.id}) · liquidity · ${at(r.then)}`, past.positionLiquidity),
      chain(`sqrtPriceX96 · ${at(r.then)}`, past.sqrtPriceX96),
      derived(`${p.base.symbol} then`, fig(p.holdsThen.base)),
      derived(`${p.quote.symbol} then`, fig(p.holdsThen.quote)),
    ],
  };
}

/** One part of the readout's facts; null where it states no read. */
function partProv(key: string, part: "yours" | "pool", c: AeroReceiptContext): Provenance | null {
  const { p, r } = c;
  const head = { block: r.head.block };
  const Q = p.quote.symbol;
  const past = r.past;
  switch (`${key}:${part}`) {
    case "range:yours": {
      const d = p.daysInRange;
      return {
        ...cardProv("range", c),
        summary: `Range — the position's ticks ${r.tickLower} to ${r.tickUpper} against the pool's tick ${r.now.tick} at ${at(r.head)}${d ? `; the pool's tick was inside the range at ${d.inRange} of ${d.read} daily reads from block ${n(d.from)} to block ${n(d.to)}, one at each UTC midnight${p.site.gridNote ? ` (${p.site.gridNote})` : ""}, each a day the position existed, kept in rails-server's at-block store` : ""}.`,
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
        contract: poolC(c),
        via: bothVia(c),
        formula: "price now ÷ price then − 1",
        inputs: [
          chain(`sqrtPriceX96 · ${at(r.then)}`, past.sqrtPriceX96),
          chain(`sqrtPriceX96 · ${at(r.head)}`, r.now.sqrtPriceX96),
        ],
      };
    case "fees:yours":
      return earnedProv(c);
    case "fees:pool": {
      if (!past) return null;
      const pool = p.pool30d;
      const R = p.site.reward.symbol;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Full range fees and full range ${R} — the growth of the pool's fee counters between ${both(c)}, which grow per unit of unstaked liquidity (in range, less the staked part), as a share of a full-range position's value at the price now; and the growth of its reward counter, which grows by the gauge's rewardRate per unit of staked liquidity, valued the same way. ${routeOf(c)} A figure is set aside when its liquidity in range was under ${pool.floor === null ? "no floor (this quote token has none)" : `${n(pool.floor)} ${Q}`} at either read, when the pool is younger than 30 days, or when it is above 10%.`,
        contract: poolC(c),
        via: bothVia(c),
        formula: `fees: (Δg0 × P + Δg1) ÷ (2 × √P), g in units of 2^128; ${R}: Δg ÷ 2^128 ÷ 10^18 × ${R} price ÷ (2 × √P valued in the quote)`,
        inputs: [
          chain(
            `feeGrowthGlobal0/1X128 · ${at(r.head)}`,
            `${r.now.feeGrowthGlobal0X128}, ${r.now.feeGrowthGlobal1X128}`,
          ),
          chain(`feeGrowthGlobal0/1X128 · ${at(r.then)}`, `${past.feeGrowthGlobal0X128}, ${past.feeGrowthGlobal1X128}`),
          chain(`rewardGrowthGlobalX128 · ${at(r.head)}`, r.now.rewardGrowthGlobalX128),
          chain(`rewardGrowthGlobalX128 · ${at(r.then)}`, past.rewardGrowthGlobalX128),
          chain("liquidity(), stakedLiquidity() now", `${r.now.activeLiquidity}, ${r.now.stakedLiquidity}`),
          chain("liquidity(), stakedLiquidity() then", `${past.activeLiquidity}, ${past.stakedLiquidity}`),
          derived(
            "unstaked liquidity now, then",
            `${L(pool.unstakedLiquidity.now)}, ${L(pool.unstakedLiquidity.then)}`,
          ),
          chain(`rewardRate() now, ${R} wei a second`, r.now.rewardRate),
          derived(`${R} a day to staked liquidity now`, fig(pool.aeroPerDay)),
          ...routeInputs(c),
          ...(pool.fullRangeFees !== null
            ? [derived("fees, share of value", `${(pool.fullRangeFees * 100).toFixed(4)}%`)]
            : []),
          ...(pool.fullRangeAero !== null
            ? [derived(`${R}, share of value`, `${(pool.fullRangeAero * 100).toFixed(4)}%`)]
            : []),
        ],
      };
    }
    case "against:yours":
      if (p.againstHolding === null || p.holdThen === null) return null;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Against holding — the tokens the same liquidity held at ${at(r.then)}, valued at the pool's price at ${at(r.head)}, against the position's worth now, without and with its 30-day ${p.staked ? `${p.site.reward.symbol}, valued now` : "fees"}.`,
        contract: poolC(c),
        via: bothVia(c),
        formula: "worth now ÷ held then valued now − 1; with earnings, (worth now + earnings) ÷ the same − 1",
        inputs: [
          chain(`sqrtPriceX96 · ${at(r.then)}`, past?.sqrtPriceX96 ?? "–"),
          derived(`held then, valued now, ${Q}`, fig(p.holdThen)),
          derived(`worth now, ${Q}`, fig(p.valueNow)),
          derived(
            `${p.staked ? p.site.reward.symbol : "fees"}, 30 days, ${Q}`,
            fig((p.staked ? p.aero?.earned30dValue : p.fees30d) ?? 0),
          ),
        ],
      };
    case "size:yours":
      if (!p.inRange) return null;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: `Active liquidity share — the position's liquidity over the pool's ${p.staked ? "staked liquidity in range" : "unstaked liquidity in range (all liquidity in range, less the staked part)"} at ${at(r.head)}.`,
        contract: poolC(c),
        via: headVia(c),
        formula: p.staked ? "L ÷ stakedLiquidity" : "L ÷ (liquidity − stakedLiquidity)",
        inputs: [
          chain("position liquidity", r.liquidity),
          chain("liquidity()", r.now.activeLiquidity),
          chain("stakedLiquidity()", r.now.stakedLiquidity),
        ],
      };
    case "size:pool": {
      if (!p.pool30d.balances) return null;
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Pool balances — each token's balanceOf the pool ${p.pool} at ${at(r.head)}${p.pool30d.balancesThen ? ` and at ${at(r.then)}` : ""}.`,
        contract: poolC(c),
        via: bothVia(c),
        inputs: [
          chain(`balanceOf · ${at(r.head)}`, `${r.now.balance0}, ${r.now.balance1}`),
          ...(past?.balance0 != null ? [chain(`balanceOf · ${at(r.then)}`, `${past.balance0}, ${past.balance1}`)] : []),
        ],
      };
    }
    case "withdrawals:yours": {
      const s = r.staked;
      return {
        kind: "derived",
        pclass: "state",
        source: head,
        summary: s
          ? `Unstaking — the gauge's withdraw(${p.id}) takes no permission beyond the depositor's and pays out the ${p.site.reward.symbol} to claim; ${p.aero?.penalty ? `penaltyRate() is ${s.penaltyBps} bps and minStakeTimes(pool) ${s.minStakeSeconds} s, so before depositTimestamp + ${s.minStakeSeconds} s that share of the ${p.site.reward.symbol} goes to the minter` : s.penaltyBps != null ? `penaltyRate() is ${s.penaltyBps} bps, which applies only within minStakeTimes(pool), ${s.minStakeSeconds} s, of the deposit, now past` : "this gauge has no early-unstake penalty"}. The Slipstream pool's burn and collect take no permission.`
          : "No gate — a Slipstream pool has no pause and no hook; its burn and collect take no permission.",
        contract: s ? gaugeC(c) : poolC(c),
        via: headVia(c),
        ...(s && s.depositTimestamp !== null
          ? {
              inputs: [
                chain("depositTimestamp(id)", String(s.depositTimestamp)),
                chain("penaltyRate(), minStakeTimes(pool)", `${s.penaltyBps ?? "–"}, ${s.minStakeSeconds ?? "–"}`),
              ],
            }
          : {}),
      };
    }
    case "steward:pool":
      return {
        kind: "chain",
        pclass: "state",
        source: head,
        summary: `Fees and who sets them — pool.fee() and pool.unstakedFee() at ${at(r.head)}${past ? ` and ${at(r.then)}` : ""}, in millionths. The pool asks its factory ${p.site.factory[p.deployment]}, whose swap fee module and unstaked fee module return each pool's fee; the factory's fee managers can replace either module.`,
        contract: poolC(c),
        via: past ? bothVia(c) : headVia(c),
        inputs: [
          chain(`fee() · ${at(r.head)}`, String(r.now.lpFee)),
          ...(past ? [chain(`fee() · ${at(r.then)}`, String(past.lpFee))] : []),
          chain(`unstakedFee() · ${at(r.head)}`, String(r.now.unstakedFee)),
          ...(past ? [chain(`unstakedFee() · ${at(r.then)}`, String(past.unstakedFee))] : []),
        ],
      };
    default:
      return null;
  }
}

/** What the section's read stamp lists as read. */
export function readContracts(c: AeroReceiptContext) {
  const { p, r } = c;
  return [
    {
      name: "Slipstream NonfungiblePositionManager",
      address: r.nfpm,
      reads: "positions(id), ownerOf(id)",
    },
    {
      name: `Slipstream pool ${p.base.symbol}/${p.quote.symbol}`,
      address: p.pool,
      reads:
        "slot0(), liquidity(), stakedLiquidity(), fee(), unstakedFee(), feeGrowthGlobal0/1X128(), rewardGrowthGlobalX128(), rewardRate(), ticks(lower), ticks(upper), gauge()",
    },
    ...(r.staked
      ? [
          {
            name: "Slipstream gauge",
            address: r.staked.gauge,
            reads: "earned(depositor, id), rewards(id), rewardGrowthInside(id), stakedContains(depositor, id)",
          },
        ]
      : []),
    ...(["usdc", "weth"] as const).map((k) => ({
      name: `${p.site.label} ${p.site.reward.symbol}/${k.toUpperCase()} pool`,
      address: r.aero[k].pool,
      reads: "getReserves()",
    })),
  ];
}
