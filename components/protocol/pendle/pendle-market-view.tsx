"use client";

// One Pendle market at one block: the card (implied APY, pool, PT price and
// maturity; the pool's PT and SY, the marks and their source), its tokens, and
// the market's latest router events from their own side.

import { PositionCard, type PositionCardSlots } from "@/components/shared/position-card";
import { PanelFigure, type PositionPanelRow } from "@/components/shared/position-card-panel";
import { PositionReadProvider } from "@/components/shared/position-read";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { SpineTipContext } from "@/components/shared/spine-column";
import { EventDateContext } from "@/components/shared/event-time";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { explorerUrl } from "@/lib/shared/chains";
import { CARD_INSET_START, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import { PendleEventCard } from "@/components/protocol/pendle/pendle-event-card";
import { UnderlyingLabel } from "@/components/protocol/pendle/pendle-position-card";
import {
  PENDLE_CHAIN_ID,
  amountText,
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  maturityDate,
  maturityWords,
  rate,
  shortAddress,
  symbolOf,
} from "@/lib/pendle/format";
import { impliedApyProv, markProv, maturityProv, poolStateProv, tvlProv } from "@/lib/pendle/provenance";
import type { PendleMarketPage, PendleTimelineRow, PendleToken } from "@/lib/pendle/types";

const utcDay = (ts: number) => Math.floor(ts / 86_400);
const datePrefix = (ts: number, aboveTs: number | null): string | null =>
  aboveTs != null && utcDay(aboveTs) === utcDay(ts) ? null : `${shortDate(ts)} ${shortDateYear(ts)}`;

function ContractLink({ tok, label }: { tok: PendleToken; label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs" data-pendle-contract={label}>
      <span className="text-rb-500">{label}</span>
      <a
        href={explorerUrl(PENDLE_CHAIN_ID, "address", tok.address)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external min-w-0 truncate"
      >
        {symbolOf(tok)} <span className="font-mono text-rb-500">{shortAddress(tok.address)}</span>
      </a>
    </div>
  );
}

export function PendleMarketView({ m }: { m: PendleMarketPage }) {
  const registry = useReceiptRegistry();
  const t = m.tokens;
  const live = m.live;
  const dec = assetDecimals(t);
  const asset = assetSymbol(t);
  const expired = live.expired === true;
  const marks = live.marks;

  const markRow = (id: "pt" | "yt" | "lp", label: string, raw: string | null): PositionPanelRow => ({
    id: `mark-${id}`,
    label,
    value:
      raw == null ? (
        "–"
      ) : (
        <span>
          <PanelFigure>
            <Prov
              info={markProv(id.toUpperCase() as "PT" | "YT" | "LP", marks.source, marks.twapSeconds, m.block)}
              value={raw}
            >
              {(rate(raw) ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}
            </Prov>
          </PanelFigure>{" "}
          SY
        </span>
      ),
    tip:
      marks.source === "oracle-twap"
        ? `Pendle's oracle, a ${marks.twapSeconds / 60}-minute average.`
        : "RouterStatic's spot rate: Pendle's oracle does not yet hold enough observations on this market.",
  });

  const slots: PositionCardSlots = {
    surface: "detail",
    status: expired ? { word: "Matured", tone: "muted", tip: `PT redeems for one ${asset}; swaps are closed.` } : null,
    identity: <UnderlyingLabel p={m} />,
    heads: [
      {
        id: "implied-apy",
        label: "Implied APY",
        labelTip: "The fixed rate the market prices PT at, at this block. It ends at maturity.",
        value:
          live.impliedApy == null ? (
            expired ? (
              "Matured"
            ) : null
          ) : (
            <Prov
              info={impliedApyProv(t.market.address, m.block, live.state?.lastLnImpliedRate ?? null)}
              value={live.impliedApy.toFixed(6)}
            >
              {apyText(live.impliedApy)}
            </Prov>
          ),
      },
      {
        id: "pool",
        label: "Pool",
        labelTip: `The pool's SY and PT, the PT at its rate in SY, in ${asset}.`,
        value:
          live.tvl?.asset == null ? null : (
            <Prov
              info={tvlProv(t.market.address, m.block)}
              value={exact(live.tvl.asset, dec) ?? live.tvl.asset}
              symbol={asset}
            >
              {amountText(live.tvl.asset, dec)}
            </Prov>
          ),
        sub: `in ${asset}`,
      },
      {
        id: "pt-price",
        label: "PT price",
        labelTip: `What one PT is worth in ${asset} at this block; it reaches one at maturity.`,
        value:
          marks.ptToAsset == null ? null : (
            <Prov info={markProv("PT", marks.source, marks.twapSeconds, m.block)} value={marks.ptToAsset}>
              {(rate(marks.ptToAsset) ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}
            </Prov>
          ),
        sub: asset,
      },
      {
        id: "maturity",
        label: "Maturity",
        value: (
          <Prov info={maturityProv(t.market.address, t.expiry, m.block)} value={String(t.expiry)}>
            {maturityDate(t.expiry)}
          </Prov>
        ),
        sub: maturityWords(t.expiry, m.timestamp),
      },
    ],
    counters: m.router
      ? { lastActivityAt: m.recent[0]?.timestamp ?? null, eventCount: m.router.events, eventCountNoun: "router event" }
      : null,
    heading: "market explanation",
    explainer: {
      body: (
        <div className="space-y-2 text-sm leading-relaxed">
          <p>
            This market splits {symbolOf(t.yieldToken)} into a principal token (PT), which redeems for one {asset} at
            maturity on {maturityDate(t.expiry)}, and a yield token (YT), which collects the yield until then. Its pool
            trades PT against SY, Pendle&rsquo;s wrapper of {symbolOf(t.yieldToken)}.
          </p>
          <p>
            {expired
              ? `The market has matured: PT redeems for one ${asset}, YT is worth nothing, swaps are closed and LP can be removed.`
              : `PT trades below one ${asset} until maturity; the implied APY is the fixed rate that discount gives over the time left.`}
          </p>
          <p>
            The marks are{" "}
            {marks.source === "oracle-twap"
              ? `Pendle's oracle, a ${marks.twapSeconds / 60}-minute average`
              : "RouterStatic's spot rates, since Pendle's oracle does not yet hold enough observations here"}
            , in SY, then in {asset} at the SY&rsquo;s exchange rate.
          </p>
        </div>
      ),
    },
    learnMore: null,
    menu: null,
    panel: [
      [
        {
          id: "pool-pt",
          label: "PT in the pool",
          value: live.state ? (
            <PanelFigure>
              <Prov
                info={poolStateProv("PT in the pool", t.market.address, m.block)}
                value={exact(live.state.totalPt, t.pt.decimals) ?? ""}
              >
                {amountText(live.state.totalPt, t.pt.decimals)}
              </Prov>
            </PanelFigure>
          ) : (
            "–"
          ),
          asset: { symbol: symbolOf(t.pt), address: t.pt.address },
        },
        {
          id: "pool-sy",
          label: "SY in the pool",
          value: live.state ? (
            <PanelFigure>
              <Prov
                info={poolStateProv("SY in the pool", t.market.address, m.block)}
                value={exact(live.state.totalSy, t.sy.decimals) ?? ""}
              >
                {amountText(live.state.totalSy, t.sy.decimals)}
              </Prov>
            </PanelFigure>
          ) : (
            "–"
          ),
          asset: { symbol: symbolOf(t.sy), address: t.sy.address },
        },
        {
          id: "lp-supply",
          label: "LP supply",
          value: (
            <PanelFigure>
              <Prov info={poolStateProv("LP supply", t.market.address, m.block)} value={exact(live.lpSupply, 18) ?? ""}>
                {amountText(live.lpSupply, 18)}
              </Prov>
            </PanelFigure>
          ),
        },
      ],
      [
        markRow("pt", "PT mark", marks.ptToSy),
        markRow("yt", "YT mark", marks.ytToSy),
        markRow("lp", "LP mark", marks.lpToSy),
      ],
    ],
  };

  // The outside tokens a market page can name: the wrapped token and the asset.
  const known = {
    [t.yieldToken.address]: { symbol: t.yieldToken.symbol, decimals: t.yieldToken.decimals },
    [t.asset.address]: { symbol: t.asset.symbol, decimals: t.asset.decimals },
  };
  const rows: PendleTimelineRow[] = m.recent.map((r) => ({
    ...r,
    role: "both",
    syToAsset: null,
    asset: null,
    impliedApy: null,
    partial: false,
  }));

  return (
    <PositionReadProvider read={{ kind: "chain", block: m.block, at: m.timestamp }}>
      <div className="space-y-6">
        <div data-pendle-market-card={t.market.address}>
          <PositionCard slots={slots} />
        </div>
        <section className="space-y-2" aria-label="Tokens" data-pendle-tokens="">
          <h2 className={`${SECTION_HEADING} ${CARD_INSET_START}`}>Tokens</h2>
          <div className="rounded-xl bg-raised px-4 py-2 sm:px-5">
            <ContractLink tok={t.market} label="Market (LP)" />
            <ContractLink tok={t.pt} label="Principal token" />
            <ContractLink tok={t.yt} label="Yield token" />
            <ContractLink tok={t.sy} label="SY" />
            <ContractLink tok={t.yieldToken} label="Wrapped token" />
            {Object.entries(m.rewardTokens).map(([a, r]) => (
              <ContractLink key={a} tok={{ address: a, ...r }} label="Reward" />
            ))}
          </div>
        </section>
        <section className="space-y-4" data-anatomy="P3" aria-label="Latest router events">
          <div className={`flex flex-wrap items-baseline justify-between gap-2 ${CARD_INSET_START}`}>
            <h2 className={SECTION_HEADING}>Latest router events</h2>
            {m.router && (
              <span className="text-xs tabular-nums text-rb-500">
                {rows.length} of {m.router.events.toLocaleString("en-US")}
              </span>
            )}
          </div>
          <ProvReceiptsScope registry={registry}>
            <div data-pendle-market-events="">
              {rows.map((row, i) => (
                <EventDateContext.Provider
                  key={`${row.txHash}-${row.logIndex}`}
                  value={datePrefix(row.timestamp, i > 0 ? rows[i - 1].timestamp : null)}
                >
                  <SpineTipContext.Provider value={i === 0 ? "above" : null}>
                    <PendleEventCard
                      row={row}
                      tokens={t}
                      meta={known}
                      side="market"
                      isLast={i === rows.length - 1}
                      parties={{ caller: m.recent[i].caller, receiver: m.recent[i].receiver }}
                    />
                  </SpineTipContext.Provider>
                </EventDateContext.Provider>
              ))}
              {rows.length === 0 && <p className="py-6 text-sm text-rb-500">No router event names this market.</p>}
            </div>
          </ProvReceiptsScope>
        </section>
      </div>
    </PositionReadProvider>
  );
}
