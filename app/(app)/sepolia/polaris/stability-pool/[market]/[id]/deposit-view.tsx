"use client";

// A Polaris stability-pool deposit's page, in the three sections
// (rails-ops standards/detail-page-anatomy.md): the card, the Lifetime flows
// tower (decision 0022, lib/polaris/sp-flows.ts), the timeline. The pool's
// getters at head (/api/chain/polaris/stability-pool) are the card's figures
// and the tower's pending segments; the index holds the history and the sums.
// The vault-held deposits carry about 185,000 rows each, so the timeline
// reads its rows newest first, a page at a time, as CoW's trade list does.

import { useEffect, useMemo, useState } from "react";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import { EventDateContext } from "@/components/shared/event-time";
import { SpineTipContext } from "@/components/shared/spine-column";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import { PolarisDepositCard } from "@/components/protocol/polaris/polaris-deposit-card";
import { PolarisDepositEventCard } from "@/components/protocol/polaris/polaris-sp-loan-event-cards";
import { RawFigure } from "@/components/protocol/polaris/polaris-sp-loan-parts";
import { fetchPolarisDepositChain, type PolarisDepositChain } from "@/lib/api/fetch-polaris-sp-loans-chain";
import { PETH, POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import { big, depositLifetime, depositNow, depositNowFromChain, units } from "@/lib/polaris/sp-loan-math";
import { DEPOSIT_PAGE, polarisDepositTower } from "@/lib/polaris/sp-flows";
import { spFeedProv, spLiveProv, spPendingLossProv } from "@/lib/polaris/sp-loan-provenance";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { CARD_INSET_START, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import {
  readPolarisSpLoans,
  type PolarisDepositEventRow,
  type PolarisDepositTimelineResponse,
} from "@/lib/sources/api/polaris-sp-loans";

const utcDay = (ts: number) => Math.floor(ts / 86_400);
const datePrefix = (ts: number, aboveTs: number | null): string | null =>
  aboveTs != null && utcDay(aboveTs) === utcDay(ts) ? null : `${shortDate(ts)} ${shortDateYear(ts)}`;

export default function DepositView({
  market,
  tokenId,
  initial,
}: {
  market: PolarisMarket;
  tokenId: string;
  initial: PolarisDepositTimelineResponse | null;
}) {
  const stable = POLARIS_MARKET_CONFIG[market].stable;
  const [data, setData] = useState(initial);
  const [rows, setRows] = useState<PolarisDepositEventRow[]>(initial?.rows ?? []);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [chain, setChain] = useState<PolarisDepositChain | null>(null);
  const [chainSettled, setChainSettled] = useState(false);

  // The index lane, where the server's read did not answer.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    readPolarisSpLoans<PolarisDepositTimelineResponse>("stability-pool/timeline", {
      market,
      id: tokenId,
      order: "desc",
      limit: String(DEPOSIT_PAGE),
    })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setRows(d.rows);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [initial, market, tokenId]);

  const row = data?.position ?? null;
  const open = row?.status === "open";

  // The chain lane: the pool's getters at head, for an open deposit.
  useEffect(() => {
    if (!open) {
      setChainSettled(true);
      return;
    }
    let cancelled = false;
    fetchPolarisDepositChain(market, tokenId)
      .then((c) => !cancelled && !c.chainStale && setChain(c))
      .catch(() => undefined)
      .finally(() => !cancelled && setChainSettled(true));
    return () => {
      cancelled = true;
    };
  }, [open, market, tokenId]);

  const lifetime = useMemo(() => (row ? depositLifetime(row) : null), [row]);
  // The tower and the head row lay the chain over the index only where the two
  // agree on the last touch; the card's headlines are the chain's alone.
  const now = useMemo(() => (lifetime && chain && open ? depositNow(lifetime, chain) : null), [lifetime, chain, open]);
  const cardNow = useMemo(() => (chain && open ? depositNowFromChain(chain) : null), [chain, open]);
  const tower = useMemo(() => (lifetime ? polarisDepositTower(market, lifetime, now) : null), [market, lifetime, now]);

  // pETH in the market's stablecoin at the feed, the price the head row values
  // the pending pETH at.
  const feed = chain?.pethInStableRaw ? units(big(chain.pethInStableRaw)) : null;
  const stripAssets: LatestPriceAsset[] =
    feed != null
      ? [
          {
            symbol: PETH.symbol,
            address: PETH.address,
            price: feed,
            unit: stable.symbol,
            label: `${PETH.symbol} at the ${stable.symbol} price feed`,
            triggerLabel: PETH.symbol,
            info: spFeedProv(market),
          },
        ]
      : [];

  const total = data?.totalEvents ?? 0;
  const loadMore = async () => {
    setMore(true);
    try {
      const d = await readPolarisSpLoans<PolarisDepositTimelineResponse>("stability-pool/timeline", {
        market,
        id: tokenId,
        order: "desc",
        limit: String(DEPOSIT_PAGE),
        offset: String(rows.length),
      });
      setRows((r) => [...r, ...d.rows]);
    } catch {
      setFailed(true);
    } finally {
      setMore(false);
    }
  };

  const registry = useReceiptRegistry();

  if (!data && !failed) return <DetailBodySkeleton />;
  if (!row)
    return (
      <div className="py-8 text-sm text-rb-500">
        The index did not answer for this deposit just now. Reload the page to try again.
      </div>
    );

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow
        session="polaris"
        wallet={chain?.owner ?? row.holder}
        owner={{ wallet: chain?.owner ?? row.holder }}
        assets={stripAssets}
        closed={!open}
        tools={false}
      />
      <PolarisDepositCard
        row={row}
        lifetime={lifetime}
        now={cardNow}
        pending={open && !chainSettled}
        explanation={
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-rb-500">
            <li>
              A deposit in the {stable.symbol} Stability Pool repays the debt of liquidated positions. Each liquidation
              burns a share of every deposit and pays pETH in its place.
            </li>
            <li>
              The pool writes what changed only when the holder touches the deposit, so between touches the deposit now
              and the pending gains are read from the pool at the latest block.
            </li>
            <li>The deposit also earns {stable.symbol} yield; what a touch does not claim stays in the deposit.</li>
          </ul>
        }
      />
      {tower && <ChainTruthTower data={tower} />}

      <section className="space-y-4" data-anatomy="P3" aria-label="Activity">
        <div className={`flex flex-wrap items-baseline justify-between gap-2 ${CARD_INSET_START}`}>
          <h2 className={SECTION_HEADING}>Activity</h2>
          <span className="text-xs tabular-nums text-rb-500" data-deposit-count="">
            {rows.length < total
              ? `Newest ${rows.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} operations`
              : `${total.toLocaleString("en-US")} ${total === 1 ? "operation" : "operations"}`}
          </span>
        </div>
        <ProvReceiptsScope registry={registry}>
          {now && lifetime && (
            <SinceLastTouch
              market={market}
              lastTimestamp={Number(row.last_timestamp)}
              burned={now.pendingLoss}
              peth={now.bcSinceTouch}
              gain={now.pendingStable}
              feed={feed}
            />
          )}
          <div data-deposit-rows="">
            {rows.map((r, i) => (
              <EventDateContext.Provider
                key={r.event_key}
                value={datePrefix(Number(r.block_timestamp), i > 0 ? Number(rows[i - 1].block_timestamp) : null)}
              >
                <SpineTipContext.Provider value={i === 0 ? "above" : null}>
                  <div id={`event-${r.event_key}`} data-event-id={r.event_key} data-row-at={r.block_timestamp}>
                    <PolarisDepositEventCard row={r} isLast={i === rows.length - 1 && rows.length >= total} />
                  </div>
                </SpineTipContext.Provider>
              </EventDateContext.Provider>
            ))}
          </div>
        </ProvReceiptsScope>
        {failed && <p className="text-sm text-rb-500">The operations could not be read just now.</p>}
        {rows.length < total && (
          <div className={CARD_INSET_START}>
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={more}
              className="inline-flex h-8 items-center rounded-full border border-teal-500/60 px-3 text-xs font-semibold text-teal-600 transition-colors hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-400"
              data-deposit-more=""
            >
              {more ? "Reading…" : `Show ${DEPOSIT_PAGE} more`}
            </button>
          </div>
        )}
      </section>
      <ProvInspectorLayer />
    </div>
  );
}

/** The timeline's head slot (L5, decision 0022 §4): what the pool has done to
 *  the deposit since its last touch, the holder having done nothing, with the
 *  pending pETH valued at the feed now. */
function SinceLastTouch({
  market,
  lastTimestamp,
  burned,
  peth,
  gain,
  feed,
}: {
  market: PolarisMarket;
  lastTimestamp: number;
  burned: bigint;
  peth: bigint;
  gain: bigint;
  feed: number | null;
}) {
  const s = POLARIS_MARKET_CONFIG[market].stable.symbol;
  const pethValue = feed != null ? units(peth) * feed : null;
  const net = pethValue != null ? pethValue + units(gain) - units(burned) : null;
  const fmt = (n: number) =>
    `${n < 0 ? "−" : "+"}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${s}`;
  return (
    <details
      className={`mb-3 rounded-2xl bg-raised px-5 py-3 text-sm ${CARD_INSET_START}`}
      data-anatomy="L5"
      data-live-window="polaris-sp-since-touch"
    >
      <summary className="cursor-pointer select-none font-semibold">
        Since its last touch{" "}
        <span className="font-normal text-rb-500">
          on {shortDate(lastTimestamp)} {shortDateYear(lastTimestamp)}
          {net != null ? `: ${fmt(net)} at the feed` : ""}
        </span>
      </summary>
      <ul className="mt-2 space-y-1 text-rb-500">
        <li data-since-row="burned">
          Burned by liquidations:{" "}
          <Prov info={spPendingLossProv(market)}>
            <RawFigure raw={burned} symbol={s} />
          </Prov>{" "}
          {s}
        </li>
        <li data-since-row="peth">
          pETH paid in:{" "}
          <Prov info={spLiveProv("pendingPeth", market)}>
            <RawFigure raw={peth} symbol={PETH.symbol} />
          </Prov>{" "}
          pETH
          {pethValue != null
            ? `, ${pethValue.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${s} at the feed`
            : ""}
        </li>
        <li data-since-row="gain">
          {s} gain:{" "}
          <Prov info={spLiveProv("stableGain", market)}>
            <RawFigure raw={gain} symbol={s} />
          </Prov>{" "}
          {s}
        </li>
      </ul>
    </details>
  );
}
