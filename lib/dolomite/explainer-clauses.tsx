// Dolomite plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the leg's RESULTING STATE — which side of zero the
// account's balance in this market sits on AFTER the event, and whether the
// move crossed zero. Dolomite has no Borrow action: a negative balance IS the
// debt, so a withdraw or trade that pushes a balance below zero OPENS
// borrowing, and a deposit or transfer that lifts it back above zero REPAYS it.
// The old state-blind bullets ("backs this account's borrowing", "reduces the
// cover") are replaced by facts about THIS leg's own resulting balance.
//
// Figures render through <Prov echo>: the moved amount echoes the header /
// spine delta receipt (movedDeltaProv + the same coords → the same entry key).
// Par is a SCALED balance, never a real token amount — the detail grid carries
// the par before→after under its own "· par" label, and this pane never
// restates a par figure numerically (a bold "{par} {sym}" would misread as the
// real balance). The resulting balance is narrated in words instead.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Dolomite cannot fill per event, each a data fact of its
// pipeline:
//   • §5.1 (risk consequence per event: ratio/health before → after, distance
//     to the line). The indexed event stream carries no per-event price and no
//     account-level collateralisation — those live only in the live per-account
//     read that feeds the position card. The per-event figure that IS available
//     (the moved amount) is echoed, and the zero-crossing narrates the
//     consequence (opened / cleared / deepened debt).
//   • §5.2 (mechanic-why on fees). A Dolomite leg carries no per-event fee — no
//     borrow fee, no close fee; interest lives in the per-market index, not a
//     per-event charge. The only fee-like figure is the liquidation spread,
//     which is account-level (§5.4).
//   • §5.4 (derived net-outcome figures). With no per-event price, a seizure's
//     premium cannot be landed on the spread constant per event; it is stated
//     in words ("worth the repaid debt plus the liquidation spread") without a
//     figure.
// Filled: forward paths (§5.3) on the now-in-debt state; aggregate / act
// context (§5.5) via the liquidation narrator / cross-reference pair and the
// trade's two-leg cross-reference; the highlight rule (§5.6) via the echoed
// moved amount.

import type { ReactNode } from "react";
import type { BaseActivityEvent, DolomiteContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import { movedDeltaProv, type DolomiteCoords } from "@/lib/dolomite/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export type DolomiteEvent = BaseActivityEvent & {
  context: { protocol: "dolomite"; data: DolomiteContext };
};

// ── resulting state ──────────────────────────────────────────────────────────

export interface DolomiteResultingState {
  before: number | null;
  after: number | null;
  /** before ≥ 0, after < 0 — this move opened (or entered) borrowing. */
  crossedIntoDebt: boolean;
  /** before < 0, after ≥ 0 — this move repaid the debt out of the negative. */
  crossedOutOfDebt: boolean;
  /** after < 0 — the balance is now borrowing. */
  nowDebt: boolean;
  /** after == 0 — this move closed the balance in this market. */
  nowFlat: boolean;
  /** before < 0 — the balance was borrowing before this move. */
  wasDebt: boolean;
  /** still borrowing and deeper than before. */
  deepenedDebt: boolean;
}

export function resultingState(ctx: DolomiteContext): DolomiteResultingState {
  const before = ctx.parBefore != null ? Number(ctx.parBefore) : null;
  const after = ctx.parAfter != null ? Number(ctx.parAfter) : null;
  const finiteBefore = before != null && Number.isFinite(before) ? before : null;
  const finiteAfter = after != null && Number.isFinite(after) ? after : null;
  return {
    before: finiteBefore,
    after: finiteAfter,
    crossedIntoDebt: finiteBefore != null && finiteAfter != null && finiteBefore >= 0 && finiteAfter < 0,
    crossedOutOfDebt: finiteBefore != null && finiteAfter != null && finiteBefore < 0 && finiteAfter >= 0,
    nowDebt: finiteAfter != null && finiteAfter < 0,
    nowFlat: finiteAfter != null && finiteAfter === 0,
    wasDebt: finiteBefore != null && finiteBefore < 0,
    deepenedDebt:
      finiteBefore != null &&
      finiteAfter != null &&
      finiteBefore < 0 &&
      finiteAfter < 0 &&
      Math.abs(finiteAfter) > Math.abs(finiteBefore),
  };
}

// ── siblings ─────────────────────────────────────────────────────────────────

/** The borrower's seized-collateral leg of the SAME transaction — lets the
 *  liquidation narrator name the collateral the liquidator took (in words; the
 *  seized figure lives on that leg's own card). */
export function seizeSibling(siblings: DolomiteEvent[], self: DolomiteEvent): DolomiteEvent | undefined {
  return siblings.find((s) => s !== self && s.txHash === self.txHash && s.context.data.eventType === "seize_out");
}

// ── figure + link rendering ──────────────────────────────────────────────────

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

/** Etherscan address link, click-isolated from the card. */
function Addr({ address }: { address: string }) {
  return (
    <a
      href={explorerUrl(MAINNET_CHAIN_ID, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {address.slice(0, 6)}…{address.slice(-4)}
    </a>
  );
}

const fmtAbs = (h?: string): string => formatNumber(Math.abs(Number(h)));

// ── the variant table ────────────────────────────────────────────────────────

/** The third-party-actor clauses — the prose half of the pink chip the header
 *  renders when the owner was neither the signer nor the leg's own party.
 *
 *  `txFrom`/`caller` ship exactly where the two-fact verdict is decidable, so
 *  their presence IS the verdict — which is what lets this stay a pure function
 *  with no owner in hand, matching the card's own gate.
 *
 *  The authority is protocol-specific and must NOT be borrowed from the Aave /
 *  Comet / Maker story, because Dolomite inverts it. An account is an
 *  `(owner, accountNumber)` pair and the single entry point is
 *  `operate(Account.Info[], Actions.ActionArgs[])`, which performs no auth of
 *  its own — each action library does, and every one of them calls the SAME
 *  gate. `DepositImpl.deposit` opens with
 *  `state.requireIsOperator(args.account, msg.sender)`, so a stranger cannot
 *  deposit into someone's account either; the check resolves to
 *  `operator == account.owner || isGlobalOperator(operator) ||
 *  isLocalOperator(account.owner, operator)`, and the owner grants the middle
 *  term with `setOperators(Types.OperatorArg[])` → `LogOperatorSet`.
 *
 *  Two facts follow that no sibling explorer can state:
 *    • the operator flag is ONE all-or-nothing boolean covering deposits,
 *      withdrawals, transfers, trades and calls alike. There is no add-only
 *      tier, so "adding is free" — true on Aave V3, Comet and Maker — is false
 *      here, and an operator cleared to top the account up is equally cleared
 *      to empty it.
 *    • `ownerSetGlobalOperator(address, bool)` is an admin call (`onlyOwner`)
 *      granting an address rights over EVERY account in the system. A global
 *      operator on a row is a governance trust decision the individual owner
 *      never made and cannot revoke.
 *  (Dolomite is a dYdX Solo fork — the `Copyright 2019 dYdX Trading Inc.`
 *  headers are still on these libraries. Isolation Mode's per-user vaults add a
 *  second `onlyVaultOwner`-style layer ON TOP of `requireIsOperator`, not
 *  instead of it.)
 *
 *  ⚠️ `ctx.caller` maps to `LogDeposit.from` / `LogWithdraw.to`. On a WITHDRAW
 *  that is a recipient, not the actor — the real msg.sender rides a separate
 *  `LogOperation(address sender)` event this pipeline does not read — so on
 *  withdraw rows the verdict rests mainly on `tx.from ≠ owner`. Nothing below
 *  claims the second fact is a contract-level msg.sender. */
/** ⚠️ MEASURED 2026-07-27: this clause is currently UNREACHABLE, and that is a
 *  backend gap rather than a bug here. Across 400 Dolomite positions sampled on
 *  the live index, `caller` is populated on the TRADE leg only (1 trade_maker +
 *  1 trade_taker in the sample) and on **no account-grain row at all** — 0 of
 *  397 deposits, 0 of 396 withdraws, 0 of 197 transfers. So the two-fact guard
 *  below always declines and the pink chip never renders on a Dolomite row.
 *
 *  ⚠️⚠️ `counterparty` IS populated on every one of those rows, and it is
 *  tempting to map it onto the party param to light this up. Do not: it is a
 *  CUSTODY fact, not an agency one, and the measurement is unambiguous. Every
 *  one of the 394 sampled deposits — across both plain `Dolomite Balance`
 *  accounts and hash-derived borrow positions — carries the SAME counterparty,
 *  `0xf8b2c637a68cf6a17b1df9f8992eebeff63d2dff` (a ~3KB contract, Dolomite's
 *  deposit router), and it is the owner on 0 of them. The migration selects it
 *  as `lower(d.source)` — "where the tokens came from" — which for a routed
 *  deposit is the router, correctly. A constant is not a party: substituting it
 *  reduces the verdict to `txFrom ≠ owner`, the sender-only test this gate
 *  exists to avoid, and would badge every contract-owned (Safe) account whose
 *  own signer acts for it. On `transfer_in` the field is the owner on 99 of 99
 *  rows, so it decides nothing there either.
 *
 *  Kept, correct and unreachable, for the same reason Fluid's value-removing
 *  branch is: the prose states the RULE, so it is true the moment the field
 *  arrives, and its absence is a data fact worth naming rather than an
 *  oversight to rediscover. What would light it up is a real msg.sender on
 *  account-grain rows — Dolomite emits one as `LogOperation(address sender)`,
 *  which the pipeline does not read — not a rename of a field it already has.
 *  Same shape of gap as LlamaLend's missing `tx_from` on V2 rows. */
function operatorActorMechanic(ctx: DolomiteContext): ClauseInput[] {
  if (!ctx.txFrom || !ctx.caller) return [];
  const adds = ctx.eventType === "deposit" || ctx.eventType === "transfer_in";
  const gate = adds
    ? clause(
        <>
          A third-party address executed this on the owner&rsquo;s behalf. Dolomite gates every action on the same
          check, adding included — only the account&rsquo;s owner, an address the owner registered as an operator of it,
          or an operator approved across the whole protocol may touch an account — so unlike most lenders, paying into
          this account requires that same clearance.
        </>,
      )
    : clause(
        <>
          A third-party address executed this on the owner&rsquo;s behalf. Dolomite runs every action through the same
          check, and the operator flag it reads is a single all-or-nothing switch: an address cleared to add to this
          account is equally cleared to withdraw from it, move balances out of it and trade it. There is no add-only
          permission to give here.
        </>,
      );
  return [
    gate,
    clause(
      <>
        That permission need not have come from the owner at all. Dolomite&rsquo;s admin can approve a global operator
        with rights over every account in the system — the routers and automated contracts the protocol itself runs on —
        and an individual owner neither chooses those nor can revoke them.
      </>,
    ),
  ];
}

export function dolomiteEventSlots(
  ctx: DolomiteContext,
  coords: DolomiteCoords,
  siblings: DolomiteEvent[],
  self: DolomiteEvent,
): EventProseSlots {
  const slots = dolomiteEventSlotsBase(ctx, coords, siblings, self);
  const actor = operatorActorMechanic(ctx);
  if (actor.length === 0) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), ...actor] };
}

function dolomiteEventSlotsBase(
  ctx: DolomiteContext,
  coords: DolomiteCoords,
  siblings: DolomiteEvent[],
  self: DolomiteEvent,
): EventProseSlots {
  const sym = ctx.marketSymbol;
  const rs = resultingState(ctx);

  // The moved amount — the leg's own signed token move (a real token amount),
  // echoing the header / spine delta receipt (same builder + coords → same
  // entry key). Bold, because it also appears on the card's chrome.
  const moved = () => (
    <Fig
      echo
      info={movedDeltaProv(ctx.eventType, sym, coords, ctx.raw?.weiDelta)}
      value={chainTruthDeltaValue(Number(ctx.weiDelta ?? 0), false)}
      symbol={sym}
    >
      {fmtAbs(ctx.weiDelta)} {sym}
    </Fig>
  );

  switch (ctx.eventType) {
    case "deposit": {
      if (rs.wasDebt) {
        // Repaying a negative balance (there is no Repay action either — a
        // deposit onto a negative balance IS the repayment).
        if (rs.crossedOutOfDebt) {
          return rs.nowFlat
            ? {
                happened: [
                  clause(
                    <>
                      Depositing {moved()} cleared the account&rsquo;s negative {sym} balance — the debt in that market
                      is repaid in full.
                    </>,
                  ),
                ],
              }
            : {
                happened: [
                  clause(
                    <>
                      Depositing {moved()} repaid the account&rsquo;s negative {sym} balance in full.
                    </>,
                  ),
                ],
                meansNow: [
                  clause(<>A negative balance IS the debt here.</>),
                  clause(<>With the balance now positive, it earns the market&rsquo;s supply rate.</>),
                ],
              };
        }
        return {
          happened: [
            clause(
              <>
                Depositing {moved()} repaid part of the account&rsquo;s negative {sym} balance.
              </>,
            ),
          ],
          meansNow: [
            clause(<>A negative balance IS the debt here.</>),
            clause(
              <>
                The balance is still below zero and keeps accruing the market&rsquo;s borrow rate until it is repaid.
              </>,
            ),
          ],
        };
      }
      return {
        happened: [
          clause(
            <>
              Deposited {moved()} into the account&rsquo;s {sym} balance.
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              The balance earns the market&rsquo;s supply rate and stands as collateral behind the account&rsquo;s
              borrowing.
            </>,
          ),
        ],
      };
    }

    case "withdraw": {
      if (rs.crossedIntoDebt) {
        return {
          happened: [
            clause(
              <>
                Withdrew {moved()} from the account&rsquo;s {sym} balance, taking it below zero.
              </>,
            ),
          ],
          meansNow: [
            clause(<>There is no separate Borrow action here — a negative balance IS the borrowing.</>),
            clause(
              <>The balance now accrues the market&rsquo;s borrow rate against the account&rsquo;s other collateral.</>,
            ),
          ],
        };
      }
      if (rs.deepenedDebt) {
        return {
          happened: [
            clause(
              <>
                Withdrew {moved()} against the account&rsquo;s already-negative {sym} balance, drawing more debt.
              </>,
            ),
          ],
          meansNow: [clause(<>The debt in this market deepened and keeps accruing the borrow rate.</>)],
        };
      }
      return {
        happened: [
          clause(
            <>
              Withdrew {moved()} from the account&rsquo;s {sym} balance.
            </>,
          ),
        ],
        meansNow: [],
      };
    }

    case "transfer_in": {
      const repay: ClauseInput = rs.crossedOutOfDebt
        ? clause(
            <>Here it lifted the account&rsquo;s {sym} balance out of the negative, repaying that much of the debt.</>,
          )
        : null;
      return {
        happened: [
          clause(
            <>
              Received {moved()} from another Dolomite account
              {ctx.counterparty ? (
                <>
                  {" "}
                  (<Addr address={ctx.counterparty} />)
                </>
              ) : null}
              .
            </>,
          ),
        ],
        // The general transfer rule (balances move between account numbers,
        // nothing leaves the protocol) is Layer-2 material — the "?" modal
        // (dolomiteTransferContent) carries it.
        meansNow: [repay],
      };
    }

    case "transfer_out": {
      const intoDebt: ClauseInput = rs.crossedIntoDebt
        ? clause(<>This transfer took the {sym} balance below zero — a negative balance IS borrowing here.</>)
        : null;
      return {
        happened: [
          clause(
            <>
              Sent {moved()} to another Dolomite account
              {ctx.counterparty ? (
                <>
                  {" "}
                  (<Addr address={ctx.counterparty} />)
                </>
              ) : null}
              .
            </>,
          ),
        ],
        meansNow: [intoDebt],
      };
    }

    case "trade_taker": {
      const intoDebt: ClauseInput = rs.crossedIntoDebt
        ? clause(
            <>
              The trade took this balance below zero — selling borrowed funds, which is how a leveraged position opens
              here.
            </>,
          )
        : null;
      return {
        happened: [
          clause(
            <>
              Traded away {moved()} — the spent side of a swap routed through an exchange wrapper
              {ctx.otherMarketSymbol ? <> into {ctx.otherMarketSymbol}</> : null}.
            </>,
          ),
        ],
        meansNow: [
          intoDebt,
          rs.crossedIntoDebt
            ? clause(
                <>
                  The negative balance accrues the market&rsquo;s borrow rate against the account&rsquo;s collateral.
                </>,
              )
            : null,
          clause(<>The received side of the swap is its own row in this transaction.</>),
        ],
      };
    }

    case "trade_maker": {
      return {
        happened: [
          clause(
            <>
              Received {moved()}
              {ctx.otherMarketSymbol ? <> out of {ctx.otherMarketSymbol}</> : null} — the received side of the same
              swap.
            </>,
          ),
        ],
        meansNow: [clause(<>The spent side of the swap is its own row in this transaction.</>)],
      };
    }

    case "liquidation": {
      // The narrator leg on the borrower's page: it owns the story. The seized
      // collateral is named in words (its figure lives on the seize_out card).
      const seize = seizeSibling(siblings, self);
      const seizeSym = seize?.context.data.marketSymbol;
      return {
        happened: [
          clause(
            <>
              The account&rsquo;s adjusted collateral fell below its margin requirement, so a liquidator repaid{" "}
              {moved()} of its debt
              {ctx.liquidator ? (
                <>
                  {" "}
                  (<Addr address={ctx.liquidator} />)
                </>
              ) : null}
              .
            </>,
          ),
        ],
        changed: [
          seizeSym
            ? clause(
                <>
                  In the same transaction the liquidator took the account&rsquo;s {seizeSym} collateral to cover it,
                  worth the debt cleared plus the liquidation spread.
                </>,
              )
            : null,
        ],
        meansNow: [
          clause(
            <>
              A liquidation here moves four balances: the account&rsquo;s debt and its collateral, and the
              liquidator&rsquo;s payout and receipt.
            </>,
          ),
          clause(
            <>
              It is partial and repeatable — the account continues with whatever remains, rather than being closed out.
            </>,
          ),
        ],
      };
    }

    case "seize_out": {
      // A cross-reference leg: it states its own seized figure, then one clause
      // tying it to the liquidation in the same transaction.
      return {
        happened: [
          clause(
            <>
              A liquidation took {moved()} of the account&rsquo;s collateral
              {ctx.liquidator ? (
                <>
                  {" "}
                  (seized by <Addr address={ctx.liquidator} />)
                </>
              ) : null}
              .
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              This is one leg of a liquidation in the same transaction: the collateral covered the account&rsquo;s debt
              cleared on another leg, plus the liquidation spread.
            </>,
          ),
          clause(<>It was taken under the protocol&rsquo;s liquidation rules, not sent by the account.</>),
        ],
      };
    }

    case "seize_in": {
      return {
        happened: [
          clause(
            <>
              As the liquidator, the account received {moved()} of seized collateral
              {ctx.counterparty ? (
                <>
                  {" "}
                  from <Addr address={ctx.counterparty} />
                </>
              ) : null}
              .
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              This is one leg of a liquidation the account carried out in the same transaction — it repaid the
              borrower&rsquo;s debt on another leg.
            </>,
          ),
          clause(<>The collateral is worth the repaid debt plus the liquidation spread.</>),
        ],
      };
    }

    case "liquidation_payout": {
      return {
        happened: [
          clause(
            <>
              As the liquidator, the account put {moved()} toward a liquidated account&rsquo;s debt
              {ctx.counterparty ? (
                <>
                  {" "}
                  (borrower <Addr address={ctx.counterparty} />)
                </>
              ) : null}
              .
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              This is one leg of that liquidation in the same transaction — the seized collateral arrived on another
              leg.
            </>,
          ),
        ],
      };
    }

    case "vaporize": {
      // vapor_owed — the written-off debt (per the timeline transform): a
      // liquidation left the account with debt its collateral could no longer
      // cover, so the shortfall is cleared rather than seized against.
      return {
        happened: [
          clause(
            <>
              The account&rsquo;s debt outran the collateral left to cover it, so a liquidation wrote off {moved()} of{" "}
              {sym} debt under the protocol&rsquo;s vaporization rules.
            </>,
          ),
        ],
        // The general vaporization rule is Layer-2 material — the "?" modal
        // (dolomiteLiquidationContent's Vaporization concept) carries it.
      };
    }

    case "call": {
      return {
        happened: [
          clause(
            <>
              The account made a protocol Call — an external action routed through the core, used by wrappers and
              integrations.
            </>,
          ),
        ],
        meansNow: [clause(<>No balance moved on this leg.</>)],
      };
    }

    default:
      return { happened: [] };
  }
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function dolomiteExplainerTeaser(
  ctx: DolomiteContext,
  coords: DolomiteCoords,
  siblings: DolomiteEvent[],
  self: DolomiteEvent,
): ReactNode | null {
  return splitLead(eventClauses(dolomiteEventSlots(ctx, coords, siblings, self))).lead;
}
