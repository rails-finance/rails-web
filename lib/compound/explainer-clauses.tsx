// Compound V3 (Comet) plain-English authoring — the variant table for the prose
// explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the account looks
// like AFTER this event), never on the event type alone. Comet's base axis is
// SIGNED: a supply lifts the running base toward lending (paying down any debt
// first); a withdraw drives it toward borrowing (a draw past the account's own
// balance IS the borrow). The event's replayed `baseAfter` / `collateralAfter`
// resolve which resulting state this is — and when they are absent (the context
// makes them optional and never replays a fallback here), the resulting-state
// clause simply drops (the never-empty floor). No after-value is computed here.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the open card — the moved delta (the header's change), the
// signed base / per-asset collateral AFTER (the detail grid), and the absorption
// forensics legs (the AbsorbDebt card's valued two-leg breakdown). A split
// component of a move (the repay portion of a supply, the borrowed portion of a
// withdraw) has NO on-card twin — the chrome shows the total delta and the
// after, not the split — so those figures stay in the muted body tone. The
// absorb_collateral leg's own usdValue is summed into the AbsorbDebt narrator's
// seized figure, not shown on this card, so it too stays muted.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Comet cannot fill, each a data fact of its pipeline:
//   • §5.1 (risk consequence with figures per event): ordinary base/collateral
//     events carry no per-event oracle price and no per-event health factor —
//     only the absorb events embed their own usdValue — so a numeric
//     ratio/health-vs-line read at event time cannot be computed. The signed
//     base before → after transition and the collateral's role in the
//     liquidation line are stated qualitatively; the numeric line is filled on
//     absorptions only, where the events carry their own valuation.
//   • §5.2 (mechanic-why on fees): Comet base and collateral operations charge
//     no per-event fee — interest accrues continuously through the market index,
//     not as a per-event charge. The reserve/cap mechanics that DO apply are
//     stated inline: the borrow collateral factor cap, the uncovered-withdrawal
//     block, and the absorption margin taken into reserves.
//   • §5.4 beyond absorptions: no per-event USD price exists for ordinary
//     events, so no other valued net-outcome figure can be derived.
// Filled: forward paths + whole-account mechanic (§5.3) on the absorb family;
// the absorption's net margin landed against the two legs (§5.4); aggregate/act
// context (§5.5) via the base decomposition and the absorb narrator /
// cross-reference pair; the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { BaseActivityEvent, CompoundContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import {
  movedDeltaProv,
  baseAfterProv,
  collateralAfterProv,
  absorbDebtUsdProv,
  absorbSeizedUsdProv,
  absorbMarginProv,
  type CompoundCoords,
} from "@/lib/compound/event-provenance";
import { marketOf, type CometMarket } from "@/lib/compound/asset-catalog";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

/** Below this magnitude a leg reads as zero — the sub-precision residual a
 *  crossed base balance or a fully spent balance leaves behind. */
export const COMPOUND_EPS = 1e-9;

export type CompoundEvent = BaseActivityEvent & { context: { protocol: "compound"; data: CompoundContext } };

/** The coords every figure cites — the same subset the header and detail build,
 *  so an explainer echo collapses onto their primary receipt. `market` is the
 *  slug resolved against the page's deployment (useCometMarket); absent, the
 *  Ethereum roster, which is what every pre-Base caller meant. */
export function coordsFor(
  ctx: CompoundContext,
  txHash?: string,
  blockNumber?: number,
  market: CometMarket = marketOf(ctx.market),
): CompoundCoords {
  return { comet: market.comet, marketLabel: market.label, txHash, blockNumber };
}

// ── figure rendering ─────────────────────────────────────────────────────────

function Fig({
  info,
  value,
  symbol,
  echo,
  children,
}: {
  info: Provenance;
  value?: string;
  symbol?: string;
  echo?: boolean;
  children: ReactNode;
}) {
  return (
    <Prov info={info} value={value} symbol={symbol} echo={echo}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

// ── the variant table ────────────────────────────────────────────────────────

/** The third-party-actor clause — the prose half of the pink chip the header
 *  renders when the account was neither the transaction's signer nor the
 *  Comet event's own `from` (the funder who provided the tokens).
 *
 *  `txFrom`/`funder` ship exactly where that two-fact verdict is decidable, so
 *  their presence IS the verdict — which is what lets this stay a pure function
 *  with no owner in hand.
 *
 *  ⚠️ The chip is supply-side ONLY, by construction: Comet's Supply and
 *  SupplyCollateral carry a funder, while Withdraw / WithdrawCollateral name
 *  the account itself as `src` and a bare recipient as `to` (event-provenance
 *  states the same bound). So there is no withdraw branch here — not an
 *  oversight, but the only rows the seam can reach.
 *
 *  The authority is Comet's own and must not be borrowed from a sibling
 *  explorer: adding value needs no permission at all, and removing it needs a
 *  manager authorisation that is a single all-or-nothing boolean — no
 *  per-asset and no per-amount cap, unlike Aave's capped delegation. */
function fundedByOtherMechanic(ctx: CompoundContext): ClauseInput[] {
  if (!ctx.txFrom || !ctx.funder) return [];
  const isBaseSupply = ctx.eventType === "supply";
  if (!isBaseSupply && ctx.eventType !== "supply_collateral") return [];
  return [
    clause(
      isBaseSupply ? (
        <>
          Another account executed this on the owner&rsquo;s behalf, and the tokens came from that account rather than
          this one. Comet asks the owner for nothing before value is added to their position — a supply names the
          account it credits, and on the base asset that same path is how a debt gets repaid, so anyone can pay down
          anyone&rsquo;s borrowing.
        </>
      ) : (
        <>
          Another account executed this on the owner&rsquo;s behalf, and the tokens came from that account rather than
          this one. Comet asks the owner for nothing before collateral is added to their position — a supply names the
          account it credits, and no consent from that account is checked.
        </>
      ),
    ),
    clause(
      <>
        Taking value back out is the opposite. The owner must first authorise the other account as a manager of theirs,
        and that authorisation is one all-or-nothing switch — every asset, withdrawals and transfers alike, with no
        amount cap. Because a base withdrawal past the account&rsquo;s own balance is the borrow itself, the same switch
        is also what would let another account borrow against this collateral.
      </>,
    ),
  ];
}

export function compoundEventSlots(
  ctx: CompoundContext,
  coords: CompoundCoords,
  siblings: CompoundEvent[],
  self: CompoundEvent,
  market: CometMarket = marketOf(ctx.market),
): EventProseSlots {
  const slots = compoundEventSlotsBase(ctx, coords, siblings, self, market);
  const funded = fundedByOtherMechanic(ctx);
  if (funded.length === 0) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), ...funded] };
}

function compoundEventSlotsBase(
  ctx: CompoundContext,
  coords: CompoundCoords,
  siblings: CompoundEvent[],
  self: CompoundEvent,
  cometMarket: CometMarket,
): EventProseSlots {
  const sym = ctx.assetSymbol;
  const market = ctx.marketLabel;
  const raw = Number(ctx.assetsDelta);
  const signedDelta = Number.isFinite(raw) ? raw : 0;
  const amt = formatNumber(Math.abs(signedDelta));

  // The moved delta — the header's own change receipt (same prov / value /
  // symbol → same entry key), so this bold figure maps to the amount above it.
  const movedProv = movedDeltaProv(ctx.eventType, sym, coords);
  const deltaFig = movedProv ? (
    <Fig echo info={movedProv} value={chainTruthDeltaValue(signedDelta, false)} symbol={sym}>
      {amt} {sym}
    </Fig>
  ) : (
    <strong className="font-semibold text-foreground">
      {amt} {sym}
    </strong>
  );

  // The signed base / per-asset collateral AFTER — the detail grid's own
  // after-value receipt. Display shows the magnitude; the receipt keeps the
  // signed exact figure the grid registered.
  const baseAfterFig = () =>
    ctx.baseAfter != null ? (
      <Fig echo info={baseAfterProv(sym, coords)} value={formatNumber(Number(ctx.baseAfter))} symbol={sym}>
        {formatNumber(Math.abs(Number(ctx.baseAfter)))} {sym}
      </Fig>
    ) : null;
  const collAfterFig = () =>
    ctx.collateralAfter != null ? (
      <Fig echo info={collateralAfterProv(sym, coords)} value={formatNumber(Number(ctx.collateralAfter))} symbol={sym}>
        {formatNumber(Number(ctx.collateralAfter))} {sym}
      </Fig>
    ) : null;

  // The resulting base state, stated plainly (the never-empty floor drops it
  // when the after-balance is absent).
  const baseAfterClause = (): ClauseInput => {
    if (ctx.baseAfter == null) return null;
    const a = Number(ctx.baseAfter);
    if (a > COMPOUND_EPS) return clause(<>The account now lends {baseAfterFig()}.</>);
    if (a < -COMPOUND_EPS) return clause(<>The account now owes {baseAfterFig()} on its base.</>);
    return clause(<>The account&rsquo;s base balance is now flat.</>);
  };
  // Collateral resulting state. When the account carries base debt (the
  // running base rides on collateral rows too), the bullet also names the
  // debt the stack stands behind — an echo of the detail grid's Borrowed
  // (base) panel, sharing its receipt.
  const collAfterClause = (): ClauseInput => {
    if (ctx.collateralAfter == null) return null;
    const base = ctx.baseAfter != null ? Number(ctx.baseAfter) : null;
    if (base != null && base < -COMPOUND_EPS) {
      const baseSym = cometMarket.baseSymbol;
      return clause(
        <>
          The account now holds {collAfterFig()} as collateral, backing{" "}
          <Fig echo info={baseAfterProv(baseSym, coords)} value={formatNumber(Number(ctx.baseAfter))} symbol={baseSym}>
            {formatNumber(Math.abs(base))} {baseSym}
          </Fig>{" "}
          of base debt.
        </>,
      );
    }
    return clause(<>The account now holds {collAfterFig()} as collateral.</>);
  };

  // The absorption's valued two-leg breakdown — the AbsorbDebt card's own
  // forensics (seized vs cleared, at the protocol's absorption-time valuations),
  // echoed onto the same receipts. Gated exactly as the detail's forensics
  // build, so a leg it can't value never registers here as a stray primary.
  const absorbValued = (): ClauseInput[] => {
    const legs = ctx.absorbedCollateral;
    const clearedUsd = Number(ctx.usdValue);
    const clearedAmt = Number(ctx.assetsDelta);
    if (!legs?.length || !Number.isFinite(clearedUsd) || clearedUsd <= 0) return [];
    const seizedUsd = legs.reduce((s, l) => s + Number(l.usdValue), 0);
    if (!Number.isFinite(seizedUsd)) return [];
    const margin = seizedUsd / clearedUsd - 1;
    const marginPct = `${margin >= 0 ? "+" : "−"}${(Math.abs(margin) * 100).toFixed(2)}%`;
    const seizedFig = (
      <Fig
        echo
        info={absorbSeizedUsdProv(coords, legs)}
        value={formatUsdValue(seizedUsd)}
        symbol={legs.length === 1 ? legs[0].symbol : undefined}
      >
        {formatUsdValue(seizedUsd)}
      </Fig>
    );
    const clearedFig = (
      <Fig
        echo
        info={absorbDebtUsdProv(sym, coords, { amount: `${Math.abs(clearedAmt)} ${sym}` })}
        value={formatUsdValue(clearedUsd)}
        symbol={sym}
      >
        {formatUsdValue(clearedUsd)}
      </Fig>
    );
    const marginFig = (
      <Fig
        echo
        info={absorbMarginProv(coords, {
          seizedUsd: formatUsdValue(seizedUsd),
          clearedUsd: formatUsdValue(clearedUsd),
        })}
        value={marginPct}
      >
        {marginPct}
      </Fig>
    );
    return margin >= 0
      ? [
          clause(
            <>
              At the protocol&rsquo;s own absorption-time valuations, the seized collateral was worth {seizedFig}{" "}
              against {clearedFig} of debt cleared.
            </>,
          ),
          clause(
            <>
              That leaves a {marginFig} margin, kept in the protocol&rsquo;s reserves and resold to liquidators at a
              discount.
            </>,
          ),
        ]
      : [
          clause(
            <>
              At the protocol&rsquo;s own absorption-time valuations, the seized collateral was worth only {seizedFig}{" "}
              against {clearedFig} of debt cleared.
            </>,
          ),
          clause(
            <>The account was absorbed {marginFig} under water, and the gap fell to the protocol&rsquo;s reserves.</>,
          ),
        ];
  };

  // The absorb_collateral leg's cross-reference to the whole absorption — read
  // against the TRANSACTION, so it reads correctly even if the AbsorbDebt card
  // renders on another page. Uses the same-tx sibling only to name the cleared
  // debt (a muted, cross-scope figure); floors to the mechanic without it.
  const absorbCollateralCrossRef = (): ClauseInput => {
    const sib = siblings.find((s) => s !== self && s.context.data.eventType === "absorb_debt");
    if (sib) {
      const sc = sib.context.data;
      const cleared = formatNumber(Math.abs(Number(sc.assetsDelta)));
      return clause(
        <>
          In the same transaction, the protocol cleared the account&rsquo;s entire base debt of {cleared}{" "}
          {sc.assetSymbol} in one absorption — Comet absorbs whole accounts, not slices.
        </>,
      );
    }
    return clause(
      <>
        In the same transaction, the protocol cleared the account&rsquo;s entire base debt in one absorption — Comet
        absorbs whole accounts, not slices.
      </>,
    );
  };

  switch (ctx.eventType) {
    case "supply": {
      const before = ctx.baseAfter != null ? Number(ctx.baseAfter) - signedDelta : null;
      const repay = before != null && signedDelta > 0 ? Math.min(signedDelta, Math.max(0, -before)) : 0;
      const lent = signedDelta - repay;
      const happened =
        repay > COMPOUND_EPS && lent > COMPOUND_EPS
          ? clause(
              <>
                Supplied {deltaFig} to the {market} market.
              </>,
            )
          : repay > COMPOUND_EPS
            ? clause(
                <>
                  Supplied {deltaFig} to the {market} market, paying down the account&rsquo;s base debt.
                </>,
              )
            : clause(
                <>
                  Supplied {deltaFig} to the {market} market, lending it into the base pool to earn the supply rate.
                </>,
              );
      const changed =
        repay > COMPOUND_EPS && lent > COMPOUND_EPS
          ? clause(
              <>
                {formatNumber(repay)} {sym} cleared the outstanding base debt, and the remaining {formatNumber(lent)}{" "}
                {sym} is lent out to earn the supply rate.
              </>,
            )
          : repay > COMPOUND_EPS
            ? clause(<>In Compound V3 a supply pays down what the account owes before it starts lending.</>)
            : null;
      return { happened: [happened], changed: [changed], meansNow: [baseAfterClause()] };
    }

    case "withdraw": {
      const mag = Math.abs(signedDelta);
      const before = ctx.baseAfter != null ? Number(ctx.baseAfter) - signedDelta : null;
      const fromSavings = before != null ? Math.min(mag, Math.max(0, before)) : mag;
      const borrowed = mag - fromSavings;
      const happened =
        borrowed > COMPOUND_EPS && fromSavings > COMPOUND_EPS
          ? clause(
              <>
                Withdrew {deltaFig} from the {market} market.
              </>,
            )
          : borrowed > COMPOUND_EPS
            ? clause(
                <>
                  Borrowed {deltaFig} from the {market} market against the account&rsquo;s collateral.
                </>,
              )
            : clause(<>Withdrew {deltaFig} of lent base back to the wallet.</>);
      const changed: ClauseInput =
        borrowed > COMPOUND_EPS && fromSavings > COMPOUND_EPS
          ? clause(
              <>
                {formatNumber(fromSavings)} {sym} came from the account&rsquo;s own lent balance, and{" "}
                {formatNumber(borrowed)} {sym} was borrowed past it against the collateral stack.
              </>,
            )
          : borrowed > COMPOUND_EPS
            ? clause(
                <>
                  In Compound V3, a withdrawal past the account&rsquo;s own balance is the borrow itself, accruing
                  interest at the market&rsquo;s borrow rate.
                </>,
              )
            : null;
      return { happened: [happened], changed: changed ? [changed] : [], meansNow: [baseAfterClause()] };
    }

    case "supply_collateral":
      return {
        happened: [
          clause(
            <>
              Added {deltaFig} to the {market} collateral stack.
            </>,
          ),
        ],
        changed: [],
        meansNow: [collAfterClause()],
      };

    case "withdraw_collateral":
      return {
        happened: [
          clause(
            <>
              Withdrew {deltaFig} from the {market} collateral stack.
            </>,
          ),
        ],
        changed: [],
        meansNow: [collAfterClause()],
      };

    case "absorb_debt":
      return {
        happened: [
          clause(
            <>The account&rsquo;s debt passed its liquidation line, so the protocol absorbed the whole account.</>,
          ),
        ],
        changed: [
          clause(
            <>It cleared {deltaFig} of base debt in one step — Compound V3 liquidates whole accounts, not slices.</>,
          ),
          clause(
            <>
              The account is credited its seized collateral&rsquo;s value minus each asset&rsquo;s liquidation penalty,
              in {sym}.
            </>,
          ),
        ],
        meansNow: absorbValued(),
      };

    case "absorb_collateral": {
      const usd = Number(ctx.usdValue);
      const seize =
        ctx.usdValue != null && Number.isFinite(usd) ? (
          <>
            In this liquidation, the protocol seized {deltaFig} of collateral, worth {formatUsdValue(usd)} at its
            absorption-time valuation.
          </>
        ) : (
          <>In this liquidation, the protocol seized {deltaFig} of collateral.</>
        );
      return {
        happened: [clause(seize)],
        changed: [
          clause(<>The protocol keeps it to resell to liquidators at a discount, recapitalising its reserves.</>),
        ],
        meansNow: [absorbCollateralCrossRef()],
      };
    }

    case "transfer_in":
    case "transfer_out": {
      const out = ctx.eventType === "transfer_out";
      return {
        happened: [
          clause(
            out ? (
              <>Transferred {deltaFig} of base to another Comet account.</>
            ) : (
              <>Received {deltaFig} of base from another Comet account.</>
            ),
          ),
        ],
        changed: [
          clause(
            out ? (
              <>This is a position move between accounts, not a withdrawal to a wallet.</>
            ) : (
              <>This is a position move between accounts, not a fresh supply.</>
            ),
          ),
        ],
        meansNow: [baseAfterClause()],
      };
    }

    case "transfer_collateral_in":
    case "transfer_collateral_out": {
      const out = ctx.eventType === "transfer_collateral_out";
      return {
        happened: [
          clause(
            out ? (
              <>Transferred {deltaFig} of collateral to another Comet account.</>
            ) : (
              <>Received {deltaFig} of collateral from another Comet account.</>
            ),
          ),
        ],
        changed: [
          clause(
            out ? (
              <>The collateral stayed inside the market — custody moved to another account.</>
            ) : (
              <>The collateral was already inside the market — custody arrived from another account.</>
            ),
          ),
        ],
        meansNow: [collAfterClause()],
      };
    }

    default:
      return { happened: [] };
  }
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function compoundExplainerTeaser(
  ctx: CompoundContext,
  coords: CompoundCoords,
  siblings: CompoundEvent[],
  self: CompoundEvent,
  market?: CometMarket,
): ReactNode | null {
  return splitLead(eventClauses(compoundEventSlots(ctx, coords, siblings, self, market))).lead;
}
