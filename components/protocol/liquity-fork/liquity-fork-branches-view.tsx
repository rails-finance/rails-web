"use client";

// The Liquity-fork PROTOCOL view (/ebisu/branches, /asymmetry/branches) —
// shared by both forks, the sibling of Liquity V2's branch-rates + redemption
// surface and of /aave-v4/hubs. Protocol-aggregate, read-only: where the trove
// pages answer "where does THIS trove stand", this answers what only the whole
// roster can — how the branches compare.
//
// Two sections, both fed by ONE head-block read (/api/chain/<fork>/branches):
//   1. A branch band — one card per collateral branch: its own oracle price,
//      size, TCR against its own CCR/SCR, and the rate span its borrowers set.
//   2. Redemption — what a redemption does and the order it does it in.
//
// THE QUEUE IS NOT LISTED HERE, and that is the point. Until 2026-08-29 this
// file drew up to 60 trove rows per branch in redemption order. The listing
// already produces exactly that view — the branch facet, the open status and an
// interest-rate sort — and produces it better: every trove rather than the
// walk's first 60, paged, filterable, and each row the card grammar the rest of
// the site speaks. So the Redemption section links INTO the listing with those
// three selections set (one link per branch, under the prose that says what a
// queue IS), and this page keeps only what is true of a BRANCH. The branch
// card's own link is the plainer one it always was — that branch's troves, no
// status or order imposed.
//
// What that link cannot say, said here in prose instead: a zombie is redeemed
// before the sorted list whatever its rate, and the listing cannot sort it there;
// and the per-trove "how much is redeemed before
// me" lives on each trove's own page (RedemptionRunway), which is the form a
// holder acts on.
//
// Framing follows the V4 hub view: present, don't rank. Fixed canonical branch
// order (the catalog's), no score, no risk valence — the only chroma is the
// app's interaction blue (navigation) and the one factual red the shared
// RatioBar reserves for a liquidation line. A branch's rates are its
// borrowers' own choices, not a protocol setting, so nothing here reads as
// "better"; redemption is exposure, not danger.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { liquityForkRedemptionContent, type LiquityForkLearnMoreParams } from "@/lib/shared/learn-more-content";
import { forkLiveVocab } from "@/lib/shared/liquity-fork-live-provenance";
import { formatCompact, formatExact, formatUsdValue } from "@/lib/utils/format";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl } from "@/lib/shared/chains";
import type { LiquityForkBranchesResponse, LiquityForkBranchState } from "@/lib/api/fetch-liquity-fork-branches";

const LINK = "text-blue-500 hover:underline";

const ratePct = (x: number) => `${x.toFixed(2)}%`;
const ratio = (x: number) => `${(x * 100).toFixed(1)}%`;

/** How this family's explorers name the three listing selections that reproduce
 *  a branch's redemption queue. The forks and the V2 reference name them
 *  differently, and the page is a Server Component, so a builder function can't
 *  cross the boundary — the shape is described with serializable fields
 *  instead. Defaults reproduce the forks' wiring, so Ebisu/Asymmetry/Base Dollar
 *  pass nothing. */
export interface LiquityForkUrlWiring {
  /** The listing's collateral facet param a branch card deep-links into.
   *  Forks: "branch". Liquity V2: "collateralTypes". */
  filterParam?: string;
  /** The status option value meaning "still borrowing". Forks: "open".
   *  Liquity V2: "active" — its wire value differs from its label. */
  openStatus?: string;
  /** The listing's sort value for the user-set annual interest rate — the
   *  queue's own order. Forks: "rate". Liquity V2: "interestRate". */
  rateSort?: string;
}

const DEFAULT_WIRING: Required<LiquityForkUrlWiring> = {
  filterParam: "branch",
  openStatus: "open",
  rateSort: "rate",
};

/** The listing URL that IS this branch's redemption queue: the branch's troves
 *  in the sorted list, lowest rate first.
 *
 *  ZOMBIES ARE DELIBERATELY EXCLUDED, and the first attempt included them —
 *  they are redeemed ahead of the sorted list, so it looked right. It isn't.
 *  The listing's zombie bucket is the INDEX's predicate (an open trove under
 *  the MIN_DEBT floor); the queue's is the chain's (outside the sorted list AND
 *  still carrying debt). A fully-redeemed zombie satisfies the first and not the
 *  second, so selecting the bucket puts troves at the head of a list called
 *  "queue" that are not in the queue at all — on WETH it filled the first page
 *  with rates below the queue's own front. The zombie rule is stated in prose,
 *  where it can be true, instead of in a sort that cannot express it. */
function queueHref(hrefBase: string, symbol: string, wiring: Required<LiquityForkUrlWiring>) {
  const params = new URLSearchParams();
  params.set(wiring.filterParam, symbol);
  params.set("status", wiring.openStatus);
  params.set("sortBy", wiring.rateSort);
  params.set("sortOrder", "asc");
  return `${hrefBase}?${params.toString()}`;
}

/** One branch's summary card — identity, price, size, TCR, rate span. */
function BranchCard({
  branch,
  data,
  hrefBase,
  wiring,
}: {
  branch: LiquityForkBranchState;
  data: LiquityForkBranchesResponse;
  hrefBase: string;
  wiring: Required<LiquityForkUrlWiring>;
}) {
  const vocab = forkLiveVocab(data.protocol);
  const sym = branch.symbol;

  if (branch.stale) {
    return (
      <div className="rounded-xl bg-raised px-4 py-3.5">
        <div className="flex items-center gap-2">
          <TokenChipIcon symbol={sym} size={20} filterable={false} />
          <span className="text-sm font-semibold text-foreground">{sym}</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-rb-500">
          This branch&rsquo;s contracts didn&rsquo;t answer on this read — its figures are withheld rather than
          estimated. The rest of the roster is unaffected.
        </p>
      </div>
    );
  }

  // The TCR bar's axis is the branch's own CCR: how its total ratio stands
  // against the line that gates new borrowing on it. Fill is the TCR as a
  // fraction of CCR (capped at 1 — above the gate the bar is simply full),
  // and the SCR tick marks the shutdown line below it. Neither tick is red:
  // a branch below CCR gates borrowing and below SCR can be wound down —
  // neither liquidates anyone, so neither earns the liquidation colour.
  const ccrFill = branch.tcr != null ? Math.min(1, branch.tcr / branch.ccr) : null;
  const ticks: RatioBarTick[] =
    branch.tcr != null
      ? [{ f: branch.scr / branch.ccr, kind: "neutral", title: `SCR ${ratio(branch.scr)} — branch shutdown line` }]
      : [];

  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={`${hrefBase}?${wiring.filterParam}=${encodeURIComponent(sym)}`}
          className="group/branch flex items-center gap-2"
        >
          <TokenChipIcon symbol={sym} size={20} filterable={false} />
          <span className="text-sm font-semibold text-foreground group-hover/branch:text-blue-500">{sym}</span>
        </Link>
        {branch.priceUsd != null && (
          <span className="text-[11px] tabular-nums text-rb-500">
            <Prov info={vocab.branchPriceProv(sym, branch.priceStale)} value={formatExact(branch.priceUsd)}>
              {formatUsdValue(branch.priceUsd)}
            </Prov>
            {branch.priceStale && <span className="ml-1 text-rb-400">· last good</span>}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <div>
          <div className="text-[11px] text-rb-500">Branch debt</div>
          <div className="mt-0.5 text-xs tabular-nums text-foreground">
            {/* The unit rides in the children, so no `symbol` prop — the
                receipts row renders display + symbol and would double it. */}
            {branch.branchDebt != null ? (
              <Prov
                info={vocab.branchAggregateProv("The branch's entire debt", "getEntireBranchDebt", sym)}
                value={formatExact(branch.branchDebt)}
              >
                {formatCompact(branch.branchDebt)} {data.debtSymbol}
              </Prov>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-rb-500">Branch collateral</div>
          <div className="mt-0.5 text-xs tabular-nums text-foreground">
            {branch.branchColl != null ? (
              <>
                <Prov
                  info={vocab.branchAggregateProv("The branch's entire collateral", "getEntireBranchColl", sym)}
                  value={formatExact(branch.branchColl)}
                >
                  {formatCompact(branch.branchColl)} {sym}
                </Prov>
                {branch.branchCollUsd != null && (
                  <span className="ml-1 text-rb-500">
                    ·{" "}
                    <Prov info={vocab.branchCollUsdProv(sym)} value={formatExact(branch.branchCollUsd)}>
                      {formatUsdValue(branch.branchCollUsd)}
                    </Prov>
                  </span>
                )}
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-rb-500">Troves</div>
          <div className="mt-0.5 text-xs tabular-nums text-foreground">
            <Prov info={vocab.branchListSizeProv(sym)}>{branch.listedCount}</Prov>
            {branch.zombieCount > 0 && (
              <span className="ml-1 text-rb-500">
                {/* A capped ids enumeration can miss zombies — the count is
                    then a floor, and both the glyph and the receipt say so. */}
                +{" "}
                <Prov info={vocab.zombieProv(sym, branch.idsCapped)}>
                  {branch.idsCapped ? `≥${branch.zombieCount}` : branch.zombieCount}
                </Prov>{" "}
                zombie{branch.zombieCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-rb-500">Rates set</div>
          <div className="mt-0.5 text-xs tabular-nums text-foreground">
            {branch.minRatePct != null && branch.maxRatePct != null ? (
              branch.queueCapped ? (
                // The walk stopped short of the list's back, so the span's top
                // and any average would read over a slice while claiming the
                // branch. The minimum IS exact (the walk starts at the queue
                // front), so only it is stated.
                <Prov info={vocab.branchRateSpanProv("The lowest user-set interest rate", sym, branch.queue.length)}>
                  from {ratePct(branch.minRatePct)}
                </Prov>
              ) : (
                <Prov info={vocab.branchRateSpanProv("The span of user-set interest rates", sym)}>
                  {branch.minRatePct === branch.maxRatePct
                    ? ratePct(branch.minRatePct)
                    : `${ratePct(branch.minRatePct)}–${ratePct(branch.maxRatePct)}`}
                </Prov>
              )
            ) : (
              <span className="text-rb-500">no queued troves</span>
            )}
            {branch.avgRatePct != null && !branch.queueCapped && (
              <span className="ml-1 text-rb-500">
                ·{" "}
                <Prov info={vocab.branchRateSpanProv("The debt-weighted average interest rate", sym)}>
                  {ratePct(branch.avgRatePct)}
                </Prov>{" "}
                avg
              </span>
            )}
          </div>
        </div>
      </div>

      {branch.tcr != null && ccrFill != null ? (
        <>
          <RatioBar fill={ccrFill} ticks={ticks} />
          <div className="mt-2 flex items-baseline justify-between text-[11px] tabular-nums text-rb-500">
            <span>
              TCR{" "}
              <Prov info={vocab.branchTcrProv(sym)} value={formatExact(branch.tcr)}>
                {ratio(branch.tcr)}
              </Prov>
            </span>
            <span>
              CCR{" "}
              <Prov info={vocab.branchConstantProv("Critical collateral ratio", "CCR", sym)}>{ratio(branch.ccr)}</Prov>
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
          {branch.queue.length === 0
            ? // Not simply "no debt": these branches keep dust in their aggregate
              // interest bookkeeping after the last debt goes, and dividing
              // collateral by dust yields a ratio in the quintillions. With no
              // debt-bearing troves there is no ratio to state — so it isn't.
              // An empty queue beside a zombie count means every remaining
              // trove was redeemed to zero debt (a debt-bearing zombie rides
              // the queue) — the branch still holds their collateral.
              branch.zombieCount > 0
              ? "This branch's remaining troves are zombies with no debt left, so there is no total collateral ratio to state."
              : "No troves on this branch, so there is no total collateral ratio to state."
            : "This branch's oracle didn't answer on this read, so its total collateral ratio is withheld rather than estimated."}
        </p>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        Liquidates below{" "}
        <Prov info={vocab.branchConstantProv("Minimum collateral ratio", "MCR", sym)}>{ratio(branch.mcr)}</Prov> per
        trove. Below CCR the branch stops new borrowing; below{" "}
        <Prov info={vocab.branchConstantProv("Shutdown collateral ratio", "SCR", sym)}>{ratio(branch.scr)}</Prov> it can
        be shut down. Each branch sets its own.
      </p>
    </div>
  );
}

export interface LiquityForkBranchesViewProps {
  data: LiquityForkBranchesResponse;
  /** Display name ("Ebisu" | "Asymmetry"). */
  protocolName: string;
  /** The explorer's listing path ("/ethereum/ebisu"). Both forks route a trove at
   *  `${basePath}/${branch}/${troveId}`, so the paths are derived from this
   *  rather than passed in as a builder — the pages are Server Components, and
   *  a function prop can't cross that boundary. */
  basePath: string;
  /** The fork's Learn-More parameters (name, stablecoin, verified docs link). */
  learnMore: LiquityForkLearnMoreParams;
  /** Divergent link wiring. Omit for the forks (their defaults); Liquity V2
   *  overrides the filter param and trove-path shape. */
  urls?: LiquityForkUrlWiring;
}

export function LiquityForkBranchesView({
  data,
  protocolName,
  basePath,
  learnMore,
  urls,
}: LiquityForkBranchesViewProps) {
  const registry = useReceiptRegistry();
  const wiring: Required<LiquityForkUrlWiring> = { ...DEFAULT_WIRING, ...urls };
  const [showEmpty, setShowEmpty] = useState(false);

  // An empty branch is real protocol state, not noise — but a roster where
  // most branches are unused buries the ones carrying debt. Default to the
  // branches with troves, and say exactly what's hidden.
  const withTroves = useMemo(() => data.branches.filter((b) => b.queue.length > 0), [data.branches]);
  const emptyCount = data.branches.length - withTroves.length;
  const shown = showEmpty || withTroves.length === 0 ? data.branches : withTroves;
  // A queue link is offered only where the SORTED LIST has something in it —
  // `listedCount`, not `queue.length`. The two differ on a branch whose only
  // queue member is a zombie (asymmetry's cbBTC18: 0 listed, 1 zombie): its
  // card rightly says "no queued troves", and a link beside that saying
  // "cbBTC18 queue →" would open an empty listing. The link excludes zombies,
  // so its availability has to be decided on the same set it will show.
  const queued = shown.filter((b) => b.listedCount > 0);

  if (data.chainStale) {
    return (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read {protocolName}&apos;s branches from chain.</p>
        <p className="text-sm">
          This view is a live contract read with no cached fallback — rather than show stale figures, it shows nothing.
          Try again shortly.
        </p>
      </div>
    );
  }

  return (
    <ProvReceiptsScope registry={registry}>
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Branches</h2>
          {emptyCount > 0 && withTroves.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEmpty((v) => !v)}
              className="text-[11px] font-semibold text-blue-500 hover:underline"
            >
              {showEmpty ? "Hide" : "Show"} {emptyCount} branch{emptyCount === 1 ? "" : "es"} with no queued troves
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((b) => (
            <BranchCard key={b.key} branch={b} data={data} hrefBase={basePath} wiring={wiring} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Redemption</h2>
          <LearnMore content={liquityForkRedemptionContent(learnMore)} inline />
        </div>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          Anyone holding {learnMore.stablecoin} can redeem it against {protocolName} at $1 face value. A redemption
          routes across the branches by how much of each is unbacked, then sweeps the branch it lands on from the LOWEST
          user-set interest rate up — so a borrower&rsquo;s rate is also their place in this queue. Being redeemed
          isn&rsquo;t a penalty: the trove gives up collateral and sheds the same value of debt, and its collateral
          ratio rises.
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          A branch&rsquo;s queue is its troves in rate order, which is the listing sorted that way — one link per branch
          below. Two things that order leaves out: a trove redeemed below the minimum debt drops out of the sorted list
          and is redeemed ahead of everything in it, whatever rate it carries, so those sit under the listing&rsquo;s
          Zombie status rather than in these links; and how much is redeemed before any one trove is stated on that
          trove&rsquo;s own page.
        </p>
        {queued.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {queued.map((b) => (
              <Link key={b.key} href={queueHref(basePath, b.symbol, wiring)} className={`text-[13px] ${LINK}`}>
                {b.symbol} queue <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-rb-500">No branch currently holds a trove to redeem against.</p>
        )}
      </section>

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}

/** The page header's live-read stamp — the block every figure was read at. */
export function LiquityForkBranchesStamp({ data }: { data: LiquityForkBranchesResponse }) {
  const chainId = useChainId();
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(chainId, "block", data.blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {data.blockNumber.toLocaleString("en-US")}
      </a>
      {" · "}
      {formatCompact(data.totalDebt)} {data.debtSymbol} outstanding
      {data.totalCollUsd != null && ` against ${formatUsdValue(data.totalCollUsd)} of collateral`}
      {!data.totalCollUsdComplete && data.branches.some((b) => !b.stale) && (
        <span className="text-rb-400"> · a collateral total is withheld: not every branch priced on this read</span>
      )}
    </p>
  );
}
