// Polaris plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Every clause is keyed on the event's RESULTING STATE (what the CDP looks
// like AFTER this touch), never on the event type alone: an adjust that
// clears the debt, one that leaves debt standing, a withdrawal that empties
// the collateral all read differently though they share a kind. Facts about
// THIS touch's own figures, third person, no verdicts.
//
// Figures render through <Prov echo>: the moved amounts echo the header's
// per-axis receipts (the log's _collChange / _debtChange, with the header's
// own value key — a bare magnitude on labelled axes, signed on a close), and
// the resulting figures echo the detail grid's after-values (the grid passes
// no symbol, so neither do these). The protocol's own legs (interest, gains,
// reward pETH, the PSM shares) echo the grid's rows for them.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
//   • §5.1 (risk consequence per event): the per-event ratio is the CARD's,
//     not the prose's. The oracle-at-block lane supplies the block's price,
//     and the card states the ratio as a header chip and a detail metric
//     (lib/polaris/cr-at-event.ts). The explainer's prose stays figures only,
//     except the liquidation's own ratio at fire, stated below.
//   • §5.2 (mechanic-why): stated where the touch exhibits one — interest
//     written in at the touch, a PSM share, a settlement mint on a close.
//   • §5.4 (derived net-outcome): a liquidation's pool/redistribution split
//     is stated from the log's own legs.

import type { ReactNode } from "react";
import type { GasCost, PolarisContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import {
  ledgerFieldProv,
  liquidationFieldProv,
  liqIcrAtFireProv,
  liqLegValueProv,
  liqPremiumProv,
  rateInForceProv,
  type PolarisCoords,
} from "@/lib/polaris/event-provenance";
import {
  POLARIS_LIQ_CONSTANTS,
  polarisLiquidationFigures,
  polarisPoolLegProv,
  polarisValueFormat,
} from "@/components/protocol/polaris/polaris-liquidation-forensics";
import { explorerUrl } from "@/lib/shared/chains";
import { PETH, POLARIS_CHAIN_ID, shortAddress } from "@/lib/polaris/asset-catalog";
import { formatExact, formatNumber } from "@/lib/utils/format";
import { formatGasCost } from "@/lib/shared/format-event";

const EPS = 1e-9;

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};
const fmt = (h?: string): string => formatNumber(Math.abs(Number(h)));
const pct = (f: number): string => `${(f * 100).toFixed(2)}%`;

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

/** Sepolia Etherscan address link, click-isolated from the card — a muted
 *  counterparty, never bolded. */
function Addr({ address }: { address: string }) {
  return (
    <a
      href={explorerUrl(POLARIS_CHAIN_ID, "address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {shortAddress(address)}
    </a>
  );
}

/** The two valued sentences a priced liquidation carries (charter §5.1 — the
 *  risk consequence, now that the feed can be read back at the block).
 *
 *  The premium is stated on the leg the protocol's own penalty applies to —
 *  the pool's collateral, which is the seized total less the owner's surplus
 *  and the liquidator's compensation. The collateral ratio at fire is the
 *  WHOLE seized collateral over the same debt: a different fact, and the one
 *  the market's minimum judges, so it gets its own sentence rather than being
 *  mistaken for the premium. Empty on a row the oracle-at-block lane has not
 *  priced. */
function valuedLiquidationClauses(ctx: PolarisContext, coords: PolarisCoords, stable: string): ClauseInput[] {
  const f = polarisLiquidationFigures(ctx);
  if (!f) return [];
  const value = polarisValueFormat(ctx.market);
  const constant = POLARIS_LIQ_CONSTANTS[f.path];
  const legName = f.path === "sp" ? ("pool collateral" as const) : ("redistributed collateral" as const);
  const premiumPct = `${f.premium >= 0 ? "+" : "−"}${(Math.abs(f.premium) * 100).toFixed(2)}%`;
  const holder = f.path === "sp" ? "stability pool" : "market's other CDPs";
  const legFigure = (
    <Fig info={polarisPoolLegProv(ctx, coords)} value={formatNumber(f.leg)} symbol={PETH.symbol}>
      {formatNumber(f.leg)} pETH
    </Fig>
  );
  const legValueFigure = (
    <Fig
      info={liqLegValueProv(legName, coords, {
        amount: `${formatExact(f.leg)} ${PETH.symbol}`,
        priceInDebt: `${formatExact(f.priceInDebt)} ${stable}`,
      })}
      value={value(f.legValue)}
      symbol={stable}
    >
      {value(f.legValue)} {stable}
    </Fig>
  );
  const clearedFigure = (
    <Fig
      info={liqLegValueProv("cleared debt", coords, { amount: `${formatExact(f.cleared)} ${stable}` })}
      value={value(f.cleared)}
      symbol={stable}
    >
      {value(f.cleared)} {stable}
    </Fig>
  );
  const premiumFigure = (
    <Fig
      info={liqPremiumProv(coords, {
        legValue: `${value(f.legValue)} ${stable}`,
        clearedValue: `${value(f.cleared)} ${stable}`,
        constant: constant.label,
        fn: constant.fn,
      })}
      value={premiumPct}
    >
      {premiumPct}
    </Fig>
  );
  const icrFigure = (
    <Fig
      info={liqIcrAtFireProv(coords, {
        seized: `${formatExact(num(ctx.collLiquidated))} ${PETH.symbol}`,
        priceInDebt: `${formatExact(f.priceInDebt)} ${stable}`,
        cleared: `${formatExact(f.cleared)} ${stable}`,
        mcrPct: POLARIS_LIQ_CONSTANTS.mcr.label,
      })}
      value={pct(f.icrAtFire)}
    >
      {pct(f.icrAtFire)}
    </Fig>
  );
  return [
    clause(
      <>
        At the feed&rsquo;s price at that block the {holder}&rsquo;s {legFigure} came to {legValueFigure} against{" "}
        {clearedFigure} of debt cleared — a premium of {premiumFigure}, the protocol&rsquo;s own liquidation penalty of{" "}
        {constant.label}.
      </>,
    ),
    clause(
      <>
        The whole seized collateral valued at the same price put its collateral ratio at liquidation at {icrFigure},
        below the market&rsquo;s normal-mode minimum of {POLARIS_LIQ_CONSTANTS.mcr.label}.
      </>,
    ),
  ];
}

export function polarisEventSlots(ctx: PolarisContext, coords: PolarisCoords): EventProseSlots {
  const stable = ctx.stableSymbol;
  const collAfter = num(ctx.newColl);
  const debtAfter = num(ctx.newDebt);
  const hasColl = collAfter > EPS;
  const hasDebt = debtAfter > EPS;
  const dColl = num(ctx.collChange);
  const dDebt = num(ctx.debtChange);
  const interest = num(ctx.accruedInterest);
  const gain = num(ctx.stableGain);
  const reward = num(ctx.bcTokenGain);
  const mrColl = num(ctx.mintRedeemCollGain);
  const mrDebt = num(ctx.mintRedeemDebtGain);
  const zeroMint = num(ctx.stablesMintedToEnsureZeroDebt);

  // Header echoes: labelled per-axis verbs on open/adjust (bare magnitude),
  // signed on a close.
  const collFig = (value: number, labeled: boolean) => (
    <Fig
      info={ledgerFieldProv("collChange", coords, ctx.raw?.collChange)}
      value={chainTruthDeltaValue(value, labeled)}
      symbol="pETH"
    >
      {formatNumber(Math.abs(value))} pETH
    </Fig>
  );
  const debtFig = (value: number, labeled: boolean) => (
    <Fig
      info={ledgerFieldProv("debtChange", coords, ctx.raw?.debtChange)}
      value={chainTruthDeltaValue(value, labeled)}
      symbol={stable}
    >
      {formatNumber(Math.abs(value))} {stable}
    </Fig>
  );
  // Grid echoes: the after-values and the protocol's legs, no symbol.
  const collAfterFig = () => (
    <Fig info={ledgerFieldProv("newColl", coords, ctx.raw?.newColl)} value={fmt(ctx.newColl)}>
      {fmt(ctx.newColl)} pETH
    </Fig>
  );
  const debtAfterFig = () => (
    <Fig info={ledgerFieldProv("newDebt", coords, ctx.raw?.newDebt)} value={fmt(ctx.newDebt)}>
      {fmt(ctx.newDebt)} {stable}
    </Fig>
  );
  const legFig = (
    field:
      | "accruedInterest"
      | "stableGain"
      | "bcTokenGain"
      | "mintRedeemCollGain"
      | "mintRedeemDebtGain"
      | "stablesMintedToEnsureZeroDebt",
    unit: string,
  ) => (
    <Fig info={ledgerFieldProv(field, coords, ctx.raw?.[field])} value={fmt(ctx[field])}>
      {fmt(ctx[field])} {unit}
    </Fig>
  );

  // The protocol's legs at this touch — stated wherever the touch carried one.
  const protocolLegs = (): ClauseInput[] => [
    interest > EPS
      ? clause(
          <>
            The touch charged {legFig("accruedInterest", stable)} of interest into its debt, accrued since its previous
            touch.
          </>,
        )
      : null,
    gain > EPS ? clause(<>It credited {legFig("stableGain", stable)} of stability gains against the debt.</>) : null,
    reward > EPS ? clause(<>It added {legFig("bcTokenGain", "pETH")} of reward pETH to the collateral.</>) : null,
    Math.abs(mrColl) > EPS || Math.abs(mrDebt) > EPS
      ? clause(
          <>
            The market&rsquo;s PSM activity since its last touch moved this CDP&rsquo;s share:{" "}
            {Math.abs(mrColl) > EPS ? (
              <>
                {legFig("mintRedeemCollGain", "pETH")} {mrColl > 0 ? "in" : "out"} on the collateral side
              </>
            ) : null}
            {Math.abs(mrColl) > EPS && Math.abs(mrDebt) > EPS ? " and " : ""}
            {Math.abs(mrDebt) > EPS ? (
              <>
                {legFig("mintRedeemDebtGain", stable)} {mrDebt > 0 ? "added to" : "cleared from"} the debt
              </>
            ) : null}
            .
          </>,
        )
      : null,
    zeroMint > EPS
      ? clause(
          <>
            Its pending gains exceeded the remaining debt, so the protocol minted{" "}
            {legFig("stablesMintedToEnsureZeroDebt", stable)} to settle it exactly to zero.
          </>,
        )
      : null,
  ];

  const rateClause = (): ClauseInput =>
    ctx.primaryRate != null
      ? clause(
          <>
            The market&rsquo;s primary rate in force at this touch was{" "}
            <Fig info={rateInForceProv(coords, ctx.raw?.primaryRate)} value={pct(ctx.primaryRate)}>
              {pct(ctx.primaryRate)}
            </Fig>{" "}
            per year — set by the market, not chosen by the holder.
          </>,
        )
      : null;

  const resulting = (): ClauseInput =>
    hasColl && hasDebt
      ? clause(
          <>
            This CDP now holds {collAfterFig()} against {debtAfterFig()} of debt.
          </>,
        )
      : hasColl
        ? clause(<>This CDP now holds {collAfterFig()} with no debt.</>)
        : hasDebt
          ? clause(<>This CDP now owes {debtAfterFig()} with no collateral.</>)
          : null;

  switch (ctx.eventType) {
    case "open": {
      const opening =
        dColl > EPS && dDebt > EPS ? (
          <>
            This CDP opened with {collFig(dColl, true)} of collateral, borrowing {debtFig(dDebt, true)}.
          </>
        ) : dColl > EPS ? (
          <>This CDP opened with {collFig(dColl, true)} of collateral and no debt.</>
        ) : (
          <>This CDP opened.</>
        );
      return {
        happened: [clause(opening)],
        changed: [...protocolLegs()],
        meansNow: [
          clause(
            <>
              Its collateral is pETH and its debt is {stable}; a fixed gas compensation in pETH is escrowed alongside
              for a liquidator, returned on close.
            </>,
          ),
          rateClause(),
        ],
      };
    }
    case "adjust": {
      const moved: ReactNode[] = [];
      if (dColl > EPS) moved.push(<>deposited {collFig(dColl, true)}</>);
      if (dColl < -EPS) moved.push(<>withdrew {collFig(dColl, true)}</>);
      if (dDebt > EPS) moved.push(<>borrowed {debtFig(dDebt, true)}</>);
      if (dDebt < -EPS) moved.push(<>repaid {debtFig(dDebt, true)}</>);
      const lead =
        moved.length === 0 ? (
          <>The holder touched this CDP without moving collateral or debt — the touch wrote its pending legs in.</>
        ) : (
          <>
            The holder{" "}
            {moved.map((m, i) => (
              <span key={i}>
                {i > 0 ? (i === moved.length - 1 ? " and " : ", ") : ""}
                {m}
              </span>
            ))}
            .
          </>
        );
      return {
        happened: [clause(lead)],
        changed: [...protocolLegs()],
        meansNow: [resulting(), rateClause()],
      };
    }
    case "close": {
      return {
        happened: [
          clause(
            <>
              The holder closed this CDP
              {dDebt < -EPS ? <>, repaying {debtFig(dDebt, false)}</> : null}
              {dColl < -EPS ? (
                <>
                  {dDebt < -EPS ? " and" : ","} withdrawing {collFig(dColl, false)}
                </>
              ) : null}
              .
            </>,
          ),
        ],
        changed: [...protocolLegs()],
        meansNow: [
          clause(
            <>
              Its collateral and debt are both at zero; the CDP NFT is burned and the escrowed gas compensation
              returned.
            </>,
          ),
          rateClause(),
        ],
      };
    }
    case "liquidate": {
      const seized = num(ctx.collLiquidated);
      const cleared = num(ctx.debtLiquidated);
      const redistDebt = num(ctx.debtRedistributed);
      const redistColl = num(ctx.collRedistributed);
      const surplus = num(ctx.collSurplus);
      const flat = num(ctx.flatComp);
      const collComp = num(ctx.collateralComp);
      const seizedFig = (
        <Fig
          info={liquidationFieldProv("collLiquidated", coords, ctx.raw?.collLiquidated)}
          value={chainTruthDeltaValue(seized, true)}
          symbol="pETH"
        >
          {formatNumber(seized)} pETH
        </Fig>
      );
      const clearedFig = (
        <Fig
          info={liquidationFieldProv("debtLiquidated", coords, ctx.raw?.debtLiquidated)}
          value={chainTruthDeltaValue(cleared, true)}
          symbol={stable}
        >
          {formatNumber(cleared)} {stable}
        </Fig>
      );
      return {
        happened: [
          clause(
            <>
              This CDP was liquidated
              {ctx.liquidator ? (
                <>
                  {" "}
                  by <Addr address={ctx.liquidator} />
                </>
              ) : null}
              : its collateral ratio had fallen below the market&rsquo;s minimum.
            </>,
          ),
        ],
        changed: [
          ctx.spAbsorbed
            ? clause(
                <>
                  The stability pool absorbed {clearedFig} of its debt and took {seizedFig} of its collateral in
                  exchange.
                </>,
              )
            : clause(
                <>
                  The stability pool absorbed {clearedFig} of its debt and took {seizedFig} of its collateral; the rest
                  — {formatNumber(redistDebt)} {stable} of debt with {formatNumber(redistColl)} pETH — was redistributed
                  across the market&rsquo;s other CDPs.
                </>,
              ),
          flat > EPS || collComp > EPS
            ? clause(
                <>
                  The liquidator received the escrowed gas compensation of {formatNumber(flat)} pETH
                  {collComp > EPS ? <> plus {formatNumber(collComp)} pETH of the collateral</> : null}.
                </>,
              )
            : null,
          surplus > EPS
            ? clause(<>{formatNumber(surplus)} pETH of collateral was left over for its owner to claim.</>)
            : null,
          ...valuedLiquidationClauses(ctx, coords, stable),
          ...protocolLegs(),
        ],
        meansNow: [clause(<>Its collateral and debt are both at zero and the CDP NFT is burned.</>)],
      };
    }
    case "transfer": {
      return {
        happened: [
          clause(
            <>
              This CDP changed hands
              {ctx.fromAddr ? (
                <>
                  {" "}
                  from <Addr address={ctx.fromAddr} />
                </>
              ) : null}
              {ctx.toAddr ? (
                <>
                  {" "}
                  to <Addr address={ctx.toAddr} />
                </>
              ) : null}
              .
            </>,
          ),
        ],
        changed: [
          clause(
            <>
              Nothing about its collateral or debt moved: the CDP is an NFT, and the transfer makes the recipient its
              new owner — the one who may act on it from here.
            </>,
          ),
        ],
      };
    }
  }
}

/** The trailing gas clause — the holder's own touches only. A liquidation is
 *  sent by the liquidator and a transfer is paid for by whoever moved the NFT,
 *  so attributing either transaction's gas to the CDP's holder would be wrong;
 *  the card passes no gas on those rows and this clause never renders there.
 *  Always last in the arc, never the lead, so the teaser never carries it. */
export function polarisGasClause(gas: GasCost): ClauseInput {
  if (!gas || gas.gasCostEth <= 0) return null;
  return clause(<>Gas for this transaction: {formatGasCost(gas)}.</>);
}

/** The card's teaser — the first sentence of the same prose. */
export function polarisExplainerTeaser(ctx: PolarisContext, coords: PolarisCoords): ReactNode {
  return splitLead(eventClauses(polarisEventSlots(ctx, coords))).lead;
}
