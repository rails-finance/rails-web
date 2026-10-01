// The Lifetime flows panel's Explanation lines and "?" for a MakerDAO / Sky
// vault (lib/makerdao/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "MakerDAO").

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { MakerFlowsFacts } from "@/hooks/useMakerFlows";

const MAKER_DOCS = {
  VAT: "https://docs.makerdao.com/smart-contract-modules/core-module/vat-detailed-documentation",
  RATES: "https://docs.makerdao.com/smart-contract-modules/rates-module",
  OVERVIEW: "https://docs.makerdao.com/",
} as const;

export interface MakerFlowsNoteProps {
  facts: MakerFlowsFacts | null;
  collSymbol: string;
  debtSymbol: string;
  ilk: string;
  /** The ilk's price is capped (a LockStake urn): the store holds the capped
   *  price, the one Maker values the vault at. */
  capped: boolean;
}

const count = (k: number, one: string, many: string) => (k === 1 ? one : `${k.toLocaleString("en-US")} ${many}`);

export function MakerFlowsNote({ facts, collSymbol, debtSymbol, ilk, capped }: MakerFlowsNoteProps): ReactNode {
  const p = facts?.pricing;
  const store = facts?.between !== "carried";
  return (
    <div className="space-y-2" data-makerdao-flows-note="" data-anatomy="F14·makerdao">
      <p>
        Each event records the vault&apos;s collateral and debt after it, and the debt is what the Vat states: the
        vault&apos;s normalized debt × {ilk}&apos;s rate accumulator at the block. So the stability fee between two
        events is exact, the debt just before an event less the debt after the one before, and the bar draws it dashed
        as Stability fee. {debtSymbol} is counted at its $1 face.
      </p>
      <p>
        Between events the debt grows in a straight line from what an event recorded to what the next event&apos;s rate
        makes of it, and after the last event to the vault&apos;s live read, which is today&apos;s figure. Maker adds
        the fee to the rate in lumps, when someone calls Jug.drip, so a day between two events is stated to within how
        the fee was dripped between them.
      </p>
      {store ? (
        <p>
          The collateral is valued at Maker&apos;s oracle price for {ilk} at the close of each day (Vat spot × Spotter
          mat, the price the liquidation check uses, one hour behind the market), recorded once a day in Rails&apos;
          daily price store: each event at its day&apos;s price
          {p && p.row > 0
            ? `, ${count(p.row, "a liquidation", "liquidations")} at the price at ${p.row === 1 ? "its block" : "their blocks"}`
            : ""}
          {p && p.today > 0 ? `, ${count(p.today, "an event today", "events today")} at the live price` : ""}
          {p && p["store-near"] > 0
            ? `, and ${count(p["store-near"], "one event", "events")} on a day the store holds no price for at the nearest day's`
            : ""}
          . Market move is the change in that price since each flow.
          {capped
            ? ` ${collSymbol}'s price here is the capped one: Maker values this collateral type at the lower of a cap governance sets and its oracle.`
            : ""}
        </p>
      ) : (
        <p>
          The daily price store did not answer, so each event takes the nearest recorded Maker oracle price in time
          {p && p.row > 0
            ? ` (${count(p.row, "a liquidation", "liquidations")} at ${p.row === 1 ? "its block" : "their blocks"})`
            : ""}
          : a liquidation&apos;s block or today&apos;s live price. Between events the collateral keeps the price of its
          latest event, and a price more than 30 days old is stated as such.
        </p>
      )}
      {facts && facts.liquidations + facts.forks + facts.returned > 0 && (
        <p>
          {facts.liquidations > 0 &&
            `${count(facts.liquidations, "A liquidation", "liquidations")} took collateral (Seized in liquidations) and cleared the debt with its fee (Cleared by liquidations); each one's figures are the Vat's balances either side of its block. `}
          {facts.returned > 0 &&
            `Collateral an auction handed back and the owner put back into the vault is Returned by auction. `}
          {facts.forks > 0 &&
            `${count(facts.forks, "A move", "moves")} between vaults (a Vat fork) shifted collateral and debt with no tokens paid in or out: Moved in from another vault, Moved to another vault.`}
        </p>
      )}
    </div>
  );
}

export function makerdaoFlowsContent(opts: { debtSym: string; ilk: string }): LearnMoreContent {
  const dsym = opts.debtSym;
  return {
    title: "About the Lifetime flows",
    intro: `The bars add up every event Maker has recorded for this vault in USD, and the line under them draws what it held and owed at the end of each day.`,
    stepsHeading: "How it's built:",
    steps: [
      "Collateral: deposited, plus what an auction returned, less withdrawn, less seized in liquidations, each at Maker's oracle price on its day, plus the change in that price since (Market move), is what the vault holds.",
      `Debt: ${dsym} generated, plus the stability fee, less ${dsym} paid back, less what liquidations cleared, is what the vault owes.`,
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The collateral type",
        text: `each vault belongs to one collateral type (this one is ${opts.ilk}), which sets its minimum ratio and stability fee.`,
      },
      {
        bold: "Stability fee",
        text: "a yearly rate governance sets per collateral type. The Vat keeps it in a rate accumulator that multiplies every vault's normalized debt, so the fee grows the debt with no event on the vault.",
      },
    ],
    links: [
      { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
      { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
      { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
    ],
  };
}
