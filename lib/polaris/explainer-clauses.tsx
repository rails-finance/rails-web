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
import type { PolarisContext } from "@/lib/shared/types/event-shape";
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
import { AmountText } from "@/components/shared/amount-text";
import { formatPolarisRatio } from "@/lib/polaris/ratio-format";

const EPS = 1e-9;

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};
const fmt = (h?: string): string => formatNumber(Math.abs(Number(h)));
const pct = (f: number): string => `${(f * 100).toFixed(2)}%`;
/** An amount to six decimals at most, trailing zeros dropped: the open's
 *  collateral and escrow read as the sum the holder sent (0.0125 + 0.0375 =
 *  0.05), which three decimals would round apart. */
const upTo6 = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

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
      <AmountText value={f.leg} /> pETH
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
      {formatPolarisRatio(f.icrAtFire, 1, POLARIS_LIQ_CONSTANTS.mcr.fraction)}
    </Fig>
  );
  return [
    clause(
      <>
        At the feed&rsquo;s price at that block the {holder}&rsquo;s {legFigure} came to {legValueFigure} against{" "}
        {clearedFigure} of debt cleared — a premium of {premiumFigure}, the protocol&rsquo;s liquidation penalty of{" "}
        {constant.label}. The penalty is the owner&rsquo;s cost: the CDP&rsquo;s collateral pays it to the {holder}, and
        it comes out of what the owner could have kept as surplus.
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
      <AmountText value={Math.abs(value)} /> pETH
    </Fig>
  );
  const debtFig = (value: number, labeled: boolean) => (
    <Fig
      info={ledgerFieldProv("debtChange", coords, ctx.raw?.debtChange)}
      value={chainTruthDeltaValue(value, labeled)}
      symbol={stable}
    >
      <AmountText value={Math.abs(value)} /> {stable}
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
      ? (() => {
          // The share is the net of every mint and redemption since the
          // previous touch: each side is stated with its own sign, and the
          // pair is never named after one of the two trades.
          const signedLeg = (field: "mintRedeemCollGain" | "mintRedeemDebtGain", v: number, unit: string) => (
            <Fig info={ledgerFieldProv(field, coords, ctx.raw?.[field])} value={fmt(ctx[field])}>
              {v < 0 ? "−" : "+"}
              {fmt(ctx[field])} {unit}
            </Fig>
          );
          const hasDebtLeg = Math.abs(mrDebt) > EPS;
          const hasCollLeg = Math.abs(mrColl) > EPS;
          const opposite = hasDebtLeg && hasCollLeg && Math.sign(mrDebt) !== Math.sign(mrColl);
          return clause(
            <>
              Since its previous touch traders minted and redeemed {stable} at the market&rsquo;s PSM; this CDP&rsquo;s
              net pro-rata share of all of it came to{" "}
              {hasDebtLeg ? <>{signedLeg("mintRedeemDebtGain", mrDebt, stable)} on its debt</> : null}
              {hasDebtLeg && hasCollLeg ? " and " : ""}
              {hasCollLeg ? <>{signedLeg("mintRedeemCollGain", mrColl, "pETH")} on its collateral</> : null}.
              {opposite
                ? " Mints add to both sides and redemptions take from both, so a net share over a stretch holding both can move the two sides in opposite directions; the trades’ fees make the sizes differ."
                : ""}
            </>,
          );
        })()
      : null,
    zeroMint > EPS
      ? (() => {
          // What the reader can check: the debt before the net share (the
          // previous debt, the holder's change, the interest, less the
          // stability gain), the share that cleared more than that, and the
          // difference the protocol adds so the debt lands on zero.
          const owedBefore = num(ctx.debtBefore) + dDebt + interest - gain;
          const cleared = -mrDebt;
          return clause(
            cleared > owedBefore + EPS ? (
              <>
                Its net PSM share cleared <AmountText value={cleared} /> {stable}, more than the{" "}
                <AmountText value={Math.max(0, owedBefore)} /> {stable} it owed before the share (
                <AmountText value={num(ctx.debtBefore) + dDebt + interest} /> {stable} with interest, less the stability
                gain), so the protocol added {legFig("stablesMintedToEnsureZeroDebt", stable)} to the debt to settle it
                to zero rather than below.
              </>
            ) : (
              <>
                Its pending gains exceeded the remaining debt, so the protocol added{" "}
                {legFig("stablesMintedToEnsureZeroDebt", stable)} to the debt to settle it to zero rather than below.
              </>
            ),
          );
        })()
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
            per year, set by the market.
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
              Its collateral is pETH and its debt is {stable}. The holder sent{" "}
              {upTo6(dColl + POLARIS_LIQ_CONSTANTS.gasComp.amount)} pETH: {upTo6(dColl)} pETH is the collateral, and the
              fixed {POLARIS_LIQ_CONSTANTS.gasComp.label} is gas compensation the CDP holds in escrow, returned on close
              or paid to the liquidator if the CDP is liquidated.
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
          <AmountText value={seized} /> pETH
        </Fig>
      );
      // The pool's share of the seizure: what is left once the redistributed
      // collateral, the owner's surplus and the liquidator's share are out.
      const poolLeg = seized - redistColl - surplus - collComp;
      const poolFig =
        ctx.spAbsorbed && poolLeg > EPS ? (
          <Fig info={polarisPoolLegProv(ctx, coords)} value={formatNumber(poolLeg)} symbol={PETH.symbol}>
            <AmountText value={poolLeg} /> pETH
          </Fig>
        ) : poolLeg > EPS ? (
          <>
            <AmountText value={poolLeg} /> pETH
          </>
        ) : null;
      const liqFig = (field: "collSurplus" | "flatComp" | "collateralComp") => (
        <Fig
          info={liquidationFieldProv(field, coords, ctx.raw?.[field])}
          value={field === "flatComp" ? upTo6(num(ctx[field])) : fmt(ctx[field])}
          symbol="pETH"
        >
          {/* The flat compensation is a round constant: stated whole, so it
              reads as the escrow the open row names. */}
          {field === "flatComp" ? upTo6(num(ctx[field])) : fmt(ctx[field])} pETH
        </Fig>
      );
      const clearedFig = (
        <Fig
          info={liquidationFieldProv("debtLiquidated", coords, ctx.raw?.debtLiquidated)}
          value={chainTruthDeltaValue(cleared, true)}
          symbol={stable}
        >
          <AmountText value={cleared} /> {stable}
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
            ? clause(<>The stability pool absorbed {clearedFig} of its debt.</>)
            : clause(
                <>
                  The stability pool absorbed {clearedFig} of its debt; the rest — <AmountText value={redistDebt} />{" "}
                  {stable} of debt with <AmountText value={redistColl} /> pETH — was redistributed across the
                  market&rsquo;s other CDPs.
                </>,
              ),
          // The seizure as one sum: where each part of it went.
          clause(
            <>
              Of the {seizedFig} seized, {poolFig ?? <>none</>} went to the stability pool
              {redistColl > EPS ? (
                <>
                  , <AmountText value={redistColl} /> pETH to the market&rsquo;s other CDPs
                </>
              ) : null}
              {collComp > EPS ? (
                <>
                  {surplus > EPS ? ", " : " and "}
                  {liqFig("collateralComp")} to the liquidator as its collateral compensation (0.5% of the seized
                  collateral)
                </>
              ) : null}
              {surplus > EPS ? <> and {liqFig("collSurplus")} was set aside for the owner to claim</> : null}.
            </>,
          ),
          flat > EPS
            ? clause(
                <>
                  The liquidator also received the {liqFig("flatComp")} of gas compensation the holder sent into escrow
                  at the open, which sits outside the seized collateral.
                </>,
              )
            : null,
          surplus > EPS
            ? clause(
                <>
                  The owner claims the surplus from the protocol&rsquo;s surplus pool; this page does not show claims.
                </>,
              )
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

/** The card's teaser — the first sentence of the same prose. */
export function polarisExplainerTeaser(ctx: PolarisContext, coords: PolarisCoords): ReactNode {
  return splitLead(eventClauses(polarisEventSlots(ctx, coords))).lead;
}
