// Aave V3 plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause states the amounts this event moved and the account mechanics it
// exhibits. It states no resulting balance: the replayed principal the rows
// carry leaves out interest, and the exact balance before and after the event is
// the open card's to show (rails-ops TO-DO-ui-jobs §19), read when the card
// opens, which prose rendered with the row cannot wait for.
//
// Figures render through <Prov>: an `echo` of the primary receipt the card
// already carries — deltas → the header's ChainTruthRow, and the liquidation
// legs / premium / at-block prices → the detail's forensics block. Aave V3 has no same-tx sibling case and no
// cross-scope figure, so every traced figure here is an echo (the highlight
// rule §5.6: bold only a figure the reader can also see on the card's chrome).
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Aave V3 cannot fill per event, each a data fact of its stream:
//   • §5.1 (risk consequence with figures) on ordinary events: the indexed
//     stream carries no per-event health factor — only the liquidation embeds
//     the account's fall below 1.0 — so a health-factor before→after at event
//     time cannot be shown in prose. The Ethereum card's open detail shows it.
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

/** The third-party-actor clause — the prose half of the pink chip the header
 *  renders when the owner was neither the signer nor the Pool's caller.
 *
 *  `txFrom`/`poolCaller` ship exactly where the two-fact verdict is decidable
 *  (see AaveV3Context), so their presence IS the verdict — which is what lets
 *  this stay a pure function with no owner in hand.
 *
 *  The authority is protocol-specific and must not be borrowed from a sibling
 *  explorer. Aave V3 splits it by direction: `supply(asset, amount, onBehalfOf,
 *  referralCode)` and `repay(..., onBehalfOf)` accept any `onBehalfOf` with no
 *  consent checked, while borrowing for someone else requires that they first
 *  called `approveDelegation` on the variable debt token.
 *
 *  ⚠️ A third-party WITHDRAW is not expressible on V3 at all: `withdraw` burns
 *  msg.sender's own aTokens and `to` is only a recipient, so the chip can reach
 *  supply, repay and borrow rows and no others. That is why there is no
 *  withdraw branch here rather than an oversight. */
function delegatedActorMechanic(ctx: AaveV3Context, brand: string): ClauseInput {
  if (!ctx.txFrom || !ctx.poolCaller) return null;
  if (ctx.eventType === "borrow")
    return clause(
      <>
        Another account executed this on the owner&rsquo;s behalf. {brand} checks credit delegation on chain before
        letting anyone borrow against collateral they don&rsquo;t own, so the owner had approved that account on the
        debt token beforehand — for a capped amount they set.
      </>,
    );
  if (ctx.eventType === "supply" || ctx.eventType === "repay")
    return clause(
      <>
        Another account executed this on the owner&rsquo;s behalf. {brand} asks for no permission to add to a position —
        supplying and repaying can be done by anyone, for anyone — so this needed nothing from the owner.
      </>,
    );
  return null;
}

export function aaveV3EventSlots(ctx: AaveV3Context, coords: V3Coords): EventProseSlots {
  const slots = aaveV3EventSlotsBase(ctx, coords);
  const delegated = delegatedActorMechanic(ctx, v3Brand(v3Protocol(coords.pool)));
  if (!delegated) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), delegated] };
}

function aaveV3EventSlotsBase(ctx: AaveV3Context, coords: V3Coords): EventProseSlots {
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
      return {
        happened: [
          clause(
            <>
              Supplied {deltaFig()} to {protocol}.
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              The supplied {sym} earns {brandOwns} variable supply rate, and any interest accrues into the balance
              itself so the supplied amount grows in place.
            </>,
          ),
          clause(<>Once enabled as collateral, the supplied {sym} also backs the account&rsquo;s borrowing.</>),
        ],
      };
    }

    case "withdraw": {
      return {
        happened: [
          clause(
            <>
              Withdrew {deltaFig()} from {protocol}.
            </>,
          ),
        ],
        meansNow: [],
      };
    }

    case "borrow": {
      const happened = <>Borrowed {deltaFig()} against the account&rsquo;s collateral.</>;
      const ratePct = ctx.borrowRate ? (Number(ctx.borrowRate) / 1e27) * 100 : null;
      return {
        happened: [clause(happened)],
        meansNow: [
          ratePct != null && ratePct > 0
            ? clause(<>The variable borrow rate at the time was {ratePct.toFixed(2)}% a year.</>)
            : null,
        ],
      };
    }

    case "repay": {
      const usingATokens = ctx.useATokens ? " using aTokens" : "";
      return {
        happened: [
          clause(
            <>
              Repaid {deltaFig()} of the account&rsquo;s debt{usingATokens}.
            </>,
          ),
        ],
        meansNow: [],
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
      return liquidationSlots(ctx, coords, sym);

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

function liquidationSlots(ctx: AaveV3Context, coords: V3Coords, debtSym: string): EventProseSlots {
  const collSym = ctx.collateralSymbol ?? "the collateral";

  // Seized / cleared amounts echo the header's liquidation deltas (value keyed
  // to the header's signed source — seized from liquidatedCollateralAmount,
  // cleared from debtToCover, both rendered negative there).
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
      {formatNumber(Number(ctx.liquidatedCollateralAmount))} {collSym}
    </Fig>
  );
  const clearedFig = (
    <Fig
      info={debtRepaidProv(debtSym, coords, ctx.raw?.debtToCover, ctx.origin?.debtToCover)}
      value={chainTruthDeltaValue(-Number(ctx.debtToCover), false)}
      symbol={debtSym}
    >
      {formatNumber(Number(ctx.debtToCover))} {debtSym}
    </Fig>
  );

  const happened = (
    <>
      The account&rsquo;s health factor fell below 1.0, so a liquidator repaid {clearedFig} of its debt and seized{" "}
      {seizedFig} of collateral in return.
    </>
  );

  return {
    happened: [clause(happened)],
    meansNow: [
      valuedSentences(ctx, coords, collSym, debtSym),
      ctx.liquidator ? liquidatorClause(ctx.liquidator, coords.chainId ?? MAINNET_CHAIN_ID) : null,
    ],
  };
}

/** The valued pair — the market's own oracle prices at the event's block value
 *  both legs, and their ratio is the liquidator's realized premium. Echoes the
 *  detail's forensics block. Drops WHOLE when either leg is unpriced (the
 *  never-empty floor). Two sentences: the two valued legs, then the premium. */
function valuedSentences(ctx: AaveV3Context, coords: V3Coords, collSym: string, debtSym: string): ClauseInput {
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

  return clause(
    <>
      At the market&rsquo;s own prices at the time, the seized collateral was worth {seizedUsdFig} against{" "}
      {clearedUsdFig} of debt cleared. That is a {premiumFig} premium to the liquidator.
    </>,
  );
}

const liquidatorClause = (liquidator: string, chainId: ChainId): ClauseInput =>
  clause(
    <>
      Cleared by a third-party liquidator (typically an automated bot):{" "}
      <a
        href={explorerUrl(chainId, "address", liquidator)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {liquidator.slice(0, 6)}…{liquidator.slice(-4)}
      </a>
      .
    </>,
  );

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations — the after-balance rides along on operate events). */
export function aaveV3ExplainerTeaser(ctx: AaveV3Context, coords: V3Coords): ReactNode | null {
  return splitLead(eventClauses(aaveV3EventSlots(ctx, coords))).lead;
}
