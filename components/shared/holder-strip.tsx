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
// Each leg draws the card's figure with no ≈, as the cards below draw theirs;
// the tip and the receipt say what built up since (ui-jobs 737). An adapter
// may still mark a leg `approx` where its cards do (Compound V3's overview).
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
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatCompact, formatCompactUsd } from "@/lib/shared/format-compact";
import { formatUsdValue } from "@/lib/utils/format";
import { FOOT_LINK } from "@/lib/shared/ui-grammar";
import Link from "next/link";
import { Fragment } from "react";

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
  /** True when the figure had to be priced to be summed, or is summed from
   *  last-touch figures — draws the ≈. */
  approx: boolean;
  /** What the ≈ means, in one sentence. Required on an approximate leg. */
  tip?: string;
  /** Beneath the value: the per-token legs behind a priced headline, or the
   *  headline's own grammar ("by the protocol's feed · testnet"). `prov` when
   *  the footnote itself states a figure rather than naming the sum's parts. */
  footnote?: {
    text: string;
    prov?: Provenance;
    /** The per-token amounts the text lists, each drawn with its token's
     *  small icon (ui-jobs 738). */
    parts?: { text: string; symbol: string; address?: string }[];
  };
  /** Where the figure came from. */
  prov: Provenance;
  /** The position card's figure (ui-jobs 737): the compact amount with its
   *  token's icon and the USD line under it, or, summed across tokens, the
   *  compact USD with each token's icon. Without it the leg draws `value`. */
  figure?: {
    /** The amount in one token; absent where the leg is a valuation. */
    amount?: number;
    tokens: { symbol: string; address?: string }[];
    usd?: number | null;
    /** The USD line's receipt, where it is a priced figure. */
    usdProv?: Provenance;
  };
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
  /** On a listing searched by wallet, how many positions the wallet holds:
   *  the band draws only from two (one would repeat its card) and its totals
   *  only from two open ones (ui-jobs 737). Unset, it draws as given. */
  positions?: number;
  /** The wallet the search names: the band links its wallet page,
   *  "Everything this wallet holds" (ui-jobs 737). */
  wallet?: string;
}

/** RevealTip's bubble is sized for a number (nowrap, tabular figures); a
 *  sentence needs its own width and prose settings, declared on the child so
 *  they win over the bubble's own. Same shape the listing card's ratio tip
 *  uses — the two tips read identically because they are the same gesture. */
const TIP_PROSE = "block w-64 whitespace-normal text-left font-normal normal-nums leading-snug";

function LegFigure({ leg }: { leg: HolderLeg }) {
  if (leg.figure) return <HouseFigure leg={leg} figure={leg.figure} />;
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

/** The card's figure: compact, the token's icon, the USD line beneath. */
function HouseFigure({ leg, figure }: { leg: HolderLeg; figure: NonNullable<HolderLeg["figure"]> }) {
  const headline =
    figure.amount != null
      ? formatCompact(figure.amount)
      : figure.usd != null
        ? formatCompactUsd(figure.usd)
        : leg.value;
  const shown = (
    <span data-holder-value={leg.approx ? `≈ ${leg.value}` : leg.value}>
      {leg.approx && <>{"≈"}&nbsp;</>}
      {headline}
    </span>
  );
  return (
    <>
      <StatValue figure={`holder-${leg.id}`}>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          <Prov info={leg.prov} value={leg.approx ? `≈ ${leg.value}` : leg.value}>
            {leg.tip ? <RevealTip tip={<span className={TIP_PROSE}>{leg.tip}</span>}>{shown}</RevealTip> : shown}
          </Prov>
          <span className="inline-flex shrink-0 items-center" data-holder-tokens="">
            {figure.tokens.map((t, i) => (
              <span key={t.symbol} className={i > 0 ? "-ml-2" : undefined}>
                <TokenChipIcon symbol={t.symbol} address={t.address} size={28} filterable={false} />
              </span>
            ))}
          </span>
        </span>
      </StatValue>
      {figure.amount != null && figure.usd != null && figure.usd > 0 && (
        <div className="text-xs mt-0.5 tabular-nums font-bold text-green-400" data-holder-usd="">
          {figure.usdProv ? (
            <Prov info={figure.usdProv} value={formatUsdValue(figure.usd)}>
              <span>{formatUsdValue(figure.usd)}</span>
            </Prov>
          ) : (
            formatUsdValue(figure.usd)
          )}
        </div>
      )}
    </>
  );
}

export function HolderStrip({
  countsLine,
  counts,
  legs,
  truncated,
  note,
  wallet,
  positions,
  scoped = false,
}: HolderStripProps & {
  /** Drawn inside a page's receipts scope (the wallet page, ui-jobs 738):
   *  its receipts open in that page's inspector. */
  scoped?: boolean;
}) {
  if (positions != null && positions < 2) return null;
  const Scope = scoped ? Fragment : ProvUnscoped;
  const totals = !truncated && legs.length > 0 && (positions == null || counts.open >= 2);
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
    <Scope>
      <div
        data-holder-strip=""
        data-anatomy="N7"
        data-holder-open={counts.open}
        data-holder-closed={counts.closed}
        data-holder-liquidated={counts.liquidated}
        className="mb-5 border-b border-rb-300/60 dark:border-rb-700/60 pb-4"
      >
        <p data-holder-counts="" className="text-sm text-foreground/80">
          {countsLine}
        </p>
        {totals && (
          <div className={`mt-2 grid grid-cols-2 gap-4 ${legs.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {legs.map((leg) => (
              <div key={leg.id} data-holder-leg={leg.id} data-anatomy="N7.1">
                <div className="text-rb-500 text-xs font-semibold">{leg.label}</div>
                {leg.figure ? (
                  <LegFigure leg={leg} />
                ) : (
                  <StatValue figure={`holder-${leg.id}`}>
                    <LegFigure leg={leg} />
                  </StatValue>
                )}
                {leg.footnote && (
                  <div className="text-xs mt-0.5 text-rb-500 tabular-nums" data-holder-footnote="">
                    {leg.footnote.prov ? (
                      <Prov info={leg.footnote.prov} value={leg.footnote.text}>
                        <span>{leg.footnote.text}</span>
                      </Prov>
                    ) : leg.footnote.parts ? (
                      // The amounts are the rows of the total's receipt.
                      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5" data-prov-exempt="">
                        {leg.footnote.parts.map((pt, i) => (
                          <span key={pt.symbol} className="inline-flex items-center gap-1" data-holder-part={pt.symbol}>
                            {i > 0 && <span aria-hidden="true">·</span>}
                            <TokenChipIcon symbol={pt.symbol} address={pt.address} size={14} filterable={false} />
                            {pt.text}
                          </span>
                        ))}
                      </span>
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
        {/* The listing search is the wallet within this protocol; the wallet
            page is the wallet everywhere. */}
        {wallet && (
          <Link
            href={`/wallet/${encodeURIComponent(wallet)}`}
            className={`mt-2 text-sm ${FOOT_LINK}`}
            data-holder-wallet-link=""
            data-anatomy="N7.2"
          >
            Everything this wallet holds
          </Link>
        )}
      </div>
    </Scope>
  );
}
