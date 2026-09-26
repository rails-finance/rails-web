import type { CoveredPositions } from "@/lib/home/covered-positions";
import type { HomeStats } from "@/lib/home/home-stats";
import { CoveredStatsNote } from "@/components/home/covered-stats-note";
import { launchedChainScope } from "@/lib/shared/protocols";
import { formatMonthDay } from "@/lib/date";

/** The production chains the count is drawn from — the same set the loader
 *  sums over, named with their layer. */
const COUNTED_SCOPE = launchedChainScope();

/**
 * Covered stats — the roster, counted, stated at display scale between the live
 * example and the explorer directory. It reads as the caption the live position
 * earns ("that was one of these") and the preamble the tile strip needs ("here
 * is what they cover"), which is why it sits between the two rather than in the
 * hero: the hero makes the claim, this is the evidence for it.
 *
 * The all-time sum leads because it is the strongest claim in the band: it
 * counts every position each explorer has ever indexed, and no argument about
 * what is live today can move it. The split rides underneath at a quieter weight
 * — it is the more interesting number and the more fragile one, and the
 * typography should say so rather than let them compete.
 *
 * The split was withheld until 2026-07-15 (server migrations 115/116 made
 * openness chain-rooted); CoveredPositions.openPositions carries that history and
 * the condition under which this stays renderable. If it ever has to come out
 * again, drop the caption sentence below — the headline above stands on its own,
 * which is exactly why it was built to.
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
 * Null when any one roster failed to resolve — the band is omitted entirely
 * rather than shown short, matching the loader's all-or-nothing contract.
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

export function CoveredStats({ covered, stats }: { covered: CoveredPositions | null; stats: HomeStats | null }) {
  if (!covered) return null;
  const walletClause = walletClauseIsInScope(covered, stats) ? stats : null;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 text-center">
      {/* Centre-aligned pair: the count carries the weight, the scope rides
          alongside it in the hero subhead's voice (light, rb-500). Wraps as a
          unit on narrow viewports rather than breaking mid-phrase. */}
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="text-foreground font-semibold leading-none tracking-tighter tabular-nums text-[clamp(36px,5.2vw,58px)]">
          {covered.totalPositions.toLocaleString("en-US")}
        </span>
        <span className="font-sans font-light tracking-tight text-rb-500 text-[clamp(17px,2.1vw,26px)]">
          positions across {COUNTED_SCOPE} DeFi
        </span>
      </p>

      {/* The split, the qualifier, and the roster's reach, as one quiet
          sentence. The counts sit in the foreground colour (rb-900 blended into
          the dark canvas) so the numbers carry and the words recede;
          `tabular-nums` matches the headline so the digits share a grid.
          Prose does the separating — a middot between clauses read as two
          fragments to the eye and as nothing to a screen reader.
          "in each protocol's own model of a position" is load-bearing, not
          throat-clearing: the grain genuinely differs (Aave V3 and Morpho
          count one row per wallet-market pair, Spark/Moonwell/Maple/Compound
          V2 one per wallet, the Liquity family one per trove), and "closed"
          carries every protocol's own word for the ending — liquidated,
          repaid, defaulted. The note behind the help icon spells that out in full.
          The wallet clause is conditional: the sentence closes cleanly on
          "…own model of a position." when the wallet stats fail to resolve, or
          when they are counted over a different set of explorers than the
          figures before them — see `walletClauseIsInScope`. */}
      <p className="mt-2 text-xs text-rb-500">
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
        {/* The help icon closes the sentence and opens the small print
             (popover under the icon on desktop, sheet on phones) that says how
             the figure is counted — it sits where the reader finishes the
             claim, not on the headline figure above it. It carries its own
             popover, so it needs nothing from this band but a place to sit. */}
        <CoveredStatsNote />
      </p>
    </div>
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
