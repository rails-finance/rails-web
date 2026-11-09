"use client";

// One Pendle market of a wallet on the shared position card (C1): the value of
// its PT, YT and LP legs and unclaimed interest in the market's asset, the
// fixed APY its PT buys locked in against the market's implied APY now, and
// the maturity. The panel states each leg, the LP's share of the pool, the
// unclaimed interest and rewards. Every figure is read at the page's block;
// the marks name their source (Pendle's oracle or RouterStatic) in their
// receipts. A market the wallet has left is a closed card.

import Link from "next/link";
import { Store } from "lucide-react";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import type { PositionPanelRow } from "@/components/shared/position-card-panel";
import { PanelFigure } from "@/components/shared/position-card-panel";
import { Prov } from "@/components/shared/provenance";
import { AssetPopover } from "@/components/shared/asset-popover";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { RevealTip } from "@/components/shared/reveal-tip";
import { formatNumber } from "@/lib/utils/format";
import {
  amountText,
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  marketName,
  maturityDate,
  maturityWords,
  symbolOf,
  units,
} from "@/lib/pendle/format";
import {
  balanceProv,
  entryApyProv,
  impliedApyProv,
  lpSplitProv,
  maturityProv,
  rewardProv,
  underlyingProv,
  valueProv,
} from "@/lib/pendle/provenance";
import { UNDERLYING_LABEL_TIP, underlyingProtocol } from "@/lib/pendle/underlying";
import type { PendlePosition, PendleTimelineRow, PendleToken } from "@/lib/pendle/types";
import { pendleMarketHref } from "@/lib/pendle/routes";

/** Whether the wallet holds nothing in the market at the block. */
export function positionClosed(p: PendlePosition): boolean {
  const zero = (v: string | null) => v == null || v === "0";
  return (
    zero(p.balances.pt) &&
    zero(p.balances.yt) &&
    zero(p.balances.lp) &&
    zero(p.ytInterest.sy) &&
    p.rewards.yt.length === 0 &&
    p.rewards.lp.length === 0
  );
}

function TokenIcon({ tok, figure }: { tok: PendleToken; figure?: string }) {
  const symbol = symbolOf(tok);
  return (
    <AssetPopover symbol={symbol} address={tok.address} figure={figure}>
      <TokenChipIcon symbol={tok.symbol ?? ""} address={tok.address} size={16} filterable={false} untitled />
    </AssetPopover>
  );
}

/** The underlying protocol's Rails label, marked as one. */
export function UnderlyingLabel({ p }: { p: Pick<PendlePosition, "tokens"> }) {
  const label = underlyingProtocol(p.tokens.yieldToken.address);
  if (!label) return null;
  return (
    <RevealTip tip={UNDERLYING_LABEL_TIP} label={UNDERLYING_LABEL_TIP}>
      <span
        className="inline-flex items-center gap-1 rounded-full border border-rb-300 px-2 py-0.5 text-[11px] text-rb-500 dark:border-rb-700"
        data-pendle-underlying={label}
      >
        <Prov info={underlyingProv(label, p.tokens.yieldToken)} value={label}>
          {label}
        </Prov>
        <span className="text-rb-400">· Rails label</span>
      </span>
    </RevealTip>
  );
}

export function PendlePositionCard({
  p,
  block,
  timestamp,
  rows,
}: {
  p: PendlePosition;
  block: number;
  timestamp: number;
  /** The wallet's router events in this market, oldest first. */
  rows: PendleTimelineRow[];
}) {
  const t = p.tokens;
  const dec = assetDecimals(t);
  const asset = assetSymbol(t);
  const expired = p.maturity.expired === true;
  const closed = positionClosed(p);
  const lpToken: PendleToken = { ...t.market, symbol: `LP ${marketName(t)}` };

  const assetFig = (raw: string | null, prov: Parameters<typeof Prov>[0]["info"]) =>
    raw == null ? null : (
      <Prov info={prov} value={exact(raw, dec) ?? raw} symbol={asset}>
        {amountText(raw, dec)}
      </Prov>
    );

  const total = p.value.asset.total;
  const entry = p.apy.entry;
  const heads: PositionCardHead[] = [
    {
      id: "value",
      label: "Value",
      labelTip: `The PT, YT and LP legs and the unclaimed interest at their marks, in ${asset}.`,
      value: assetFig(total, valueProv("total", t, block, p.maturity.expired)),
      assets: <TokenIcon tok={t.asset} figure={total ? `${amountText(total, dec)} ${asset}` : undefined} />,
      sub: `in ${asset}`,
    },
    {
      id: "entry-apy",
      label: "Fixed APY at entry",
      labelTip:
        "The fixed rate this wallet's PT buys locked in: each buy's PT against the asset paid and the time left to maturity, weighted by the PT bought.",
      value:
        entry.ptWeighted == null ? null : (
          <Prov info={entryApyProv(entry.buys, entry.unpriced)} value={entry.ptWeighted.toFixed(6)}>
            {apyText(entry.ptWeighted)}
          </Prov>
        ),
      sub:
        entry.buys === 0
          ? "no PT bought through a router"
          : `${entry.buys} PT ${entry.buys === 1 ? "buy" : "buys"}${entry.unpriced ? `, ${entry.unpriced} unpriced` : ""}`,
    },
    {
      id: "implied-apy",
      label: "Implied APY now",
      labelTip: "The fixed rate the market prices PT at, at this block. It ends at maturity.",
      value:
        p.apy.current == null ? (
          expired ? (
            "Matured"
          ) : null
        ) : (
          <Prov info={impliedApyProv(t.market.address, block, null)} value={p.apy.current.toFixed(6)}>
            {apyText(p.apy.current)}
          </Prov>
        ),
      sub: expired ? "swaps closed at maturity" : "the market's rate",
    },
    {
      id: "maturity",
      label: "Maturity",
      value: (
        <Prov info={maturityProv(t.market.address, t.expiry, block)} value={String(t.expiry)}>
          {maturityDate(t.expiry)}
        </Prov>
      ),
      sub: maturityWords(t.expiry, timestamp),
    },
  ];

  const legRow = (
    id: "pt" | "yt" | "lp",
    label: string,
    tok: PendleToken,
    raw: string | null,
    valueRaw: string | null,
    leg: "PT" | "YT" | "LP",
    tip: string,
  ): PositionPanelRow => ({
    id,
    label,
    value:
      raw == null ? (
        "–"
      ) : (
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
          <PanelFigure>
            <Prov
              info={balanceProv(leg, tok, raw, block)}
              value={exact(raw, tok.decimals) ?? raw}
              symbol={symbolOf(tok)}
            >
              {amountText(raw, tok.decimals)}
            </Prov>
          </PanelFigure>
          {valueRaw != null && raw !== "0" && (
            <span>
              worth <PanelFigure>{assetFig(valueRaw, valueProv(leg, t, block, p.maturity.expired))}</PanelFigure>{" "}
              {asset}
            </span>
          )}
        </span>
      ),
    tip,
  });

  const rewards = [
    ...p.rewards.yt.map((r) => ({ ...r, side: "YT" as const })),
    ...p.rewards.lp.map((r) => ({ ...r, side: "LP" as const })),
  ];

  const left: PositionPanelRow[] = [
    legRow(
      "pt",
      "PT",
      t.pt,
      p.balances.pt,
      p.value.asset.pt,
      "PT",
      expired
        ? `Each PT now redeems for one ${asset}.`
        : `Each PT redeems for one ${asset} at maturity; before then it trades below that, which is the fixed yield.`,
    ),
    legRow(
      "yt",
      "YT",
      t.yt,
      p.balances.yt,
      p.value.asset.yt,
      "YT",
      expired
        ? "YT is worth nothing after maturity; its unclaimed interest stays claimable."
        : "YT earns the yield token's yield until maturity, then is worth nothing.",
    ),
    legRow(
      "lp",
      "LP",
      lpToken,
      p.balances.lp,
      p.value.asset.lp,
      "LP",
      expired
        ? "The pool's swaps closed at maturity; LP can still be removed."
        : "A share of the market's pool of PT and SY.",
    ),
  ];
  const right: PositionPanelRow[] = [];
  if (p.balances.lp && p.balances.lp !== "0" && p.lpSplit.pt != null && p.lpSplit.sy != null)
    right.push({
      id: "lp-split",
      label: "LP holds",
      value: (
        <Prov
          info={lpSplitProv(block)}
          value={`${exact(p.lpSplit.pt, t.pt.decimals)}|${exact(p.lpSplit.sy, t.sy.decimals)}`}
        >
          <PanelFigure>{amountText(p.lpSplit.pt, t.pt.decimals)}</PanelFigure> PT and{" "}
          <PanelFigure>{amountText(p.lpSplit.sy, t.sy.decimals)}</PanelFigure> SY
        </Prov>
      ),
      tip: "The pool's PT and SY in proportion to this wallet's LP.",
    });
  right.push({
    id: "interest",
    label: "Unclaimed interest",
    value:
      p.ytInterest.asset == null ? (
        "–"
      ) : (
        <span>
          <PanelFigure>{assetFig(p.ytInterest.asset, valueProv("interest", t, block, p.maturity.expired))}</PanelFigure>{" "}
          {asset}
        </span>
      ),
    tip: "The yield this wallet's YT has earned and not yet claimed.",
  });
  right.push({
    id: "rewards",
    label: "Unclaimed rewards",
    value:
      rewards.length === 0 ? (
        "none"
      ) : (
        <span className="inline-flex flex-col gap-0.5">
          {rewards.map((r) => (
            <span key={`${r.side}:${r.token}`}>
              <PanelFigure>
                <Prov
                  info={rewardProv(r.symbol ?? "reward token", r.side, r.amount, r.decimals, block)}
                  value={exact(r.amount, r.decimals) ?? r.amount}
                  symbol={r.symbol ?? undefined}
                >
                  {amountText(r.amount, r.decimals)}
                </Prov>
              </PanelFigure>{" "}
              {r.symbol ?? "tokens"} on {r.side}
            </span>
          ))}
        </span>
      ),
    tip: "Rewards the market pays to LP and YT holders, accrued and not yet claimed.",
  });

  const first = rows[0];
  const last = rows[rows.length - 1];

  const explanation = (
    <div className="space-y-2 text-sm leading-relaxed" data-pendle-explanation="">
      <p>
        This market splits {symbolOf(t.yieldToken)} into a principal token (PT) and a yield token (YT), and pools PT
        with SY, Pendle&rsquo;s wrapper of {symbolOf(t.yieldToken)}, for trading. It matures on {maturityDate(t.expiry)}
        .
      </p>
      {expired ? (
        <p>
          The market has matured: each PT redeems for one {asset}, YT is worth nothing and keeps any interest it had not
          claimed, swaps are closed, and LP can still be removed.
        </p>
      ) : (
        <p>
          Before maturity PT trades below one {asset}; the gap is the fixed yield a buyer locks in. YT collects the
          yield until maturity. LP earns the pool&rsquo;s fees and rewards.
        </p>
      )}
      <p>
        Every figure is read at block {block.toLocaleString("en-US")}. The legs are valued at{" "}
        {p.marks.source === "oracle-twap"
          ? `Pendle's oracle, a ${p.marks.twapSeconds / 60}-minute average`
          : p.marks.source === "routerstatic-spot"
            ? "RouterStatic's spot rate, since Pendle's oracle does not yet hold enough observations on this market"
            : "no mark, because neither the oracle nor RouterStatic answered"}
        , in SY, then in {asset} at the SY&rsquo;s exchange rate.
      </p>
      {entry.buys > 0 && entry.ptWeighted != null && (
        <p>
          This wallet bought {amountText(entry.ptBought, t.pt.decimals)} PT through Pendle&rsquo;s routers for{" "}
          {amountText(entry.assetPaid, dec)} {asset}, a fixed {apyText(entry.ptWeighted)} a year to maturity
          {p.apy.current != null ? `; the market prices PT at ${apyText(p.apy.current)} now` : ""}.
        </p>
      )}
    </div>
  );

  const menu = {
    leading: () => (
      <ToolsMenuItem
        icon={<Store size={16} />}
        title="Open the market"
        subtitle={marketName(t)}
        href={pendleMarketHref(t.market.address)}
        item="pendle-market"
      />
    ),
    exports: null,
  };

  const identity = (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Link
        href={pendleMarketHref(t.market.address)}
        className="text-xs font-semibold text-foreground hover:underline"
        data-pendle-market-link={t.market.address}
      >
        {marketName(t)}
      </Link>
      <UnderlyingLabel p={p} />
    </span>
  );

  const counters = { lastActivityAt: last?.timestamp ?? null, eventCount: rows.length, eventCountNoun: "router event" };

  const slots: PositionCardSlots = closed
    ? {
        surface: "detail",
        status: { word: expired ? "Matured" : "Closed", tone: "muted" },
        identity,
        heads: [heads[1], heads[3]],
        outcome: {
          word: "Closed",
          dates: [
            ...(first ? [{ label: "First router event", at: first.timestamp }] : []),
            ...(last ? [{ label: "Last router event", at: last.timestamp }] : []),
          ],
          tip: "This wallet holds no PT, YT or LP in the market and has no interest or rewards to claim at this block.",
        },
        counters,
        heading: "position explanation",
        explainer: { body: explanation },
        learnMore: null,
        menu,
      }
    : {
        surface: "detail",
        status: expired
          ? {
              word: "Matured",
              tone: "muted",
              tip: `PT redeems for one ${asset}; YT is worth nothing; LP can be removed.`,
            }
          : null,
        identity,
        heads,
        counters,
        heading: "position explanation",
        explainer: { body: explanation },
        learnMore: null,
        menu,
        panel: [left, right],
      };
  return (
    <div data-pendle-position={t.market.address}>
      <PositionCard slots={slots} />
    </div>
  );
}
