"use client";

// The swaps behind a CoW figure on the Aave V3 or V4 info page
// (/ethereum/<family>/cow-swaps): the family's rail header, the figure's panel
// with its receipt, the figure and sort filters (in the URL: ?figure=&sort=),
// then the swaps on the spine, newest or largest first, fifty at a time.
// Drawn as the CoW wallet page draws its trades (cow-wallet-view.tsx). Read on
// the client: the server holds the swaps an hour, and a cold read takes seconds.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RailHeader } from "@/components/shared/rail-header";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { SpineTipContext } from "@/components/shared/spine-column";
import { EventDateContext } from "@/components/shared/event-time";
import { FilterDropdown } from "@/components/shared/filter-dropdown";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { CARD_INSET_START, INLINE_LINK, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  COW_AAVE_FAMILY_NAME,
  COW_SHAPES,
  COW_SHAPE_LABEL,
  bpText,
  countText,
  parseCowSwapsQuery,
  usdText,
  type CowAaveFamily,
  type CowAaveFigure,
  type CowAaveSort,
  type CowAaveSwap,
  type CowAaveSwapsPage,
  type CowAaveTotals,
} from "@/lib/cow/aave-totals";
import {
  cowFeesTotalProv,
  cowMedianFeeProv,
  cowPricedProv,
  cowSurplusTotalProv,
} from "@/lib/cow/aave-totals-provenance";
import { CowAaveSwapCard } from "@/components/protocol/cow/cow-aave-swap-card";
import { CowFiguresWait, useCowAaveTotals } from "@/components/protocol/cow/cow-aave-figures";
import { useCowAaveRead } from "@/components/protocol/cow/use-cow-aave-read";

const PAGE = 50;

const FIGURE_LABEL: Record<CowAaveFigure, string> = {
  surplus: "Surplus",
  fees: "Fees",
  "no-fee": "No fee",
  unpriced: "No price",
  "not-decoded": "No trade read",
};

const SORT_LABEL: Record<CowAaveSort, string> = { recent: "Recent activity", usd: "Largest first" };

/** The date once a day: a row names it where the row above is another UTC day. */
const utcDay = (ts: number) => Math.floor(ts / 86_400);
const datePrefix = (ts: number, aboveTs: number | null): string | null =>
  aboveTs != null && utcDay(aboveTs) === utcDay(ts) ? null : `${shortDate(ts)} ${shortDateYear(ts)}`;

/** How many swaps a figure's listing holds, from the totals. */
function countFor(t: CowAaveTotals, figure: CowAaveFigure): number {
  const c = t.counts;
  if (figure === "surplus") return c.priced;
  if (figure === "fees") return t.fees.trades;
  if (figure === "no-fee") return c.noFee;
  if (figure === "unpriced") return c.unpriced;
  return c.notDecoded;
}

export function CowAaveSwapsView({ family }: { family: CowAaveFamily }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { figure, sort } = parseCowSwapsQuery(sp);
  const fam = COW_AAVE_FAMILY_NAME[family];
  const totalsRead = useCowAaveTotals(family);
  const totals = totalsRead.status === "ready" ? totalsRead.value : null;
  const base = `/api/cow/ethereum/aave/${family}/swaps?${new URLSearchParams({ figure, sort, limit: String(PAGE) })}`;
  // The first page reads under the same retry rule as the figures; later pages are read on demand.
  const first = useCowAaveRead<CowAaveSwapsPage>(`${base}&offset=0`);
  const [more, setMore] = useState<{ base: string; pages: CowAaveSwapsPage[] }>({ base, pages: [] });
  const [moreState, setMoreState] = useState<"idle" | "reading" | "failed">("idle");
  const pages = useMemo(
    () => [...(first.status === "ready" ? [first.value] : []), ...(more.base === base ? more.pages : [])],
    [first, more, base],
  );
  // Rows by swap key, once each: a page read after the server's hourly re-read can repeat a row.
  const swaps = useMemo(() => {
    const seen = new Set<string>();
    const out: CowAaveSwap[] = [];
    for (const p of pages)
      for (const sw of p.swaps)
        if (!seen.has(sw.swapKey)) {
          seen.add(sw.swapKey);
          out.push(sw);
        }
    return out;
  }, [pages]);
  const labels = useMemo(() => Object.assign({}, ...pages.map((p) => p.tokens)) as CowAaveSwapsPage["tokens"], [pages]);
  const matched = first.status === "ready" ? first.value.matched : null;
  const registry = useReceiptRegistry();

  const readMore = useCallback(async () => {
    setMoreState("reading");
    try {
      const res = await fetch(`${base}&offset=${swaps.length}`);
      const body = (await res.json()) as CowAaveSwapsPage & { success: boolean };
      if (!res.ok || !body.success) throw new Error(String(res.status));
      setMore((prev) => ({ base, pages: [...(prev.base === base ? prev.pages : []), body] }));
      setMoreState("idle");
    } catch {
      setMoreState("failed");
    }
  }, [base, swaps.length]);

  const go = (next: { figure?: CowAaveFigure; sort?: CowAaveSort }) => {
    const p = new URLSearchParams({ figure: next.figure ?? figure });
    const s = next.sort ?? sort;
    if (s !== "recent") p.set("sort", s);
    setMoreState("idle");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const sortable = figure === "surplus" || figure === "fees" || figure === "no-fee";
  const figureOptions = (Object.keys(FIGURE_LABEL) as CowAaveFigure[])
    .filter((f) => !totals || f === figure || countFor(totals, f) > 0)
    .map((f) => ({ key: f, label: FIGURE_LABEL[f], count: totals ? countFor(totals, f) : undefined }));

  return (
    <div className="space-y-6 py-8">
      <RailHeader session={family} venue="info" />
      <div>
        <h1 className="text-2xl font-semibold text-foreground" data-anatomy="I10.1">
          {fam} swaps via CoW
        </h1>
        <p className="mt-1 text-sm text-rb-500">
          The swaps behind the CoW figures on{" "}
          <Link href={`/ethereum/${family}/info`} className={INLINE_LINK}>
            the {fam} info page
          </Link>
          .
        </p>
      </div>

      {totals ? <FigurePanel t={totals} figure={figure} /> : <CowFiguresWait read={totalsRead} />}

      <section className="space-y-4" data-anatomy="I10.2" aria-label="Swaps" data-cow-swaps={figure}>
        <div className={`flex flex-wrap items-baseline justify-between gap-2 ${CARD_INSET_START}`}>
          <h2 className={SECTION_HEADING}>Swaps</h2>
          <span className="text-xs tabular-nums text-rb-500" aria-live="polite" data-cow-count="">
            {first.status === "reading"
              ? "Reading…"
              : matched != null
                ? `${countText(matched)} ${matched === 1 ? "swap" : "swaps"}`
                : null}
          </span>
        </div>
        <div className={`flex flex-wrap gap-2 ${CARD_INSET_START}`}>
          <FilterDropdown
            label="Figure"
            variant="pill"
            noClear
            options={figureOptions}
            selected={figure}
            onSelect={(k) => k && go({ figure: k as CowAaveFigure })}
            anatomy="I10.3"
          />
          {sortable && (
            <FilterDropdown
              label="Sort"
              variant="pill"
              noClear
              options={(Object.keys(SORT_LABEL) as CowAaveSort[]).map((k) => ({ key: k, label: SORT_LABEL[k] }))}
              selected={sort}
              onSelect={(k) => k && go({ sort: k as CowAaveSort })}
              anatomy="I10.3"
            />
          )}
        </div>
        <ProvReceiptsScope registry={registry}>
          <div data-cow-swap-rows="">
            {swaps.map((s, i) => (
              <EventDateContext.Provider
                key={s.swapKey}
                value={datePrefix(s.timestamp, i > 0 ? swaps[i - 1].timestamp : null)}
              >
                <SpineTipContext.Provider value={null}>
                  <div id={`event-${s.swapKey}`} data-event-id={s.swapKey} data-row-at={s.timestamp}>
                    <CowAaveSwapCard
                      family={family}
                      swap={s}
                      labels={labels}
                      isLast={i === swaps.length - 1 && (matched == null || swaps.length >= matched)}
                    />
                  </div>
                </SpineTipContext.Provider>
              </EventDateContext.Provider>
            ))}
            {first.status === "ready" && swaps.length === 0 && (
              <p className="py-6 text-sm text-rb-500">No swap is behind this figure.</p>
            )}
          </div>
        </ProvReceiptsScope>
        {first.status === "not-yet" && (
          <p className="text-sm text-rb-500">The swaps are still being read. Reload the page in a minute.</p>
        )}
        {(first.status === "failed" || moreState === "failed") && (
          <p className="text-sm text-rb-500">The swaps could not be read. Reload the page to try again.</p>
        )}
        {matched != null && swaps.length < matched && (
          <div className={CARD_INSET_START}>
            <button
              type="button"
              onClick={() => void readMore()}
              disabled={moreState === "reading"}
              className="inline-flex h-8 items-center rounded-full border border-teal-500/60 px-3 text-xs font-semibold text-teal-600 transition-colors hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-400"
              data-cow-more=""
            >
              {moreState === "reading" ? "Reading…" : `Show ${PAGE} more`}
            </button>
          </div>
        )}
      </section>
      <ProvInspectorLayer />
    </div>
  );
}

/** The figure the listing stands behind, with its receipt. */
function FigurePanel({ t, figure }: { t: CowAaveTotals; figure: CowAaveFigure }) {
  const c = t.counts;
  return (
    <ProvSection scope={`cow-swaps-${t.family}`} data-anatomy="I10.4" data-cow-figure-panel={figure}>
      <SectionHeading title={FIGURE_LABEL[figure]} />
      <div className="mt-1.5 max-w-3xl space-y-1 text-sm text-rb-500">
        {figure === "surplus" && (
          <>
            <p>
              Surplus beyond the limits signed:{" "}
              <Prov info={cowSurplusTotalProv(t, undefined, "this listing")} value={t.surplus.usd.toFixed(2)}>
                <span className="font-semibold tabular-nums text-foreground">{usdText(t.surplus.usd)}</span>
              </Prov>{" "}
              across {countText(c.priced)} priced trades.
            </p>
            <ul className="list-disc pl-5">
              {COW_SHAPES.filter((s) => t.surplus.byShape[s].trades > 0).map((s) => (
                <li key={s}>
                  {COW_SHAPE_LABEL[s]}:{" "}
                  <Prov info={cowSurplusTotalProv(t, s, "this listing")} value={t.surplus.byShape[s].usd.toFixed(2)}>
                    <span className="tabular-nums text-foreground">{usdText(t.surplus.byShape[s].usd)}</span>
                  </Prov>
                  , {countText(t.surplus.byShape[s].trades)} trades
                </li>
              ))}
            </ul>
          </>
        )}
        {figure === "fees" && (
          <p>
            Fees in the swaps&apos; prices:{" "}
            <Prov info={cowFeesTotalProv(t)} value={t.fees.usd.toFixed(2)}>
              <span className="font-semibold tabular-nums text-foreground">{usdText(t.fees.usd)}</span>
            </Prov>{" "}
            across {countText(t.fees.trades)} trades
            {t.fees.medianBp != null && (
              <>
                , a median of{" "}
                <Prov info={cowMedianFeeProv(t)} value={String(t.fees.medianBp)}>
                  <span className="tabular-nums text-foreground">{bpText(t.fees.medianBp)}</span>
                </Prov>
              </>
            )}
            .
          </p>
        )}
        {figure === "no-fee" && (
          <p>
            These trades executed above their settlement&apos;s clearing price and state no fee. Their surplus counts in
            the surplus figure.
          </p>
        )}
        {figure === "unpriced" && (
          <p>
            Aave has no price for the token these trades&apos; surplus and fees are in, within about two days of each
            trade, so they are in neither figure.
          </p>
        )}
        {figure === "not-decoded" && (
          <p>No trade is read for these swaps&apos; settlements yet, so they are in neither figure.</p>
        )}
        {(figure === "surplus" || figure === "fees") && (
          <p>
            Priced at Aave&apos;s oracle price when each trade settled:{" "}
            <Prov info={cowPricedProv(t)} value={String(c.priced)}>
              {countText(c.priced)} of {countText(c.trades)} trades
            </Prov>
            .
          </p>
        )}
      </div>
    </ProvSection>
  );
}
