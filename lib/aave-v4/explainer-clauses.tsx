// Aave V4 plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the position looks
// like AFTER this event on the moved reserve), never on the event type alone: a
// withdraw that empties the supply, a repay that clears the debt, a first
// borrow, a supply that also flips on collateral all read differently though
// they share a kind. The state-blind morals the old bullets carried ("to avoid
// future liquidations, maintain a health factor well above 1.0", "limiting
// contagion risk") are gone — replaced by facts about THIS event's own figures
// and the possibility space of the state it left.
//
// Keying tier is PARTIAL: the running after-balances (supplyAfter / debtAfter)
// are optional on the wire. When one is absent its resulting-state clause simply
// drops (the never-empty floor) — an after-value is never computed here.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the open card (moved amount → the header; running
// after-balance and borrow rate → the detail grid; liquidation legs → the
// header's Seized/Repaid), a plain primary only for a same-transaction
// sibling's figure, whose receipt lives in another card's scope — an echo can't
// cross a ProvReceiptsScope boundary, so it registers here as a primary.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Aave V4 cannot fill per event, each a data fact of its wire:
//   • §5.1 (risk consequence with figures): the indexed stream carries no
//     per-event health factor. The opened card's grid reads it from the spoke
//     either side of the block (use-health-factor-around.ts); the liquidation
//     prose reads the same figure to say why the factor moved, and the operate
//     prose leaves it to the grid.
//   • §5.2 (mechanic-why on fees): Aave V4 operates charge no per-event fee. The
//     borrow rate is a rate, not a fee (surfaced as its own figure); the only
//     fee-like figure is the liquidation bonus, priced by the valued sentence.
//   • §5.4 beyond liquidations: operates carry a single primary price and no
//     counter-leg, so no valued net-outcome exists to derive; liquidation rows
//     carry both a collateral and a debt price, so the bonus is priced there.
// Filled: resulting-state figures (after-balances) via echo; the borrow rate
// (§5.2-adjacent) via echo; forward paths (§5.3) on cleared debt, emptied
// collateral and post-liquidation remainder; the liquidation bonus (§5.4); the
// same-transaction sibling seam (§5.5); the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV4Context, AaveV4EventType } from "@/lib/shared/types/protocols/aave-v4";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import {
  clause,
  cont,
  eventClauses,
  H,
  splitLead,
  type ClauseInput,
  type EventProseSlots,
} from "@/lib/shared/explainer-prose";
import {
  chainBalanceProv,
  eventLogProv,
  snapshotProv,
  heldDebtRateProv,
  type EventProvDetail,
} from "@/lib/aave-v4/position-provenance";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { effectiveBorrowAPR, borrowRatesByDebt } from "@/lib/aave-v4/borrow-rate";
import { formatExact } from "@/lib/utils/format";
import { hfLabel } from "@/lib/aave-v4/format";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { chainIdForSpokeAddress } from "@/lib/aave-v4/spoke-meta";

export type AaveV4Event = BaseActivityEvent & { context: { protocol: "aave-v4"; data: AaveV4Context } };

/** A balance at or below this reads as zero — matches the detail grid's own
 *  0.0001 floor, so the prose and the grid agree on when a leg is emptied. */
const EPS = 1e-4;

// The emitted log + Solidity field each moved amount is read from — the SAME
// maps the header uses, so a prose figure and the header figure share a
// provenance identity (entry key) and locate together. Keep in lockstep with
// aave-v4-event-header.tsx.
const AMOUNT_LABEL: Record<string, string> = {
  supply: "Amount supplied",
  withdraw: "Amount withdrawn",
  borrow: "Amount borrowed",
  repay: "Amount repaid",
};
const AMOUNT_FIELD: Record<string, string> = {
  supply: "suppliedAmount",
  withdraw: "withdrawnAmount",
  borrow: "drawnAmount",
  repay: "repaidAmount",
};
const AMOUNT_LOG: Record<string, string> = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
};
const SIBLING_VERB: Record<string, string> = {
  supply: "supplied",
  withdraw: "withdrew",
  borrow: "borrowed",
  repay: "repaid",
};
const ECON_KINDS = new Set<AaveV4EventType>(["supply", "withdraw", "borrow", "repay"]);
const isEcon = (e: AaveV4Event): boolean => ECON_KINDS.has(e.context.data.eventType);

/** The detail grid's own token formatter, reproduced so a prose after-balance
 *  reads (and keys) exactly as the grid's after-value does. */
function fmt(v: string | number | undefined): string {
  if (v == null || v === "") return "0";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const decimals = Math.min(8, Math.ceil(-Math.log10(abs)) + 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** USD value formatter for the liquidation bonus sentence — plain dollars, not a
 *  card figure (so it stays muted, never bold). */
function fmtUsd(value: number): string {
  if (!isFinite(value)) return "$0";
  if (value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const num = (s?: string): number | null => {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

// ── resulting state ──────────────────────────────────────────────────────────

export interface AaveV4ResultingState {
  supplyAfter: number | null;
  debtAfter: number | null;
  supplyBefore: number | null;
  debtBefore: number | null;
  /** The moved supply leg went from a real balance to ~0. */
  supplyEmptied: boolean;
  /** The moved debt leg went from a real balance to ~0. */
  debtCleared: boolean;
  /** This supply opened the reserve's supply leg (nothing there before). */
  opensSupply: boolean;
  /** This borrow is the reserve's first debt (nothing there before). */
  firstBorrow: boolean;
}

export function resultingState(ctx: AaveV4Context): AaveV4ResultingState {
  const supplyAfter = num(ctx.supplyAfter);
  const debtAfter = num(ctx.debtAfter);
  const supplyBefore = num(ctx.supplyBefore);
  const debtBefore = num(ctx.debtBefore);
  return {
    supplyAfter,
    debtAfter,
    supplyBefore,
    debtBefore,
    supplyEmptied: supplyAfter != null && supplyAfter <= EPS && (supplyBefore ?? 0) > EPS,
    debtCleared: debtAfter != null && debtAfter <= EPS && (debtBefore ?? 0) > EPS,
    opensSupply: supplyAfter != null && supplyAfter > EPS && (supplyBefore ?? 0) <= EPS,
    firstBorrow: debtAfter != null && debtAfter > EPS && (debtBefore ?? 0) <= EPS,
  };
}

// ── sibling helpers (the same-transaction seam) ──────────────────────────────
// `siblings` is the whole same-transaction group (chronological asc), the card
// threads it in. The first event of a multi-event transaction narrates the
// combined act; a later one carries one cross-reference, phrased against the
// transaction.

const otherEconSiblings = (siblings: AaveV4Event[], self: AaveV4Event): AaveV4Event[] =>
  siblings.filter((s) => s !== self && isEcon(s));

const isMultiActionTx = (siblings: AaveV4Event[]): boolean => siblings.length > 1;
const isFirstOfTx = (siblings: AaveV4Event[], self: AaveV4Event): boolean =>
  siblings.length > 1 && siblings[0].id === self.id;

export function coordsFor(e: AaveV4Event): EventProvDetail {
  const c = e.context.data;
  return { spokeName: c.spokeName, spokeAddress: c.spokeAddress, txHash: e.txHash, blockNumber: e.blockNumber };
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

/** The moved amount — echoes the header's amount receipt (same label / value /
 *  symbol → same entry key). `own` toggles echo (true for this card's own event,
 *  false for a same-tx sibling whose receipt lives in another scope). */
function amountFig(ctx: AaveV4Context, coord: EventProvDetail, own: boolean): ReactNode {
  const et = ctx.eventType;
  const raw = Number(ctx.amount);
  const display = aaveV4DisplaySymbol(ctx.reserveSymbol) || "tokens";
  return (
    <Fig
      echo={own}
      info={eventLogProv(
        AMOUNT_LABEL[et] ?? `Amount ${et}`,
        AMOUNT_FIELD[et] ?? et,
        { ...coord, asset: ctx.reserveSymbol, raw: ctx.raw?.amount, origin: ctx.origin?.amount },
        AMOUNT_LOG[et],
      )}
      value={formatExact(raw)}
      symbol={ctx.reserveSymbol}
    >
      {fmt(ctx.amount)} {display}
    </Fig>
  );
}

/** A running after-balance — echoes the detail grid's after-value receipt.
 *  Symbol is intentionally omitted (the grid's after Prov carries only an icon),
 *  so the entry key matches. */
function afterFig(coord: EventProvDetail, side: "supply" | "debt", ctx: AaveV4Context): ReactNode {
  const asset = ctx.reserveSymbol;
  const after = side === "supply" ? ctx.supplyAfter : ctx.debtAfter;
  const raw = side === "supply" ? ctx.raw?.supplyAfter : ctx.raw?.debtAfter;
  const display = aaveV4DisplaySymbol(asset) || "tokens";
  // The same receipt the detail grid gives the figure: the chain balance at
  // the block (interest included) where the row carries its shares, else the
  // replayed event sum.
  const detail = { ...coord, asset, raw };
  const info =
    ctx.balanceBasis === "chain"
      ? chainBalanceProv(
          "Balance after this event",
          detail,
          side,
          side === "supply"
            ? { value: raw, shares: ctx.raw?.supplySharesAfter, a: ctx.raw?.hubAddedAssets, b: ctx.raw?.hubAddedShares }
            : { value: raw, shares: ctx.raw?.drawnSharesAfter, a: ctx.raw?.hubDrawnIndex },
        )
      : snapshotProv("Balance after this event", detail, side);
  return (
    <Fig echo info={info} value={fmt(after)}>
      {fmt(after)} {display}
    </Fig>
  );
}

/** The borrow rate — echoes the header pill / detail Borrow Rate row (value is
 *  the same "X.XX%" string, symbol omitted). */
function rateFig(ctx: AaveV4Context, coord: EventProvDetail): ReactNode | null {
  const apr = effectiveBorrowAPR(ctx);
  if (!apr) return null;
  const rateSym = borrowRatesByDebt(ctx)[0]?.symbol ?? ctx.reserveSymbol;
  const pct = `${(parseFloat(apr) * 100).toFixed(2)}%`;
  return (
    <Fig echo info={heldDebtRateProv({ ...coord, asset: rateSym })} value={pct}>
      {pct}
    </Fig>
  );
}

// ── the variant table ────────────────────────────────────────────────────────

/** The position-manager line: who sent this event, when it was not the owner.
 *
 *  On Aave V4 every spoke entry point (supply, withdraw, borrow, repay,
 *  setUsingAsCollateral) carries `onlyPositionManager(onBehalfOf)`: the spoke's
 *  `caller` is the user itself, or a position manager that governance activated
 *  and the owner approved (a borrow or withdraw through one also needs the
 *  owner's per-reserve allowance). So a `caller` other than the owner IS a
 *  position manager, and that comparison is the condition here. The presence of
 *  `txFrom` / `caller` is not: the index ships both on every owner-sent row too.
 *
 *  The event T3 names the manager in one line; what a position manager is, and
 *  why a borrow needs an allowance, is T4 (the supply / borrow / repay modals).
 *  `liquidationCall` is ungated and names its liquidator in its own clause. */
function positionManagerLine(ctx: AaveV4Context): ClauseInput {
  if (ctx.eventType === "liquidation" || !ctx.caller) return null;
  const owner = ctx.owner?.toLowerCase();
  const caller = ctx.caller.toLowerCase();
  if (!owner || caller === owner) return null;
  const signedByOwner = ctx.txFrom?.toLowerCase() === owner;
  return clause(
    signedByOwner ? (
      <>Sent by the owner through position manager {addressLink(ctx, caller)}.</>
    ) : (
      <>Sent by position manager {addressLink(ctx, caller)}, acting on the owner&rsquo;s behalf.</>
    ),
  );
}

function addressLink(ctx: AaveV4Context, address: string): ReactNode {
  return (
    <a
      href={explorerUrl(chainIdForSpokeAddress(ctx.spokeAddress), "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {address.slice(0, 6)}…{address.slice(-4)}
    </a>
  );
}

/** The health factor either side of the event, as the opened card's grid reads
 *  it (see useHealthFactorAround). Absent while loading or after a miss. */
export interface AaveV4HfPair {
  before: number | null;
  after: number | null;
}

export function aaveV4EventSlots(
  ctx: AaveV4Context,
  coord: EventProvDetail,
  siblings: AaveV4Event[],
  self: AaveV4Event,
  hf?: AaveV4HfPair,
): EventProseSlots {
  const slots = aaveV4EventSlotsBase(ctx, coord, siblings, self, hf);
  const managed = positionManagerLine(ctx);
  if (!managed) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), managed] };
}

function aaveV4EventSlotsBase(
  ctx: AaveV4Context,
  coord: EventProvDetail,
  siblings: AaveV4Event[],
  self: AaveV4Event,
  hf?: AaveV4HfPair,
): EventProseSlots {
  const rs = resultingState(ctx);
  const token = aaveV4DisplaySymbol(ctx.reserveSymbol) || "the asset";
  const market = ctx.spokeName;
  const marketPhrase = market ? <>the {market} market</> : <>this market</>;
  const sibling = siblingClause(siblings, self);

  switch (ctx.eventType) {
    case "supply": {
      const happened = ctx.alsoToggledCollateral ? (
        <>
          Supplied {amountFig(ctx, coord, true)} to {marketPhrase} and enabled it as collateral in the same transaction.
        </>
      ) : (
        <>
          Supplied {amountFig(ctx, coord, true)} to {marketPhrase}.
        </>
      );
      const changed: ClauseInput = rs.supplyAfter
        ? clause(
            rs.opensSupply ? (
              <>The position now holds {afterFig(coord, "supply", ctx)} on this reserve, its first here.</>
            ) : (
              <>
                Its {token} supply on this reserve is now {afterFig(coord, "supply", ctx)}.
              </>
            ),
          )
        : null;
      const meansNow: ClauseInput[] = ctx.alsoToggledCollateral
        ? [
            clause(
              <>
                This {token} earns variable interest and now backs the position&rsquo;s borrows, so it can be seized in
                a liquidation.
              </>,
            ),
          ]
        : [clause(<>This {token} earns variable interest, and can be enabled as collateral to back borrows.</>)];
      return { happened: [clause(happened)], changed: changed ? [changed] : [], meansNow: [...meansNow, sibling] };
    }

    case "withdraw": {
      const ending: ClauseInput = rs.supplyEmptied
        ? cont(<>, fully exiting the {token} supply on this market.</>)
        : rs.supplyAfter != null
          ? cont(<>, leaving {afterFig(coord, "supply", ctx)} supplied here.</>)
          : cont(<>.</>);
      return {
        happened: [clause(<>Withdrew {amountFig(ctx, coord, true)} back to the wallet</>), ending],
        meansNow: [sibling],
      };
    }

    case "borrow": {
      const happened = rs.firstBorrow ? (
        <>Borrowed {amountFig(ctx, coord, true)} — the position&rsquo;s first debt on this reserve.</>
      ) : (
        <>Borrowed {amountFig(ctx, coord, true)}.</>
      );
      const changed: ClauseInput = rs.debtAfter
        ? clause(
            <>
              Outstanding {token} debt is now {afterFig(coord, "debt", ctx)}.
            </>,
          )
        : null;
      const rate = rateFig(ctx, coord);
      const meansNow: ClauseInput[] = [
        rate ? clause(<>Interest accrues on it continuously, at a {rate} borrow rate.</>) : null,
        sibling,
      ];
      return { happened: [clause(happened)], changed: changed ? [changed] : [], meansNow };
    }

    case "repay": {
      const ending: ClauseInput = rs.debtCleared
        ? cont(<>, clearing the {token} debt on this market in full.</>)
        : rs.debtAfter != null
          ? cont(<>, leaving {afterFig(coord, "debt", ctx)} of debt.</>)
          : cont(<>.</>);
      const repayRate = rateFig(ctx, coord);
      const meansNow: ClauseInput[] = rs.debtCleared
        ? [
            clause(
              <>
                With this debt cleared, the collateral that backed it can be withdrawn or left to support a future
                borrow.
              </>,
            ),
            sibling,
          ]
        : [
            repayRate ? clause(<>The debt still outstanding accrues interest at a {repayRate} borrow rate.</>) : null,
            sibling,
          ];
      return { happened: [clause(<>Repaid {amountFig(ctx, coord, true)}</>), ending], meansNow };
    }

    case "liquidation":
      return liquidationSlots(ctx, coord, hf);

    case "collateral_toggle": {
      const happened = ctx.enabled ? (
        <>
          Enabled {token} as collateral on {marketPhrase}.
        </>
      ) : (
        <>
          Disabled {token} as collateral on {marketPhrase}.
        </>
      );
      const meansNow: ClauseInput = ctx.enabled
        ? clause(
            <>
              This {token} now backs the position&rsquo;s borrows, raising its borrowing power and exposing it to
              seizure in a liquidation.
            </>,
          )
        : clause(
            <>
              This {token} is now held outside the position&rsquo;s collateral and is safe from seizure in a
              liquidation, so the position&rsquo;s borrowing power falls.
            </>,
          );
      return { happened: [clause(happened)], meansNow: [meansNow] };
    }

    default:
      return { happened: [] };
  }
}

/** A snapshot leg list read as prose: "175.8240 USDT", "1,591 USDG and 0.808 USDC".
 *  Amounts at the grid's own precision (fmt), so each matches its T2 row. */
function legList(rows: { symbol: string; amount: string }[] | undefined): ReactNode | null {
  const live = (rows ?? []).filter((r) => (num(r.amount) ?? 0) > EPS);
  if (live.length === 0) return null;
  return live.map((r, i) => (
    <span key={r.symbol}>
      {i > 0 ? (i === live.length - 1 ? " and " : ", ") : null}
      <strong className="font-semibold text-foreground">
        {fmt(r.amount)} {aaveV4DisplaySymbol(r.symbol)}
      </strong>
    </span>
  ));
}

function liquidationSlots(ctx: AaveV4Context, coord: EventProvDetail, hf?: AaveV4HfPair): EventProseSlots {
  const rs = resultingState(ctx);
  const market = ctx.spokeName;
  const debtSym = aaveV4DisplaySymbol(ctx.reserveSymbol) || "debt";
  const seizedFig =
    ctx.liquidatedCollateralAmount && ctx.collateralSymbol ? (
      <Fig
        echo
        info={eventLogProv(
          "Collateral seized in the liquidation",
          "collateralAmountRemoved",
          {
            ...coord,
            asset: ctx.collateralSymbol,
            raw: ctx.raw?.liquidatedCollateralAmount,
            origin: ctx.origin?.liquidatedCollateralAmount,
          },
          "LiquidationCall",
        )}
        value={formatExact(Number(ctx.liquidatedCollateralAmount))}
        symbol={ctx.collateralSymbol}
      >
        {fmt(ctx.liquidatedCollateralAmount)} {aaveV4DisplaySymbol(ctx.collateralSymbol)}
      </Fig>
    ) : null;
  const clearedFig = ctx.debtToCover ? (
    <Fig
      echo
      info={eventLogProv(
        "Debt repaid by the liquidation",
        "debtAmountRestored",
        { ...coord, asset: ctx.reserveSymbol, raw: ctx.raw?.amount, origin: ctx.origin?.amount },
        "LiquidationCall",
      )}
      value={formatExact(Number(ctx.debtToCover))}
      symbol={ctx.reserveSymbol}
    >
      {fmt(ctx.debtToCover)} {aaveV4DisplaySymbol(ctx.reserveSymbol)}
    </Fig>
  ) : null;

  const happened = market ? (
    <>This position was liquidated — the account&rsquo;s health factor on the {market} spoke had fallen below 1.0.</>
  ) : (
    <>This position was liquidated — the account&rsquo;s health factor had fallen below 1.0.</>
  );

  const changed: ClauseInput =
    clearedFig && seizedFig
      ? clause(
          <>
            A liquidator repaid {clearedFig} of the debt and took {seizedFig} of collateral in return.
          </>,
        )
      : clearedFig
        ? clause(<>A liquidator repaid {clearedFig} of the debt.</>)
        : seizedFig
          ? clause(<>A liquidator seized {seizedFig} of collateral.</>)
          : null;

  // Why the health factor moved. The figures echo the grid's Health factor cell
  // when the read has landed; the reason stands without them.
  const otherDebts = (ctx.allDebts ?? []).filter((d) => d.symbol !== ctx.reserveSymbol && (num(d.amount) ?? 0) > EPS);
  const hfMove =
    hf && hf.before != null ? (
      <>
        The health factor went from <H>{hfLabel(hf.before)}</H> to <H>{hfLabel(hf.after)}</H>
      </>
    ) : null;
  const why: ClauseInput = rs.debtCleared
    ? clause(
        <>
          {hfMove ? <>{hfMove} because it</> : <>It</>} cleared all of the {debtSym} debt
          {otherDebts.length > 0 ? (
            <>; the {legList(otherDebts)} debt remains.</>
          ) : (
            <>, the position&rsquo;s only debt.</>
          )}
        </>,
      )
    : rs.debtAfter != null && rs.debtBefore != null
      ? clause(
          <>
            {hfMove ? <>{hfMove}: the</> : <>The</>} {debtSym} debt fell from <H>{fmt(rs.debtBefore)}</H> to{" "}
            <H>{fmt(rs.debtAfter)}</H>. Collateral counts toward the health factor only up to its liquidation threshold,
            so seizing it lowers the factor less than clearing the same value of debt raises it.
          </>,
        )
      : null;

  // What is left, on every liquidation: collateral and debt per reserve, as
  // the grid's after rows show them.
  const collLeft = legList(ctx.allSupplies);
  const debtLeft = legList(ctx.allDebts);
  const left: ClauseInput =
    collLeft || debtLeft
      ? clause(
          debtLeft ? (
            <>
              Left after it: {collLeft ? <>{collLeft} of collateral</> : <>no collateral</>} against {debtLeft} of debt,
              still accruing interest; the position can be liquidated again if its health factor falls below 1.0.
            </>
          ) : (
            <>Left after it: {collLeft} of collateral and no debt.</>
          ),
        )
      : null;

  const meansNow: ClauseInput[] = [
    why,
    liquidationBonus(ctx),
    left,
    ctx.liquidator ? clause(<>Sent by liquidator {addressLink(ctx, ctx.liquidator)}.</>) : null,
  ];

  return { happened: [clause(happened)], changed: changed ? [changed] : [], meansNow };
}

/** The liquidation bonus — the seized collateral valued against the debt
 *  cleared, at the two prices the row carries. Both figures are plain dollars,
 *  not card chrome, so the sentence stays muted (never bold). Drops WHOLE when
 *  either price is missing or the debt-cleared value is non-positive — the
 *  never-empty floor. */
function liquidationBonus(ctx: AaveV4Context): ClauseInput {
  const cp = ctx.collateralPrice?.usd;
  const dp = ctx.debtPrice?.usd;
  const seized = Number(ctx.liquidatedCollateralAmount);
  const cleared = Number(ctx.debtToCover);
  if (!cp || !dp || !Number.isFinite(seized) || !Number.isFinite(cleared) || seized <= 0 || cleared <= 0) return null;
  const seizedUsd = seized * cp;
  const clearedUsd = cleared * dp;
  if (clearedUsd <= 0) return null;
  const bonusPct = (seizedUsd / clearedUsd - 1) * 100;
  if (!Number.isFinite(bonusPct)) return null;
  const bonusStr = `${bonusPct >= 0 ? "+" : "−"}${Math.abs(bonusPct).toFixed(2)}%`;
  return clause(
    <>
      At the prices at the time, the seized collateral was worth about {fmtUsd(seizedUsd)} against {fmtUsd(clearedUsd)}{" "}
      of debt cleared — a {bonusStr} bonus the liquidator captured for taking on the position.
    </>,
  );
}

/** The same-transaction seam. On the first event of a multi-event transaction,
 *  narrate the combined act (naming each other economic action and its amount, a
 *  cross-scope primary figure). On a later event, one cross-reference clause
 *  phrased against the transaction. */
function siblingClause(siblings: AaveV4Event[], self: AaveV4Event): ClauseInput {
  if (!isMultiActionTx(siblings)) return null;
  const others = otherEconSiblings(siblings, self);
  if (others.length === 0) return null;

  if (isFirstOfTx(siblings, self)) {
    const parts = others.map((s, i) => {
      const sc = s.context.data;
      const verb = SIBLING_VERB[sc.eventType] ?? sc.eventType;
      return (
        <span key={i}>
          {i > 0 ? (i === others.length - 1 ? " and " : ", ") : null}
          {verb} {amountFig(sc, coordsFor(s), false)}
        </span>
      );
    });
    return clause(<>In the same transaction, the position also {parts}.</>);
  }

  // A later step: point back at the transaction without re-narrating figures
  // (each sibling's own card carries them) — name the other action and its
  // asset so the cross-reference is concrete.
  const parts = others.map((s) => {
    const sc = s.context.data;
    const verb = SIBLING_VERB[sc.eventType] ?? sc.eventType;
    return `${verb} ${aaveV4DisplaySymbol(sc.reserveSymbol)}`;
  });
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return clause(<>Part of the same transaction, which also {list}.</>);
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function aaveV4ExplainerTeaser(
  ctx: AaveV4Context,
  coord: EventProvDetail,
  siblings: AaveV4Event[],
  self: AaveV4Event,
): ReactNode | null {
  return splitLead(eventClauses(aaveV4EventSlots(ctx, coord, siblings, self))).lead;
}
