import type { CoveredPositions } from "@/lib/home/covered-positions";
import type { HomeStats } from "@/lib/home/home-stats";
import { formatValueHeld, spokenValueHeld, type ValueHeld } from "@/lib/home/value-held";
import { CoveredStatsNote } from "@/components/home/covered-stats-note";
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
 * what is live today can move it. The value held in open positions is the
 * second line, and appears only when the whole roster answered
 * (value-held.ts). The open/closed split and the wallet clause ride in the (i)
 * note.
 *
 * The split was withheld until 2026-07-15 (server migrations 115/116 made
 * openness chain-rooted); CoveredPositions.openPositions carries that history and
 * the condition under which this stays renderable. If it ever has to come out
 * again, drop the caption sentence passed to the note below.
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
  const walletClause = walletClauseIsInScope(covered, stats) ? stats : null;

  // The (i) closes the last label in the band: the value's, or the count's
  // when the value block is omitted.
  const note = (
    <CoveredStatsNote
      value={valueHeld}
      caption={
        <>
          <span className="tabular-nums text-foreground">{covered.openPositions.toLocaleString("en-US")}</span> open and{" "}
          <span className="tabular-nums text-foreground">{covered.closedPositions.toLocaleString("en-US")}</span>{" "}
          closed, replayed from chain events in each protocol&rsquo;s own model of a position
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
      }
    />
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 flex flex-col items-center gap-6 text-center sm:gap-4">
      {/* Two centred lines (Miles, 2 Nov 2026): the count, then the value held
          in open positions. From `sm` each line runs inline, the label
          vertically centred on its figure; below `sm` each stacks, label above
          figure. Sizes step at breakpoints and never scale with the viewport.
          The caption line that used to sit under the count opens from the (i)
          (covered-stats-note.tsx). */}
      <p className={LINE} data-anatomy="S3.1">
        <span className={LABEL}>Explore</span>
        <span className={FIGURE}>{covered.totalPositions.toLocaleString("en-US")}</span>
        <span className={LABEL}>
          positions across {COUNTED_SCOPE} DeFi
          {!valueHeld && <span className="ml-2 align-[-0.05em]">{note}</span>}
        </span>
      </p>

      {valueHeld && (
        <p className={LINE} data-anatomy="S3.2">
          <span className={LABEL}>Together, the open positions on Rails hold</span>
          <span className="inline-flex items-center gap-x-2">
            <span className={FIGURE} aria-label={spokenValueHeld(valueHeld.totalUsd)}>
              {formatValueHeld(valueHeld.totalUsd)}
            </span>
            <span className={`${LABEL} inline-flex items-center [&_button]:align-middle`}>{note}</span>
          </span>
        </p>
      )}
    </div>
  );
}

/** One line of the band: stacked and centred below `sm`, inline from `sm`
 *  (wrapping between `sm` and `lg`, one row from `lg`). */
const LINE = "flex flex-col items-center gap-y-1 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-4";
/** Both figures name the face: the count and the value read in one font. */
const FIGURE =
  "font-sans text-foreground font-semibold leading-none tracking-tighter tabular-nums text-5xl lg:text-6xl";
const LABEL = "font-sans font-light tracking-tight text-rb-500 text-lg sm:text-xl lg:text-[28px]";

/**
 * UTC-fixed so the server (ISR regeneration) and client render identical text
 * regardless of either one's local timezone — the same reasoning as the
 * "en-US" fix on the number formatting above, applied to a date this time.
 */
function formatEarliestDate(iso: string): string {
  const date = new Date(iso);
  return `${formatMonthDay(date)}, ${date.getUTCFullYear()}`;
}
