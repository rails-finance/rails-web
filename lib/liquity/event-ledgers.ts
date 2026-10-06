// L3: a Liquity-family Trove event's ledgers, one per side, from the page's
// replay (lib/shared/liquity-flows.ts `liquityFocusEvents` and the flow
// model). The card's cells (components/protocol/liquity-family/
// liquity-ledger.tsx), the Copy for LLM block and the test exports read the
// same rows. Pure, for the export script.

import { eventCum, eventSideSum, eventTokenSum, type FocusEvent } from "@/lib/shared/flow-focus";
import { dayCloseNote, tokenLedger, type Ledger } from "@/lib/shared/event-ledger";
import type { FlowModel, FlowSide } from "@/lib/shared/flows-timeline";
import { usdShown, type UsdSwitches } from "@/lib/shared/usd-display";
import { LQ } from "@/lib/shared/liquity-flows";
import { L2_WORDS } from "@/lib/liquity/event-templates";

export interface LiquityEventLedger {
  ledger: Ledger;
  /** The rows stand at the event (false: at its day's close). */
  exact: boolean;
}

/** The Debt ledger's row for the accrual since the previous event, by its
 *  line: the interest, or the batch's management fee. */
export function liquityAccrualLabel(key: string): string {
  return key === LQ.batchFee ? L2_WORDS.ledger_batch_fee_since : L2_WORDS.ledger_interest_since;
}

/** One side's ledger as of the event, or null where the replay lacks it. */
export function liquityEventLedger(
  model: FlowModel,
  events: FocusEvent[],
  eventId: string,
  side: FlowSide,
  sw: UsdSwitches,
): LiquityEventLedger | null {
  const cum = eventCum(model, events, eventId);
  const ev = events.find((e) => e.id === eventId) ?? null;
  if (!cum || !ev?.sides) return null;
  const sum = eventTokenSum(model, events, side, cum, eventId);
  if (!sum) return null;
  const f = ev.sides[side];
  // The debt at its $1 face: its USD is its token amount.
  const usd = usdShown(sw, f.symbol, side === "debt" ? f.held : f.after, f.held);
  const rows = usd ? eventSideSum(model, side, cum, f.after) : null;
  const ledger = tokenLedger({
    model,
    side,
    ev,
    sum,
    usd: rows ? { lines: rows.lines, dollars: rows.total.dollars, before: f.before } : null,
    ...(cum.exact ? { accrualLabel: liquityAccrualLabel } : {}),
  });
  return { ledger, exact: cum.exact };
}

/** The decimals a side's ledger prints its tokens at, for the card's cells
 *  and the prose's collateral figures. */
export function liquityEventDecimals(
  model: FlowModel,
  events: FocusEvent[],
  eventId: string,
  side: FlowSide,
): number | null {
  const cum = eventCum(model, events, eventId);
  if (!cum) return null;
  return eventTokenSum(model, events, side, cum, eventId)?.decimals ?? null;
}

/** A ledger as a Markdown table: one row per line, the event's rows bold, the
 *  total before → after. */
export function ledgerMarkdown(l: LiquityEventLedger, name: string, eventTs: number): string[] {
  const { ledger } = l;
  const usd = ledger.usd != null;
  const head = [name, ledger.symbol ?? "Tokens", ...(usd ? ["USD"] : [])];
  const out = [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`];
  for (const r of ledger.rows) {
    const label = r.role === "event" ? `**${r.label}**` : r.label;
    out.push(`| ${[label, r.tokens?.text ?? "", ...(usd ? [r.usd?.text ?? ""] : [])].join(" | ")} |`);
  }
  const tok = ledger.tokens
    ? ledger.tokens.before != null
      ? `${ledger.tokens.before} → ${ledger.tokens.after}`
      : ledger.tokens.after
    : "";
  out.push(`| ${["**Total**", tok, ...(usd ? [ledger.usd!.after] : [])].join(" | ")} |`);
  if (!l.exact) out.push("", dayCloseNote(eventTs));
  return out;
}
