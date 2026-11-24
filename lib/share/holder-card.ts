// The wallet view's share card, from the holder strip's own model.
// ---------------------------------------------------------------------------
// The strip (components/shared/holder-strip.tsx) already decided what a wallet
// search may state about a wallet, in what units, and with what marks: the
// counts by status, and one leg per unit it holds. A share card is that same statement at 1200×630 for a reader who has
// not opened the page — so this maps the strip's props onto
// `PositionCardModel` rather than deciding anything a second time.
//
// WHAT IT NEVER DOES IS RE-SUM. Every figure here is a string the adapter
// already formatted in its own units, carried across verbatim. The one thing
// drawn rather than copied is the ≈, which the strip draws from `approx` and
// the card has to write into the value string — the renderer has no mark of its
// own.
//
// A WALLET PAST ONE PAGE states its count, the other kinds' counts beside it,
// and no stats, exactly as the strip does: those rows are a slice, and a total summed from a slice is the
// paging trap. The strip says so in a sentence beneath; a card has no room for
// one, so it states the count as its status word and shows no stats at all,
// which says the same thing by having nothing to mis-read.

import type { HolderStripProps } from "@/components/shared/holder-strip";
import type { PositionCardModel } from "@/lib/share/position-card";
import type { SessionProtocol } from "@/lib/shared/sessions";

/** The card canvas fits three stats across; a fourth would wrap onto its own
 *  row beneath the two it left behind. A wallet with a deposit beside its
 *  Troves hands over three (a collateral, a debt, a deposit). */
const MAX_STATS = 3;

/** The searched kind's counts where only its total is a statement. */
const NO_COUNTS = { open: 0, closed: 0, liquidated: 0 };

/** The counts as a card's status word — "4 open · 2 closed · 1 liquidated",
 *  then each other kind the wallet holds ("· 1 open deposit · 2 closed
 *  deposits").
 *  The strip states them as a sentence, which at 24px in a pill would wrap; the
 *  card states the same three numbers in the shortest form that still names
 *  what each one counts. A status with none of a kind omits it rather than
 *  writing a zero (the strip's own rule: an absent status stays absent). */
function statusWord(counts: HolderStripProps["counts"], kinds: HolderStripProps["kinds"] = []): string | undefined {
  const n = (v: number) => v.toLocaleString("en-US");
  const parts = [
    counts.open > 0 ? `${n(counts.open)} open` : null,
    counts.closed > 0 ? `${n(counts.closed)} closed` : null,
    counts.liquidated > 0 ? `${n(counts.liquidated)} liquidated` : null,
    // The other kinds by their nouns: "1 open deposit", "2 closed deposits".
    ...kinds.flatMap((k) => [
      k.open > 0 ? `${n(k.open)} open ${k.noun[k.open === 1 ? 0 : 1]}` : null,
      k.closed > 0 ? `${n(k.closed)} closed ${k.noun[k.closed === 1 ? 0 : 1]}` : null,
    ]),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Map a holder strip onto the shared card renderer's model.
 *
 *  `subject` is the holder as the page names it (an ENS name, or a shortened
 *  address); `total` the wallet's own `pagination.total`, which is what a
 *  truncated card states; `plural` the explorer's plural position noun, for
 *  that same line. */
export function holderCardModel(
  strip: HolderStripProps,
  opts: {
    session: SessionProtocol;
    subject: string;
    total: number;
    plural: string;
  },
): PositionCardModel {
  if (strip.truncated) {
    return {
      session: opts.session,
      subject: opts.subject,
      headline: `${opts.plural} held by ${opts.subject}`,
      // The other kinds the wallet holds still count by status: each is
      // read whole, only the searched kind is past a page.
      status: [`${opts.total.toLocaleString("en-US")} ${opts.plural}`, statusWord(NO_COUNTS, strip.kinds)]
        .filter(Boolean)
        .join(" · "),
      stats: [],
      asOf: new Date(),
    };
  }

  const stats: PositionCardModel["stats"] = strip.legs.map((leg) => ({
    label: leg.label,
    value: leg.approx ? `≈ ${leg.value}` : leg.value,
  }));

  return {
    session: opts.session,
    subject: opts.subject,
    headline: `${opts.plural} held by ${opts.subject}`,
    status: statusWord(strip.counts, strip.kinds),
    stats: stats.slice(0, MAX_STATS),
    asOf: new Date(),
  };
}
