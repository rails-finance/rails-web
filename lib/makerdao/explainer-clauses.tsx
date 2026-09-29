// MakerDAO plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the vault looks
// like AFTER this event), not on the event kind alone: a repayment that clears
// the debt, a withdrawal that empties the collateral, and a repayment that only
// trims the balance read differently though they share a kind. The state-blind
// morals the old bullets carried ("raising the vault's collateral ratio",
// "lowering the vault's collateral ratio") are gone — replaced by facts about
// THIS event's own figures and the vault's resulting state.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the open card (the collateral delta → header / detail
// transition; the collateral after-balance → detail grid; the liquidation legs
// → the forensics block; the new owner → the header party chip). A figure with
// no on-card twin stays muted, unwrapped body text (the highlight rule).
//
// The debt is quoted in DAI (or USDS on LockStake urns): dart × the rate at the
// block, the figure the header draws, so it echoes the header's receipt. It is
// available only once the event carries its block's rate, so a draw/repay
// states its amount when it can and states the action alone when it can't (the
// never-empty floor).
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// The rows carry no price; the page reads the ilk at each row's block (the OSM
// price, the minimum ratio) by chain call and hands it in as `extras`, with the
// debt split (drawn / fee) and, on a liquidation, the auction's outcome. Each
// clause that needs one of them is left out until it lands (the never-empty
// floor keeps the action sentence).

import type { ReactNode } from "react";
import type { BaseActivityEvent, MakerDAOContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import {
  clause,
  cont,
  eventClauses,
  splitLead,
  type ClauseInput,
  type EventProseSlots,
} from "@/lib/shared/explainer-prose";
import {
  dinkProv,
  inkAfterProv,
  giveDstProv,
  giveOwnerProv,
  debtDeltaOf,
  type MakerCoords,
} from "@/lib/makerdao/event-provenance";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { AmountText } from "@/components/shared/amount-text";
import { H } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";
import type { MakerAuctionRead, MakerIlkAt } from "@/lib/makerdao/chain-history-types";
import type { MakerDebtSplit, MakerLeftoverLink } from "@/lib/makerdao/vault-history";

/** What the page knows about a row beyond its own fields
 *  (lib/makerdao/vault-history.tsx). Every clause that needs one of these is
 *  left out until it lands. */
export interface MakerRowExtras {
  /** The ilk at the row's block: the OSM price, the minimum ratio. */
  ilkAt?: MakerIlkAt | null;
  /** The debt at the row split into DAI drawn and fee. */
  split?: MakerDebtSplit;
  /** The previous row's timestamp. */
  previousAt?: number;
  /** A row that moved collateral an auction handed back. */
  leftover?: MakerLeftoverLink;
  /** A liquidation row's auction. */
  auction?: MakerAuctionRead;
  /** A liquidation row: when the owner took the handed-back collateral out. */
  leftoverTakenAt?: number;
}

const dai2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const usd2 = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct2 = (r: number): string =>
  `${(r * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const matPct = (m: number): string => `${Number((m * 100).toFixed(2))}%`;

/** Sub-wei magnitudes read as zero — the exact-history replay lands on clean
 *  zeros, but a defensive epsilon keeps a stray residual from reading as a
 *  live balance. */
export const MAKER_EPS = 1e-9;

// ── resulting state ──────────────────────────────────────────────────────────

export interface MakerResultingState {
  inkAfter: number;
  artAfter: number;
  hasDebtAfter: boolean;
  collateralOnly: boolean;
  closedPosition: boolean;
  debtOnly: boolean;
}

export function resultingState(ctx: MakerDAOContext): MakerResultingState {
  const inkAfter = Number(ctx.inkAfter);
  const artAfter = Number(ctx.artAfter);
  const ink = Number.isFinite(inkAfter) ? Math.max(0, inkAfter) : 0;
  const art = Number.isFinite(artAfter) ? Math.max(0, artAfter) : 0;
  const colZero = ink <= MAKER_EPS;
  const debtZero = art <= MAKER_EPS;
  return {
    inkAfter: ink,
    artAfter: art,
    hasDebtAfter: !debtZero,
    collateralOnly: !colZero && debtZero,
    closedPosition: colZero && debtZero,
    debtOnly: colZero && !debtZero,
  };
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

const fmtAbs = (h?: string): string => formatNumber(Math.abs(Number(h)));

// ── the third-party actor clause ─────────────────────────────────────────────

/** The prose half of the pink chip the header renders when the vault's owner
 *  neither signed the transaction nor was its entry contract. `txFrom` / `txTo`
 *  ship exactly where that two-fact verdict is decidable (see MakerDAOContext),
 *  so their presence IS the verdict — which is what lets this stay a pure
 *  function with the owner never in hand.
 *
 *  ⚠️ Maker's second fact is WEAKER than every other explorer's and the wording
 *  must not overclaim it. `txTo` is the TRANSACTION ENVELOPE's `to`, not a
 *  contract-emitted `msg.sender`: the Vat's LogNote `usr` is always the CDP
 *  manager and so never discriminates, while a DSProxy is auth-gated, so a
 *  transaction entering through the owner's own proxy means the owner initiated
 *  it whoever signed. What the pair supports is exactly "signed by someone else
 *  AND not entered through the owner's own proxy" — never "the contract-level
 *  msg.sender was a third party".
 *
 *  The authority splits by DIRECTION, and by which contract the move went
 *  through. `Vat.frob` exempts consent precisely when the move is safening:
 *
 *      require(either(both(dart <= 0, dink >= 0), wish(u, msg.sender)),
 *              "Vat/not-allowed-u");
 *
 *  so a direct frob that only adds collateral and/or repays debt needs nothing
 *  from the owner. But nearly every vault is held through `DssCdpManager`,
 *  whose own frob carries `cdpAllowed` — `msg.sender == owns[cdp] ||
 *  cdpCan[owns[cdp]][cdp][msg.sender] == 1` — so on that path even a
 *  value-ADDING move needs a prior `cdpAllow`. Both regimes are named rather
 *  than flattening them into an unqualified "anyone can add". */
function delegatedActorMechanic(ctx: MakerDAOContext): ClauseInput {
  if (!ctx.txFrom || !ctx.txTo || !ctx.ownerAt) return null;
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;
  const safening = dart <= 0 && dink >= 0;
  const opened = (
    <>
      Another address executed this: the transaction was signed by someone other than the vault&rsquo;s owner and did
      not enter through the owner&rsquo;s own proxy.{" "}
    </>
  );
  return clause(
    safening ? (
      <>
        {opened}
        Maker lets anyone make a vault safer — a move that only adds collateral or only repays debt is accepted straight
        from any address. Vaults held through the CDP manager are stricter, and there the owner has to have authorised
        that address on this vault first.
      </>
    ) : (
      <>
        {opened}
        Taking collateral out or drawing new debt requires standing permission: the owner must have granted that address
        permission to act on the vault, per-vault where the CDP manager holds it. The owner can withdraw the permission
        at any time.
      </>
    ),
  );
}

// ── the variant table ────────────────────────────────────────────────────────

export function makerdaoEventSlots(
  ctx: MakerDAOContext,
  coords: MakerCoords,
  extras: MakerRowExtras = {},
): EventProseSlots {
  const slots = makerdaoEventSlotsBase(ctx, coords, extras);
  const actor = delegatedActorMechanic(ctx);
  if (!actor) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), actor] };
}

function makerdaoEventSlotsBase(ctx: MakerDAOContext, coords: MakerCoords, extras: MakerRowExtras): EventProseSlots {
  // Every sentence below reads the vault after the event. Without the index's
  // running state for this row there is nothing true to say about it.
  if (ctx.inkAfter == null || ctx.artAfter == null) {
    return { happened: [clause(<>The vault&rsquo;s balances after this event are not loaded.</>)] };
  }
  const sym = ctx.collateralSymbol;
  const dsym = ilkDebtSymbol(ctx.ilk);
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;
  const rate = ctx.rateAtBlock != null ? Number(ctx.rateAtBlock) / 1e27 : null;
  const rs = resultingState(ctx);

  // Collateral delta echoes the header delta / detail-grid transition (same prov
  // vocabulary + coords, same exact value → same entry key). A frob labels the
  // header axis, so its stored value is the bare magnitude; grab / fork keep the
  // signed value.
  const labeled = ctx.eventType === "frob";
  const colDeltaFig = () => (
    <Fig echo info={dinkProv(sym, coords)} value={chainTruthDeltaValue(dink, labeled)} symbol={sym}>
      {fmtAbs(ctx.dink)} {sym}
    </Fig>
  );
  // The collateral the vault holds after this event echoes the detail grid's
  // Collateral stat (formatNumber, same symbol → same entry key).
  const colAfterFig = () => (
    <Fig echo info={inkAfterProv(sym, coords)} value={formatNumber(rs.inkAfter)} symbol={sym}>
      <AmountText value={rs.inkAfter} /> {sym}
    </Fig>
  );

  // The DAI amount a draw or repay moved (dart × rate at the block) echoes the
  // header's debt delta: same prov, same exact value. Null where the row has no
  // rate; the clause then names the action alone.
  const debt = debtDeltaOf(ctx, dsym, coords);
  const daiAmount: ReactNode | null =
    ctx.debtChange != null && dart !== 0 ? (
      <Fig echo info={debt.prov} value={chainTruthDeltaValue(debt.value, labeled)} symbol={dsym}>
        <AmountText value={Math.abs(debt.value)} /> {dsym}
      </Fig>
    ) : null;

  switch (ctx.eventType) {
    case "frob":
      return frobSlots(ctx, rs, dink, dart, daiAmount, colDeltaFig, colAfterFig, extras);
    case "grab":
      return grabSlots(ctx, coords, sym, dsym, dink, dart, daiAmount, rate, colDeltaFig, extras);
    case "give":
      return giveSlots(ctx, coords, colAfterFig, rs);
    case "fork-out":
    case "fork-in":
      return forkSlots(ctx, dink, dart, daiAmount, colDeltaFig, colAfterFig, rs);
    case "lse-kick":
    case "lse-take":
    case "lse-remove":
      return lseSlots(ctx, sym, colAfterFig, rs);
    default:
      return { happened: [] };
  }
}

// ── frob (deposit / withdraw / draw / repay, singly or combined) ──────────────

/** What the row's collateral and debt mean at its block's price: the ratio,
 *  how far the price could fall before the minimum, and the DAI the vault
 *  could still draw. Null without the ilk read or with no debt. */
function riskAt(rs: MakerResultingState, debtAfter: number, ilkAt?: MakerIlkAt | null) {
  const price = ilkAt?.priceUsd ?? null;
  const mat = ilkAt?.mat ?? null;
  if (price == null || mat == null || !(price > 0) || !(debtAfter > 1e-9) || !(rs.inkAfter > MAKER_EPS)) return null;
  const ratio = (rs.inkAfter * price) / debtAfter;
  const liqPrice = (debtAfter * mat) / rs.inkAfter;
  return {
    price,
    mat,
    ratio,
    liqPrice,
    drop: 1 - liqPrice / price,
    room: Math.max(0, (rs.inkAfter * price) / mat - debtAfter),
  };
}

function frobSlots(
  ctx: MakerDAOContext,
  rs: MakerResultingState,
  dink: number,
  dart: number,
  daiAmount: ReactNode | null,
  colDeltaFig: () => ReactNode,
  colAfterFig: () => ReactNode,
  extras: MakerRowExtras,
): EventProseSlots {
  const sym = ctx.collateralSymbol;
  const dsym = ilkDebtSymbol(ctx.ilk);
  const price = extras.ilkAt?.priceUsd ?? null;
  const debtAfter = ctx.debtAfter != null ? Number(ctx.debtAfter) : 0;
  const debtChange = ctx.debtChange != null ? Number(ctx.debtChange) : 0;
  const risk = riskAt(rs, debtAfter, extras.ilkAt);
  const split = extras.split;
  const since = split?.stretchStartAt != null ? formatDate(split.stretchStartAt) : null;

  // Collateral an auction handed back: the row moves it, it is not new money.
  const lo = extras.leftover;
  if (lo) {
    if (lo.role === "in") {
      return {
        happened: [
          clause(
            <>
              This moved {colDeltaFig()} into the vault: the collateral the auction of {formatDate(lo.grabAt)} handed
              back once it had covered the debt and the penalty. It is the same collateral, not a new deposit.
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              The auction returns what is left to the vault&rsquo;s address as free collateral; moving it into the vault
              and out again is how the owner takes it.
            </>,
          ),
        ],
      };
    }
    const kept = rs.inkAfter;
    return {
      happened: [
        clause(
          <>
            This took {colDeltaFig()} out of the vault to the owner: what the auction of {formatDate(lo.grabAt)} handed
            back.
          </>,
        ),
      ],
      meansNow: [
        kept > MAKER_EPS
          ? clause(<>{colAfterFig()} stays behind; the vault owes nothing and holds nothing else.</>)
          : clause(<>The vault is empty again.</>),
      ],
    };
  }

  const valueOf = (amount: number) =>
    price != null ? <> (worth {usd0(amount * price)} at the OSM price then)</> : null;
  const collFrag: ReactNode | null =
    dink > 0 ? (
      <>
        deposited {colDeltaFig()} of collateral{valueOf(dink)}
      </>
    ) : dink < 0 ? (
      <>
        withdrew {colDeltaFig()} of collateral{valueOf(-dink)}
      </>
    ) : null;
  const debtFrag: ReactNode | null =
    dart > 0 ? (
      daiAmount ? (
        <>drew {daiAmount} of new debt</>
      ) : (
        <>drew new debt</>
      )
    ) : dart < 0 ? (
      daiAmount ? (
        <>repaid {daiAmount} of debt</>
      ) : (
        <>repaid part of the debt</>
      )
    ) : null;

  const noDebtPath = clause(
    <>
      With no debt the vault accrues no stability fee, and nothing can liquidate it; the collateral can be withdrawn at
      any time or left to back a future borrow.
    </>,
  );

  // The row's risk at its own price: how far the collateral price could fall
  // and how much more the vault could draw.
  const riskClause: ClauseInput = risk
    ? clause(
        <>
          At <H>{usd2(risk.price)}</H> an {sym}, the vault could draw <H>{dai2(risk.room)}</H> {dsym} more before the{" "}
          <H>{matPct(risk.mat)}</H> minimum, and {sym} could fall {Math.max(0, Math.round(risk.drop * 100))}% (to{" "}
          {usd2(risk.liqPrice)}) before it could be liquidated.
        </>,
      )
    : null;

  // What the debt is made of, in the one definition the card and the flows
  // panel use: the DAI drawn since the vault last owed nothing, and the fee.
  const feeClause: ClauseInput = (() => {
    if (!split || split.drawnBefore == null || split.feeBefore == null || dart === 0 || since == null) return null;
    if (dart < 0 && rs.artAfter <= MAKER_EPS) {
      const repaid = -debtChange;
      const drawnPart = split.drawnBefore;
      const feePart = Math.max(0, repaid - drawnPart);
      if (!(feePart > 0.005)) return null;
      const recent = ctx.interestSincePrevious != null ? Number(ctx.interestSincePrevious) : null;
      return clause(
        <>
          The {dai2(repaid)} {dsym} repayment covered {dai2(drawnPart)} {dsym} drawn since {since} and {dai2(feePart)}{" "}
          {dsym} of stability fee
          {recent != null && recent > 0.005 && extras.previousAt != null ? (
            <>
              , <H>{dai2(recent)}</H> of it accrued since {formatDate(extras.previousAt)}
            </>
          ) : null}
          .
        </>,
      );
    }
    if (split.drawnAfter == null || split.feeAfter == null || !(debtAfter > 1e-9) || split.feeAfter < 0.005)
      return null;
    return clause(
      <>
        The <H>{dai2(debtAfter)}</H> {dsym} now owed is {dai2(split.drawnAfter)} {dsym} drawn since {since} and{" "}
        {dai2(split.feeAfter)} {dsym} of stability fee.
      </>,
    );
  })();

  // The opening act reads as one self-contained sentence.
  if (ctx.isOpen) {
    const happened = (
      <>
        The vault opened with {colDeltaFig()} of collateral{valueOf(dink)}
        {dart > 0 ? <> and {daiAmount ?? "its first debt"} drawn against it</> : null}.
      </>
    );
    return {
      happened: [clause(happened)],
      changed: [riskClause],
      meansNow: [
        rs.collateralOnly
          ? noDebtPath
          : clause(
              <>
                From here the debt grows at {ctx.ilk}&rsquo;s stability fee, added to what the vault owes without any
                action of its own.
              </>,
            ),
      ],
    };
  }

  // A zero-delta frob moved nothing.
  if (!collFrag && !debtFrag) {
    return {
      happened: [
        clause(<>This operation moved no collateral and no debt — commonly a bundled step of a larger action.</>),
      ],
    };
  }

  // The action sentence carries no terminal punctuation; the ending continuation
  // supplies it and states the resulting state.
  const action: ReactNode =
    collFrag && debtFrag ? (
      <>
        This operation {collFrag} and {debtFrag}
      </>
    ) : collFrag ? (
      <>This operation {collFrag}</>
    ) : (
      <>This operation {debtFrag}</>
    );
  const ending: ClauseInput = rs.closedPosition
    ? cont(<>, leaving the vault empty — nothing remains on either side.</>)
    : rs.collateralOnly && dart < 0
      ? cont(<>, clearing the debt in full — the vault now holds collateral only.</>)
      : cont(<>.</>);

  // Without the ilk read, the resulting holding (echoes the after-collateral
  // figure) stands in for the risk sentence.
  const holding: ClauseInput =
    !risk && rs.hasDebtAfter && rs.inkAfter > MAKER_EPS
      ? clause(<>The vault now holds {colAfterFig()} of collateral against its outstanding debt.</>)
      : null;

  const meansNow: ClauseInput[] = rs.collateralOnly ? [noDebtPath] : [];

  return { happened: [clause(action), ending], changed: [feeClause, riskClause, holding], meansNow };
}

// ── grab (liquidation) ───────────────────────────────────────────────────────

function grabSlots(
  ctx: MakerDAOContext,
  coords: MakerCoords,
  sym: string,
  dsym: string,
  dink: number,
  dart: number,
  daiAmount: ReactNode | null,
  rate: number | null,
  colDeltaFig: () => ReactNode,
  extras: MakerRowExtras,
): EventProseSlots {
  const price = ctx.priceAtBlock?.usd ?? extras.ilkAt?.priceUsd ?? null;
  const a = extras.auction?.kind === "clipper" ? extras.auction : null;
  const mat = a?.mat ?? extras.ilkAt?.mat ?? null;
  const cleared = rate != null ? Math.abs(dart) * rate : null;
  const ratio = price != null && cleared != null && cleared > 0 ? (Math.abs(dink) * price) / cleared : null;

  const why =
    ratio != null && mat != null && price != null ? (
      <>
        The vault&rsquo;s collateral ratio fell under {ctx.ilk}&rsquo;s <H>{matPct(mat)}</H> minimum (
        <H>{pct2(ratio)}</H> at the OSM price of <H>{usd2(price)}</H>), so a keeper liquidated it:
      </>
    ) : (
      <>This vault fell below its liquidation ratio and was liquidated:</>
    );
  const happened = (
    <>
      {why} {colDeltaFig()} of collateral was seized
      {dart !== 0 && daiAmount ? <>, and {daiAmount} of debt cleared</> : null}.
    </>
  );

  if (!extras.auction || (a && !a.settled)) {
    // Not read yet, or still running: the mechanism, without figures.
    return {
      happened: [clause(happened)],
      meansNow: [
        clause(
          <>
            The seized collateral goes to an auction that must raise the debt plus a liquidation penalty; whatever
            collateral is left once that is covered goes back to the vault.
          </>,
        ),
      ],
    };
  }
  if (!a) {
    return {
      happened: [clause(happened)],
      meansNow: [
        clause(
          <>
            The seized collateral went to one of Maker&rsquo;s earlier auctions (the Flipper), whose results this page
            does not read.
          </>,
        ),
      ],
    };
  }

  const tab = Number(a.tabDai);
  const penalty = Number(a.penaltyDai);
  const sold = Number(a.soldInk);
  const left = Number(a.leftoverInk);
  const short = Number(a.shortfallDai);
  const when = a.settledAt != null ? formatDate(a.settledAt) : null;
  const auctionClause = clause(
    <>
      The auction had to raise <H>{dai2(tab)}</H> {dsym}: the debt plus a <H>{dai2(penalty)}</H> {dsym} penalty (
      {Math.round((a.chop - 1) * 100)}%).{" "}
      {left > 0 ? (
        <>
          {when ? <>On {when} it </> : <>It </>}sold <H>{formatNumber(sold)}</H> {sym} for that and returned{" "}
          <H>{formatNumber(left)}</H> {sym} to the vault.
        </>
      ) : short > 0 ? (
        <>
          It sold all {formatNumber(sold)} {sym} and still fell <H>{dai2(short)}</H> {dsym} short; the protocol absorbed
          the rest and nothing came back to the vault.
        </>
      ) : (
        <>
          It sold all {formatNumber(sold)} {sym} to cover it, leaving nothing to return.
        </>
      )}
    </>,
  );
  const outcome = clause(
    <>
      The owner keeps the {dsym} it drew and gives up <H>{formatNumber(sold)}</H> {sym}: the debt&rsquo;s worth of
      collateral and the penalty&rsquo;s.
      {left > 0 && extras.leftoverTakenAt != null ? (
        <>
          {" "}
          The returned {formatNumber(left)} {sym} waited at the vault&rsquo;s address until the owner took it out on{" "}
          {formatDate(extras.leftoverTakenAt)}.
        </>
      ) : null}
    </>,
  );
  void coords;
  return { happened: [clause(happened)], changed: [auctionClause], meansNow: [outcome] };
}

// ── give (ownership transfer) ────────────────────────────────────────────────

function giveSlots(
  ctx: MakerDAOContext,
  coords: MakerCoords,
  colAfterFig: () => ReactNode,
  rs: MakerResultingState,
): EventProseSlots {
  const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  // The new holder echoes the header's party chip — the resolved owner when the
  // give resolved the proxy hop, otherwise the raw destination.
  const dst = ctx.giveDstOwner ?? ctx.giveDst;
  const newOwnerFig = dst ? (
    <Fig echo info={ctx.giveDstOwner ? giveOwnerProv(coords) : giveDstProv(coords)} value={dst}>
      {short(dst)}
    </Fig>
  ) : (
    <>a new owner</>
  );

  const happened = (
    <>
      The vault changed hands: its ownership moved to {newOwnerFig}
      {ctx.giveDstOwner && ctx.giveDstOwner !== ctx.giveDst ? <> — the owner behind a proxy contract</> : null}.
    </>
  );
  const meansNow: ClauseInput[] = [
    clause(
      <>
        Nothing in the vault moved — the collateral and debt are untouched; only who controls it changed. An owner can
        hand the vault to another address, or authorise another address to do so on their behalf
        {ctx.giveCaller ? <> (this one was carried out by {short(ctx.giveCaller)})</> : null}.
      </>,
    ),
  ];
  if (rs.inkAfter > MAKER_EPS) {
    meansNow.push(clause(<>The vault still holds {colAfterFig()} of collateral, now under the new owner.</>));
  }
  return { happened: [clause(happened)], meansNow };
}

// ── fork-out / fork-in (position migration between urns) ──────────────────────

function forkSlots(
  ctx: MakerDAOContext,
  dink: number,
  dart: number,
  daiAmount: ReactNode | null,
  colDeltaFig: () => ReactNode,
  colAfterFig: () => ReactNode,
  rs: MakerResultingState,
): EventProseSlots {
  const out = ctx.eventType === "fork-out";
  const moved: ReactNode =
    dink !== 0 && dart !== 0 && daiAmount ? (
      <>
        {colDeltaFig()} of collateral together with {daiAmount} of debt
      </>
    ) : dink !== 0 ? (
      <>{colDeltaFig()} of collateral</>
    ) : dart !== 0 && daiAmount ? (
      <>{daiAmount} of debt</>
    ) : (
      <>the position</>
    );

  const happened = (
    <>
      The position moved {out ? "out of" : "into"} this vault: {moved} {out ? "left for" : "arrived from"} another
      vault.
    </>
  );
  const meansNow: ClauseInput[] = [
    clause(
      <>
        No tokens changed hands and no debt was repaid — the collateral and the debt against it relocated together. This
        is how a vault is migrated.
      </>,
    ),
  ];
  if (rs.inkAfter > MAKER_EPS) {
    meansNow.push(clause(<>This vault now holds {colAfterFig()} of collateral.</>));
  }
  return { happened: [clause(happened)], meansNow };
}

// ── LockStake auction lifecycle (zero-delta markers) ─────────────────────────

function lseSlots(
  ctx: MakerDAOContext,
  sym: string,
  colAfterFig: () => ReactNode,
  rs: MakerResultingState,
): EventProseSlots {
  const happened =
    ctx.eventType === "lse-kick" ? (
      <>
        A liquidation auction opened for this vault: its seized {sym} went to auction. The collateral and debt change
        rides the vault&rsquo;s paired liquidation.
      </>
    ) : ctx.eventType === "lse-take" ? (
      <>A bidder bought part of the seized {sym} from the auction.</>
    ) : (
      <>
        The auction settled: sold {sym} is burned, and any remainder above the debt plus penalty returns to the vault.
      </>
    );
  const meansNow: ClauseInput[] =
    rs.inkAfter > MAKER_EPS ? [clause(<>The vault holds {colAfterFig()} of collateral at this point.</>)] : [];
  return { happened: [clause(happened)], meansNow };
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). */
export function makerdaoExplainerTeaser(
  ctx: MakerDAOContext,
  coords: MakerCoords,
  extras: MakerRowExtras = {},
): ReactNode | null {
  return splitLead(eventClauses(makerdaoEventSlots(ctx, coords, extras))).lead;
}
