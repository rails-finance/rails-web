import Link from "next/link";
import type { CoveredPositions } from "@/lib/home/covered-positions";
import type { HomeStats } from "@/lib/home/home-stats";
import { formatValueHeld, spokenValueHeld, type ValueHeld } from "@/lib/home/value-held";
import { IndexNotice } from "@/components/shared/index-notice";
import { launchedProductionChainNames } from "@/lib/shared/protocols";
import { formatMonthDay } from "@/lib/date";

/** The production chains the count is drawn from — the same set the loader
 *  sums over. */
const COUNTED_SCOPE = launchedProductionChainNames();

/**
 * Covered stats — the roster, counted, stated at display scale between the live
 * example and the explorer directory. It reads as the caption the live position
 * earns ("that was one of these") and the preamble the tile strip needs ("here
 * is what they cover"), which is why it sits between the two rather than in the
 * hero: the hero makes the claim, this is the evidence for it.
 *
 * The all-time sum leads because it is the strongest claim in the band: it
 * counts every position each explorer has ever indexed, and no argument about
 * what is live today can move it. The value held in open positions follows
 * it in the same sentence, and appears only when the whole roster answered
 * (value-held.ts). The open/closed split, the wallet clause and the breakdown
 * are on /about/figures (CoveredCaption, components/about/figures-body.tsx),
 * reached from the link under the sentence (ui-jobs 523).
 *
 * The split was withheld until 2026-07-15 (server migrations 115/116 made
 * openness chain-rooted); CoveredPositions.openPositions carries that history and
 * the condition under which this stays renderable. If it ever has to come out
 * again, drop the caption sentence (CoveredCaption below).
 *
 * `protocolCount` stays carried but unstated — the strip of explorer tiles
 * directly below says which protocols better than a number does.
 *
 * The scope phrase is the chains the count is true of, built from the roster
 * rather than written out (`COUNTED_SCOPE` below) — it names the production
 * chains a reader can reach from the nav, which is the same set the loader
 * sums over (`COUNTED_PROTOCOLS` in covered-positions-data.ts). A chain whose
 * explorers are all unlaunched leaves both in one edit, so the sentence cannot
 * claim coverage of a chain the site does not link.
 *
 * When any one roster failed to resolve the band is the index notice
 * rather than a short count, matching the loader's all-or-nothing contract.
 *
 * Fixed "en-US" grouping so the server and client render identical text.
 */
/**
 * May the wallet clause ride beside the position figures?
 *
 * Only while the two are counted over the SAME explorers. The position figures
 * are fanned out per explorer here (covered-positions-data.ts), so unlaunching
 * one drops it from them; the wallet count and the earliest date are a single
 * roster-wide aggregate the backend does itself
 * (rails-server-onboarding `/api/stats/overview`), and this repo cannot narrow
 * it. Until that aggregate is scoped to the same set, one sentence would state
 * two figures over two different rosters — a wallet count that includes
 * explorers the site does not link, read as if it described the positions
 * beside it.
 *
 * `walletCountProtocols` is the backend saying how many explorers fed its
 * figure, so the comparison is the backend's own answer against ours. It
 * closes on its own the moment the two agree — no flag to remember, and the
 * failure is a missing sentence rather than a wrong number.
 */
function walletClauseIsInScope(covered: CoveredPositions, stats: HomeStats | null): stats is HomeStats {
  return stats !== null && stats.walletCountProtocols === covered.protocolCount;
}

export function CoveredStats({
  covered,
  stats,
  valueHeld,
}: {
  covered: CoveredPositions | null;
  stats: HomeStats | null;
  valueHeld: ValueHeld | null;
}) {
  // Null when the index did not answer for any one roster (ui-jobs 461).
  if (!covered)
    return (
      <div className="w-full max-w-7xl mx-auto px-4 text-center">
        <IndexNotice />
      </div>
    );
  const count = <span className={FIGURE}>{covered.totalPositions.toLocaleString("en-US")}</span>;

  // Without the value the band is the count's line alone, as before 476.
  if (!valueHeld)
    return (
      <div className="w-full max-w-7xl mx-auto px-4 flex flex-col items-center text-center">
        <p className={LINE} data-anatomy="S3.1">
          <span className={GROUP}>
            <span className={LABEL}>Explore</span>
            {count}
          </span>
          <span className={LABEL}>positions across {COUNTED_SCOPE} DeFi</span>
        </p>
        <FiguresLink />
      </div>
    );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 flex flex-col items-center text-center">
      {/* One sentence (Miles, 3 Nov 2026): the count is the one figure; the
          value runs in the text at the labels' size. "Explore N positions," is
          a group that never breaks, so does "DeFi (i)", and the value never
          splits; everything else wraps as ordinary centred text. One <p>, so a
          screen reader reads it as one sentence. Sizes step at breakpoints and
          never scale with the viewport. Under it, the link to how the figures
          are counted (ui-jobs 523). */}
      <p className={`${LABEL} text-balance`} data-anatomy="S3.1">
        <span className={GROUP}>
          <span>Explore</span>
          {count}
          <span>positions,</span>
        </span>{" "}
        holding{" "}
        <span className="whitespace-nowrap tabular-nums" data-anatomy="S3.2">
          <span aria-hidden="true">{formatValueHeld(valueHeld.totalUsd)}</span>
          <span className="sr-only">{spokenValueHeld(valueHeld.totalUsd)}</span>
        </span>{" "}
        {/* From lg the sentence breaks before "across", two lines (Miles, 5 Nov
            2026); below lg it wraps as before. */}
        <br className="hidden lg:inline" />
        across {COUNTED_SCOPE} DeFi
      </p>
      <FiguresLink />
    </div>
  );
}

/** The count's line when the value is omitted: label, figure, label on centred rows. */
const LINE = "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:gap-x-4";
/** "Explore", the count and the label after it, never broken apart. */
const GROUP = "inline-flex flex-nowrap items-center gap-x-2 whitespace-nowrap sm:gap-x-4";
/** The count, the band's one figure. */
const FIGURE =
  "font-sans text-foreground font-semibold leading-none tracking-tighter tabular-nums text-4xl sm:text-5xl";
const LABEL = "font-sans font-light tracking-tight text-rb-500 text-lg sm:text-xl lg:text-[28px]";
/** Under the sentence: the way to how the figures are counted, in the link blue. */
function FiguresLink() {
  return (
    <Link
      href="/about/figures"
      className="mt-4 text-sm font-medium text-blue-600 underline-offset-4 hover:underline dark:text-[var(--text-link)]"
      data-anatomy="S3.3"
    >
      How these are counted <span>→</span>
    </Link>
  );
}

/** The open and closed counts, and the wallets where they are in scope: the
 *  caption /about/figures opens with. Drawn here so the wallet-clause rule
 *  (`walletClauseIsInScope`) stays beside the figures it guards. */
export function CoveredCaption({ covered, stats }: { covered: CoveredPositions; stats: HomeStats | null }) {
  const walletClause = walletClauseIsInScope(covered, stats) ? stats : null;
  return (
    <>
      <span className="tabular-nums text-foreground">{covered.openPositions.toLocaleString("en-US")}</span> open and{" "}
      <span className="tabular-nums text-foreground">{covered.closedPositions.toLocaleString("en-US")}</span> closed,
      replayed from chain events in each protocol&rsquo;s own model of a position
      {walletClause && (
        <>
          , across{" "}
          <span className="tabular-nums text-foreground">{walletClause.walletCount.toLocaleString("en-US")}</span>{" "}
          wallets reaching back to{" "}
          <span className="text-foreground">{formatEarliestDate(walletClause.earliestTransactionAt)}</span>
        </>
      )}
      .
    </>
  );
}

/**
 * UTC-fixed so the server (ISR regeneration) and client render identical text
 * regardless of either one's local timezone — the same reasoning as the
 * "en-US" fix on the number formatting above, applied to a date this time.
 */
function formatEarliestDate(iso: string): string {
  const date = new Date(iso);
  return `${formatMonthDay(date)}, ${date.getUTCFullYear()}`;
}
