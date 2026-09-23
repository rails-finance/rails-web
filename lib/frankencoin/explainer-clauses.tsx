// Frankencoin plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the position looks
// like AFTER this event), never on the event type alone: a repay that clears the
// debt, a repay that leaves debt standing, a withdraw that empties the
// collateral all read differently though they share a kind. The state-blind
// morals the old bullets carried ("More collateral raises what the declared
// price can back" stays — it is a mechanic; but "keeps it clear of…" style
// consequence morals are gone) give way to facts about THIS event's own figures.
//
// Figures render through <Prov>: an `echo` when the same figure already has a
// primary receipt on the open card — the moved amounts on the header (the
// MintingUpdate deltas, the challenge / forced-sale slice figures) and the
// after-absolutes + declared price on the detail grid. Frankencoin has NO
// same-transaction sibling seam (each position is its own contract, narrated by
// its own card), so there are no cross-scope primaries here — every figure has an
// on-card twin, so every bolded figure is an echo.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Checklist items Frankencoin cannot fill, each a data fact of its pipeline:
//   • §5.1 (risk consequence per event): Frankencoin runs NO price oracle and no
//     health factor exists. The declared liquidation price is on the row, but the
//     mint ceiling / utilisation that would let a "distance to the line" be drawn
//     is a head-overlay figure, not carried on the event — so no per-event
//     ratio-vs-threshold is computed (stated as before→after figures only).
//   • §5.2 (mechanic-why on fees): stated where the event exhibits one — the
//     reserve contribution (held back at mint, released on repay) and interest
//     charged up front at minting. Frankencoin charges no ongoing accrual.
//   • §5.4 (derived net-outcome): only a succeeded challenge slice carries both a
//     ZCHF bid and the collateral acquired, so the effective price is derived
//     there; a forced sale emits only the collateral amount (no proceeds), so no
//     net-outcome figure exists to derive on it.
// Filled: forward paths (§5.3) on denied / expired-forced-sale / price-raise
// cooldown / collateral-only; the reserve + up-front-interest mechanic (§5.2);
// the challenge slice's effective price (§5.4); the highlight rule (§5.6) via Fig.

import type { ReactNode } from "react";
import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
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
  changeProv,
  mintedAfterProv,
  collateralAfterProv,
  liqPriceAfterProv,
  challengeFigureProv,
  forcedSaleProv,
  type FrankencoinCoords,
} from "@/lib/frankencoin/event-provenance";
import { shortAddress } from "@/lib/frankencoin/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

/** The dust epsilon — a balance below this is treated as zero. */
const FC_EPS = 1e-9;

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};
const fmt = (h?: string): string => formatNumber(Math.abs(Number(h)));

// ── resulting state ──────────────────────────────────────────────────────────

interface FrankencoinResultingState {
  colAfter: number;
  debtAfter: number;
  hasCol: boolean;
  hasDebt: boolean;
  collateralOnly: boolean;
  closed: boolean;
  debtCleared: boolean;
}

function resultingState(ctx: FrankencoinContext): FrankencoinResultingState {
  const colAfter = ctx.collateral != null ? num(ctx.collateral) : 0;
  const debtAfter = ctx.minted != null ? num(ctx.minted) : 0;
  const hasCol = colAfter > FC_EPS;
  const hasDebt = debtAfter > FC_EPS;
  return {
    colAfter,
    debtAfter,
    hasCol,
    hasDebt,
    collateralOnly: hasCol && !hasDebt,
    closed: !hasCol && !hasDebt,
    debtCleared: !hasDebt,
  };
}

// ── figure rendering ─────────────────────────────────────────────────────────

function Fig({
  info,
  value,
  symbol,
  children,
}: {
  info: Provenance;
  value: string;
  symbol?: string;
  children: ReactNode;
}) {
  return (
    <Prov echo info={info} value={value} symbol={symbol}>
      <strong className="font-semibold text-foreground">{children}</strong>
    </Prov>
  );
}

/** Etherscan address link, click-isolated from the card — a muted counterparty,
 *  never bolded (an address is not a chrome-mirrored figure). */
function Addr({ address }: { address: string }) {
  return (
    <a
      href={explorerUrl(MAINNET_CHAIN_ID, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {shortAddress(address)}
    </a>
  );
}

// ── the variant table ────────────────────────────────────────────────────────

export function frankencoinEventSlots(ctx: FrankencoinContext, coords: FrankencoinCoords): EventProseSlots {
  const sym = ctx.collateralSymbol;
  const dec = ctx.collateralDecimals;
  const rs = resultingState(ctx);
  const showColl = !ctx.collateralUnderstated && ctx.collateral != null;

  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : null;
  const dColl =
    !ctx.collateralUnderstated && ctx.collateral != null && ctx.collateralBefore != null
      ? num(ctx.collateral) - num(ctx.collateralBefore)
      : null;

  // Delta figures echo the header's per-axis receipt (changeProv + the header's
  // own value key: a BARE magnitude on the labeled open/adjust axes, a SIGNED one
  // on a close's unlabeled deltas).
  const mintDeltaFig = (value: number, labeled: boolean) => (
    <Fig info={changeProv("minted", sym, coords)} value={chainTruthDeltaValue(value, labeled)} symbol="ZCHF">
      {formatNumber(Math.abs(value))} ZCHF
    </Fig>
  );
  const collDeltaFig = (value: number, labeled: boolean) => (
    <Fig info={changeProv("collateral", sym, coords)} value={chainTruthDeltaValue(value, labeled)} symbol={sym}>
      {formatNumber(Math.abs(value))} {sym}
    </Fig>
  );
  // After-absolutes echo the detail grid's after-value receipt. The grid's own
  // <Prov> passes NO symbol (the ticker rides as a decorative icon), so its
  // entry key registers a null symbol — these echoes omit `symbol` too, so the
  // key matches byte-for-byte and the figure pulse-links to its grid twin. `fmt`
  // is the grid's own formatter, so the value key matches as well.
  const mintAfterFig = () => (
    <Fig info={mintedAfterProv(coords, ctx.raw?.minted)} value={fmt(ctx.minted)}>
      {fmt(ctx.minted)} ZCHF
    </Fig>
  );
  const collAfterFig = () => (
    <Fig info={collateralAfterProv(sym, coords, ctx.raw?.collateral)} value={fmt(ctx.collateral)}>
      {fmt(ctx.collateral)} {sym}
    </Fig>
  );
  const liqPriceAfterFig = () => (
    <Fig info={liqPriceAfterProv(sym, dec, coords, ctx.raw?.price)} value={fmt(ctx.liqPrice)}>
      {fmt(ctx.liqPrice)} ZCHF/{sym}
    </Fig>
  );

  // The V1 clone-creation caveat (charter §2 misleading-figure exception): the
  // recorded collateral figure understates reality, so no amount is shown — said
  // in plain words, naming no machinery.
  const understatedCaveat = (): ClauseInput =>
    ctx.collateralUnderstated
      ? clause(
          <>
            The collateral figure recorded for this event understates the real balance — a known quirk of V1 clone
            creation — so no collateral amount is shown for it. The current balance at the top of the page is correct.
          </>,
        )
      : null;

  // The reserve + up-front-interest mechanic (§5.2), stated where a mint exhibits
  // it.
  const mintFeeMechanic = (): ClauseInput =>
    clause(
      <>
        Interest for the remaining term is charged up front at minting, and a fixed share of each mint is held back in
        the system reserve; the borrower receives the rest.
      </>,
    );

  switch (ctx.eventType) {
    case "open":
    case "clone": {
      const isClone = ctx.eventType === "clone";
      // Understated collateral (the V1 clone-creation quirk) is never narrated —
      // the caveat explains its absence.
      const openColl = showColl ? num(ctx.collateral) : 0;
      const openMint = num(ctx.minted);
      const lede = (
        <>
          {isClone ? "Cloned from an existing position" : "This position opened"}
          {isClone && ctx.original ? (
            <>
              {" "}
              (<Addr address={ctx.original} />)
            </>
          ) : null}
        </>
      );
      const opening =
        openColl > 0 && openMint > 0 ? (
          <>
            {lede} with {collDeltaFig(openColl, true)} of collateral, minting {mintDeltaFig(openMint, true)}.
          </>
        ) : openColl > 0 ? (
          <>
            {lede} with {collDeltaFig(openColl, true)} of collateral.
          </>
        ) : openMint > 0 ? (
          <>
            {lede}, minting {mintDeltaFig(openMint, true)}.
          </>
        ) : (
          <>{lede}.</>
        );
      const declaredPrice: ClauseInput =
        ctx.liqPrice != null ? clause(<>The owner declared a liquidation price of {liqPriceAfterFig()}.</>) : null;
      const oracleMechanic = clause(
        <>
          Frankencoin runs no price oracle — that price is the owner&rsquo;s own declaration, and a challenge auction is
          what tests it.
        </>,
      );
      const lifecycleMechanic = isClone
        ? clause(
            <>
              A clone reuses the original&rsquo;s already-vetted terms and mint limit, so it skips the veto window and
              can mint straight away.
            </>,
          )
        : clause(
            <>
              As a new original position it first waits out a veto window — at least three days, chosen by the owner —
              in which FPS holders can deny it.
            </>,
          );
      return {
        happened: [clause(opening)],
        changed: [declaredPrice],
        meansNow: [oracleMechanic, lifecycleMechanic, openMint > 0 ? mintFeeMechanic() : null, understatedCaveat()],
      };
    }

    case "mint": {
      const delta = dMint ?? num(ctx.minted);
      const firstDebt = dMint != null && Math.abs(num(ctx.minted) - dMint) <= FC_EPS;
      const happened = firstDebt ? (
        <>Minted {mintDeltaFig(delta, true)} — the position&rsquo;s first debt.</>
      ) : (
        <>
          Minted {mintDeltaFig(delta, true)}, taking its debt to {mintAfterFig()}.
        </>
      );
      return { happened: [clause(happened)], meansNow: [mintFeeMechanic()] };
    }

    case "repay": {
      const delta = dMint ?? 0;
      const ending: ClauseInput =
        rs.debtCleared && !rs.hasCol
          ? cont(<>, clearing the debt in full and closing the position.</>)
          : rs.debtCleared
            ? cont(<>, clearing the debt in full — the position now holds only collateral.</>)
            : cont(<>, leaving {mintAfterFig()} of debt outstanding.</>);
      // The general reserve-release rule (a share of each mint is held back and
      // released as debt is repaid) is Layer-2 material — the "?" modal
      // (frankencoinMintingContent's Reserve contribution) carries it.
      const collateralOnlyPath: ClauseInput =
        rs.debtCleared && rs.hasCol
          ? clause(<>With no debt left, the collateral can be withdrawn or left to back a future mint.</>)
          : null;
      return {
        happened: [clause(<>Repaid {mintDeltaFig(delta, true)}</>), ending],
        meansNow: [collateralOnlyPath],
      };
    }

    case "add_collateral": {
      const delta = dColl ?? 0;
      return {
        happened: [
          clause(
            <>
              Added {collDeltaFig(delta, true)} of collateral, taking the position to {collAfterFig()}.
            </>,
          ),
        ],
        meansNow: [understatedCaveat()],
      };
    }

    case "withdraw_collateral": {
      const delta = dColl ?? 0;
      const changed: ClauseInput = rs.closed
        ? clause(<>That empties the position — nothing remains on either side.</>)
        : rs.collateralOnly
          ? clause(<>The position now holds {collAfterFig()} and owes nothing.</>)
          : rs.hasDebt && showColl
            ? clause(
                <>
                  That leaves {collAfterFig()} behind {mintAfterFig()} of debt.
                </>,
              )
            : null;
      return {
        happened: [clause(<>Withdrew {collDeltaFig(delta, true)} of collateral.</>)],
        changed: [changed],
        meansNow: [understatedCaveat()],
      };
    }

    case "adjust_price": {
      const raised = ctx.liqPriceBefore != null && ctx.liqPrice != null && num(ctx.liqPrice) > num(ctx.liqPriceBefore);
      const from =
        ctx.liqPriceBefore != null ? (
          <>
            {" "}
            from {formatNumber(Math.abs(Number(ctx.liqPriceBefore)))} ZCHF/{sym}
          </>
        ) : null;
      const happened = (
        <>
          Changed the declared liquidation price{from} to {liqPriceAfterFig()}.
        </>
      );
      const meaning = raised
        ? clause(
            <>
              Raising the declared price starts a three-day cooldown on minting — the window in which the new price can
              be challenged before it backs any fresh ZCHF.
            </>,
          )
        : clause(
            <>
              The declared price is the owner&rsquo;s own; Frankencoin runs no oracle, and a challenge auction is what
              keeps it in line.
            </>,
          );
      return { happened: [clause(happened)], meansNow: [meaning] };
    }

    case "adjust": {
      const changed: ClauseInput[] = [];
      if (showColl && ctx.minted != null)
        changed.push(
          clause(
            <>
              It now holds {collAfterFig()} against {mintAfterFig()} of debt.
            </>,
          ),
        );
      else if (ctx.minted != null) changed.push(clause(<>Its debt now stands at {mintAfterFig()}.</>));
      if (ctx.liqPrice != null) changed.push(clause(<>The declared liquidation price is {liqPriceAfterFig()}.</>));
      return {
        happened: [clause(<>Adjusted the position in a single transaction.</>)],
        changed,
        meansNow: [understatedCaveat()],
      };
    }

    case "auction_settlement": {
      const tookColl = showColl && dColl != null && dColl < 0;
      const clearedDebt = dMint != null && dMint < 0;
      const tail: ReactNode =
        tookColl && clearedDebt ? (
          <>
            , taking {collDeltaFig(dColl as number, true)} of collateral and clearing{" "}
            {mintDeltaFig(dMint as number, true)} of debt.
          </>
        ) : tookColl ? (
          <>, taking {collDeltaFig(dColl as number, true)} of collateral.</>
        ) : clearedDebt ? (
          <>, clearing {mintDeltaFig(dMint as number, true)} of debt.</>
        ) : (
          <>.</>
        );
      const happened = <>The protocol wrote this position down as an auction settled{tail}</>;
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>
              This was the protocol&rsquo;s write-down, not an act of the owner — a challenge slice or forced sale
              settled in the same transaction.
            </>,
          ),
          understatedCaveat(),
        ],
      };
    }

    case "close":
      return {
        happened: [clause(<>Closed the position — collateral and its ZCHF debt both returned to zero.</>)],
        meansNow: [clause(<>The share of each mint held in the system reserve came back with the final repayment.</>)],
      };

    case "denied": {
      const happened = (
        <>
          This position was denied
          {ctx.deniedBy ? (
            <>
              {" "}
              by <Addr address={ctx.deniedBy} />
            </>
          ) : null}
          {ctx.deniedMessage ? <> (&ldquo;{ctx.deniedMessage}&rdquo;)</> : null}.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(<>Holders of enough FPS vetoed it during its init window.</>),
          clause(<>Denial disables minting permanently. The collateral stays withdrawable by the owner.</>),
        ],
      };
    }

    case "challenge_started": {
      const size = num(ctx.challengeSize);
      const happened = (
        <>
          {ctx.challenger ? <Addr address={ctx.challenger} /> : "A challenger"} challenged{" "}
          <Fig
            info={challengeFigureProv("size", "started", sym, coords, ctx.raw?.size)}
            value={chainTruthDeltaValue(size, true)}
            symbol={sym}
          >
            {formatNumber(size)} {sym}
          </Fig>{" "}
          of this position&rsquo;s collateral.
        </>
      );
      return {
        happened: [clause(happened)],
        // The general framing (a challenge bets the declared price is too
        // high) is Layer-2 material — the "?" modal
        // (frankencoinChallengeContent) carries it.
        meansNow: [
          clause(<>The challenger posts their own {sym}, not ZCHF.</>),
          clause(
            <>
              Phase one offers that collateral at the declared price; only if nobody buys it does the position&rsquo;s
              own collateral go to a declining auction.
            </>,
          ),
        ],
      };
    }

    case "challenge_averted": {
      const size = num(ctx.challengeSize);
      const happened = (
        <>
          The challenge over{" "}
          <Fig
            info={challengeFigureProv("size", "averted", sym, coords, ctx.raw?.size)}
            value={chainTruthDeltaValue(size, true)}
            symbol={sym}
          >
            {formatNumber(size)} {sym}
          </Fig>{" "}
          was averted.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>
              Someone bought the challenger&rsquo;s posted collateral at the declared price — the market judging the
              price fair.
            </>,
          ),
          clause(<>The position survived untouched; the challenger&rsquo;s bet lost.</>),
        ],
      };
    }

    case "challenge_succeeded": {
      const bid = num(ctx.bid);
      const acquired = num(ctx.acquiredCollateral);
      const bidFig = (
        <Fig
          info={challengeFigureProv("bid", "succeeded", sym, coords, ctx.raw?.bid)}
          value={chainTruthDeltaValue(bid, true)}
          symbol="ZCHF"
        >
          {formatNumber(bid)} ZCHF
        </Fig>
      );
      const acquiredFig = (
        <Fig
          info={challengeFigureProv("acquiredCollateral", "succeeded", sym, coords, ctx.raw?.acquiredCollateral)}
          value={chainTruthDeltaValue(acquired, true)}
          symbol={sym}
        >
          {formatNumber(acquired)} {sym}
        </Fig>
      );
      // §5.4 derived net-outcome: the effective price the slice cleared at (ZCHF
      // per collateral). Muted — no on-card twin, and rendered inline so the dev
      // coverage tripwire (whole-token spans only) never sees a bare figure.
      const effectivePrice: ClauseInput =
        bid > 0 && acquired > FC_EPS
          ? clause(
              <>
                That is an effective {formatNumber(bid / acquired)} ZCHF per {sym}.
              </>,
            )
          : null;
      return {
        happened: [
          clause(
            <>
              A challenge slice succeeded: a bidder paid {bidFig} and took {acquiredFig} of the position&rsquo;s
              collateral.
            </>,
          ),
        ],
        changed: [effectivePrice],
        meansNow: [
          clause(
            <>
              The ZCHF repays the position&rsquo;s debt, the challenger earns the protocol&rsquo;s reward, and any
              shortfall is covered by the reserve.
            </>,
          ),
          // The general slicing rule ("one challenge can settle in several
          // slices") is Layer-2 material — the "?" modal
          // (frankencoinChallengeContent step 3) carries it verbatim.
          clause(
            <>
              A partial sale can leave the position standing: a challenge is an event in its life, not necessarily its
              end.
            </>,
          ),
        ],
      };
    }

    case "forced_sale": {
      const amt = num(ctx.forcedSaleAmount);
      const happened = (
        <>
          <Fig info={forcedSaleProv(sym, coords, ctx.raw?.size)} value={chainTruthDeltaValue(amt, true)} symbol={sym}>
            {formatNumber(amt)} {sym}
          </Fig>{" "}
          of the position&rsquo;s collateral was sold in a forced sale.
        </>
      );
      return {
        happened: [clause(happened)],
        meansNow: [
          clause(
            <>
              The position&rsquo;s expiration had passed, so anyone could clear it through the hub at a declining price;
              the proceeds repay the debt.
            </>,
          ),
          clause(<>The sale was the hub&rsquo;s clearing on the expiry clock, not an act of the owner.</>),
        ],
      };
    }

    case "ownership_transferred": {
      if (ctx.initialization) {
        return {
          happened: [
            clause(
              <>
                The factory handed the new position contract to its owner
                {ctx.newOwner ? (
                  <>
                    {" "}
                    (<Addr address={ctx.newOwner} />)
                  </>
                ) : null}
                .
              </>,
            ),
          ],
          meansNow: [
            clause(<>This is part of opening, not a transfer between holders.</>),
            clause(<>Every position starts life owned by the factory for a single transaction.</>),
          ],
        };
      }
      return {
        happened: [
          clause(
            <>
              The position changed owners
              {ctx.previousOwner ? (
                <>
                  {" "}
                  from <Addr address={ctx.previousOwner} />
                </>
              ) : null}
              {ctx.newOwner ? (
                <>
                  {" "}
                  to <Addr address={ctx.newOwner} />
                </>
              ) : null}
              .
            </>,
          ),
        ],
        meansNow: [
          clause(
            <>
              A position is a contract of its own, so ownership is a transferable fact this explorer follows through
              every transfer.
            </>,
          ),
        ],
      };
    }

    default:
      return { happened: [] };
  }
}

/** The teaser = the lead of the composed arc (the first sentence plus any
 *  trailing continuations). */
export function frankencoinExplainerTeaser(ctx: FrankencoinContext, coords: FrankencoinCoords): ReactNode | null {
  return splitLead(eventClauses(frankencoinEventSlots(ctx, coords))).lead;
}
