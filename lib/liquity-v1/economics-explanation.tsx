// Liquity V1 economics Explanation — the plain-language narration under the
// chain-truth tower, mirroring the V2 benchmark (lib/liquity/economics-
// explanation.tsx): a lead sentence naming the prices the figures use, bullets
// built from the tower's data (computeLiquityV1Economics), and the redemption
// net outcome at each redemption's price and at today's price.
//
// Pricing: the tower values ETH at the PriceFeed price NOW and LUSD at $1, so
// a "Redeemed" ETH row and the "Redeemed" LUSD row differ by how far ETH has
// moved since the redemptions. The outcome bullet and the strip on the tower's
// heading row state both prices so the difference reads as what it is.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerSideData } from "@/lib/shared/chain-truth-economics";
import type { LiquityV1RedemptionTotals } from "@/lib/liquity-v1/economics";
import { formatCompact } from "@/lib/utils/format";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { fmtEth, fmtLusd, fmtUsd, fmtUsdSigned } from "@/lib/liquity-v1/event-figures";

const DUST = 1e-9;

const sideSymbol = (side: TowerSideData, fallback: string): string =>
  side.current[0]?.symbol ?? side.exited[0]?.symbol ?? side.liquidated[0]?.symbol ?? fallback;

const fig = (amount: number, usd: number | null, valued: boolean, symbol: string): string =>
  valued && usd != null
    ? `${formatCompact(amount)} ${symbol} (${formatCompactUsd(usd)})`
    : `${formatCompact(amount)} ${symbol}`;

const strong = (s: string) => <span className="font-semibold text-foreground tabular-nums">{s}</span>;

const byKey = (side: TowerSideData, key: string) =>
  [...side.exited, ...side.liquidated].find((l) => l.key === key) ?? null;

/** Explanation body for the Liquity V1 tower. Returns null when there's
 *  nothing to narrate (no current state and no lifetime flows). */
export function liquityV1EconomicsExplanation(
  data: ChainTruthTowerData,
  opts: { priceNow?: number | null; redemptions?: LiquityV1RedemptionTotals | null } = {},
): ReactNode {
  const { collateral, debt, valued } = data;
  const { priceNow, redemptions } = opts;
  const collSym = sideSymbol(collateral, "ETH");
  const debtSym = sideSymbol(debt, "LUSD");
  const bullets: ReactNode[] = [];

  const withdrawn = byKey(collateral, "coll-withdrawn");
  const toSurplus = byKey(collateral, "coll-surplus");
  const collRedeemed = byKey(collateral, "coll-redeemed");
  const collLiq = byKey(collateral, "coll-liq");
  const repaid = byKey(debt, "debt-repaid");
  const debtRedeemed = byKey(debt, "debt-redeemed");
  const debtLiq = byKey(debt, "debt-liq");
  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  const depositedAmt = valued && priceNow ? collateral.lifetimeInflow / priceNow : collateral.lifetimeInflow;

  if (collateral.lifetimeInflow > DUST) {
    const parts: string[] = [];
    if (withdrawn) parts.push(`${fig(withdrawn.amount, withdrawn.usd, valued, collSym)} withdrawn by the owner`);
    if (collRedeemed) parts.push(`${fig(collRedeemed.amount, collRedeemed.usd, valued, collSym)} taken by redemptions`);
    if (toSurplus) parts.push(`${fig(toSurplus.amount, toSurplus.usd, valued, collSym)} moved to the surplus pool`);
    if (collLiq) parts.push(`${fig(collLiq.amount, collLiq.usd, valued, collSym)} seized in liquidation`);
    bullets.push(
      <span key="coll-flow">
        Collateral: {strong(fig(depositedAmt, valued ? collateral.lifetimeInflow : null, valued, collSym))} deposited
        {parts.length > 0 && <>, then {parts.join(", ")}</>}
        {collNow ? <>, leaving {strong(fig(collNow.amount, collNow.usd, valued, collSym))}.</> : <>, leaving none.</>}
      </span>,
    );
  }

  if (debt.lifetimeInflow > DUST) {
    const parts: string[] = [];
    if (repaid) parts.push(`${fig(repaid.amount, null, false, debtSym)} repaid by the owner`);
    if (debtRedeemed) parts.push(`${fig(debtRedeemed.amount, null, false, debtSym)} cancelled by redemptions`);
    if (debtLiq) parts.push(`${fig(debtLiq.amount, null, false, debtSym)} cancelled in liquidation`);
    bullets.push(
      <span key="debt-flow">
        Debt: {strong(fig(debt.lifetimeInflow, null, false, debtSym))} taken on (the LUSD received, the borrowing fees
        and the 200 LUSD reserve)
        {parts.length > 0 && <>, then {parts.join(", ")}</>}
        {debtNow ? <>, leaving {strong(fig(debtNow.amount, null, false, debtSym))}.</> : <>, leaving none.</>}
      </span>,
    );
  }

  if (redemptions) {
    const atToday = priceNow != null && priceNow > 0 ? redemptions.ethTaken * priceNow : null;
    const netThen = redemptions.lusdRedeemed - redemptions.ethValueAtRedemption;
    bullets.push(
      <span key="redemption-outcome">
        Redemptions took {strong(`${fmtEth(redemptions.ethTaken)} ${collSym}`)} for{" "}
        {strong(`${fmtLusd(redemptions.lusdRedeemed)} ${debtSym}`)} of debt, and that ETH was worth{" "}
        {strong(fmtUsd(redemptions.ethValueAtRedemption))} at the PriceFeed price when each redemption happened: a net{" "}
        {strong(fmtUsdSigned(Math.abs(netThen) < 0.005 ? 0 : netThen))} to the owner.
        {atToday != null && (
          <>
            {" "}
            At today&apos;s {fmtUsd(priceNow as number)} the same ETH is worth {strong(fmtUsd(atToday))}, which is why
            the Redeemed ETH row reads more than the Redeemed LUSD row: a net{" "}
            {strong(fmtUsdSigned(redemptions.lusdRedeemed - atToday))} at today&apos;s value.
          </>
        )}
        {redemptions.reserveBurned > 0 && (
          <>
            {" "}
            The Redeemed LUSD row also counts the {fmtLusd(redemptions.reserveBurned)} LUSD of liquidation reserve a
            full redemption burned.
          </>
        )}
      </span>,
    );
  }

  if (collNow || debtNow || bullets.length > 0) {
    bullets.push(
      <span key="mechanic">
        Liquity V1 charges no interest: the debt moves only when the owner borrows or repays, or a redemption or
        liquidation reaches the Trove.
      </span>,
    );
  }

  if (!valued) {
    bullets.push(
      <span key="unvalued">
        Amounts are in tokens: the PriceFeed&apos;s ETH price did not load, so no dollar values are shown.
      </span>,
    );
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures add up the Trove&apos;s flows over its life.{" "}
        {valued && priceNow ? (
          <>
            ETH amounts are valued at today&apos;s PriceFeed price, {fmtUsd(priceNow)}, and LUSD at $1, so a flow from
            years ago is shown at what that ETH is worth now.
          </>
        ) : null}
      </p>
      {bullets.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

/** The redemption net-outcome strip on the tower's heading row (the V2 tower's
 *  rowExtra): the net at each redemption's price, and at today's price. */
export function liquityV1RedemptionOutcome(t: LiquityV1RedemptionTotals | null, priceNow?: number | null): ReactNode {
  if (!t) return undefined;
  const netThen = t.lusdRedeemed - t.ethValueAtRedemption;
  const thenProv: Provenance = {
    kind: "derived",
    summary:
      "Redemption net outcome — the LUSD the redeemers paid in, counted at $1, less the ETH they took valued at the PriceFeed price at each redemption's block.",
    formula: "LUSD redeemed − ETH taken × price at each redemption",
    inputs: [
      { label: "LUSD redeemed", value: fmtLusd(t.lusdRedeemed), kind: "chain-derived" },
      {
        label: "ETH taken, at redemption prices",
        value: fmtUsd(t.ethValueAtRedemption),
        kind: "chain-derived",
        pclass: "oracle",
      },
    ],
  };
  const netNow = priceNow != null && priceNow > 0 ? t.lusdRedeemed - t.ethTaken * priceNow : null;
  const nowProv: Provenance | null =
    netNow != null
      ? {
          kind: "derived",
          summary:
            "Redemption net outcome at today's price — the LUSD the redeemers paid in, counted at $1, less the ETH they took valued at the PriceFeed price now.",
          formula: "LUSD redeemed − ETH taken × price now",
          inputs: [
            { label: "LUSD redeemed", value: fmtLusd(t.lusdRedeemed), kind: "chain-derived" },
            { label: "ETH taken", value: fmtEth(t.ethTaken), kind: "chain-derived" },
            { label: "price now", value: fmtUsd(priceNow as number), kind: "chain", pclass: "oracle" },
          ],
        }
      : null;
  const tone = (n: number) => (n >= 0 ? "text-green-400" : "text-red-400");
  const shownThen = Math.abs(netThen) < 0.005 ? 0 : netThen;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 pl-2 text-xs text-rb-500">
      <span>Owner&apos;s net outcome from redemptions was</span>
      <Prov info={thenProv}>
        <span className={tone(shownThen)}>{fmtUsdSigned(shownThen)}</span>
      </Prov>
      <span>at the redemption prices</span>
      {netNow != null && nowProv && (
        <>
          <span>or</span>
          <Prov info={nowProv}>
            <span className={tone(netNow)}>{fmtUsdSigned(netNow)}</span>
          </Prov>
          <span>at today&apos;s value</span>
        </>
      )}
    </div>
  );
}

const LIQUITY_V1_FAQ = {
  BORROWING: "https://docs.liquity.org/liquity-v1/faq/borrowing",
  REDEMPTIONS: "https://docs.liquity.org/liquity-v1/faq/lusd-redemptions",
  LIQUIDATIONS: "https://docs.liquity.org/liquity-v1/faq/stability-pool-and-liquidations",
} as const;

/** The tower's "?" for Liquity V1. */
export function liquityV1EconomicsContent(): LearnMoreContent {
  return {
    title: "About the Lifetime Flows",
    intro:
      "This panel adds up everything that moved in and out of the Trove over its life, from each of its events, and shows what it holds today.",
    stepsHeading: "How to read it:",
    steps: [
      "The left bar is collateral (ETH): deposited, then withdrawn by the owner, taken by redemptions, moved to the surplus pool or seized in liquidation, and what is left.",
      "The right bar is debt (LUSD): taken on, then repaid by the owner, cancelled by redemptions or in liquidation, and what is owed.",
      "Dollar values put ETH at today's price from Liquity's PriceFeed and LUSD at $1. A deposit made when ETH was cheaper shows at today's value.",
      "Because of that, the Redeemed ETH row and the Redeemed LUSD row differ by how far ETH has moved since. At the price of each redemption they were equal; the net outcome beside the heading gives both.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "No interest",
        text: "the debt moves only when the owner borrows or repays, or a redemption or liquidation reaches the Trove.",
        sources: [{ label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING }],
      },
      {
        bold: "Debt taken on",
        text: "each draw adds the LUSD received plus a one-time fee; opening also adds the 200 LUSD liquidation reserve, which closing or a full redemption burns.",
        sources: [{ label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING }],
      },
    ],
    links: [
      { label: "Borrowing FAQ", url: LIQUITY_V1_FAQ.BORROWING },
      { label: "Redemptions FAQ", url: LIQUITY_V1_FAQ.REDEMPTIONS },
      { label: "Stability Pool and liquidations FAQ", url: LIQUITY_V1_FAQ.LIQUIDATIONS },
    ],
  };
}
