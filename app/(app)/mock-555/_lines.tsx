// ui-jobs 555, door 1 mock: the six readout lines, agreed 9 Nov 2026 (Range,
// Fees, Against holding, Size, Withdrawals, Steward). Each line is a windowed
// figure, the holder's first; no verdict words.

import type { PoolPosition } from "./_reads";
import { day, num, pct, short, shown, type Line } from "./_ui";

const REMOVE_FLAGS = new Set(["beforeRemoveLiquidity", "afterRemoveLiquidity", "afterRemoveLiquidityReturnsDelta"]);

export function lines(p: PoolPosition): Line[] {
  const B = p.base.symbol;
  const Q = p.quote.symbol;
  const since = p.block.thenAt;
  const opened = p.firstAt !== null && p.firstAt > since ? p.firstAt : null;
  const s = shown(p);
  const posReceipt = p.version === "v3" ? `NPM.positions(${p.id})` : `PositionManager.getPoolAndPositionInfo(${p.id})`;
  const poolReceipt = p.version === "v3" ? `pool ${short(p.pool)}` : `StateView, pool id ${short(p.pool)}`;
  const blocks = `blocks ${p.block.then.toLocaleString("en-US")} (${day(p.block.thenAt)}) and ${p.block.now.toLocaleString("en-US")} (${day(p.block.nowAt)})`;

  // Range
  const onlyHolds = p.holds.base === 0 ? Q : p.holds.quote === 0 ? B : null;
  const range: Line = {
    key: "range",
    label: "Range",
    yours: (
      <>
        {p.range.full
          ? "In range at every price: the position is full range. "
          : p.inRange
            ? `In range: the price, ${num(s.price)} ${s.unit}, sits inside ${num(s.low)} to ${num(s.high)}. `
            : `Out of range, ${s.side} it: the price is ${num(s.price)} ${s.unit}, the range ${num(s.low)} to ${num(s.high)}. It holds only ${onlyHolds ?? "one token"} and earns no fees while the price is outside. `}
        {p.daysInRange && p.daysInRange.read > 0 && (
          <>
            {opened
              ? `In range on ${p.daysInRange.inRange} of ${p.daysInRange.read} daily reads since it opened on ${day(opened)}.`
              : `In range on ${p.daysInRange.inRange} of the last ${p.daysInRange.read} days, read once a day.`}
          </>
        )}
      </>
    ),
    pool:
      s.then !== null ? (
        <>
          The price moved {pct(s.price / s.then - 1, 1)} in 30 days, from {num(s.then)} to {num(s.price)} {s.unit}.
        </>
      ) : null,
    receipt: [
      `ticks from ${posReceipt}`,
      `${p.version === "v3" ? "slot0().tick" : "getSlot0().tick"} at ${blocks}`,
      "one tick a day for the count",
    ],
    source: "sample",
  };

  // Fees
  let feesYours: React.ReactNode;
  if (opened)
    feesYours = (
      <>
        Opened on {day(opened)}, inside the window: its first 30-day figure is on {day(opened + 30 * 86400)}.
      </>
    );
  else if (p.liquidityChanged)
    feesYours = <>Its liquidity changed inside the window, so its 30-day fees wait for the DEX lane&apos;s events.</>;
  else if (p.fees30d !== null)
    feesYours = (
      <>
        Earned {num(p.fees30d)} {Q} in fees in the last 30 days.
      </>
    );
  else feesYours = null;
  const fees: Line = {
    key: "fees",
    label: "Fees",
    yours: (
      <>
        {feesYours}{" "}
        {p.uncollected > 0 && (
          <>
            Not yet collected: {num(p.uncollected)} {Q}.
          </>
        )}
      </>
    ),
    pool:
      p.pool30d.fullRangeFees !== null ? (
        <>
          A full-range position in this pool earned {pct(p.pool30d.fullRangeFees, 3).replace("+", "")} of its value in
          fees in 30 days.
        </>
      ) : (
        <>The pool is younger than 30 days.</>
      ),
    receipt: [
      p.version === "v3"
        ? "feeGrowthGlobal0/1X128 and ticks(lower/upper).feeGrowthOutside"
        : "getFeeGrowthInside, getFeeGrowthGlobals",
      `at ${blocks}`,
      "liquidity × the change, valued at the pool's price now",
    ],
    source: "state",
  };

  // Against holding
  let ahYours: React.ReactNode = null;
  if (opened) ahYours = <>Opened inside the window.</>;
  else if (p.liquidityChanged) ahYours = <>Its liquidity changed inside the window; this waits for the DEX lane.</>;
  else if (p.againstHolding !== null && p.againstHoldingWithFees !== null)
    ahYours = (
      <>
        {pct(p.againstHolding)} against holding the tokens it held on {day(since)}, both valued at today&apos;s price;{" "}
        {pct(p.againstHoldingWithFees)} with the fees it earned.
      </>
    );
  const sd = p.sinceDeposit;
  const against: Line = {
    key: "against",
    label: "Against holding",
    yours: ahYours,
    pool: sd ? (
      <>
        Since its first deposit on {p.firstAt ? day(p.firstAt) : "–"}: {num(sd.deposited.base)} {B} and{" "}
        {num(sd.deposited.quote)} {Q} put in, {num(sd.holdValue)} {Q} if held. The position, its unpaid fees and all it
        has paid out come to {num(sd.nowWithEverything)} {Q}: {pct(sd.nowWithEverything / sd.holdValue - 1)}.
      </>
    ) : p.version === "v4" ? (
      <>Since its first deposit: waits for the DEX lane (V4 does not index a position&apos;s own deposits).</>
    ) : null,
    receipt: [
      `amounts from liquidity and sqrtPriceX96 at ${blocks}`,
      ...(sd
        ? [
            `IncreaseLiquidity ×${sd.events.increase}, DecreaseLiquidity ×${sd.events.decrease}, Collect ×${sd.events.collect} for token ${p.id}`,
          ]
        : []),
    ],
    source: p.version === "v3" ? "logs" : "state",
  };

  // Size
  const b = p.pool30d.balances;
  const b30 = p.pool30d.balancesThen;
  const size: Line = {
    key: "size",
    label: "Size",
    yours: p.inRange ? (
      <>
        {p.shareOfActive >= 0.0001 ? pct(p.shareOfActive, 2).replace("+", "") : "Under 0.01%"} of the liquidity in range
        now.
      </>
    ) : (
      <>None of the liquidity in range now: the position is out of range.</>
    ),
    pool: b ? (
      <>
        The pool holds {num(b.base)} {B} and {num(b.quote)} {Q}
        {b30 && (
          <>
            ; 30 days ago {num(b30.base)} {B} and {num(b30.quote)} {Q}
          </>
        )}
        .
      </>
    ) : (
      <>The pool&apos;s balances wait for the DEX lane: V4 keeps every pool in one contract.</>
    ),
    receipt: [
      p.version === "v3"
        ? `${B} and ${Q} balanceOf(${short(p.pool)}), pool.liquidity()`
        : "StateView.getLiquidity (in range only)",
      `at ${blocks}`,
    ],
    source: p.version === "v3" ? "state" : "lane",
  };

  // Withdrawals
  const removeHooks = p.hookPermissions.filter((f) => REMOVE_FLAGS.has(f));
  const withdrawals: Line = {
    key: "withdrawals",
    label: "Withdrawals",
    yours: !p.hooks ? (
      <>Can be withdrawn at any block. The pool has no pause and no hook.</>
    ) : removeHooks.length ? (
      <>
        The pool&apos;s hook {short(p.hooks)} runs on every withdrawal ({removeHooks.join(", ")}) and can block it or
        take from it.
      </>
    ) : (
      <>
        Can be withdrawn at any block. The pool&apos;s hook {short(p.hooks)} runs on {p.hookPermissions.join(", ")}, and
        has no permission on withdrawals.
      </>
    ),
    pool: p.hasSubscriber ? <>A subscriber contract is notified of the position&apos;s changes.</> : null,
    receipt: p.hooks
      ? ["the hook address's permission bits (v4-core Hooks.sol)"]
      : [p.version === "v3" ? "V3 pools have no pause or hook" : "PoolKey.hooks is zero"],
    source: "state",
  };

  // Steward
  const steward: Line = {
    key: "steward",
    label: "Steward",
    yours: null,
    pool: (
      <>
        {p.dynamicFee && p.hooks
          ? `The hook ${short(p.hooks)} sets this pool's fee, ${p.lpFeePct}% now. `
          : `Nobody can change this pool's ${p.feeLabel} fee. `}
        {p.protocolCut}
      </>
    ),
    receipt: [
      p.version === "v3" ? "slot0().feeProtocol" : "getSlot0().protocolFee, lpFee; PoolKey.fee",
      `at block ${p.block.now.toLocaleString("en-US")}`,
    ],
    source: "state",
  };

  return p.inRange || p.range.full
    ? [size, fees, range, withdrawals, against, steward]
    : [range, size, fees, withdrawals, against, steward];
}
