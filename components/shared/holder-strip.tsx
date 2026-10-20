"use client";

// The holder strip — what a wallet search states about the wallet, above its
// own cards.
// ---------------------------------------------------------------------------
// A reviewer's first look at Polaris (2026-09-10): "I hold three CDPs across
// both markets and they come back as three separate cards, no totals." This is
// the answer, and it is deliberately small: the wallet search view the middle
// path made IS the holder's view, and the gap was a summary above the cards.
// Not an analytics surface, not a route of its own — a band, on the same
// `?q=<address|ens>` URL, so it is shareable as it is.
//
// WHAT IT STATES, in this order: the counts by status, and one leg per unit the
// wallet holds (a total collateral, a total debt).
//
// WHAT IT NEVER STATES is a wallet-wide collateral ratio. Liquidation is per
// position: a wallet holding one CDP at 118% and one at 400% has no single
// ratio, and an average of the two reads as safety it does not have.
//
// EVERY VALUED FIGURE WEARS THE ≈ and carries its own receipt. A leg summed
// across different tokens has to be priced to be summed at all, and the price
// is the feed's at one read; the interest each position has accrued since its
// last touch is in none of it. The ≈, its tooltip and the receipt each say so.
// An exact leg (one token, summed in its own unit) wears no ≈ and says so by
// not wearing one.
//
// TOTALS ONLY WHILE THE WALLET FITS ONE PAGE. The legs are summed from the rows
// the page is showing; beyond one page those rows are a slice, and a total
// summed from a slice is the paging trap (a paged aggregate is not an
// aggregate). Past that the strip states the count and says why the totals are
// absent — it never completes itself with a second fetch.
//
// The adapters — `lib/polaris/holder-strip.ts`, `lib/liquity-v2/holder-strip.ts`
// — are pure functions of the two responses the listing already holds (its rows
// and its one price read); `lib/compound-arbitrum/holder-strip.ts` is one of the
// wallet overview's Comet read and history. This file owns the look; they own
// the words and the units.

import { Prov, ProvUnscoped, type Provenance } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { StatValue } from "@/components/shared/stat-value";

/** One summed unit the wallet holds — a collateral, a debt. */
export interface HolderLeg {
  /** Stable machine name for the leg ("collateral" / "debt") — the React key
   *  and the `data-holder-leg` handle. Never shown. */
  id: string;
  /** The words above the value ("Total collateral"). */
  label: string;
  /** The figure, formatted by the adapter in its own units (the ≈ is drawn
   *  here, from `approx`, so the string never carries one). */
  value: string;
  /** True when the figure had to be priced to be summed — draws the ≈. */
  approx: boolean;
  /** What the ≈ means, in one sentence. Required on an approximate leg. */
  tip?: string;
  /** Beneath the value: the per-token legs behind a priced headline, or the
   *  headline's own grammar ("by the protocol's feed · testnet"). `prov` when
   *  the footnote itself states a figure rather than naming the sum's parts. */
  footnote?: { text: string; prov?: Provenance };
  /** Where the figure came from. */
  prov: Provenance;
}

export interface HolderStripProps {
  /** The counts by status, as the adapter's own sentence — "CDPs across both
   *  markets" and "troves, one on each branch" are protocol facts, not a
   *  template. */
  countsLine: string;
  /** The same counts as figures, for anything reading the band rather than
   *  its prose. Absent statuses stay absent (V2 zombies are open troves and
   *  are counted as such; they are SAID only when there are any). */
  counts: { open: number; closed: number; liquidated: number; zombie?: number };
  /** One per summed unit. Empty while the wallet does not fit one page. */
  legs: HolderLeg[];
  /** The wallet holds more positions than the page shows — the legs are
   *  withheld rather than summed from a slice. */
  truncated: boolean;
  /** One sentence beneath, saying why the totals are absent. */
  note?: string;
}

/** RevealTip's bubble is sized for a number (nowrap, tabular figures); a
 *  sentence needs its own width and prose settings, declared on the child so
 *  they win over the bubble's own. Same shape the listing card's ratio tip
 *  uses — the two tips read identically because they are the same gesture. */
const TIP_PROSE = "block w-64 whitespace-normal text-left font-normal normal-nums leading-snug";

function LegFigure({ leg }: { leg: HolderLeg }) {
  const shown = leg.approx ? (
    <span>
      {"≈"}&nbsp;{leg.value}
    </span>
  ) : (
    <span>{leg.value}</span>
  );
  return (
    <Prov info={leg.prov} value={leg.approx ? `≈ ${leg.value}` : leg.value}>
      {leg.tip ? <RevealTip tip={<span className={TIP_PROSE}>{leg.tip}</span>}>{shown}</RevealTip> : shown}
    </Prov>
  );
}

export function HolderStrip({ countsLine, counts, legs, truncated, note }: HolderStripProps) {
  return (
    // A BAND, not a card: the raised rounded surface belongs to a position, and
    // this states something about several of them. A rule under it separates it
    // from the cards it is about, and it borrows the stat grammar's own tones —
    // it introduces no colour of its own.
    //
    // ProvUnscoped: on a listing there is no provenance inspector to arm (the
    // dock is a detail-page surface), so every <Prov> here is inert content —
    // exactly as the listing cards' own figures are. Declaring it keeps the dev
    // unscoped-<Prov> tripwire quiet here while it stays loud everywhere else.
    <ProvUnscoped>
      <div
        data-holder-strip=""
        data-holder-open={counts.open}
        data-holder-closed={counts.closed}
        data-holder-liquidated={counts.liquidated}
        className="mb-5 border-b border-rb-300/60 dark:border-rb-700/60 pb-4"
      >
        <p data-holder-counts="" className="text-sm text-foreground/80">
          {countsLine}
        </p>
        {!truncated && legs.length > 0 && (
          <div className={`mt-2 grid grid-cols-2 gap-4 ${legs.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {legs.map((leg) => (
              <div key={leg.id} data-holder-leg={leg.id}>
                <div className="text-rb-500 text-xs font-semibold">{leg.label}</div>
                <StatValue figure={`holder-${leg.id}`}>
                  <LegFigure leg={leg} />
                </StatValue>
                {leg.footnote && (
                  <div className="text-xs mt-0.5 text-rb-500 tabular-nums">
                    {leg.footnote.prov ? (
                      <Prov info={leg.footnote.prov} value={leg.footnote.text}>
                        <span>{leg.footnote.text}</span>
                      </Prov>
                    ) : (
                      <span>{leg.footnote.text}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {note && (
          <p data-holder-note="" className="mt-2 text-xs text-rb-500">
            {note}
          </p>
        )}
      </div>
    </ProvUnscoped>
  );
}
