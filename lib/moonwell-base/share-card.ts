// Moonwell Base position → share-card model. The bridge between
// `loadMoonwellBaseHead`'s Comptroller read (the same head the position page
// itself awaits) and the shared card renderer — no second read.

import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { linesUsd } from "@/lib/moonwell/supply-totals";
import { creditRemainingStat } from "@/lib/moonwell/credit-remaining";
import { formatUsd } from "@/lib/shared/format-event";
import { shortSubject } from "@/lib/shared/page-metadata";
import type { PositionCardModel } from "@/lib/share/position-card";

/**
 * The Comptroller read carries no lifecycle status the way an indexed row
 * does — the sweep that could tell "closed" apart from "never opened" stays
 * client-side (see `loadMoonwellBaseHead`'s own header comment on why the
 * history is slow). So an account the Comptroller reports no open markets for
 * is treated the same as a wallet the protocol has never seen: `null` here,
 * which `positionImage` degrades to the static roster card rather than
 * rendering an empty dynamic one that can't say whether "empty" means
 * "never touched" or "touched and left".
 */
export function moonwellBaseShareCardModel(
  position: MoonwellChainResponse | null,
  wallet: string,
): PositionCardModel | null {
  if (!position || position.markets.length === 0) return null;

  // "Supplied": every supplied market, entered or not, as the card's headline
  // (ui-jobs 644); `collateralValueUsd` is the entered markets alone.
  const supplied = linesUsd(
    position.markets.map((m) => ({ address: m.underlying, amount: m.supplyUnderlying })),
    Object.fromEntries(position.markets.filter((m) => m.priceUsd != null).map((m) => [m.underlying, m.priceUsd!])),
  );
  const stats: PositionCardModel["stats"] = [
    ...(supplied != null ? [{ label: "Supplied", value: formatUsd(supplied) }] : []),
    { label: CARD_VOCAB.debt, value: formatUsd(position.debtValueUsd) },
  ];
  // Credit remaining, as the card's headline states it (ui-jobs 632): the
  // credit limit (entered supply × collateral factor) less the debt, over the
  // limit; nothing where the account owes nothing.
  const credit = creditRemainingStat(position.collateralCapacityUsd, position.debtValueUsd);
  if (credit != null) stats.push({ label: "Credit remaining", value: credit });

  return {
    session: "moonwell-base",
    subject: shortSubject(wallet),
    status: "Open",
    stats,
    asOf: new Date(),
  };
}
