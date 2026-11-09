"use client";

// One Pendle market at one block: the card (implied APY, pool, PT price and
// maturity; the pool's PT and SY, the marks and their source), the strip of how
// the market is built, and its router events from their own side.

import { PositionCard, type PositionCardSlots } from "@/components/shared/position-card";
import { PanelFigure, type PositionPanelRow } from "@/components/shared/position-card-panel";
import { PositionReadProvider } from "@/components/shared/position-read";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { PendleTokenStrip } from "@/components/protocol/pendle/pendle-token-strip";
import { PendleMarketEvents } from "@/components/protocol/pendle/pendle-market-events";
import { UnderlyingLabel } from "@/components/protocol/pendle/pendle-position-card";
import {
  amountText,
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  maturityDate,
  maturityWords,
  rate,
  symbolOf,
  unitRate,
} from "@/lib/pendle/format";
import { impliedApyProv, markProv, maturityProv, poolStateProv, tvlProv } from "@/lib/pendle/provenance";
import type { PendleMarketPage, PendleTokenMeta } from "@/lib/pendle/types";

export function PendleMarketView({
  m,
  meta,
  initialSearch,
}: {
  m: PendleMarketPage;
  /** The outside tokens' symbols and decimals (lib/sources/api/pendle.ts outsideTokenMeta). */
  meta: Record<string, PendleTokenMeta>;
  initialSearch: string;
}) {
  const registry = useReceiptRegistry();
  const t = m.tokens;
  const live = m.live;
  const dec = assetDecimals(t);
  const asset = assetSymbol(t);
  const expired = live.expired === true;
  const marks = live.marks;

  const markText = (raw: string, from: number | null, sy: number | null) =>
    (unitRate(raw, from, sy) ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
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
              {markText(raw, id === "lp" ? t.market.decimals : t.pt.decimals, t.sy.decimals)}
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

  return (
    <PositionReadProvider read={{ kind: "chain", block: m.block, at: m.timestamp }}>
      <ProvReceiptsScope registry={registry}>
        <div className="space-y-6">
          <div data-pendle-market-card={t.market.address}>
            <PositionCard slots={slots} />
          </div>
          <PendleTokenStrip m={m} />
          <PendleMarketEvents m={m} initialMeta={meta} initialSearch={initialSearch} />
        </div>
      </ProvReceiptsScope>
    </PositionReadProvider>
  );
}
