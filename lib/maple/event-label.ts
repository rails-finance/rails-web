// The words T1 states for a Maple row. Server-safe: the event page's metadata
// reads them.
//
// The timeline's head (rails-ops decision 0045, TO-DO-ui-jobs 367) is a
// past-participle kind and at most one clause: "Deposited", "Withdrew",
// "Withdrawal requested", "Request reduced", "Request cancelled", "Withdrawal
// filled", "Transferred · to 0x…" / "from 0x…". Shares the wallet received
// from Maple's SyrupRouter are its own deposit made through the router:
// "Deposited · through Maple SyrupRouter". The spine carries the figures.

import type { BaseActivityEvent, MapleContext } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";
import { getKnownInfrastructure } from "@/lib/shared/known-infrastructure";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

/** A share transfer's verb, kept before the amount on the event page's card. */
export const TRANSFER_LABEL = { transfer_in: "Shares received", transfer_out: "Shares sent" } as const;

/** The timeline head's words. */
export const MAPLE_T1 = {
  sep: "·",
  deposit: "Deposited",
  withdraw: "Withdrew",
  request: "Withdrawal requested",
  request_decrease: "Request reduced",
  request_cancel: "Request cancelled",
  request_fill: "Withdrawal filled",
  transferred: "Transferred",
  to: "to",
  from: "from",
  through: "through",
  /** The flank's words for a transfer's amount. */
  legSent: "transferred out",
  legReceived: "transferred in",
} as const;

/** A Maple SyrupRouter: shares it sends are the receiving wallet's own deposit. */
export const isSyrupRouter = (address: string | null | undefined): boolean =>
  getKnownInfrastructure(address, MAINNET_CHAIN_ID)?.contractName === "SyrupRouter";

/** A transfer in from the SyrupRouter: the wallet's deposit through it. */
export const isRouterDeposit = (ctx: MapleContext): boolean =>
  ctx.eventType === "transfer_in" && isSyrupRouter(ctx.counterparty);

/** The row's past-participle kind. */
export function mapleT1Kind(ctx: MapleContext): string {
  if (isRouterDeposit(ctx)) return MAPLE_T1.deposit;
  if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") return MAPLE_T1.transferred;
  return MAPLE_T1[ctx.eventType];
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A transfer counterparty's name in the clause, where the registry names
 *  it, without the pool's share token the registry adds ("CCIP escrow ·
 *  syrupUSDT" reads "CCIP escrow"): the spine names the token, and a second
 *  middle dot would read as a second clause. */
export function mapleT1PartyName(address: string): string | undefined {
  return getKnownInfrastructure(address, MAINNET_CHAIN_ID)?.name.split(" · ")[0];
}

/** The head's words as one line, for the phone caption and the row's
 *  accessible name: "Withdrawal filled", "Transferred · to 0x1234…abcd". */
export function mapleT1Caption(ctx: MapleContext): string {
  const kind = mapleT1Kind(ctx);
  const transfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
  if (!transfer || !ctx.counterparty) return kind;
  const lead = isRouterDeposit(ctx) ? MAPLE_T1.through : ctx.eventType === "transfer_out" ? MAPLE_T1.to : MAPLE_T1.from;
  const name = mapleT1PartyName(ctx.counterparty) ?? short(ctx.counterparty);
  return `${kind} ${MAPLE_T1.sep} ${lead} ${name}`;
}

/** The row's word on the event page's card: a transfer names the direction,
 *  any other row says its action label. */
export function mapleRowLabel(event: BaseActivityEvent): string {
  if (!isMapleEvent(event)) return event.actionLabel;
  const kind = event.context.data.eventType;
  return kind === "transfer_in" || kind === "transfer_out" ? TRANSFER_LABEL[kind] : event.actionLabel;
}
