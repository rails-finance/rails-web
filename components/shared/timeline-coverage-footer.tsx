// What the timeline above it is, and is not — the last thing under the last event.
// ----------------------------------------------------------------------------
// An INDEXED timeline's completeness is a property of the index: stated once
// per explorer, on the coverage page. A SWEPT one's completeness is a property
// of the request that drew it — which block the sweep started at, and whether
// every chunk of it came back. A Base explorer can be either, per request (the
// route serves the index once it holds the whole life and sweeps until then).
// A limitation is always named under the events rather than left to be
// inferred — but completeness itself gets no sentence (revised 2026-09-02,
// Miles's read of the live page): a coverage paragraph appears only when
// something IS missing (a horizon, holes, undated events, a capped list), and
// its absence under a finished life is the complete claim. An affirmative
// "nothing is missing" line under every whole-life timeline read as the same
// reassurance repeated on every fork; dropping it means silence carries the
// answer instead of stating it.
//
// Three verdicts about WHERE THE HISTORY STARTS, and they say different things
// because they ARE different things:
//
//   • COMPLETE — the sweep started at the contract's own first block and read
//     every block from there. Renders NO paragraph. Printing "captured from
//     <date> onward" here would invent a limitation: the reader would take the
//     date as a horizon when it is simply the day the position opened. Printing
//     an explicit "nothing is missing" instead would state a fact that silence
//     already carries — once every explorer's whole-life case says the same
//     thing, the sentence stops earning its place under the events.
//   • HORIZON — the history starts later than the contract does. This is the
//     "from X date onward" case, and it names the date and the cause, which
//     differs by source: a SWEEP ran out of time before reaching the first
//     block (it runs newest-first, so what it misses is the oldest stretch);
//     an INDEX answer for a heavy wallet with no stored seed sends only its
//     newest rows from a cut (rails-server baseLending.ts `TimelineHorizon`).
//   • HOLED — a stretch inside the swept span would not answer. The events are
//     real; the gaps are named; and the running balances are flagged, because a
//     replay that missed events is arithmetic over an incomplete stream and
//     every before/after figure downstream of a hole is wrong by whatever it
//     did not see.
//
// A CAPPED list — the replay ran over every event and the list draws only the
// most recent N — is NOT stated here any more. Since 2026-09-10 (rails-ops
// decision 0019) it is stated by the boundary card, the last node on the spine
// after the oldest drawn row (<TimelineBoundaryCard>): the count, the span,
// the events by type, the position at the cut. The one-sentence "N earlier
// events are not listed" that used to close this footer went with it — one
// statement, not two. The windowed arm's leading notice ("This list opens at
// a balance brought forward") went the same day, for the same card.
//
// When none of the three applies the component renders nothing at all: no
// rule, no support line. The "Support Rails" ask that used to close every
// timeline was retired on 2026-09-02 — a pitch under a list of facts.
//
// The index's 50,000-row ceiling has no footer here any more. Every
// index-served mainnet page reads a WINDOW of the newest 1,000 events plus an
// opening balance (lib/shared/timeline-opening-balance.ts), and a window of a
// thousand never reaches a ceiling of fifty thousand; the one page that still
// fetches a history whole (a Liquity V1 wallet with more than one life) holds
// 1,482 events at its deepest. The boundary card is the one mechanism past
// the cut on every arm (decision 0019, amended 2026-09-10).

import type { ChainTimelineCoverage } from "@/lib/api/fetch-chain-timeline";
import { explorerUrl } from "@/lib/shared/chains";
import { useChainId } from "@/lib/shared/chain-context";
import { formatDateLong } from "@/lib/date";

/** The small-print register every footer/notice here shares. No rule above
 *  or below: the list's last card and the toolbar are the edges. */
const NOTE = "text-[11px] leading-relaxed text-rb-500";

function longDate(unix: number): string {
  return formatDateLong(unix);
}

export interface TimelineCoverageFooterProps {
  coverage: ChainTimelineCoverage;
  /** The contract the sweep read, for the "from its first block" claim —
   *  e.g. "the Aave V3 Pool on Base". */
  sourceLabel: string;
}

export function TimelineCoverageFooter({ coverage, sourceLabel }: TimelineCoverageFooterProps) {
  const chainId = useChainId();
  // Deliberately the coverage's own figure and not the first card on screen:
  // the list is a capped slice of a long history, so its oldest row is not the
  // position's oldest event.
  const first = coverage.firstEventAt;
  const holed = coverage.gaps.length > 0;
  const undated = coverage.undated ?? 0;

  const blockLink = (b: number) => (
    <a href={explorerUrl(chainId, "block", b)} target="_blank" rel="noopener noreferrer" className="link-external">
      {b.toLocaleString("en-US")}
    </a>
  );

  // Nothing missing, nothing to say — silence is the complete claim (header).
  // A capped list is not "missing" here: the boundary card on the spine
  // states it (rails-ops decision 0019), and one statement is enough.
  if (!holed && coverage.fromDeployment && undated === 0) return null;

  return (
    <div className={`mt-2 pt-3 ${NOTE}`}>
      {holed ? (
        <p>
          <span className="text-foreground">This history has holes in it.</span> Rails swept {sourceLabel} from block{" "}
          {blockLink(coverage.fromBlock)} to {blockLink(coverage.toBlock)}, but{" "}
          {coverage.gaps.length === 1 ? "one stretch" : `${coverage.gaps.length} stretches`} would not answer:{" "}
          {coverage.gaps.map((g, i) => (
            <span key={`${g.from}-${g.to}`}>
              {i > 0 && ", "}
              {g.from.toLocaleString("en-US")}–{g.to.toLocaleString("en-US")}
            </span>
          ))}
          . Every event shown is real, but any event inside those blocks is missing from this list — and because the
          running balances are replayed from the events, the before/after figures after a hole are short by whatever it
          hid. Reload to sweep again.
        </p>
      ) : coverage.fromDeployment ? null : (
        <p>
          Rails has captured this timeline from{" "}
          <span className="text-foreground">
            {first != null ? longDate(first) : `block ${coverage.fromBlock.toLocaleString("en-US")}`}
          </span>{" "}
          onward.{" "}
          {coverage.source === "index" ? (
            <>
              This wallet&rsquo;s history on {sourceLabel} is too large to send in one answer, and Rails has not yet
              stored a summary of its earlier part, so the index sent its newest events, from block{" "}
              {blockLink(coverage.fromBlock)}; anything it did before that, back to {sourceLabel}&rsquo;s first block (
              {blockLink(coverage.deployBlock)}), is outside what was read.
            </>
          ) : (
            <>
              The sweep reached back to block {blockLink(coverage.fromBlock)} before it ran out of time, not all the way
              to {sourceLabel}&rsquo;s first block ({blockLink(coverage.deployBlock)}), so anything this wallet did
              earlier is outside what was read.
            </>
          )}{" "}
          Everything shown is contiguous — the missing part is older, not in the middle — but the running balances on
          the cards are replayed from what was read, so they start from nothing at that block rather than from whatever
          the wallet already held.
        </p>
      )}
      {undated > 0 && (
        <p className="mt-1.5">
          {undated.toLocaleString("en-US")} further {undated === 1 ? "event is" : "events are"} missing from this list
          because the block {undated === 1 ? "it happened in" : "they happened in"} could not be dated — an event with
          no timestamp has nowhere to sit on a timeline, and a placeholder date would read as a real one. The balances
          and the totals above still count {undated === 1 ? "it" : "them"}. Reloading usually resolves it.
        </p>
      )}
    </div>
  );
}
