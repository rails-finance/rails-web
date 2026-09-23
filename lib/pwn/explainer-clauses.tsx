// PWN plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// SPECIAL KEYING: a PWN event carries no running balances, so its "resulting
// state" is the LOAN'S LIFECYCLE STATUS after the event — active, repaid,
// defaulted, settled or retired — never a balance. Every variant keys on that
// status (loanStatus), never on the event type alone.
//
// The narrator inversion (vs Fluid): here the ECONOMIC events — created /
// paid_back / claimed — own the story, and the NFT-custody events — minted /
// burned — carry ONE cross-reference back to the same-transaction economic
// event that does. (Fluid is the reverse: its mint narrates.) Cross-references
// are phrased against the TRANSACTION, since a sibling may render on its own.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the card's detail grid (credit principal, repay total,
// collateral). ChainTruthDetail registers each of those with NO `symbol` prop
// (the token rides as an icon), so an echo omits `symbol` too — the receipt
// entryKey is `label|value|symbol`, and the value mirrors the grid's own `fmt`
// (formatNumber(Number(h))) so the two keys match byte-for-byte. The FIXED
// INTEREST (repay − principal) has no on-card twin, so per the highlight rule
// it renders muted and unwrapped — the derived gap between two bold figures.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Items PWN cannot fill, each a data fact of a fixed-term P2P loan:
//   • §5.1 (risk consequence with figures) — a PWN loan has no health factor,
//     no collateral ratio, no liquidation line and no per-event price. Default
//     is a clock event, not a price event, so there is no ratio-vs-threshold to
//     state at event time. Skipped on every event.
//   • §5.2 (mechanic-why on fees) — a PWN loan charges no protocol fee. Its one
//     cost is the FIXED INTEREST, agreed pairwise at origination and never
//     accruing; the created / paid_back variants state that mechanic inline.
// Filled: forward paths (§5.3) on the default door (created → claimable by the
// lender) and the claim door (paid_back → the note holder); derived net-outcome
// (§5.4) via the fixed interest; aggregate / act context (§5.5) via the custody
// cross-reference; the highlight rule (§5.6) via Fig on the chrome figures only.

import type { ReactNode } from "react";
import type { BaseActivityEvent, PwnContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import {
  creditAdvancedProv,
  repayAmountProv,
  collateralLockedProv,
  collateralSeizedProv,
  type PwnCoords,
} from "@/lib/pwn/event-provenance";
import { shortTokenId } from "@/lib/pwn/asset-catalog";
import { formatNumber } from "@/lib/utils/format";

export type PwnEvent = BaseActivityEvent & { context: { protocol: "pwn"; data: PwnContext } };

// ── resulting state = loan lifecycle status ──────────────────────────────────

// ── sibling predicate (custody → economic cross-reference) ───────────────────

const ECONOMIC = new Set<PwnContext["eventType"]>(["created", "paid_back", "claimed"]);

/** The same-transaction economic event for this loan — the story a minted /
 *  burned custody card cross-references back to. */
export function economicSibling(siblings: PwnEvent[], self: PwnEvent): PwnEvent | undefined {
  const loanId = self.context.data.loanId;
  return siblings.find((s) => s !== self && s.context.data.loanId === loanId && ECONOMIC.has(s.context.data.eventType));
}

// ── figure rendering ─────────────────────────────────────────────────────────

/** Matches PwnEventDetail's `fmt` so an echo's value key is byte-identical to
 *  the detail-grid primary it links to. */
const fmt = (h?: string): string => (h == null ? "—" : formatNumber(Number(h)));

function Fig({
  info,
  value,
  echo,
  children,
}: {
  info: Provenance;
  value: string;
  echo?: boolean;
  children: ReactNode;
}) {
  return (
    <Prov info={info} value={value} echo={echo}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

/** "2024-01-01 17:38 UTC" from a unix-seconds integer string. */
function fmtTs(v?: string): string {
  if (v == null) return "—";
  const d = new Date(Number(v) * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

const isNftCollateral = (ctx: PwnContext): boolean =>
  ctx.collateralCategory === "ERC721" || ctx.collateralCategory === "ERC1155";

/** The collateral as a chrome-echoed figure: "PIRATE #3599" for an NFT, "0.24
 *  WETH" fungible — echoing the detail grid's Collateral · locked / seized
 *  receipt. Falls back to the muted words "the collateral" when the terms carry
 *  no symbol (the never-empty floor). */
function collateralFig(ctx: PwnContext, coords: PwnCoords, seized: boolean): ReactNode {
  if (!ctx.collateralSymbol) return "the collateral";
  const nft = isNftCollateral(ctx) && ctx.collateralId != null;
  const value = nft ? `#${shortTokenId(ctx.collateralId!)}` : fmt(ctx.collateralAmount);
  const info = seized
    ? collateralSeizedProv(ctx.collateralSymbol, coords)
    : collateralLockedProv(ctx.collateralSymbol, coords);
  return (
    <Fig echo info={info} value={value}>
      {nft ? (
        <>
          {ctx.collateralSymbol} #{shortTokenId(ctx.collateralId!)}
        </>
      ) : (
        <>
          {fmt(ctx.collateralAmount)} {ctx.collateralSymbol}
        </>
      )}
    </Fig>
  );
}

/** The credit principal — echoes the detail grid's Credit · principal receipt. */
const creditFig = (ctx: PwnContext, coords: PwnCoords): ReactNode => (
  <Fig echo info={creditAdvancedProv(ctx.creditSymbol!, coords)} value={fmt(ctx.creditAmount)}>
    {fmt(ctx.creditAmount)} {ctx.creditSymbol}
  </Fig>
);

/** The fixed repay total — echoes the detail grid's Repay · total receipt. */
const repayFig = (ctx: PwnContext, coords: PwnCoords): ReactNode => (
  <Fig echo info={repayAmountProv(ctx.creditSymbol!, coords)} value={fmt(ctx.loanRepayAmount)}>
    {fmt(ctx.loanRepayAmount)} {ctx.creditSymbol}
  </Fig>
);

/** repay − principal, or null when the terms carry no repay total (v1.2/v1.3). */
const interestOf = (ctx: PwnContext): number | null =>
  ctx.loanRepayAmount != null && ctx.creditAmount != null
    ? Number(ctx.loanRepayAmount) - Number(ctx.creditAmount)
    : null;

// ── the variant table ────────────────────────────────────────────────────────

export function pwnEventSlots(
  ctx: PwnContext,
  coords: PwnCoords,
  siblings: PwnEvent[],
  self: PwnEvent,
): EventProseSlots {
  const creditSym = ctx.creditSymbol ?? "the credit token";
  const interest = interestOf(ctx);
  const hasRepay = ctx.loanRepayAmount != null && ctx.creditSymbol != null;

  switch (ctx.eventType) {
    case "created": {
      // status: active. The economic narrator — owns the whole opening story.
      const creditText = ctx.creditSymbol ? creditFig(ctx, coords) : "the credit";
      const repayClause: ClauseInput = hasRepay
        ? clause(
            interest != null && interest > 0 ? (
              <>
                The borrower owes a fixed {repayFig(ctx, coords)} back — the principal plus {formatNumber(interest)}{" "}
                {creditSym} of interest.
              </>
            ) : (
              <>The borrower owes a fixed {repayFig(ctx, coords)} back.</>
            ),
          )
        : null;
      const fixedNote: ClauseInput = hasRepay
        ? clause(<>That total is fixed at origination and stays the same for the life of the loan.</>)
        : null;
      const dueClause: ClauseInput = ctx.dueValue
        ? ctx.dueKind === "duration"
          ? clause(<>The loan runs {formatNumber(Number(ctx.dueValue) / 86400)} days from origination.</>)
          : clause(<>The loan is due by {fmtTs(ctx.dueValue)}.</>)
        : null;
      const defaultDoor: ClauseInput = ctx.dueValue
        ? clause(<>Once the deadline passes, an unpaid loan can be claimed by the lender as defaulted.</>)
        : null;
      return {
        happened: [
          clause(
            <>
              A peer-to-peer loan was struck on fixed terms: the lender advanced {creditText} to the borrower against{" "}
              {collateralFig(ctx, coords, false)}, locked in the loan&rsquo;s escrow.
            </>,
          ),
        ],
        changed: [repayClause],
        meansNow: [fixedNote, dueClause, defaultDoor],
      };
    }

    case "paid_back": {
      // status: repaid.
      const breakdown: ClauseInput =
        ctx.creditSymbol && interest != null && interest > 0
          ? clause(
              <>
                That total was {creditFig(ctx, coords)} of principal and {formatNumber(interest)} {creditSym} of fixed
                interest.
              </>,
            )
          : null;
      return {
        happened: [
          clause(
            hasRepay ? (
              // A repay total in the terms is the v1.1 fixed-economics proof;
              // a loan without one states its cost differently (v1.2+ can
              // accrue), so the fixed-total claim renders only with the figure.
              <>The borrower repaid {repayFig(ctx, coords)}, the fixed total struck at origination.</>
            ) : (
              <>The borrower repaid the loan in full.</>
            ),
          ),
        ],
        changed: [
          breakdown,
          clause(<>Repaying released {collateralFig(ctx, coords, false)} from escrow back to the borrower.</>),
        ],
        meansNow: [clause(<>The repaid credit now sits with the loan contract until the note holder claims it.</>)],
      };
    }

    case "claimed": {
      if (ctx.defaulted) {
        // status: defaulted — the lender took the collateral in place of repayment.
        return {
          happened: [clause(<>The loan&rsquo;s deadline passed unpaid, so it defaulted.</>)],
          changed: [
            clause(
              <>
                The note holder claimed the escrowed collateral — {collateralFig(ctx, coords, true)} — in place of
                repayment.
              </>,
            ),
          ],
          // The general clock-not-price rule is Layer-2 material — the "?"
          // modal (pwnDefaultContent's intro + "Nothing is liquidated")
          // carries it.
          meansNow: [clause(<>The collateral passed to the lender exactly as the terms always said it would.</>)],
        };
      }
      // status: settled — the lender collected the repaid credit.
      return {
        happened: [
          clause(
            hasRepay ? (
              <>The note holder collected the repaid {repayFig(ctx, coords)} from the loan&rsquo;s escrow.</>
            ) : (
              <>The note holder collected the repaid credit from the loan&rsquo;s escrow.</>
            ),
          ),
        ],
        // The general collect rule (claiming settles the loan and retires the
        // LOAN note) is Layer-2 material — the "?" modal
        // (pwnRepaymentContent("claimed")) carries it; the pane keeps its
        // happened clause (never-empty floor).
      };
    }

    case "extended": {
      // status: active — only the deadline moved.
      const move: ReactNode =
        ctx.originalDefaultTimestamp && ctx.extendedDefaultTimestamp ? (
          <>
            : {fmtTs(ctx.originalDefaultTimestamp)} → {fmtTs(ctx.extendedDefaultTimestamp)}
          </>
        ) : null;
      return {
        happened: [clause(<>The parties renegotiated the loan&rsquo;s default deadline{move}.</>)],
        meansNow: [
          clause(
            hasRepay ? (
              // The fixed-economics claim rides the same v1.1 proof as the
              // repay figure — a loan whose terms accrue keeps the softer form.
              <>The borrower gets more time under the same fixed economics — only the deadline moved.</>
            ) : (
              <>The borrower gets more time under the terms the parties struck — only the deadline moved.</>
            ),
          ),
        ],
      };
    }

    case "minted": {
      // Custody card. The economic story lives on the same-tx `created` card;
      // this carries the note mechanic and one cross-reference back to it.
      const sib = economicSibling(siblings, self);
      const crossRef: ClauseInput =
        sib && sib.context.data.eventType === "created"
          ? clause(<>The loan it secures was struck in this same transaction.</>)
          : null;
      return {
        happened: [
          clause(
            <>
              The protocol minted LOAN note #{ctx.loanId} to the lender — an ERC-721 carrying the claim on this loan:
              its repayment, or its collateral if the loan defaults.
            </>,
          ),
        ],
        meansNow: [
          crossRef,
          clause(
            <>
              The note is transferable: the claim can change hands while the loan runs, and the loan settles to whoever
              holds it.
            </>,
          ),
        ],
      };
    }

    case "burned": {
      // Custody card. Cross-references the same-tx close it retired.
      const sib = economicSibling(siblings, self);
      const outcome: ReactNode | null = sib ? (
        sib.context.data.eventType === "paid_back" ? (
          <> — the borrower had repaid it</>
        ) : sib.context.data.defaulted ? (
          <> — it had defaulted and the lender claimed the collateral</>
        ) : (
          <> — the lender had collected the repayment</>
        )
      ) : null;
      const crossRef: ClauseInput = sib ? clause(<>The loan closed in this same transaction{outcome}.</>) : null;
      return {
        happened: [clause(<>The LOAN note was burned — the claim is settled and the loan is retired on-chain.</>)],
        meansNow: [crossRef],
      };
    }

    default:
      return { happened: [] };
  }
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function pwnExplainerTeaser(
  ctx: PwnContext,
  coords: PwnCoords,
  siblings: PwnEvent[],
  self: PwnEvent,
): ReactNode | null {
  return splitLead(eventClauses(pwnEventSlots(ctx, coords, siblings, self))).lead;
}
