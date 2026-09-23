// The wallet view's share card, from the holder strip's own model.
// ---------------------------------------------------------------------------
// The strip (components/shared/holder-strip.tsx) already decided what a wallet
// search may state about a wallet, in what units, and with what marks: the
// counts by status, one leg per unit it holds, and the position nearest its
// floor. A share card is that same statement at 1200×630 for a reader who has
// not opened the page — so this maps the strip's props onto
// `PositionCardModel` rather than deciding anything a second time.
//
// WHAT IT NEVER DOES IS RE-SUM. Every figure here is a string the adapter
// already formatted in its own units, carried across verbatim. The one thing
// drawn rather than copied is the ≈, which the strip draws from `approx` and
// the card has to write into the value string — the renderer has no mark of its
// own.
//
// A WALLET PAST ONE PAGE states its count and nothing else, exactly as the
// strip does: those rows are a slice, and a total summed from a slice is the
// paging trap. The strip says so in a sentence beneath; a card has no room for
// one, so it states the count as its status word and shows no stats at all,
// which says the same thing by having nothing to mis-read.

import type { HolderStripProps } from "@/components/shared/holder-strip";
import type { PositionCardModel } from "@/lib/share/position-card";
import type { SessionProtocol } from "@/lib/shared/sessions";

/** The card canvas fits three stats across; a fourth would wrap onto its own
 *  row beneath the two it left behind, which reads as an afterthought rather
 *  than a set. Both explorers hand over at most three anyway (a collateral, a
 *  debt, the nearest position) — this is the floor under that, not a policy. */
const MAX_STATS = 3;

/** The ratio on the nearest-floor stat, in the strip's own grammar — one
 *  decimal, en-US. A measurement, so it keeps its decimal even at a round
 *  number. */
const pct = (v: number): string =>
  `${v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** The counts as a card's status word — "4 open · 2 closed · 1 liquidated".
 *  The strip states them as a sentence, which at 24px in a pill would wrap; the
 *  card states the same three numbers in the shortest form that still names
 *  what each one counts. A status with none of a kind omits it rather than
 *  writing a zero (the strip's own rule: an absent status stays absent). */
function statusWord(counts: HolderStripProps["counts"]): string | undefined {
  const parts = [
    counts.open > 0 ? `${counts.open.toLocaleString("en-US")} open` : null,
    counts.closed > 0 ? `${counts.closed.toLocaleString("en-US")} closed` : null,
    counts.liquidated > 0 ? `${counts.liquidated.toLocaleString("en-US")} liquidated` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Map a holder strip onto the shared card renderer's model.
 *
 *  `subject` is the holder as the page names it (an ENS name, or a shortened
 *  address); `total` the wallet's own `pagination.total`, which is what a
 *  truncated card states; `plural` the explorer's plural position noun, for
 *  that same line. `nearestLabel` lets an explorer shorten the strip's own name
 *  for the nearest position: the strip's label is a LINK a reader can follow,
 *  so it carries the whole identity, and a card is an image with nothing to
 *  follow — Liquity V2 names the branch there rather than repeating a trove id
 *  no one can click. */
export function holderCardModel(
  strip: HolderStripProps,
  opts: {
    session: SessionProtocol;
    subject: string;
    total: number;
    plural: string;
    nearestLabel?: (label: string) => string;
  },
): PositionCardModel {
  if (strip.truncated) {
    return {
      session: opts.session,
      subject: opts.subject,
      headline: `${opts.plural} held by ${opts.subject}`,
      status: `${opts.total.toLocaleString("en-US")} ${opts.plural}`,
      stats: [],
      asOf: new Date(),
    };
  }

  const stats: PositionCardModel["stats"] = strip.legs.map((leg) => ({
    label: leg.label,
    value: leg.approx ? `≈ ${leg.value}` : leg.value,
  }));
  if (strip.nearest) {
    const name = opts.nearestLabel ? opts.nearestLabel(strip.nearest.label) : strip.nearest.label;
    stats.push({
      label: "Nearest its floor",
      value: `${name} ${strip.nearest.approx ? "≈ " : ""}${pct(strip.nearest.ratioPct)}`,
    });
  }

  return {
    session: opts.session,
    subject: opts.subject,
    headline: `${opts.plural} held by ${opts.subject}`,
    status: statusWord(strip.counts),
    stats: stats.slice(0, MAX_STATS),
    asOf: new Date(),
  };
}
