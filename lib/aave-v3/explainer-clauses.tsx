// Aave V3 plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause states the amounts this event moved and the account mechanics it
// exhibits. The balance reconciliation (previous + interest ± amount = after)
// reads the row's chain-valued before/after (decision 0033), unbolded: the
// open card's position block states those balances with their receipts.
// The one same-transaction case is a liquidation and its protocol fee
// (liquidation-fee.ts); each names the other.
//
// Figures render through <Prov>: an `echo` of the primary receipt the card
// already carries — deltas → the header's ChainTruthRow, and the liquidation
// legs / premium / at-block prices → the detail's forensics block (the
// highlight rule §5.6: bold only a figure the reader can also see on the
// card's chrome).
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Aave V3 cannot fill per event, each a data fact of its stream:
//   • §5.1 (risk consequence with figures): the indexed stream carries no
//     per-event health factor. On Ethereum the prose reads the position state
//     the open card reads (decision 0025) and states the move, and how the
//     factor moved since the previous event; Base and Seamless carry none.
//   • §5.2 (mechanic-why on fees): an ordinary supply/withdraw/borrow/repay
//     charges no per-event fee. The only fee-like figure is the liquidation
//     bonus, priced by the valued sentence (§5.4).
//   • §5.4 beyond liquidations: no per-event USD is carried for ordinary events
//     beyond the after-balance chip, so no other valued net-outcome figure
//     exists to derive in prose.
// Filled: risk mechanics (account-wide health factor) as meansNow clauses; the
// valued premium (§5.4) on liquidations; the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import {
  assetsDeltaProv,
  transferDeltaProv,
  seizedCollateralProv,
  debtRepaidProv,
  writtenOffDebtProv,
  liqLegUsdProv,
  liqPremiumProv,
  swapLegNet,
  swapLegProv,
  swapLegSign,
  type V3Coords,
} from "@/lib/aave-v3/event-provenance";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import { explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { v3Brand, v3Possessive, v3Protocol, type V3Protocol } from "./protocol-name";
import { AAVE_V3_SWAP_LABELS } from "./swap-kinds";
import { externalActor } from "@/lib/shared/external-actor";
import { hfLabelV4, fmtUnitPrice } from "@/lib/aave-v4/format";
import { baseToUsd, humanOf, wadToNumber, type AaveV3PositionState } from "./position-state";
import { feeLiquidation, fmt2, liquidationBonus, liquidationFee, pctPlain } from "./liquidation-fee";
import type { AaveV3TimelineEvent } from "./event-neighbours";

/** The signed reserve delta this event moved — supply/borrow/transfer_in raise
 *  their side (+), withdraw/repay/transfer_out lower it (−). Mirrors the
 *  header's signedAmount so the delta echo's value key matches the header
 *  receipt byte-for-byte. */
const signedDelta = (ctx: AaveV3Context): number => {
  const mag = Math.abs(Number(ctx.amount ?? "0")) || 0;
  const neg =
    ctx.eventType === "withdraw" ||
    ctx.eventType === "repay" ||
    ctx.eventType === "transfer_out" ||
    ctx.eventType === "bad_debt_written_off";
  return (neg ? -1 : 1) * mag;
};

// ── figure rendering ─────────────────────────────────────────────────────────

function Fig({
  info,
  value,
  symbol,
  children,
}: {
  info: Provenance;
  value?: string;
  symbol?: string;
  children: ReactNode;
}) {
  return (
    <Prov echo info={info} value={value} symbol={symbol}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

const fmtAmt = (s: string | undefined): string => formatNumber(Math.abs(Number(s ?? "0")));

// ── the variant table ────────────────────────────────────────────────────────

/** The third-party line: who sent this event, when it was not the owner.
 *
 *  Keyed on the same verdict the header's pink chip uses (externalActor): the
 *  owner is neither the transaction's signer nor the Pool's caller. The index
 *  ships `txFrom` / `poolCaller` on owner-sent rows too, so their presence is
 *  not the condition. One line naming the sender; why a supply or repay needs
 *  no consent and a borrow needs credit delegation is T4 (the modals).
 *
 *  A third-party WITHDRAW is not expressible on V3 (`withdraw` burns
 *  msg.sender's own aTokens), so the line reaches supply, repay and borrow. */
function delegatedActorLine(ctx: AaveV3Context, owner: string | undefined, chainId: ChainId): ClauseInput {
  if (!owner) return null;
  if (ctx.eventType !== "supply" && ctx.eventType !== "repay" && ctx.eventType !== "borrow") return null;
  const actor = externalActor(ctx, owner);
  if (!actor) return null;
  return clause(
    ctx.eventType === "borrow" ? (
      <>Sent by {addressLink(actor, chainId)}, an account the owner had allowed to borrow on its behalf.</>
    ) : (
      <>Sent by {addressLink(actor, chainId)}, another account acting for the owner.</>
    ),
  );
}

const addressLink = (address: string, chainId: ChainId): ReactNode => (
  <a
    href={explorerUrl(chainId, "address", address)}
    target="_blank"
    rel="noopener noreferrer"
    className="text-blue-500 hover:underline"
    onClick={(e) => e.stopPropagation()}
  >
    {address.slice(0, 6)}…{address.slice(-4)}
  </a>
);

// ── the position state around the event (Ethereum) ──────────────────────────

/** What the prose reads from the position state the open card reads
 *  (decision 0025), around this transaction and the previous one. */
export interface V3StateRead {
  /** Health factor either side of the transaction; null where there is no debt. */
  hfBefore: number | null;
  hfAfter: number | null;
  /** The event's own reserve's collateral flag either side. */
  collateral?: { before: boolean; after: boolean };
  /** The health factor after the previous transaction, and what moved it since. */
  prevHf?: number | null;
  priceMove?: { symbol: string; from: number; to: number };
  ltMove?: { from: number; to: number };
  /** Account totals before the transaction, in USD. */
  debtUsdBefore?: number;
  /** Balances after the transaction, per reserve and side. */
  left?: { symbol: string; side: "supply" | "debt"; amount: number }[];
}

export function v3StateRead(
  ctx: AaveV3Context,
  here: AaveV3PositionState | undefined,
  prev: AaveV3PositionState | undefined,
): V3StateRead | undefined {
  if (!here?.account) return undefined;
  const hfOf = (wad: string | null): number | null => (wad == null ? null : wadToNumber(wad));
  const reserve = (ctx.eventType === "liquidation" ? ctx.collateralAsset : ctx.reserve)?.toLowerCase();
  const own = here.reserves.find((r) => r.reserve.toLowerCase() === reserve);
  const out: V3StateRead = {
    hfBefore: hfOf(here.account.before.healthFactor),
    hfAfter: hfOf(here.account.after.healthFactor),
    collateral: own?.collateral ?? undefined,
    debtUsdBefore: baseToUsd(here.account.before.totalDebtBase),
    left: here.reserves.flatMap((r) => {
      const dec = r.decimals;
      if (dec == null) return [];
      return (["supply", "debt"] as const)
        .map((side) => ({
          symbol: r.symbol ?? r.reserve.slice(0, 6),
          side,
          amount: Number(humanOf((side === "supply" ? r.supply : r.debt).after, dec)),
        }))
        .filter((l) => l.amount > 0);
    }),
  };
  if (prev?.account && prev.txHash.toLowerCase() !== here.txHash.toLowerCase()) {
    out.prevHf = hfOf(prev.account.after.healthFactor);
    // The collateral whose price moved most between the two reads.
    let best: V3StateRead["priceMove"];
    for (const r of here.reserves) {
      if (!r.collateral?.before || r.priceBase == null) continue;
      const p = prev.reserves.find((q) => q.reserve === r.reserve);
      if (!p?.priceBase) continue;
      const from = Number(p.priceBase) / 1e8;
      const to = Number(r.priceBase) / 1e8;
      if (!best || Math.abs(to / from - 1) > Math.abs(best.to / best.from - 1))
        best = { symbol: r.symbol ?? "the collateral", from, to };
    }
    if (best && Math.abs(best.to / best.from - 1) >= 0.005) out.priceMove = best;
    const ltFrom = prev.account.after.liquidationThresholdBps;
    const ltTo = here.account.before.liquidationThresholdBps;
    if (ltFrom > 0 && ltTo > 0 && ltFrom !== ltTo) out.ltMove = { from: ltFrom / 100, to: ltTo / 100 };
  }
  return out;
}

/** The health factor as the open card shows it: a third decimal below 1.1,
 *  rounded down under 1 so a liquidatable account never reads 1.000. */
const hfText = (hf: number): string => hfLabelV4(hf);

/** One sentence on how the health factor moved in this transaction. */
function healthFactorLine(state: V3StateRead | undefined, withdraw = false): ClauseInput {
  if (!state) return null;
  const { hfBefore: b, hfAfter: a } = state;
  if (a == null) {
    return b == null
      ? null
      : clause(<>With no debt left, the account has no health factor and cannot be liquidated.</>);
  }
  const tail = a < 1.1 ? <>, close to the liquidation line at 1</> : null;
  const allowed = withdraw ? (
    <>. The Pool allows a withdrawal only while the health factor stays at or above 1</>
  ) : null;
  if (b == null)
    return clause(
      <>
        With this first debt the health factor is {hfText(a)}
        {tail}
        {allowed}.
      </>,
    );
  const d = a - b;
  const verb = Math.abs(d) < 0.005 ? null : d > 0 ? "rose" : "fell";
  return clause(
    verb ? (
      <>
        The health factor {verb} from {hfText(b)} to {hfText(a)}
        {tail}
        {allowed}.
      </>
    ) : (
      <>
        The health factor stayed at {hfText(a)}
        {tail}
        {allowed}.
      </>
    ),
  );
}

/** How the health factor moved between the previous event and this one, with
 *  no event: a price, a governance change to the threshold, or interest. */
function priorMoveLine(state: V3StateRead | undefined): ClauseInput {
  if (!state || state.prevHf == null || state.hfBefore == null) return null;
  const from = state.prevHf;
  const to = state.hfBefore;
  if (Math.abs(to - from) < 0.01) return null;
  const pm = state.priceMove;
  const causes: ReactNode[] = [];
  if (pm)
    causes.push(
      <>
        {pm.symbol}&rsquo;s price {pm.to > pm.from ? "rose" : "fell"} from {fmtUnitPrice(pm.from)} to{" "}
        {fmtUnitPrice(pm.to)}
      </>,
    );
  if (state.ltMove)
    causes.push(
      <>
        Aave governance {state.ltMove.to > state.ltMove.from ? "raised" : "lowered"} the liquidation threshold from{" "}
        {state.ltMove.from}% to {state.ltMove.to}%
      </>,
    );
  const why =
    causes.length > 0 ? (
      <>
        {" "}
        as{" "}
        {causes.map((c, i) => (
          <span key={i}>
            {i > 0 ? " and " : null}
            {c}
          </span>
        ))}
      </>
    ) : to < from ? (
      <> as interest accrued on the debt</>
    ) : null;
  return clause(
    <>
      Since the previous event the health factor had moved from {hfText(from)} to {hfText(to)} with no action on the
      account{why}.
    </>,
  );
}

// ── reconciliation ───────────────────────────────────────────────────────────

/** Figures of one sum at one precision: the lead sentence's (three decimals,
 *  trailing zeros dropped), or two where the liquidation's legs state two. */
const recFmt = (n: number, decimals: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals === 2 ? 2 : 0, maximumFractionDigits: decimals });

/** The balance reconciled, Liquity-style: the balance at the previous event,
 *  the interest since, the amount this event moved, the balance after. The
 *  previous balance is stated as the after less the other terms, each at the
 *  same precision, so the sum reads exactly. */
function reconcileLine(
  label: string,
  sym: string,
  terms: { after: number; interest?: number; moves: { amount: number; sign: 1 | -1; what: string }[]; start?: string },
  d = 3,
): ClauseInput {
  const { after, moves } = terms;
  const interest = terms.interest ?? 0;
  const r = (n: number) => Number(n.toFixed(d));
  const prev = r(r(after) - r(interest) - moves.reduce((s, m) => s + m.sign * r(m.amount), 0));
  if (prev < -1e-9) return null;
  return clause(
    <>
      {label}: {recFmt(prev, d)} {terms.start ?? "at the previous event"}
      {r(interest) > 0 ? <> + {recFmt(interest, d)} interest since</> : null}
      {moves.map((m, i) => (
        <span key={i}>
          {" "}
          {m.sign > 0 ? "+" : "−"} {recFmt(m.amount, d)} {m.what}
        </span>
      ))}{" "}
      = {recFmt(after, d)} {sym}.
    </>,
  );
}

const numOf = (s: string | undefined): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** The event's own balance line: supply for supply/withdraw, debt for borrow/repay. */
function eventReconcile(ctx: AaveV3Context, sym: string): ClauseInput {
  const supplySide = ctx.eventType === "supply" || ctx.eventType === "withdraw";
  const before = numOf(supplySide ? ctx.supplyBefore : ctx.debtBefore);
  const after = numOf(supplySide ? ctx.supplyAfter : ctx.debtAfter);
  const amount = Math.abs(numOf(ctx.amount) ?? 0);
  if (after == null || amount === 0) return null;
  const interest = numOf(supplySide ? ctx.supplyInterestSincePrevious : ctx.debtInterestSincePrevious) ?? 0;
  const verb = { supply: "supplied", withdraw: "withdrawn", borrow: "borrowed", repay: "repaid" }[
    ctx.eventType as "supply" | "withdraw" | "borrow" | "repay"
  ];
  const sign: 1 | -1 = ctx.eventType === "supply" || ctx.eventType === "borrow" ? 1 : -1;
  // A first supply or borrow of the reserve: nothing before to reconcile.
  if (before != null && before <= 0) {
    return clause(
      supplySide ? (
        <>
          {sym} supplied is now {recFmt(after, 3)} {sym}.
        </>
      ) : (
        <>
          {sym} debt is now {recFmt(after, 3)} {sym}.
        </>
      ),
    );
  }
  if (after <= 0 && !supplySide) return null;
  return reconcileLine(supplySide ? `${sym} supplied` : `${sym} debt`, sym, {
    after,
    interest,
    moves: [{ amount, sign, what: verb }],
  });
}

export interface V3SlotOpts {
  /** The position's owner: the third-party line keys on it. */
  owner?: string;
  /** This transaction's rows (a liquidation and its fee transfer). */
  siblings?: readonly AaveV3TimelineEvent[];
  /** The position state around this event (Ethereum only). */
  state?: V3StateRead;
}

export function aaveV3EventSlots(ctx: AaveV3Context, coords: V3Coords, opts: V3SlotOpts = {}): EventProseSlots {
  const chainId = coords.chainId ?? MAINNET_CHAIN_ID;
  const slots = aaveV3EventSlotsBase(ctx, coords, opts);
  const delegated = delegatedActorLine(ctx, opts.owner, chainId);
  if (!delegated) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), delegated] };
}

function aaveV3EventSlotsBase(ctx: AaveV3Context, coords: V3Coords, opts: V3SlotOpts): EventProseSlots {
  const state = opts.state;
  const sym = ctx.reserveSymbol ?? "the asset";
  // The protocol the Pool belongs to — "Aave V3" unless the page says otherwise
  // (Seamless). Rendered identically to the literal it replaced on Aave.
  const protocol = v3Protocol(coords.pool);
  const brandOwns = v3Possessive(v3Brand(protocol));
  // Transfers ride the supply axis (aToken moves; debt tokens are
  // non-transferable) — they never reach deltaFig's assetsDeltaProv, but the
  // side stays truthful for any future consumer.
  const side: "supply" | "debt" =
    ctx.eventType === "supply" ||
    ctx.eventType === "withdraw" ||
    ctx.eventType === "transfer_in" ||
    ctx.eventType === "transfer_out" ||
    ctx.eventType === "swap"
      ? "supply"
      : "debt";

  // The moved amount — echoes the header's ChainTruthRow delta receipt (same
  // prov builder + coords, the signed-string helper, the reserve symbol).
  const deltaFig = () => (
    <Fig
      info={assetsDeltaProv(sym, side, coords, ctx.raw?.amount, ctx.origin?.amount)}
      value={chainTruthDeltaValue(signedDelta(ctx), false)}
      symbol={sym}
    >
      {fmtAmt(ctx.amount)} {sym}
    </Fig>
  );
  switch (ctx.eventType) {
    case "supply": {
      const coll = state?.collateral;
      const collateralLine: ClauseInput =
        coll && !coll.before && coll.after
          ? clause(
              <>
                The Pool switched {sym} on as collateral in the same transaction, as it does on a first supply of an
                asset that can back borrowing, so this {sym} backs the account&rsquo;s debt and can be seized in a
                liquidation.
              </>,
            )
          : coll?.after
            ? clause(
                <>
                  {sym} was already on as collateral, so the new {sym} backs the account&rsquo;s debt at once and can be
                  seized in a liquidation.
                </>,
              )
            : coll
              ? clause(<>{sym} is not on as collateral here, so this supply backs no borrowing.</>)
              : clause(
                  <>Once {sym} is on as collateral, the supplied amount also backs the account&rsquo;s borrowing.</>,
                );
      return {
        happened: [
          clause(
            <>
              Supplied {deltaFig()} to {protocol}.
            </>,
          ),
        ],
        changed: [eventReconcile(ctx, sym)],
        meansNow: [
          clause(<>It earns {brandOwns} variable supply rate, paid into the balance as it accrues.</>),
          collateralLine,
          healthFactorLine(state),
          priorMoveLine(state),
        ],
      };
    }

    case "withdraw": {
      return {
        happened: [
          clause(
            <>
              Withdrew {deltaFig()} from {protocol} to the wallet.
            </>,
          ),
        ],
        changed: [eventReconcile(ctx, sym)],
        meansNow: [healthFactorLine(state, true), priorMoveLine(state)],
      };
    }

    case "borrow": {
      const happened = <>Borrowed {deltaFig()} against the account&rsquo;s collateral.</>;
      const ratePct = ctx.borrowRate ? (Number(ctx.borrowRate) / 1e27) * 100 : null;
      return {
        happened: [clause(happened)],
        changed: [eventReconcile(ctx, sym)],
        meansNow: [
          ratePct != null && ratePct > 0
            ? clause(<>The variable borrow rate at the time was {ratePct.toFixed(2)}% a year.</>)
            : null,
          healthFactorLine(state),
          priorMoveLine(state),
        ],
      };
    }

    case "repay": {
      const usingATokens = ctx.useATokens ? ` using supplied ${sym}` : "";
      const cleared = (numOf(ctx.debtAfter) ?? 1) <= 0;
      return {
        happened: [
          clause(
            <>
              Repaid {deltaFig()} of the account&rsquo;s debt{usingATokens}
              {cleared ? <>, clearing its {sym} debt</> : null}.
            </>,
          ),
        ],
        changed: [eventReconcile(ctx, sym)],
        meansNow: [healthFactorLine(state), priorMoveLine(state)],
      };
    }

    case "swap": {
      const s = ctx.swap;
      if (!s) return { happened: [], meansNow: [] };
      const rSym = s.receivedSymbol ?? "the other asset";
      const given = Math.abs(Number(ctx.amount ?? "0")) || 0;
      const received = Math.abs(Number(s.receivedAmount ?? "0")) || 0;
      const givenFig = (
        <Fig
          info={swapLegProv(
            sym,
            s.givenAction,
            coords,
            ctx.raw?.amount,
            ctx.origin?.amount,
            s.kind,
            swapLegNet(s, "given"),
            s,
          )}
          value={chainTruthDeltaValue(swapLegSign(s.givenAction) * given, false)}
          symbol={sym}
        >
          {fmtAmt(ctx.amount)} {sym}
        </Fig>
      );
      const receivedFig = (
        <Fig
          info={swapLegProv(
            rSym,
            s.receivedAction,
            coords,
            s.raw.receivedAmount,
            s.receivedOrigin,
            s.kind,
            swapLegNet(s, "received"),
            s,
          )}
          value={chainTruthDeltaValue(swapLegSign(s.receivedAction, s.kind) * received, false)}
          symbol={rSym}
        >
          {fmtAmt(s.receivedAmount)} {rSym}
        </Fig>
      );
      const adapter = s.route === "cow_adapter";
      const paraswap = s.route === "paraswap";
      const through = paraswap ? "made through ParaSwap" : "settled through CoW Protocol";
      const paired = clause(
        paraswap ? (
          <>The rows are paired by the ParaSwap adapter that made every one of them, not by sharing a transaction.</>
        ) : (
          <>The two legs are paired by the settlement&rsquo;s Trade log, not by sharing a transaction.</>
        ),
      );
      // What a ParaSwap adapter returned from the part of the swap it did not
      // use (server mig 248); the card nets it into its leg.
      const back = s.events?.find((e) => e.leftover);
      const backFig = back ? (
        <Fig
          info={assetsDeltaProv(
            back.symbol ?? sym,
            back.action === "supply" ? "supply" : "debt",
            coords,
            back.raw,
            back.origin,
          )}
          value={fmtAmt(back.amount)}
          symbol={back.symbol}
        >
          {fmtAmt(back.amount)} {back.symbol}
        </Fig>
      ) : null;

      if (s.kind === "debt_swap")
        return {
          happened: [
            clause(
              <>
                Repaid {givenFig} of {sym} debt and borrowed {receivedFig} of {rSym} in a debt swap {through}.
              </>,
            ),
          ],
          meansNow: [
            clause(
              <>
                The debt moved from {sym} to {rSym}: {rSym} borrowed against this position paid for the {sym} that
                repaid its old debt.
              </>,
            ),
            adapter
              ? clause(
                  <>
                    The order belonged to a one-order contract the Aave app created, which borrowed the {rSym} on this
                    position&rsquo;s behalf and repaid the {sym} debt with what it bought, in the same transaction.
                  </>,
                )
              : null,
            paraswap
              ? clause(
                  <>
                    ParaSwap&rsquo;s debt swap adapter borrowed the {rSym} on this position&rsquo;s behalf, swapped it
                    through ParaSwap and repaid the {sym} debt, in the same transaction.
                    {backFig ? (
                      <>
                        {" "}
                        It repaid {backFig} at once, the part the swap did not use, so the figure is the {rSym} that
                        stays borrowed.
                      </>
                    ) : null}
                  </>,
                )
              : null,
            paired,
          ],
        };

      if (s.kind === "repay_with_collateral")
        return {
          happened: [
            clause(
              <>
                Repaid {receivedFig} of {rSym} debt with {givenFig} of supplied {sym} in a repay with collateral{" "}
                {through}.
              </>,
            ),
          ],
          meansNow: [
            clause(
              <>
                The collateral paid the debt: the {sym} was sold for {rSym} and the debt repaid in one transaction.
              </>,
            ),
            adapter
              ? clause(
                  <>
                    The order belonged to a one-order contract the Aave app created, which took the {sym} aTokens,
                    withdrew and sold them, and repaid the {rSym} debt on this position&rsquo;s behalf.
                  </>,
                )
              : null,
            paraswap
              ? clause(
                  <>
                    ParaSwap&rsquo;s repay adapter took the {sym} aTokens, withdrew and swapped them through ParaSwap,
                    and repaid the {rSym} debt on this position&rsquo;s behalf.
                    {backFig ? (
                      <>
                        {" "}
                        It supplied {backFig} back at once, the part the swap did not use, so the figure is the {sym}{" "}
                        that left the position.
                      </>
                    ) : null}
                  </>,
                )
              : null,
            paired,
          ],
        };

      if (s.kind === "supply_from_swap")
        return {
          happened: [
            clause(
              <>
                Sold {receivedFig} for {givenFig} of supplied {sym} in a supply from a swap settled through CoW
                Protocol.
              </>,
            ),
          ],
          meansNow: [
            clause(
              <>
                The {sym} entered the position as aTokens: this account signed an order selling {rSym} from its wallet,
                and CoW Protocol&rsquo;s settlement sent the {sym} aTokens it bought to this position. The {rSym} came
                from the wallet, not from the position.
              </>,
            ),
            clause(<>The purchase is read from the settlement&rsquo;s Trade log, which this account owns.</>),
          ],
        };

      if (s.kind === "withdraw_and_swap" && paraswap)
        return {
          happened: [
            clause(
              <>
                Withdrew {givenFig} of supplied {sym} and swapped it for {receivedFig} in a withdraw and swap {through}.
              </>,
            ),
          ],
          meansNow: [
            clause(
              <>
                The {sym} left the position: ParaSwap&rsquo;s withdraw swap adapter took the aTokens, withdrew the {sym}{" "}
                from the Pool and swapped it through ParaSwap. The {rSym} went to this account&rsquo;s wallet, not into
                the position.
              </>,
            ),
            clause(<>The swap is read from the adapter&rsquo;s Swapped log, in the same transaction.</>),
          ],
        };

      if (s.kind === "withdraw_and_swap")
        return {
          happened: [
            clause(
              <>
                Withdrew {givenFig} of supplied {sym} and sold it for {receivedFig} in a withdraw and swap settled
                through CoW Protocol.
              </>,
            ),
          ],
          meansNow: [
            clause(
              <>
                The {sym} left the position: CoW Protocol&rsquo;s settlement took the aTokens under the order this
                account signed, withdrew the {sym} from the Pool and sold it. The {rSym} went to the order&rsquo;s
                receiver, not into the position.
              </>,
            ),
            clause(<>The sale is read from the settlement&rsquo;s Trade log, which this account owns.</>),
          ],
        };

      const kindName = AAVE_V3_SWAP_LABELS[s.kind].toLowerCase();
      return {
        happened: [
          clause(
            <>
              Swapped {givenFig} of supplied {sym} for {receivedFig} of supplied {rSym} in a {kindName} {through}.
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              Both assets stayed supplied: the {paraswap ? "swap" : "order"} moved this position from one reserve to
              another without the tokens reaching the wallet.
            </>,
          ),
          paraswap
            ? clause(
                <>
                  ParaSwap&rsquo;s swap adapter took the {sym} aTokens, withdrew and swapped them through ParaSwap, and
                  supplied the {rSym} back to this position in the same transaction.
                </>,
              )
            : adapter
              ? clause(
                  <>
                    The order belonged to a one-order contract the Aave app created, which took the {sym} aTokens and
                    supplied the {rSym} it bought back to this position in the same transaction.
                  </>,
                )
              : clause(
                  <>
                    The owner signed the order, and the settlement contract took the {sym} aTokens and returned {rSym}{" "}
                    aTokens in the same settlement.
                  </>,
                ),
          paired,
        ],
      };
    }

    case "transfer_in": {
      const transferFig = (
        <Fig
          info={transferDeltaProv(sym, "in", coords)}
          value={chainTruthDeltaValue(signedDelta(ctx), false)}
          symbol={sym}
        >
          {fmtAmt(ctx.amount)} {sym}
        </Fig>
      );
      const named = getProtocolContract(ctx.counterparty, coords.chainId ?? MAINNET_CHAIN_ID);
      const sender = named?.name ?? "another account";
      const happened = (
        <>
          Received {transferFig} of supplied {sym} from {sender} as an aToken transfer.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          named ? clause(<>The sender is {named.role}.</>) : null,
          clause(
            <>
              This is a position move between accounts, not a fresh supply: the aTokens changed hands inside the Pool,
              so no new value entered the protocol.
            </>,
          ),
          clause(
            <>
              The received {sym} earns the supply rate like any supplied balance, and once enabled as collateral it
              backs the account&rsquo;s borrowing.
            </>,
          ),
        ],
      };
    }

    case "transfer_out": {
      const feeOf = feeLiquidation(ctx, opts.siblings, coords.chainId ?? MAINNET_CHAIN_ID);
      if (feeOf) return feeSlots(ctx, coords, sym, feeOf);
      const transferFig = (
        <Fig
          info={transferDeltaProv(sym, "out", coords)}
          value={chainTruthDeltaValue(signedDelta(ctx), false)}
          symbol={sym}
        >
          {fmtAmt(ctx.amount)} {sym}
        </Fig>
      );
      const named = getProtocolContract(ctx.counterparty, coords.chainId ?? MAINNET_CHAIN_ID);
      const recipient = named?.name ?? "another account";
      const happened = (
        <>
          Sent {transferFig} of supplied {sym} to {recipient} as an aToken transfer.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          named ? clause(<>The recipient is {named.role}.</>) : null,
          clause(
            <>
              This is a position move between accounts, not a withdrawal to a wallet: custody moved to the receiving
              account and the tokens stayed inside the Pool.
            </>,
          ),
        ],
      };
    }

    case "liquidation":
      return liquidationSlots(ctx, coords, sym, opts);

    case "bad_debt_written_off":
      return writtenOffSlots(ctx, coords, sym, protocol);

    default:
      return { happened: [] };
  }
}

/** The write-off (DeficitCreated). The log lands BEFORE the liquidation's own
 *  row in the same transaction; what is left on the reserve is the position
 *  state's to show, not this prose's. */
function writtenOffSlots(ctx: AaveV3Context, coords: V3Coords, sym: string, protocol: V3Protocol): EventProseSlots {
  const brand = v3Brand(protocol);
  const mag = Math.abs(Number(ctx.amount ?? "0")) || 0;
  // Echoes the header's written-off delta: same builder, same coords, the
  // same negative signed value.
  const offFig = (
    <Fig
      info={writtenOffDebtProv(sym, coords, ctx.raw?.amount, ctx.origin?.amount)}
      value={chainTruthDeltaValue(-mag, false)}
      symbol={sym}
    >
      {fmtAmt(ctx.amount)} {sym}
    </Fig>
  );
  const absorbed =
    protocol === "Aave V3"
      ? "Aave's Umbrella safety module and its treasury are what cover it."
      : `${brand} covers it from its own reserves.`;
  return {
    happened: [
      clause(
        <>
          A liquidation left the account with no collateral to cover {offFig} of its {sym} debt, so {brand} wrote it
          off.
        </>,
      ),
    ],
    meansNow: [
      clause(
        <>
          Nothing was repaid. The debt tokens were burned and the Pool records the amount as a deficit on the reserve.{" "}
          {absorbed}
        </>,
      ),
    ],
  };
}

function liquidationSlots(ctx: AaveV3Context, coords: V3Coords, debtSym: string, opts: V3SlotOpts): EventProseSlots {
  const collSym = ctx.collateralSymbol ?? "the collateral";
  const state = opts.state;
  const chainId = coords.chainId ?? MAINNET_CHAIN_ID;
  const fee = liquidationFee(ctx, opts.siblings, chainId);

  // Seized / cleared amounts echo the header's liquidation deltas (value keyed
  // to the header's signed source — seized from liquidatedCollateralAmount,
  // cleared from debtToCover, both rendered negative there). Two decimals, as
  // the open card's legs state them.
  const seizedFig = (
    <Fig
      info={seizedCollateralProv(
        collSym,
        coords,
        ctx.raw?.liquidatedCollateralAmount,
        ctx.origin?.liquidatedCollateralAmount,
      )}
      value={chainTruthDeltaValue(-Number(ctx.liquidatedCollateralAmount), false)}
      symbol={collSym}
    >
      {fmt2(ctx.liquidatedCollateralAmount)} {collSym}
    </Fig>
  );
  const clearedFig = (
    <Fig
      info={debtRepaidProv(debtSym, coords, ctx.raw?.debtToCover, ctx.origin?.debtToCover)}
      value={chainTruthDeltaValue(-Number(ctx.debtToCover), false)}
      symbol={debtSym}
    >
      {fmt2(ctx.debtToCover)} {debtSym}
    </Fig>
  );

  const fell =
    state?.hfBefore != null ? (
      <>The account&rsquo;s health factor had fallen to {hfText(state.hfBefore)}, below 1.0</>
    ) : (
      <>The account&rsquo;s health factor fell below 1.0</>
    );
  const happened = (
    <>
      {fell}, so a liquidator repaid {clearedFig} of its debt and took {seizedFig} of its collateral.
    </>
  );

  // The two balances reconciled. The Pool sends the fee after the seizure, and
  // the timeline's fee row sits in the same transaction.
  const feeAmt = fee ? Math.abs(Number(fee.amount)) || 0 : 0;
  const collAfter = numOf(ctx.supplyAfter);
  const debtAfter = numOf(ctx.debtAfter);
  const collLine: ClauseInput =
    collAfter != null
      ? reconcileLine(
          `${collSym} supplied`,
          collSym,
          {
            after: collAfter,
            start: "before",
            moves: [
              { amount: Number(ctx.liquidatedCollateralAmount), sign: -1, what: "to the liquidator" },
              ...(feeAmt > 0 ? [{ amount: feeAmt, sign: -1 as const, what: "to the Aave treasury" }] : []),
            ],
          },
          2,
        )
      : null;
  const debtLine: ClauseInput =
    debtAfter != null
      ? reconcileLine(
          `${debtSym} debt`,
          debtSym,
          {
            after: debtAfter,
            interest: numOf(ctx.debtInterestSincePrevious) ?? 0,
            moves: [{ amount: Number(ctx.debtToCover), sign: -1, what: "repaid by the liquidator" }],
          },
          2,
        )
      : null;

  // How much one call may take (aave-v3-origin LiquidationLogic, v3.3+):
  // half the account's total debt, or all of the debt asset when the health
  // factor is at or below 0.95 or either asset's position is under $2,000.
  const clearedUsd = ctx.debtPrice ? Number(ctx.debtToCover) * ctx.debtPrice.usd : null;
  const half =
    clearedUsd != null && state?.debtUsdBefore ? Math.abs(clearedUsd / state.debtUsdBefore - 0.5) < 0.002 : false;
  const closeFactor: ClauseInput =
    v3Protocol(coords.pool) === "Aave V3"
      ? clause(
          half && state?.debtUsdBefore ? (
            <>
              One liquidation may repay at most half of the account&rsquo;s total debt, or all of the debt asset when
              the health factor is at or below 0.95 or the position in either asset is under $2,000: the{" "}
              {formatUsdValue(clearedUsd as number)} cleared here is half of the {formatUsdValue(state.debtUsdBefore)}{" "}
              owed.
            </>
          ) : (
            <>
              One liquidation may repay at most half of the account&rsquo;s total debt, or all of the debt asset when
              the health factor is at or below 0.95 or the position in either asset is under $2,000.
            </>
          ),
        )
      : null;

  const hfMove: ClauseInput =
    state?.hfBefore != null && state.hfAfter != null
      ? clause(
          <>
            The health factor went from {hfText(state.hfBefore)} to {hfText(state.hfAfter)}: collateral counts toward it
            only up to its liquidation threshold, so taking collateral lowers it less than clearing the same value of
            debt raises it.
          </>,
        )
      : null;

  const debtLeft = state?.left?.filter((l) => l.side === "debt") ?? [];
  const otherDebt = debtLeft.filter((l) => l.symbol !== debtSym);
  const leftLine: ClauseInput =
    otherDebt.length > 0
      ? clause(
          <>
            A liquidation repays one debt asset, so the{" "}
            {otherDebt.map((l, i) => (
              <span key={l.symbol}>
                {i > 0 ? " and " : null}
                {l.symbol}
              </span>
            ))}{" "}
            debt was left as it was. The account stays open and can be liquidated again if its health factor falls below
            1.0.
          </>,
        )
      : clause(<>The account stays open and can be liquidated again if its health factor falls below 1.0.</>);

  return {
    happened: [clause(happened)],
    changed: [debtLine, collLine],
    meansNow: [
      priorMoveLine(state),
      valuedSentences(ctx, coords, collSym, debtSym, fee),
      closeFactor,
      hfMove,
      leftLine,
      ctx.liquidator
        ? clause(<>Sent by liquidator {addressLink(ctx.liquidator, chainId)}, typically an automated bot.</>)
        : null,
    ],
  };
}

/** The liquidation's protocol fee: an aToken transfer to the Aave treasury in
 *  the liquidation's transaction (lib/aave-v3/liquidation-fee.ts). */
function feeSlots(ctx: AaveV3Context, coords: V3Coords, sym: string, liq: AaveV3Context): EventProseSlots {
  const transferFig = (
    <Fig
      info={transferDeltaProv(sym, "out", coords)}
      value={chainTruthDeltaValue(signedDelta(ctx), false)}
      symbol={sym}
    >
      {fmt2(ctx.amount)} {sym}
    </Fig>
  );
  const feeAmt = Math.abs(Number(ctx.amount)) || 0;
  const after = numOf(liq.supplyAfter);
  const b = liquidationBonus(liq, ctx);
  const chainId = coords.chainId ?? MAINNET_CHAIN_ID;
  return {
    happened: [
      clause(
        <>
          Sent {transferFig} of supplied {sym} to the Aave treasury as the protocol fee of the liquidation in the same
          transaction.
        </>,
      ),
    ],
    changed: [
      after != null
        ? reconcileLine(
            `${sym} supplied`,
            sym,
            {
              after,
              start: "after the liquidator’s share",
              moves: [{ amount: feeAmt, sign: -1, what: "fee" }],
            },
            2,
          )
        : null,
    ],
    meansNow: [
      clause(
        b?.feeShare != null ? (
          <>
            Aave keeps {pctPlain(b.feeShare)} of the liquidation bonus on {sym}. The fee moved as aTokens to the Aave
            Collector {addressLink(ctx.counterparty ?? "", chainId)}, the treasury contract; nothing was withdrawn.
          </>
        ) : (
          <>
            Aave keeps a share of the liquidation bonus on {sym}. The fee moved as aTokens to the Aave Collector{" "}
            {addressLink(ctx.counterparty ?? "", chainId)}, the treasury contract; nothing was withdrawn.
          </>
        ),
      ),
    ],
  };
}

/** The valued pair — the market's own oracle prices at the event's block value
 *  both legs, and their ratio is the liquidator's realized premium. Echoes the
 *  detail's forensics block. Drops WHOLE when either leg is unpriced (the
 *  never-empty floor). Two sentences: the two valued legs, then the premium. */
function valuedSentences(
  ctx: AaveV3Context,
  coords: V3Coords,
  collSym: string,
  debtSym: string,
  fee?: AaveV3Context,
): ClauseInput {
  const cp = ctx.collateralPrice;
  const dp = ctx.debtPrice;
  const seizedAmt = Number(ctx.liquidatedCollateralAmount);
  const clearedAmt = Number(ctx.debtToCover);
  if (!cp || !dp || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || clearedAmt <= 0) return null;
  const seizedUsd = seizedAmt * cp.usd;
  const clearedUsd = clearedAmt * dp.usd;
  const premium = seizedUsd / clearedUsd - 1;
  const sign = premium >= 0 ? "+" : "−";
  const premiumPct = `${sign}${(Math.abs(premium) * 100).toFixed(2)}%`;

  const seizedUsdFig = (
    <Fig
      info={liqLegUsdProv("seized collateral", collSym, coords, {
        amount: `${ctx.liquidatedCollateralAmount} ${collSym}`,
        priceUsd: cp.usd,
      })}
      value={formatUsdValue(seizedUsd)}
      symbol={collSym}
    >
      {formatUsdValue(seizedUsd)}
    </Fig>
  );
  const clearedUsdFig = (
    <Fig
      info={liqLegUsdProv("cleared debt", debtSym, coords, {
        amount: `${ctx.debtToCover} ${debtSym}`,
        priceUsd: dp.usd,
      })}
      value={formatUsdValue(clearedUsd)}
      symbol={debtSym}
    >
      {formatUsdValue(clearedUsd)}
    </Fig>
  );
  const premiumFig = (
    <Fig
      info={liqPremiumProv(coords, { seizedUsd: formatUsdValue(seizedUsd), clearedUsd: formatUsdValue(clearedUsd) })}
      value={premiumPct}
    >
      {premiumPct}
    </Fig>
  );

  // The bonus the Pool paid on this collateral: the Base lanes carry it at the
  // block; on Ethereum it is read off the liquidation's own legs plus its fee.
  const atBlock = ctx.liquidationBonusAtBlock;
  const b = atBlock
    ? {
        bonus: (atBlock.bonusBps - 10000) / 10000,
        feeShare: atBlock.protocolFeeBps > 0 ? atBlock.protocolFeeBps / 10000 : null,
      }
    : liquidationBonus(ctx, fee);
  const feeAmt = fee ? Math.abs(Number(fee.amount)) || 0 : 0;
  const bonusLine =
    b && b.bonus > 0 ? (
      <>
        {v3Brand(v3Protocol(coords.pool))} pays a {pctPlain(b.bonus)} liquidation bonus on {collSym}: the collateral
        taken is worth {pctPlain(b.bonus)} more than the debt repaid
        {b.feeShare != null ? (
          <>
            , and {pctPlain(b.feeShare)} of that bonus
            {feeAmt > 0 ? (
              <>
                {" "}
                ({fmt2(fee?.amount)} {collSym})
              </>
            ) : null}{" "}
            goes to the Aave treasury
          </>
        ) : null}
        .{" "}
      </>
    ) : null;

  return clause(
    <>
      {bonusLine}At the block&rsquo;s oracle prices the liquidator&rsquo;s {fmt2(ctx.liquidatedCollateralAmount)}{" "}
      {collSym} was worth {seizedUsdFig} against {clearedUsdFig} of debt cleared, a {premiumFig} premium.
    </>,
  );
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations — the after-balance rides along on operate events). */
export function aaveV3ExplainerTeaser(ctx: AaveV3Context, coords: V3Coords, opts: V3SlotOpts = {}): ReactNode | null {
  return splitLead(eventClauses(aaveV3EventSlots(ctx, coords, opts))).lead;
}
