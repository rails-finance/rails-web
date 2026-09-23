// Share-card model for a live V3-family Pool read — shared by Aave V3 Base and
// Seamless, whose position pages both go through `v3PoolPositionLoader`
// (lib/shared/swept-position-page-data.ts) and so hand this the identical
// `V3PoolPositionTail` shape. Aave V3 on Ethereum reads an INDEXED listing row
// instead (`AaveV3PositionRow`, with its own status/peaks fields already on
// it), which is why that explorer keeps its own mapper rather than this one.
//
// `v3ViewFromChain` is the same adapter the detail card runs through — reusing
// it here means "open vs closed vs liquidated" and the peak reserves can never
// read differently between the live card and this one.

import { v3ViewFromChain, type V3SweptHistory } from "@/lib/aave-v3/chain-position-view";
import type { V3PoolPositionTail } from "@/lib/shared/swept-position-page-data";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import type { ChainTimelineResponse } from "@/lib/api/fetch-chain-timeline";
import type { AaveV3ReserveAmount } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { CARD_VOCAB, ratioLabel } from "@/lib/shared/card-vocab";
import { formatUsd } from "@/lib/shared/format-event";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";
import type { SessionProtocol } from "@/lib/shared/sessions";

// "unread": no state recorded for the account yet (0018); never read as closed.
const STATUS_WORD = { open: "Open", closed: "Closed", liquidated: "Liquidated", unread: "Unread" } as const;

/** Neutral HF headline — matches the detail card's own reading (the ratio
 *  stops meaning anything as a number once it clears 100). */
function hfLabel(hf: number): string {
  return hf >= 100 ? "∞" : hf.toFixed(2);
}

function largest(reserves: AaveV3ReserveAmount[]): AaveV3ReserveAmount | null {
  let best: AaveV3ReserveAmount | null = null;
  for (const r of reserves) {
    if (r.amount > 0 && (!best || r.amount > best.amount)) best = r;
  }
  return best;
}

export function v3PoolShareCardModel(
  tail: V3PoolPositionTail,
  wallet: string,
  opts: { session: SessionProtocol; market: string },
): PositionCardModel | null {
  // No Pool read for this wallet — `positionImage` degrades to the static
  // roster card rather than rendering an empty one.
  if (!tail.position) return null;

  // The wire timeline is present only when the index vouches for the whole
  // life (see swept-position-page-data.ts) — rehydrating it here is decoding
  // the loader's own result, not a second read.
  const rehydrated = tail.timeline ? (rehydrateChainTimelineWire(tail.timeline) as ChainTimelineResponse) : null;
  const history: V3SweptHistory | null = rehydrated ? { timeline: rehydrated, whole: true } : null;
  const view = v3ViewFromChain(tail.position, opts.market, undefined, rehydrated?.events, history);

  const open = view.supplies.length > 0 || view.borrows.length > 0;
  const hasTerminalRecord = view.peakSupplies.length > 0 || view.peakBorrows.length > 0 || view.liquidationCount > 0;
  // A closed Pool account and a wallet this Pool has never seen both read as
  // zero reserves — the whole sweep is what tells them apart (peaks or a
  // liquidation on record). Without one, this degrades to the static card
  // rather than asserting "Closed" over a wallet that was simply never here.
  if (!open && !hasTerminalRecord) return null;

  const stats: PositionCardModel["stats"] = [];

  if (open) {
    // The detail card's USD headline needs every held reserve individually
    // priced (an oracle read the position page makes client-side, after this
    // server tail is already sent) — a second read this mapper does not make.
    // The Pool's own aggregate from getUserAccountData, already inside this
    // read, stands in for it: real whenever the account holds reserves, since
    // Aave needs a working oracle on every listed one to compute HF at all.
    if (tail.position.totalCollateralUsd > 0) {
      stats.push({ label: CARD_VOCAB.collateral, value: formatUsd(tail.position.totalCollateralUsd) });
    } else {
      const top = largest(view.supplies);
      if (top) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
    if (tail.position.totalDebtUsd > 0) {
      stats.push({ label: CARD_VOCAB.debt, value: formatUsd(tail.position.totalDebtUsd) });
    } else {
      const top = largest(view.borrows);
      if (top) stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
    if (view.healthFactor != null && view.healthFactor > 0 && !view.chainHfStale) {
      stats.push({ label: ratioLabel("pooled"), value: hfLabel(view.healthFactor) });
    }
  } else {
    const topSupply = largest(view.peakSupplies);
    if (topSupply)
      stats.push({ label: CARD_VOCAB.peakCollateral, value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}` });
    const topDebt = largest(view.peakBorrows);
    if (topDebt)
      stats.push({ label: CARD_VOCAB.peakDebt, value: `${formatCompact(topDebt.amount)} ${topDebt.symbol}` });
  }

  return {
    session: opts.session,
    subject: shortSubject(wallet),
    status: STATUS_WORD[view.status],
    stats,
    asOf: new Date(),
  };
}
