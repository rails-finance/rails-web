"use client";

// The CoW figures block on the Aave V3 and V4 info pages (slot I10,
// lib/cow/aave-totals.ts): the surplus beyond the limits signed and the fees in
// the swaps' prices, two figures never added together, with the surplus's three
// shapes under it, the median fee, and notes naming every trade the figures
// leave out. Each figure opens the listing of the swaps behind it. Read on the
// client after the page loads: a cold read on the server takes seconds, and
// the rest of the page does not wait for it. While the read is under way, or
// answers 503 or 504, the block draws its loading line, never a zero.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { BlockRef } from "@/components/shared/block-ref";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { formatDate } from "@/lib/date";
import { COW_TERMS } from "@/lib/cow/terms";
import { COW_CHAIN_ID } from "@/lib/cow/trade";
import {
  COW_AAVE_FAMILY_NAME,
  COW_SHAPES,
  COW_SHAPE_LABEL,
  bpText,
  countText,
  cowSwapsHref,
  usdText,
  type CowAaveFamily,
  type CowAaveTotals,
} from "@/lib/cow/aave-totals";
import {
  cowFeesTotalProv,
  cowMedianFeeProv,
  cowPricedProv,
  cowSurplusTotalProv,
} from "@/lib/cow/aave-totals-provenance";

export const COW_FIGURES_HEADING = "CoW swaps";

/** Waits between reads while the server's figures are not ready (503) or the read runs past its budget (504). */
const RETRY_MS = [3_000, 6_000, 12_000, 20_000];

type State = { status: "reading" } | { status: "ready"; totals: CowAaveTotals } | { status: "not-yet" };

function useCowAaveTotals(family: CowAaveFamily): State {
  const [state, setState] = useState<State>({ status: "reading" });
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async (n: number) => {
      try {
        const res = await fetch(`/api/cow/ethereum/aave/${family}/totals`);
        const body = (await res.json()) as CowAaveTotals & { success: boolean };
        if (!live) return;
        if (res.ok && body.success) return setState({ status: "ready", totals: body });
      } catch {
        if (!live) return;
      }
      if (n < RETRY_MS.length) timer = setTimeout(() => void attempt(n + 1), RETRY_MS[n]);
      else setState({ status: "not-yet" });
    };
    void attempt(0);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [family]);
  return state;
}

const TILE = "rounded-xl border border-rb-200 p-4 dark:border-rb-700";
const FIGURE = "text-2xl font-semibold tabular-nums text-foreground";

export function CowAaveFigures({ family }: { family: CowAaveFamily }) {
  const state = useCowAaveTotals(family);
  const fam = COW_AAVE_FAMILY_NAME[family];
  return (
    <div className="mt-5">
      <ProvSection scope={`cow-figures-${family}`} data-anatomy="I10" data-cow-figures={family}>
        <SectionHeading title={COW_FIGURES_HEADING} />
        <p className="mt-1.5">
          Aave&apos;s app can route a position swap through {COW_TERMS.name}, which settles the order in a batch with
          others. The figures below cover every such swap on {fam} positions on Ethereum.
        </p>
        {state.status === "reading" && (
          <p className="mt-3 text-rb-500" data-cow-figures-state="reading" aria-live="polite">
            Reading the {COW_TERMS.name} figures…
          </p>
        )}
        {state.status === "not-yet" && (
          <p className="mt-3 text-rb-500" data-cow-figures-state="not-yet">
            The {COW_TERMS.name} figures are still being read. Reload the page in a minute to see them.
          </p>
        )}
        {state.status === "ready" && <Figures t={state.totals} />}
      </ProvSection>
    </div>
  );
}

function Figures({ t }: { t: CowAaveTotals }) {
  const c = t.counts;
  const shown = COW_SHAPES.filter((s) => t.surplus.byShape[s].trades > 0);
  const top = t.unpricedTokens.slice(0, 3).map((u) => u.symbol ?? `${u.address.slice(0, 6)}…`);
  const more = t.unpricedTokens.length - top.length;
  return (
    <div data-cow-figures-state="ready">
      {t.asOf.block != null && t.asOf.timestamp != null && (
        <p className="mt-1 text-xs text-rb-500" data-cow-figures-asof={t.asOf.block}>
          {countText(c.trades)} trades, up to {formatDate(t.asOf.timestamp)}, block{" "}
          <BlockRef block={t.asOf.block} chainId={COW_CHAIN_ID} size={12} />
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className={TILE} data-cow-figure="surplus">
          <h3 className="text-sm font-semibold text-foreground">Surplus beyond the limits signed</h3>
          <p className="mt-1">
            <Prov info={cowSurplusTotalProv(t)} value={t.surplus.usd.toFixed(2)}>
              <span className={FIGURE}>{usdText(t.surplus.usd)}</span>
            </Prov>
          </p>
          <ul className="mt-2 space-y-1">
            {shown.map((s) => (
              <li key={s} className="flex justify-between gap-3" data-cow-surplus-shape={s}>
                <span>{COW_SHAPE_LABEL[s]}</span>
                <Prov info={cowSurplusTotalProv(t, s)} value={t.surplus.byShape[s].usd.toFixed(2)}>
                  <span className="tabular-nums text-foreground">{usdText(t.surplus.byShape[s].usd)}</span>
                </Prov>
              </li>
            ))}
          </ul>
          <Link href={cowSwapsHref(t.family, "surplus", "usd")} className={`mt-3 inline-block ${INLINE_LINK}`}>
            See the {countText(c.priced)} swaps
          </Link>
        </div>
        <div className={TILE} data-cow-figure="fees">
          <h3 className="text-sm font-semibold text-foreground">Fees in the swaps&apos; prices</h3>
          <p className="mt-1">
            <Prov info={cowFeesTotalProv(t)} value={t.fees.usd.toFixed(2)}>
              <span className={FIGURE}>{usdText(t.fees.usd)}</span>
            </Prov>
          </p>
          {t.fees.medianBp != null && (
            <p className="mt-2 flex justify-between gap-3" data-cow-median-fee="">
              <span>Median fee</span>
              <Prov info={cowMedianFeeProv(t)} value={String(t.fees.medianBp)}>
                <span className="tabular-nums text-foreground">{bpText(t.fees.medianBp)}</span>
              </Prov>
            </p>
          )}
          <Link href={cowSwapsHref(t.family, "fees", "usd")} className={`mt-3 inline-block ${INLINE_LINK}`}>
            See the {countText(t.fees.trades)} swaps
          </Link>
        </div>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5" data-cow-figures-notes="">
        <li data-cow-note="priced">
          Each trade is priced in US dollars at its block, at Aave&apos;s oracle price for the token:{" "}
          <Prov info={cowPricedProv(t)} value={String(c.priced)}>
            {countText(c.priced)} of {countText(c.trades)} trades
          </Prov>
          .
        </li>
        {c.unpriced > 0 && (
          <li data-cow-note="unpriced">
            {countText(c.unpriced)} trades have their surplus and fees in a token Aave has no price for (
            {top.join(", ")}
            {more > 0 ? ` and ${countText(more)} more` : ""}), so they are in neither figure.{" "}
            <Link href={cowSwapsHref(t.family, "unpriced")} className={INLINE_LINK}>
              See them
            </Link>
          </li>
        )}
        {c.noFee > 0 && (
          <li data-cow-note="no-fee">
            {countText(c.noFee)} trades executed above their settlement&apos;s clearing price, so state no fee: they are
            in the surplus and not in the fees.{" "}
            <Link href={cowSwapsHref(t.family, "no-fee")} className={INLINE_LINK}>
              See them
            </Link>
          </li>
        )}
        {c.notDecoded > 0 && (
          <li data-cow-note="not-decoded">
            {c.notDecoded === 1
              ? "1 swap's settlement has no trade read yet"
              : `${countText(c.notDecoded)} swaps' settlements have no trade read yet`}
            , so the figures count {countText(c.trades)} trades and the listings show {countText(c.swaps)} swaps.{" "}
            <Link href={cowSwapsHref(t.family, "not-decoded")} className={INLINE_LINK}>
              See {c.notDecoded === 1 ? "it" : "them"}
            </Link>
          </li>
        )}
        {c.flashPremiumRead > 0 && (
          <li data-cow-note="flash">The flash-loan fee each swap paid to the lending pool is in neither figure.</li>
        )}
      </ul>
    </div>
  );
}
