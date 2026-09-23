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
// The debt is quoted in DAI (or USDS on LockStake urns) — the meaningful unit,
// muted, because the card's chrome carries the vault's normalized figure, not
// this valued one, so bolding it would break the cognitive link the highlight
// rule protects. The DAI figure is available only once the event carries its
// block's rate, so a draw/repay states its amount when it can and states the
// action alone when it can't (the never-empty floor).
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Maker cannot fill on ordinary vault operations, each a data
// fact of its pipeline:
//   • §5.1 (risk consequence per event) on frob / fork: the indexed stream
//     carries no per-event oracle price or liquidation ratio for these, so a
//     collateral-ratio-vs-threshold read at event time cannot be computed.
//     Stated on grab (liquidation) only, where the seizure carries the price.
//   • §5.2 (mechanic-why on the dust floor): the minimum-debt figure is not on
//     the event context, so a repayment near the floor cannot be named with a
//     number. The stability-fee mechanic on a draw IS stated.
//   • §5.4 beyond liquidations: no per-event USD → no other valued net-outcome
//     figure exists to derive on a frob / fork.
// Filled: forward paths (§5.3) on collateral-only and on the liquidation
// auction; the liquidation net-outcome cushion (§5.4); the highlight rule
// (§5.6) via Fig.

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
  grabSeizedUsdProv,
  grabClearedDaiProv,
  grabCushionProv,
  giveDstProv,
  giveOwnerProv,
  type MakerCoords,
} from "@/lib/makerdao/event-provenance";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

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

export function makerdaoEventSlots(ctx: MakerDAOContext, coords: MakerCoords): EventProseSlots {
  const slots = makerdaoEventSlotsBase(ctx, coords);
  const actor = delegatedActorMechanic(ctx);
  if (!actor) return slots;
  return { ...slots, meansNow: [...(slots.meansNow ?? []), actor] };
}

function makerdaoEventSlotsBase(ctx: MakerDAOContext, coords: MakerCoords): EventProseSlots {
  const sym = ctx.collateralSymbol;
  const dsym = ilkDebtSymbol(ctx.ilk);
  const dink = Number(ctx.dink) || 0;
  const dart = Number(ctx.dart) || 0;
  const rate = ctx.rateAtBlock != null ? Number(ctx.rateAtBlock) / 1e27 : null;
  // The DAI actually minted / burned by this draw or repay — the debt delta
  // valued at this event's own rate. Muted (the chrome carries the vault's
  // normalized figure, not this one); null until the event carries a rate.
  const dartDai = rate != null && rate > 0 && dart !== 0 ? Math.abs(dart) * rate : null;
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
      {formatNumber(rs.inkAfter)} {sym}
    </Fig>
  );

  // The DAI amount a draw or repay moved — muted, unwrapped body text (no
  // on-chrome twin). Null-safe: falls back to naming the action alone.
  const daiAmount = dartDai != null ? `${formatNumber(dartDai)} ${dsym}` : null;

  switch (ctx.eventType) {
    case "frob":
      return frobSlots(ctx, rs, dink, dart, daiAmount, colDeltaFig, colAfterFig);
    case "grab":
      return grabSlots(ctx, coords, sym, dsym, dink, dart, daiAmount, rate, colDeltaFig);
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

function frobSlots(
  ctx: MakerDAOContext,
  rs: MakerResultingState,
  dink: number,
  dart: number,
  daiAmount: string | null,
  colDeltaFig: () => ReactNode,
  colAfterFig: () => ReactNode,
): EventProseSlots {
  const collFrag: ReactNode | null =
    dink > 0 ? (
      <>deposited {colDeltaFig()} of collateral</>
    ) : dink < 0 ? (
      <>withdrew {colDeltaFig()} of collateral</>
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

  // The opening act reads as one self-contained sentence.
  if (ctx.isOpen) {
    const happened = (
      <>
        The vault opened with {colDeltaFig()} of collateral
        {dart > 0 ? <> and {daiAmount ?? "its first debt"} drawn against it</> : null}.
      </>
    );
    return { happened: [clause(happened)], meansNow: [rs.collateralOnly ? noDebtPath : null] };
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

  // The resulting holding, when the vault still carries debt (echoes the after-
  // collateral figure). Empty / collateral-only states are covered by the
  // ending and the forward path.
  const holding: ClauseInput =
    rs.hasDebtAfter && rs.inkAfter > MAKER_EPS
      ? clause(<>The vault now holds {colAfterFig()} of collateral against its outstanding debt.</>)
      : null;

  const meansNow: ClauseInput[] = rs.collateralOnly ? [noDebtPath] : [];

  return { happened: [clause(action), ending], changed: [holding], meansNow };
}

// ── grab (liquidation) ───────────────────────────────────────────────────────

function grabSlots(
  ctx: MakerDAOContext,
  coords: MakerCoords,
  sym: string,
  dsym: string,
  dink: number,
  dart: number,
  daiAmount: string | null,
  rate: number | null,
  colDeltaFig: () => ReactNode,
): EventProseSlots {
  const happened = (
    <>
      This vault fell below its liquidation ratio and was liquidated: {colDeltaFig()} of collateral was seized
      {dart !== 0 && daiAmount ? <>, and {daiAmount} of debt cleared</> : null}.
    </>
  );

  // Forward path (§5.3) — where the seizure goes and who is made whole.
  const auction = clause(
    <>
      The seized collateral goes to an auction; any surplus over the debt plus the liquidation penalty returns to the
      owner. The vault itself survives and can be used again.
    </>,
  );

  // The valued net-outcome (§5.4) — echoes the forensics block. Renders only
  // once the block is priced and its legs resolve, exactly as the forensics
  // block gates itself.
  const meansNow: ClauseInput[] = [auction, valuedCushion(ctx, coords, sym, dsym, dink, dart, rate)];
  return { happened: [clause(happened)], meansNow };
}

/** The valued cushion sentence — the seized collateral against the cleared debt
 *  at the vault's own oracle price that block, echoing the forensics legs. Drops
 *  whole when the block is unpriced or a leg doesn't resolve (the never-empty
 *  floor). */
function valuedCushion(
  ctx: MakerDAOContext,
  coords: MakerCoords,
  sym: string,
  dsym: string,
  dink: number,
  dart: number,
  rate: number | null,
): ClauseInput {
  const price = ctx.priceAtBlock;
  const seizedAmt = Math.abs(dink);
  const clearedArt = Math.abs(dart);
  if (!price || rate == null || rate <= 0) return null;
  if (!(seizedAmt > 0) || !(clearedArt > 0)) return null;
  const seizedUsd = seizedAmt * price.usd;
  const clearedDai = clearedArt * rate;
  if (!Number.isFinite(seizedUsd) || !Number.isFinite(clearedDai) || clearedDai <= 0) return null;
  const cushion = seizedUsd / clearedDai - 1;
  const cushionStr = `${cushion >= 0 ? "+" : "−"}${(Math.abs(cushion) * 100).toFixed(2)}%`;
  // Echo the forensics legs: seized value + symbol, cleared value + symbol, the
  // cushion percentage. The event-time price itself lives on the forensics price
  // pill (chrome), so the sentence names it without a figure.
  const seizedFig = (
    <Fig
      echo
      info={grabSeizedUsdProv(sym, coords, { amount: formatNumber(seizedAmt), priceUsd: price.usd })}
      value={formatUsdValue(seizedUsd)}
      symbol={sym}
    >
      {formatUsdValue(seizedUsd)}
    </Fig>
  );
  const clearedFig = (
    <Fig
      echo
      info={grabClearedDaiProv(coords, {
        amount: formatNumber(clearedArt),
        dai: `${formatNumber(clearedDai)} ${dsym}`,
      })}
      value={formatUsdValue(clearedDai)}
      symbol={dsym}
    >
      {formatUsdValue(clearedDai)}
    </Fig>
  );
  const cushionFig = (
    <Fig
      echo
      info={grabCushionProv(coords, {
        seizedUsd: formatUsdValue(seizedUsd),
        clearedDai: `${formatNumber(clearedDai)} ${dsym}`,
      })}
      value={cushionStr}
    >
      {cushionStr}
    </Fig>
  );
  return clause(
    <>
      At the vault&rsquo;s oracle price at the time, the seized collateral was worth {seizedFig} against {clearedFig} of
      debt cleared — a {cushionFig} cushion carried into the auction, where the liquidation penalty and any owner
      surplus settle.
    </>,
  );
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
  daiAmount: string | null,
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
export function makerdaoExplainerTeaser(ctx: MakerDAOContext, coords: MakerCoords): ReactNode | null {
  return splitLead(eventClauses(makerdaoEventSlots(ctx, coords))).lead;
}
