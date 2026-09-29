// The Sky Savings T4 lessons (standards/detail-page-anatomy.md, the disclosure
// ladder): what each event kind does, true of any holder, with the official
// sources it rests on — Sky's developer docs and the contract sources Sky
// publishes. A figure about one position belongs at T2 or T3, never here.

import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";
import type { SkySavingsEventType } from "@/lib/shared/types/event-shape";
import { SKY_DOCS } from "@/lib/sky-savings/constants";

const link = (d: { label: string; href: string }): LearnMoreLink => ({ label: d.label, url: d.href });

const SHARE = {
  bold: "A share whose count stays the same",
  text: "sUSDS is the share token of Sky's savings module. A holder's number of shares changes only when they deposit, withdraw or transfer. What each share redeems for rises instead.",
  sources: [link(SKY_DOCS.susds)],
};
const PRICE = {
  bold: "The share price is chi",
  text: "chi is the USDS one sUSDS redeems for. It grows every second at the Savings Rate, compounding, and the contract rounds each step the same way for everyone.",
  sources: [link(SKY_DOCS.source)],
};
const RATE = {
  bold: "Sky governance sets the rate",
  text: "The Savings Rate (SSR) is a per-second factor stored in the contract. Only an address Sky governance has authorised can change it, through the contract's file call, and each change is a public log.",
  sources: [link(SKY_DOCS.source)],
};
const SOURCE = {
  bold: "Where the interest comes from",
  text: "Each deposit, withdrawal or anyone's call to drip brings chi up to date. Drip creates the USDS the savers have earned since the last drip and books the same amount as debt of the Sky system, which the system's revenue covers.",
  sources: [link(SKY_DOCS.source)],
};

const LINKS = [link(SKY_DOCS.susds), link(SKY_DOCS.usds), link(SKY_DOCS.source)];

export function skyPositionContent(): LearnMoreContent {
  return {
    title: "How Sky Savings Works",
    intro:
      "A Sky Savings position is an address that holds sUSDS. Depositing USDS mints sUSDS at the share price of the moment, and the share price rises at the Savings Rate until the shares are withdrawn.",
    detailsHeading: "Key concepts",
    details: [
      SHARE,
      PRICE,
      RATE,
      SOURCE,
      {
        bold: "Interest earned",
        text: "Interest earned is what the position is worth now, plus every USDS amount that left it, less every USDS amount that came in. Shares received from another address count at their value on arrival, so what the sender earned before stays with the sender.",
      },
      {
        bold: "The dollar figure",
        text: "Sky runs no USDS price feed. The PSM swaps USDS for USDC at a fixed rate less its exit fee, so one USDS is worth 1 ÷ (1 + fee) USDC. That fee has been zero for the whole life of sUSDS.",
        sources: [link(SKY_DOCS.wrapper), link(SKY_DOCS.psm)],
      },
    ],
    links: LINKS,
  };
}

export function skyEventContent(kind: SkySavingsEventType): LearnMoreContent {
  switch (kind) {
    case "deposit":
      return {
        title: "How Depositing into Savings USDS Works",
        intro:
          "A deposit hands USDS to the savings module and mints sUSDS in return, at the share price of that block.",
        stepsHeading: "What happens",
        steps: [
          "The contract runs drip first, so the share price is current.",
          "It takes the USDS and mints USDS ÷ share price in sUSDS, rounded down.",
          "The shares go to the receiver the depositor names, which can be another address.",
          "A deposit can carry a referral code, a number a front end attaches to mark deposits it sent.",
        ],
        detailsHeading: "Key concepts",
        details: [
          PRICE,
          {
            bold: "Referral codes",
            text: "The code is a number from 0 to 65,535 in a separate Referral log. Sky publishes no list of which front end uses which code, so Rails shows the number alone.",
            sources: [link(SKY_DOCS.referral)],
          },
        ],
        links: LINKS,
      };
    case "withdrawal":
      return {
        title: "How Withdrawing from Savings USDS Works",
        intro: "A withdrawal burns sUSDS and pays out USDS at the share price of that block.",
        stepsHeading: "What happens",
        steps: [
          "The contract runs drip first, so the share price is current.",
          "It burns the shares and pays shares × share price in USDS.",
          "The USDS goes to the receiver the caller names. An address the owner approved can withdraw for the owner.",
        ],
        detailsHeading: "Key concepts",
        details: [PRICE, SOURCE],
        links: LINKS,
      };
    case "received":
    case "sent":
    case "self":
      return {
        title: "Why a Transfer Carries Value",
        intro:
          "sUSDS is an ordinary token, so shares move between addresses with no deposit or withdrawal. The savings module sees no USDS move.",
        detailsHeading: "Key concepts",
        details: [
          {
            bold: "Valued at the share price of the block",
            text: "A transfer's worth is its shares times the share price of its block. For the receiver that worth is what the shares cost; for the sender it is what left.",
          },
          {
            bold: "Interest follows the shares",
            text: "Interest earned before a transfer stays with the sender. From the transfer on, the receiver's shares earn at the Savings Rate.",
          },
          SHARE,
        ],
        links: LINKS,
      };
  }
}

export function skyRateContent(): LearnMoreContent {
  return {
    title: "How the Sky Savings Rate Is Set",
    intro:
      "The Savings Rate is the per-second factor chi grows by. Sky governance changes it, and every change is a File log on the sUSDS contract.",
    detailsHeading: "Key concepts",
    details: [
      RATE,
      {
        bold: "Stated as a yearly figure",
        text: "Rails states the rate as the per-second factor compounded over 365 days, less one. Between two changes the rate is constant, so the history is a series of steps.",
      },
      {
        bold: "A change applies to every holder at once",
        text: "The new rate applies from its block to every share. The contract brings chi up to date at the old rate before the change lands.",
        sources: [link(SKY_DOCS.source)],
      },
    ],
    links: LINKS,
  };
}

export function skyFlowsContent(): LearnMoreContent {
  return {
    title: "Reading Lifetime Flows for Sky Savings",
    intro:
      "Lifetime flows show everything that came into the position and everything that left, with what is still held. A savings position has one side, so it draws one bar.",
    detailsHeading: "Key concepts",
    details: [
      {
        bold: "In",
        text: "Deposits at their USDS amount, and shares received at their worth on arrival.",
      },
      {
        bold: "Out",
        text: "Withdrawals at their USDS amount, and shares sent at their worth when they left.",
      },
      {
        bold: "Interest earned",
        text: "Still held plus out, less in. It is the dashed part of the bar: it grew inside the shares, and no transaction moved it.",
      },
      {
        bold: "Dollars",
        text: "USDS is valued at the PSM rate of 1 ÷ (1 + fee) USDC. The fee has been zero throughout, so one USDS counts as one dollar on the axis.",
        sources: [link(SKY_DOCS.wrapper)],
      },
    ],
    links: LINKS,
  };
}
