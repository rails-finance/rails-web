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

import { collAmount, debtDigits, usdPrice } from "@/lib/makerdao/price-format";
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
import type { MakerAuctionRead, MakerIlkAt, MakerTxContext } from "@/lib/makerdao/chain-history-types";
import type {
  MakerDebtSplit,
  MakerEvent,
  MakerLeftoverLink,
  MakerMatStep,
  MakerOwnershipStep,
} from "@/lib/makerdao/vault-history";
import { indefiniteArticle } from "@/lib/utils/format";
import {
  describeCaller,
  describeOwner,
  describeSender,
  inAndOutPartner,
  shortAddr,
  txSummary,
} from "@/lib/makerdao/ownership-prose";
import { knownContract } from "@/lib/makerdao/known-contracts";

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
  /** The row's own id. */
  eventId?: string;
  /** Every loaded row of the row's transaction, in chain order. */
  txRows?: MakerEvent[];
  /** What the row's transaction did (read for ownership transactions). */
  txContext?: MakerTxContext;
  /** A give row: the owner before and after. */
  ownership?: MakerOwnershipStep;
  /** Every give row's owners, for the transaction summary. */
  ownershipAll?: Map<string, MakerOwnershipStep>;
  /** The ilk's minimum ratio moved since the previous row. */
  matStep?: MakerMatStep;
  /** Signed by someone other than the owner in force, in a transaction that
   *  handed the vault to the signer: the vault was created for them. */
  createdForSigner?: boolean;
  /** The account that owned the vault at this row (behind its proxy). */
  ownerAt?: string | null;
}

const dai2 = (n: number): string => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
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
  const actor = extras.createdForSigner ? null : delegatedActorMechanic(ctx);
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
      {collAmount(Math.abs(dink))} {sym}
    </Fig>
  );
  // The collateral the vault holds after this event echoes the detail grid's
  // Collateral stat (formatNumber, same symbol → same entry key).
  const colAfterFig = () => (
    <Fig echo info={inkAfterProv(sym, coords)} value={formatNumber(rs.inkAfter)} symbol={sym}>
      {rs.inkAfter >= 1e-6 && rs.inkAfter < 1 ? collAmount(rs.inkAfter) : <AmountText value={rs.inkAfter} />} {sym}
    </Fig>
  );

  // The DAI amount a draw or repay moved (dart × rate at the block) echoes the
  // header's debt delta: same prov, same exact value. Null where the row has no
  // rate; the clause then names the action alone.
  const debt = debtDeltaOf(ctx, dsym, coords);
  const daiAmount: ReactNode | null =
    ctx.debtChange != null && dart !== 0 ? (
      <Fig echo info={debt.prov} value={chainTruthDeltaValue(debt.value, labeled)} symbol={dsym}>
        {rs.collateralOnly && dart < 0 ? debtDigits(Math.abs(debt.value)) : <AmountText value={Math.abs(debt.value)} />}{" "}
        {dsym}
      </Fig>
    ) : null;

  switch (ctx.eventType) {
    case "frob":
      return frobSlots(ctx, rs, dink, dart, daiAmount, colDeltaFig, colAfterFig, extras);
    case "grab":
      return grabSlots(ctx, coords, sym, dsym, dink, dart, daiAmount, rate, colDeltaFig, extras);
    case "give":
      return giveSlots(ctx, coords, colAfterFig, rs, extras);
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

// ── the minimum ratio moved by governance ────────────────────────────────────

function matStepClause(ilk: string, step?: MakerMatStep): ClauseInput {
  if (!step) return null;
  const dir = step.to < step.from ? "lowered" : "raised";
  return clause(
    <>
      {ilk}&rsquo;s minimum ratio was {dir} from {matPct(step.from)} to <H>{matPct(step.to)}</H> by governance
      {step.change ? <> on {formatDate(step.change.timestamp)}</> : <> between the previous event and this one</>}.
    </>,
  );
}

// ── a vault created by a contract for the signer ─────────────────────────────

function createdForClause(ctx: MakerDAOContext, extras: MakerRowExtras): ClauseInput {
  if (!extras.createdForSigner || !ctx.txFrom) return null;
  const creator = ctx.ownerAt ?? null;
  const known = knownContract(creator);
  const give = extras.txRows?.find((r) => r.context.data.eventType === "give");
  const proxy = give?.context.data.giveDst;
  const cup = extras.txContext?.migratedCup;
  return clause(
    <>
      {known ? known.name : shortAddr(creator)} ({shortAddr(creator)}) created this vault and handed it to{" "}
      {shortAddr(ctx.txFrom)}
      {proxy && proxy !== ctx.txFrom ? <>&rsquo;s DSProxy ({shortAddr(proxy)})</> : null} in the same transaction, which{" "}
      {shortAddr(ctx.txFrom)} sent
      {cup ? (
        <>
          : it moved {shortAddr(ctx.txFrom)}&rsquo;s Single-Collateral Dai CDP #{cup} into this vault, with its
          collateral and debt
        </>
      ) : null}
      .
    </>,
  );
}

// ── a deposit and a withdrawal of the same amount in one transaction ─────────

function inAndOutClause(ctx: MakerDAOContext, extras: MakerRowExtras): ClauseInput {
  const self = extras.txRows?.find((r) => r.id === extras.eventId);
  if (!self) return null;
  const partner = inAndOutPartner(self, extras.txRows);
  if (!partner) return null;
  const dink = Number(ctx.dink) || 0;
  const amount = `${formatNumber(Math.abs(dink))} ${ctx.collateralSymbol}`;
  const gives = extras.txRows?.filter((r) => r.context.data.eventType === "give").length ?? 0;
  return clause(
    dink > 0 ? (
      <>
        The same {amount} came out again later in this transaction
        {gives > 0 ? <>, after the vault&rsquo;s ownership moved and came back</> : null}, so it added nothing to the
        vault.
      </>
    ) : (
      <>This is the {amount} put in earlier in this transaction; the vault ends it holding what it held before.</>
    ),
  );
}

// ── who sent the transaction ─────────────────────────────────────────────────

/** A transaction in which a contract the sender called opened the vault in
 *  its own name and gave it to the sender (or the sender's proxy): the give
 *  row, its caller (the contract) and the proxy the vault went to. */
export function openedViaContract(
  rows: readonly MakerEvent[] | undefined,
  tx: MakerTxContext | undefined,
): { contract: string; proxy: string | null; built: boolean } | null {
  if (!rows || !tx || !tx.to) return null;
  if (!rows.some((r) => r.context.data.isOpen)) return null;
  const give = rows.find((r) => r.context.data.eventType === "give");
  const g = give?.context.data;
  if (!g || g.giveCaller !== tx.to) return null;
  if (g.giveDstOwner !== tx.from && g.giveDst !== tx.from) return null;
  const proxy = g.giveDst && g.giveDst !== tx.from ? g.giveDst : null;
  const built = proxy != null && (tx.proxiesBuilt ?? []).some((p) => p.proxy === proxy && p.owner === tx.from);
  return { contract: tx.to, proxy, built };
}

/** "Sent by 0x3ee4…7675, the owner, through its DSProxy 0xc0a8…9d7b." */
function senderClause(extras: MakerRowExtras): ClauseInput {
  const tx = extras.txContext;
  if (!tx || extras.createdForSigner) return null;
  const via = openedViaContract(extras.txRows, tx);
  if (via) {
    return clause(
      <>
        {shortAddr(tx.from)} sent this transaction to the contract {shortAddr(via.contract)}. The contract{" "}
        {via.built && via.proxy ? (
          <>
            built {shortAddr(tx.from)}&rsquo;s DSProxy ({shortAddr(via.proxy)}),{" "}
          </>
        ) : null}
        opened this vault, becoming its owner, and gave it to {via.proxy ? <>that DSProxy</> : shortAddr(tx.from)} in
        the same transaction.
      </>,
    );
  }
  const to = tx.to ? tx.parties[tx.to] : undefined;
  const owner = extras.ownerAt ?? null;
  const isOwner = owner != null && tx.from === owner;
  const known = knownContract(tx.to);
  const route: ReactNode =
    to?.kind === "dsproxy" && to.owner === tx.from ? (
      <> through its DSProxy {shortAddr(tx.to)}</>
    ) : to?.kind === "dsproxy" && to.owner ? (
      <>
        {" "}
        through {shortAddr(to.owner)}&rsquo;s DSProxy {shortAddr(tx.to)}
      </>
    ) : known ? (
      <> through {known.name}</>
    ) : to?.kind === "instadapp-account" ? (
      <> through the Instadapp account {shortAddr(tx.to)}</>
    ) : tx.to ? (
      <>
        {" "}
        to {to?.kind === "contract" ? "the contract " : ""}
        {shortAddr(tx.to)}
      </>
    ) : null;
  return clause(
    <>
      Sent by {shortAddr(tx.from)}
      {isOwner ? <>, the owner,</> : null}
      {route}
      {tx.tools.length > 0 ? <>, running {tx.tools.join(" and ")}</> : null}.
    </>,
  );
}

/** A transaction that changed the vault more than once: each change in chain
 *  order, and which one this row is. */
function txStepsClause(extras: MakerRowExtras): ClauseInput {
  const rows = extras.txRows ?? [];
  if (rows.some((r) => r.context.data.eventType !== "frob")) return null;
  if (rows.length < 2) return null;
  const parts = rows.map((r) => {
    const d = r.context.data;
    const dink = Number(d.dink) || 0;
    const debt = Number(d.debtChange) || 0;
    const dsym = ilkDebtSymbol(d.ilk);
    const bits: string[] = [];
    if (dink > 0) bits.push(`deposited ${formatNumber(dink)} ${d.collateralSymbol}`);
    if (dink < 0) bits.push(`withdrew ${formatNumber(-dink)} ${d.collateralSymbol}`);
    if (debt > 0) bits.push(`drew ${dai2(debt)} ${dsym}`);
    if (debt < 0) bits.push(`repaid ${dai2(-debt)} ${dsym}`);
    return bits.join(" and ") || "moved nothing";
  });
  const at = rows.findIndex((r) => r.id === extras.eventId);
  if (at < 0) return null;
  const ORD = ["first", "second", "third", "fourth", "fifth"];
  return clause(
    <>
      This transaction changed the vault {rows.length === 2 ? "twice" : `${rows.length} times`}, each change a separate
      row: {parts.map((p, i) => (i === 0 ? `first it ${p}` : `, then it ${p}`)).join("")}. This row is the{" "}
      {ORD[at] ?? `number ${at + 1}`}.
    </>,
  );
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

/** A fall as a whole percent; a figure that rounds to 100 while the price
 *  would still be above zero reads "over 99%". */
export function dropText(drop: number): string {
  const whole = Math.max(0, Math.round(drop * 100));
  return whole >= 100 && drop < 1 ? "over 99%" : `${whole}%`;
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
        kept >= 1e-6
          ? clause(<>{colAfterFig()} stays behind; the vault owes nothing and holds nothing else.</>)
          : kept > MAKER_EPS
            ? clause(<>A trace under 0.000001 {sym} stays behind; the vault owes nothing.</>)
            : clause(<>The vault is empty again.</>),
      ],
    };
  }

  const valueOf = (amount: number) =>
    price != null ? (
      <>
        {" "}
        (worth {usd0(amount * price)} at Maker&rsquo;s {extras.ilkAt?.priceCap ? "capped price" : "oracle price"} then)
      </>
    ) : null;
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
  const capAt =
    extras.ilkAt?.priceCap != null &&
    extras.ilkAt.priceCap.oracleUsd != null &&
    extras.ilkAt.priceCap.oracleUsd > extras.ilkAt.priceCap.capUsd
      ? extras.ilkAt.priceCap
      : null;
  const riskClause: ClauseInput = risk
    ? clause(
        <>
          At <H>{usdPrice(risk.price)}</H> {indefiniteArticle(sym).toLowerCase()} {sym}
          {capAt ? <> (Maker&rsquo;s capped price; the oracle read {usdPrice(capAt.oracleUsd as number)})</> : null},
          the vault could draw <H>{dai2(risk.room)}</H> {dsym} more before the <H>{matPct(risk.mat)}</H> minimum, and{" "}
          {capAt ? <>Maker&rsquo;s price</> : sym} could fall {dropText(risk.drop)} (to {usdPrice(risk.liqPrice)})
          before it could be liquidated.
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
          The {dai2(repaid)} {dsym} repayment covered {dai2(drawnPart)} {dsym} of principal (drawn less repaid) and{" "}
          {dai2(feePart)} {dsym} of stability fee
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
    const repaidNow = dart < 0 ? -debtChange : 0;
    const intoFee = repaidNow > 0 ? repaidNow - split.drawnBefore : 0;
    return clause(
      <>
        {intoFee > 0.005 ? (
          <>
            The repayment cleared the last {dai2(split.drawnBefore)} {dsym} of principal, and the other {dai2(intoFee)}{" "}
            {dsym} paid down fee.{" "}
          </>
        ) : null}
        The <H>{dai2(debtAfter)}</H> {dsym} now owed is {dai2(split.drawnAfter)} {dsym} of principal (drawn less repaid)
        and {dai2(split.feeAfter)} {dsym} of stability fee.
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
      changed: [riskClause, createdForClause(ctx, extras), senderClause(extras)],
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

  return {
    happened: [clause(action), ending],
    changed: [
      txStepsClause(extras),
      inAndOutClause(ctx, extras),
      matStepClause(ctx.ilk, extras.matStep),
      feeClause,
      riskClause,
      holding,
      senderClause(extras),
    ],
    meansNow,
  };
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
        <H>{pct2(ratio)}</H> at the OSM price of <H>{usdPrice(price)}</H>), so a keeper liquidated it:
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
  return {
    happened: [clause(happened)],
    changed: [matStepClause(ctx.ilk, extras.matStep), auctionClause],
    meansNow: [outcome],
  };
}

// ── give (ownership transfer) ────────────────────────────────────────────────

function giveSlots(
  ctx: MakerDAOContext,
  coords: MakerCoords,
  colAfterFig: () => ReactNode,
  rs: MakerResultingState,
  extras: MakerRowExtras,
): EventProseSlots {
  const step = extras.ownership;
  const tx = extras.txContext;
  // The new holder echoes the header's party chip.
  const dst = ctx.giveDstOwner ?? ctx.giveDst;
  if (!step) {
    const newOwnerFig = dst ? (
      <Fig echo info={ctx.giveDstOwner ? giveOwnerProv(coords) : giveDstProv(coords)} value={dst}>
        {shortAddr(dst)}
      </Fig>
    ) : (
      <>a new owner</>
    );
    return {
      happened: [clause(<>Ownership of the vault moved to {newOwnerFig}.</>)],
      meansNow: [clause(<>The collateral and the debt stayed where they were.</>)],
    };
  }

  // What the whole transaction did, on its first give only.
  const rows = extras.txRows ?? [];
  const firstGive = rows.find((r) => r.context.data.eventType === "give");
  const summary =
    firstGive && firstGive.id === extras.eventId && extras.ownershipAll
      ? txSummary(rows, tx, extras.ownershipAll)
      : null;

  const happened = (
    <>
      Ownership moved from {describeOwner(step.before, tx)} to {describeOwner(step.after, tx)}.
    </>
  );
  const opened = openedViaContract(rows, tx);
  const proxyNamed = [step.before.holder, step.after.holder].some((h) => h && tx?.parties[h]?.kind === "dsproxy");
  const who: ClauseInput =
    opened && tx
      ? clause(
          <>
            {shortAddr(tx.from)} started this transfer. The CDP manager makes whoever opens a vault its owner, so the
            contract {shortAddr(opened.contract)}, which {shortAddr(tx.from)} sent the transaction to, opened the vault
            and then gave it to{" "}
            {opened.proxy ? (
              <>
                {shortAddr(tx.from)}&rsquo;s DSProxy ({shortAddr(opened.proxy)})
                {opened.built ? <>, built in the same transaction</> : null}
              </>
            ) : (
              shortAddr(tx.from)
            )}
            .
          </>,
        )
      : clause(
          <>
            The transfer was made by {describeCaller(step.caller, tx)}
            {tx && step.caller !== tx.from ? <>, in a transaction {describeSender(tx)}</> : null}.
          </>,
        );
  const proxyGloss: ClauseInput = proxyNamed
    ? clause(<>A DSProxy is a contract wallet its owner acts through.</>)
    : null;
  const why: ClauseInput =
    tx?.migratedCup != null && knownContract(step.before.holder)?.role === "maker"
      ? clause(
          <>
            The migration contract opens each migrated vault in its own name and hands it to the migrating account; this
            one carries Single-Collateral Dai CDP #{tx.migratedCup}.
          </>,
        )
      : null;
  const meansNow: ClauseInput[] = [clause(<>The collateral and the debt stayed where they were.</>)];
  const movedInTx = rows.some((r) => r.context.data.eventType === "frob");
  if (rs.inkAfter > MAKER_EPS && !movedInTx) {
    meansNow.push(clause(<>The vault holds {colAfterFig()} of collateral.</>));
  }
  return {
    happened: summary ? [clause(summary), clause(happened)] : [clause(happened)],
    changed: [who, why, proxyGloss],
    meansNow,
  };
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
