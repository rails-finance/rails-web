// The event page's contracts (rails-ops reference/app-anatomy.md, P4) for a
// Polaris stability-pool deposit and a reserve loan, beside the CDP's
// (lib/polaris/explorer.ts): the pool or the loans manager, the position's
// number and its holder, then the shared rows. The page reads the row the
// timeline holds for the event; the title is the row's kind and what it moved.

import type { EventPageContract, EventPageSlot } from "@/lib/shared/explorer-adapter";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { makeEventTitle, type EventTitle } from "@/lib/shared/event-title";
import { formatDateLong } from "@/lib/date";
import { FPETH, PETH, POLARIS_MARKET_CONFIG, POLARIS_WETH, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { POLARIS_LOANS_PATH, POLARIS_SP_PATH } from "@/lib/polaris/routes";
import { big, units } from "@/lib/polaris/sp-loan-math";
import { spEventLabel } from "@/lib/polaris/sp-event-prose";
import { loanEventLabel } from "@/lib/polaris/loan-event-prose";
import type { PolarisDepositEventRow, PolarisLoanEventRow } from "@/lib/sources/api/polaris-sp-loans";

const WORDS = {
  timeline_link: "See the whole history in the timeline.",
  pool: "Pool",
  deposit: "Deposit",
  copy_deposit: "Copy the deposit's number",
  loan: "Loan",
  copy_loan: "Copy the loan's number",
  holder: "Holder",
  reserve: "Polaris reserve",
  deposit_description: (stable: string, id: string, day: string) =>
    `One transaction from the Polaris ${stable} Stability Pool deposit #${id}, on ${day}.`,
  loan_description: (id: string, day: string) => `One transaction from the Polaris reserve loan #${id}, on ${day}.`,
};

const ZERO = BigInt(0);
const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const signedUnits = (raw: bigint) => units(raw < ZERO ? -raw : raw);

function holderFact(holder: string | null, listing: string) {
  return holder
    ? [
        {
          key: "holder",
          label: WORDS.holder,
          value: shortAddress(holder),
          full: holder,
          mono: true,
          href: `${listing}?q=${holder}`,
        },
      ]
    : [];
}

/** A deposit row's title: each amount the touch moved, with its verb, or the
 *  row's kind where it moved none. */
export function depositEventTitle(event: BaseActivityEvent, row: PolarisDepositEventRow): EventTitle {
  const stable = POLARIS_MARKET_CONFIG[row.market].stable;
  if (row.event_type === "transfer") return makeEventTitle(event, spEventLabel(row), []);
  const change = big(row.top_up_or_withdrawal);
  const title = makeEventTitle(event, spEventLabel(row), [
    change !== ZERO
      ? {
          value: signedUnits(change),
          symbol: stable.symbol,
          address: stable.address,
          label: change > ZERO ? "Deposit" : "Withdraw",
        }
      : null,
    { value: units(big(row.bc_gain_claimed)), symbol: PETH.symbol, address: PETH.address, label: "Claim" },
    { value: units(big(row.stable_gain_claimed)), symbol: stable.symbol, address: stable.address, label: "Claim" },
  ]);
  return title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** A loan row's title, as the CDP's adjust: the fpETH and the WETH it moved. */
export function loanEventTitle(event: BaseActivityEvent, row: PolarisLoanEventRow): EventTitle {
  if (row.event_type === "transfer") return makeEventTitle(event, loanEventLabel(row), []);
  const c = big(row.coll_change);
  const d = big(row.debt_change);
  const title = makeEventTitle(event, loanEventLabel(row), [
    c !== ZERO
      ? {
          value: signedUnits(c),
          symbol: FPETH.symbol,
          address: FPETH.address,
          label: c > ZERO ? "Deposit" : "Withdraw",
        }
      : null,
    d !== ZERO
      ? {
          value: signedUnits(d),
          symbol: POLARIS_WETH.symbol,
          address: POLARIS_WETH.address,
          label: d > ZERO ? "Borrow" : "Repay",
        }
      : null,
  ]);
  return row.event_type === "adjusted" && title.amounts.length > 0 ? { ...title, kind: "" } : title;
}

/** The page's metadata description, also read on the server. */
export function depositEventPageDescription(market: PolarisMarket, tokenId: string, timestamp: number): string {
  const stable = POLARIS_MARKET_CONFIG[market].stable.symbol;
  return `${WORDS.deposit_description(stable, tokenId, formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export function loanEventPageDescription(loanId: string, timestamp: number): string {
  return `${WORDS.loan_description(loanId, formatDateLong(timestamp))} ${WORDS.timeline_link}`;
}

export interface PolarisDepositEventPageInput extends EventPageSlot {
  market: PolarisMarket;
  tokenId: string;
  /** The deposit NFT's holder (a vault for the vault-held deposits). */
  holder: string | null;
  /** The pinned event's row; the timeline's events are built from the rows. */
  row: PolarisDepositEventRow | undefined;
}

export function polarisDepositEventPage({
  market,
  tokenId,
  holder,
  row,
  event,
  ...slot
}: PolarisDepositEventPageInput): EventPageContract {
  const stable = POLARIS_MARKET_CONFIG[market].stable.symbol;
  return {
    heading: row ? spEventLabel(row) : event.actionLabel,
    title: row ? depositEventTitle(event, row) : makeEventTitle(event, event.actionLabel, []),
    facts: [
      { key: "pool", label: WORDS.pool, value: `${stable} Stability Pool` },
      { key: "deposit", label: WORDS.deposit, value: tokenId, mono: true, copy: WORDS.copy_deposit },
      ...holderFact(holder, POLARIS_SP_PATH),
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: depositEventPageDescription(market, tokenId, event.timestamp),
  };
}

export interface PolarisLoanEventPageInput extends EventPageSlot {
  loanId: string;
  holder: string | null;
  row: PolarisLoanEventRow | undefined;
}

export function polarisLoanEventPage({
  loanId,
  holder,
  row,
  event,
  ...slot
}: PolarisLoanEventPageInput): EventPageContract {
  return {
    heading: row ? loanEventLabel(row) : event.actionLabel,
    title: row ? loanEventTitle(event, row) : makeEventTitle(event, event.actionLabel, []),
    facts: [
      { key: "pool", label: WORDS.pool, value: WORDS.reserve },
      { key: "loan", label: WORDS.loan, value: loanId, mono: true, copy: WORDS.copy_loan },
      ...holderFact(holder, POLARIS_LOANS_PATH),
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: loanEventPageDescription(loanId, event.timestamp),
  };
}
