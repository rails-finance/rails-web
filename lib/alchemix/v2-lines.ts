// The V2 Alchemist card's figures and its one sentence, as plain values: the
// card (components/protocol/alchemix/v2-event-card.tsx) and, on the server, the
// event page's title, the sentence (rails-ops decision 0045).

import type { AlchemixV2Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { formatUnitsExact } from "@/lib/utils/format";

export type AlchemixV2Event = BaseActivityEvent & { context: { protocol: "alchemix-v2"; data: AlchemixV2Context } };

/** alUSD and alETH, the two V2 synthetics: 18 decimals each, read from the
 *  tokens. The same two V3 mints. */
export const SYNTHETIC_DECIMALS = 18;

export interface Amount {
  field: string;
  raw: string;
  decimals: number;
  symbol: string;
  address?: string;
  value: number;
  shares: boolean;
}

function amount(raw: string | null | undefined, decimals: number | null | undefined): number | null {
  if (raw == null || decimals == null) return null;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / 10 ** decimals : null;
}

/** The one amount the log moved, in the unit the log states it in. */
export function movedAmount(d: AlchemixV2Context): Amount | null {
  const r = d.raw;
  const yieldSym = d.yieldToken?.symbol ?? "yield token";
  const underSym = d.underlyingToken?.symbol ?? "underlying";
  const pick = (
    field: string,
    decimals: number | null | undefined,
    symbol: string,
    shares: boolean,
    address?: string,
  ) => {
    const raw = r[field];
    const value = amount(raw, decimals);
    return raw != null && value != null && decimals != null
      ? { field, raw, decimals, symbol, address, value, shares }
      : null;
  };
  switch (d.eventType) {
    case "deposit":
      return pick("amount", d.yieldToken?.decimals, yieldSym, false, d.yieldToken?.address);
    case "withdraw":
    case "liquidate":
      return pick("shares", d.yieldToken?.decimals, yieldSym, true, d.yieldToken?.address);
    case "mint":
    case "burn":
      return pick("amount", SYNTHETIC_DECIMALS, d.syntheticSymbol, false);
    case "repay":
      return pick("amount", d.underlyingToken?.decimals, underSym, false, d.underlyingToken?.address);
    default:
      return null;
  }
}

/** The debt a Repay or Liquidate cancelled, where the log carries it. */
export function credit(d: AlchemixV2Context): { raw: string; value: number } | null {
  const raw = d.raw.credit;
  const value = amount(raw, SYNTHETIC_DECIMALS);
  return raw != null && value != null ? { raw, value } : null;
}

export function v2Sentence(e: AlchemixV2Event, a: Amount | null): string | null {
  const d = e.context.data;
  const amt = a ? `${formatUnitsExact(a.raw, a.decimals)} ${a.symbol}` : null;
  const c = credit(d);
  const cleared = c ? `${formatUnitsExact(c.raw, SYNTHETIC_DECIMALS)} ${d.syntheticSymbol}` : null;
  switch (d.eventType) {
    case "deposit":
      return amt ? `${amt} went into the V2 Alchemist as collateral.` : null;
    case "withdraw":
      return amt ? `${amt} shares of collateral came out of the V2 Alchemist.` : null;
    case "mint":
      return amt ? `The account minted ${amt} against its collateral.` : null;
    case "burn":
      return amt ? `${amt} was burned to pay down the account's debt.` : null;
    case "repay":
      return amt
        ? cleared
          ? `${amt} repaid ${cleared} of debt.`
          : `${amt} was repaid. The log from before 11 May 2022 does not state how much debt that cleared.`
        : null;
    case "liquidate":
      // Alchemix V2's Liquidate is the account holder's own action: it sells
      // their collateral shares to repay their own debt, with no third party
      // (rails-ops reference/alchemix-v2-frozen-record.md).
      return amt
        ? cleared
          ? `The holder repaid ${cleared} of debt by selling ${amt} shares of their own collateral.`
          : `The holder sold ${amt} shares of their own collateral to repay debt. The log from before 11 May 2022 does not state how much debt that cleared.`
        : null;
    default:
      return null;
  }
}
