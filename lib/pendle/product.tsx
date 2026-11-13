"use client";

// Pendle's markets on the product shells (rails-ops ui-jobs 549 step 8;
// decisions 0043 and 0059).
//
//   • The roster (R1, /ethereum/pendle/markets): one head for the protocol
//     (Markets, Active, Matured), then the markets table with its toolbar
//     (R1.2, components/protocol/pendle/pendle-roster.tsx).
//   • A market's page (R2, /ethereum/pendle/markets/<market>): the head on the
//     vitals band (Liquidity, Implied APY, PT price, Maturity; YT, LP and SY in the
//     `tokens` structure), how the market is built (M2), its pool (M2.1), then
//     its router events (P3), each section with its own ⋮.
//
// Pendle's words stay where the measure is Pendle's: Implied APY, PT price, YT
// price, LP price, SY exchange rate, Maturity. The size is the docs' "Liquidity"
// (lib/pendle/words.ts; ui-jobs 654).
// Every read is rails-server's at the chain's finalized block; the addresses
// sit in receipts and the ⋮s.

import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { rowAssetKeys } from "@/lib/shared/focus-row-keys";
import type { ReactNode } from "react";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { readStampProv, type ReadContract } from "@/components/shared/read-stamp";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { AssetUnit } from "@/components/shared/asset-unit";
import { MarketPage } from "@/components/shared/product/market-page";
import { RevealTip } from "@/components/shared/reveal-tip";
import { ProductHeadSection } from "@/components/shared/product/product-head";
import { SubPageHeader } from "@/components/shared/sub-page-header";
import { PositionReadProvider } from "@/components/shared/position-read";
import type { SectionMenuLink } from "@/components/shared/section-menu";
import { PendleRosterTable } from "@/components/protocol/pendle/pendle-roster";
import { PendleTokenStrip } from "@/components/protocol/pendle/pendle-token-strip";
import { PendleMarketEvents } from "@/components/protocol/pendle/pendle-market-events";
import { UnderlyingLabel } from "@/components/protocol/pendle/pendle-position-card";
import { explorerUrl } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import {
  PENDLE_CHAIN_ID,
  PENDLE_ORACLE,
  PENDLE_ROUTER_STATIC,
  amountText,
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  marketName,
  maturityDate,
  maturityWords,
  symbolOf,
  unitRate,
} from "@/lib/pendle/format";
import {
  impliedApyProv,
  maturityProv,
  poolStateProv,
  priceProv,
  rosterCountProv,
  syRateProv,
  tvlProv,
} from "@/lib/pendle/provenance";
import { LP_SYMBOL_NOTE, PENDLE_WORDS as W, emptyPool, marketTitleWithAsset } from "@/lib/pendle/words";
import type { PendleMarketPage, PendleRoster, PendleTokenMeta } from "@/lib/pendle/types";
import type { Loadable, MarketModel, ProductHead, ProductSection } from "@/lib/shared/product/model";

// ── Words ────────────────────────────────────────────────────────────────────

const ROOT = "/ethereum/pendle";
const DOCS = "https://docs.pendle.finance";
const n = (v: number) => v.toLocaleString("en-US");

// "Up to one": a PT redeems for one unit of the accounting asset (Pendle's docs,
// PT) unless the SY's exchange rate sits under the watermark the YT stored, when
// it redeems for less (Negative Yield; Yield Tokenization: pyIndexCurrent =
// max(SY.exchangeRate(), pyIndexStored)). Read 13 Nov 2026 at block 26,405,972:
// both rates equal or the exchange rate above on apyUSD-5NOV2026 and
// stETH-30DEC2027 (rails-ops reference/official-docs/pendle.md). "No longer
// trades": RouterStatic.swapExactSyForPtStatic on the matured apyUSD-5NOV2026
// market reverts with MarketExpired() at that block.
const TIP = {
  markets: "Every market Pendle's routers have named",
  active: "Markets before their maturity, of all markets",
  matured: "Markets past their maturity, where each PT redeems for up to one unit of its asset",
  tvl: "The pool's SY plus its PT at the PT's price, in the market's asset",
  empty: "The pool holds under 0.000001 SY, so no trade sets a rate: the stored rate is its last trade's",
  apy: "Pendle's docs: the market consensus of the future APY of an asset, from the ratio of the YT price to the PT price",
  pt: "What one PT is worth in the market's asset; it reaches one at maturity",
  yt: "What one YT is worth in the market's asset; it collects the yield until maturity",
  lp: `What one LP is worth in the market's asset: a share of the pool's PT and SY. ${LP_SYMBOL_NOTE}`,
  sy: "The SY's exchange rate: what one SY is worth in the market's asset. SY is Pendle's wrapper of the yield-bearing token",
};

const about: SectionMenuLink = {
  item: "about",
  title: "About this explorer",
  subtitle: "How Rails reads Pendle",
  href: `${ROOT}/info`,
  internal: true,
};
const docs: SectionMenuLink = {
  item: "docs",
  title: "Pendle's docs",
  subtitle: "Markets, PT and YT",
  href: `${DOCS}/pendle-v2/ProtocolMechanics/YieldTokenization/PT`,
};

/** The stamp's receipt: rails-server's read at the chain's finalized block. */
function stampProv(block: number, at: number | null, what: string, contracts: ReadContract[]): Provenance {
  const p = readStampProv({ chainId: PENDLE_CHAIN_ID, block, at, what, contracts });
  const time = at == null ? "" : ` (${new Date(at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC)`;
  return {
    ...p,
    summary: `${what} was read at block ${n(block)}${time}, the chain's finalized block, through rails-server's read of the chain. The stamp shows the block's time.`,
  };
}

/** A figure in the market's asset, its mark after it. */
function InAsset({ symbol, address, children }: { symbol: string; address: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span>{children}</span>
      <AssetUnit symbol={symbol} address={address} />
    </span>
  );
}

const priceText = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 4 });

// ── The roster (R1) ──────────────────────────────────────────────────────────

function RosterExplainer({ total, active, matured }: { total: number; active: number; matured: number }) {
  return (
    <>
      <ExplainGroup title="The markets">
        <ExplainBullet>
          Pendle&rsquo;s routers have named <Fig bold>{n(total)}</Fig> markets on Ethereum.
        </ExplainBullet>
        <ExplainBullet>
          <Fig bold>{n(active)}</Fig> markets are active: their PT trades below one unit of the asset until maturity.
        </ExplainBullet>
        <ExplainBullet>
          <Fig bold>{n(matured)}</Fig> markets have matured: each PT redeems for up to one unit of the asset, and the
          pool no longer trades.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Reading the table">
        <ExplainBullet>The table opens on the active markets; its Maturity filter shows the rest.</ExplainBullet>
        <ExplainBullet>
          Liquidity and PT price are in each market&rsquo;s asset, so they compare only between markets of one asset.
        </ExplainBullet>
      </ExplainGroup>
    </>
  );
}

export function PendleRosterPage({
  roster,
  at,
  initialSearch,
}: {
  roster: PendleRoster;
  at: number;
  initialSearch: string;
}) {
  // Focus (ui-jobs 557): the markets whose tokens (PT, YT, SY, the yield
  // token, the LP) are in focus; the head still counts the whole roster.
  const scoped = useScopedRows(
    roster.markets,
    (m) => rowAssetKeys(m.tokens, PENDLE_CHAIN_ID),
    () => PENDLE_CHAIN_ID,
  );
  const block = roster.block;
  const total = roster.markets.length;
  const active = roster.markets.filter((m) => m.expired === false).length;
  const matured = total - active;
  const count = (which: "all" | "active" | "matured", v: number, hook: string) => (
    <span data-vital={hook}>
      <Prov info={rosterCountProv(which, v, block)} value={String(v)}>
        {n(v)}
      </Prov>
    </span>
  );
  const head: ProductHead = {
    scope: "markets-head",
    title: "Pendle on Ethereum",
    purpose:
      "Each market splits a yield-bearing token into PT, which redeems for up to one unit of its asset at maturity, and YT, which collects the yield until then.",
    figures: [
      { slot: "roster", label: "Markets", tip: TIP.markets, value: count("all", total, "markets") },
      { slot: "usage", label: "Active", tip: TIP.active, value: count("active", active, "active") },
      { slot: "population", label: "Matured", tip: TIP.matured, value: count("matured", matured, "matured") },
    ],
    readAt:
      block > 0
        ? {
            chainId: PENDLE_CHAIN_ID,
            block,
            receipt: (t) =>
              stampProv(block, t, "Every figure on this page", [
                {
                  name: "Each Pendle market",
                  address: roster.markets[0]?.tokens.market.address ?? PENDLE_ROUTER_STATIC,
                  reads: "readState(router), expiry(), isExpired()",
                },
                { name: "Pendle RouterStatic", address: PENDLE_ROUTER_STATIC, reads: "getPtToSyRate(market)" },
              ]),
          }
        : null,
    tools: {
      links: [
        about,
        {
          item: "router-static",
          title: "RouterStatic on Etherscan",
          subtitle: "The contract each PT price is read through",
          href: explorerUrl(PENDLE_CHAIN_ID, "address", PENDLE_ROUTER_STATIC),
        },
        docs,
      ],
    },
    explainer: {
      body: <RosterExplainer total={total} active={active} matured={matured} />,
      label: "roster explanation",
    },
    learnMore: null,
    anatomy: "M4",
    hooks: { "data-pendle-roster-head": "" },
  };
  return (
    <div className="min-h-screen" data-anatomy="R1">
      <div className="py-8">
        <SubPageHeader protocol={protocolForHref(ROOT)!} title="Markets" />
        <ProductHeadSection head={head} titled={false} />
        <ScopeNote scoped={scoped} noun={["market", "markets"]} className="mb-2" />
        <div {...scoped.listProps}>
          <PendleRosterTable roster={{ ...roster, markets: scoped.rows }} at={at} initialSearch={initialSearch} />
        </div>
      </div>
    </div>
  );
}

// ── A market's page (R2) ─────────────────────────────────────────────────────

interface Ctx {
  m: PendleMarketPage;
  asset: string;
  assetAddress: string;
  expired: boolean;
  tvl: string | null;
  apy: number | null;
  pt: number | null;
  yt: number | null;
  lp: number | null;
  sy: number | null;
  spot: boolean;
  /** An empty pool (lib/pendle/words.ts emptyPool): no implied APY shown. */
  empty: boolean;
}

function ctxOf(m: PendleMarketPage): Ctx {
  const t = m.tokens;
  const live = m.live;
  const dec = assetDecimals(t);
  const marks = live.marks;
  const expired = live.expired === true;
  return {
    m,
    asset: assetSymbol(t),
    assetAddress: t.asset.address,
    expired,
    tvl: live.tvl?.asset == null ? null : amountText(live.tvl.asset, dec),
    apy: live.impliedApy,
    pt: expired ? 1 : unitRate(marks.ptToAsset, t.pt.decimals, dec),
    yt: expired ? 0 : unitRate(marks.ytToAsset, t.yt.decimals, dec),
    lp: unitRate(marks.lpToAsset, t.market.decimals, dec),
    sy: unitRate(marks.syToAsset, t.sy.decimals, dec),
    spot: !expired && marks.source === "routerstatic-spot",
    empty: !expired && emptyPool(live.tvl, t.sy.decimals),
  };
}

function MarketExplainer({ x }: { x: Ctx }) {
  const t = x.m.tokens;
  const a = x.asset;
  const yieldToken = symbolOf(t.yieldToken);
  const date = maturityDate(t.expiry);
  const tokens = (
    <ExplainGroup title="Tokens">
      {x.yt != null && (
        <ExplainBullet>
          {x.expired ? (
            <>
              One YT is worth <Fig bold>0 {a}</Fig> after maturity; yield it earned stays claimable.
            </>
          ) : (
            <>
              One YT is worth{" "}
              <Fig bold>
                {priceText(x.yt)} {a}
              </Fig>{" "}
              and collects the yield of {yieldToken} until maturity.
            </>
          )}
        </ExplainBullet>
      )}
      {x.lp != null && (
        <ExplainBullet>
          One LP is worth{" "}
          <Fig bold>
            {priceText(x.lp)} {a}
          </Fig>
          , a share of the pool&rsquo;s PT and SY.
        </ExplainBullet>
      )}
      {x.sy != null && (
        <ExplainBullet>
          One SY, Pendle&rsquo;s wrapper of {yieldToken}, is worth{" "}
          <Fig bold>
            {priceText(x.sy)} {a}
          </Fig>
          .
        </ExplainBullet>
      )}
    </ExplainGroup>
  );
  if (x.expired)
    return (
      <>
        <ExplainGroup title="This market">
          <ExplainBullet>
            This market matured on <Fig bold>{date}</Fig>, and its pool no longer trades.
          </ExplainBullet>
          {x.tvl != null && (
            <ExplainBullet>
              The pool still holds{" "}
              <Fig bold>
                {x.tvl} {a}
              </Fig>{" "}
              of PT and SY, which LP holders can remove.
            </ExplainBullet>
          )}
          <ExplainBullet>The implied APY ends at maturity, so the market prices no fixed rate.</ExplainBullet>
          <ExplainBullet>
            One PT redeems for up to <Fig bold>1 {a}</Fig>.
          </ExplainBullet>
        </ExplainGroup>
        {tokens}
      </>
    );
  return (
    <>
      <ExplainGroup title="This market">
        {x.tvl != null && (
          <ExplainBullet>
            This market&rsquo;s pool holds{" "}
            <Fig bold>
              {x.tvl} {a}
            </Fig>{" "}
            of PT and SY.
          </ExplainBullet>
        )}
        {x.empty && <ExplainBullet>The pool is empty, so it prices no implied APY.</ExplainBullet>}
        {x.apy != null && !x.empty && (
          <ExplainBullet>
            The implied APY is <Fig bold>{apyText(x.apy)}</Fig>: by Pendle&rsquo;s docs, the market&rsquo;s consensus of
            the future APY of {yieldToken}.
          </ExplainBullet>
        )}
        {x.pt != null && (
          <ExplainBullet>
            One PT is worth{" "}
            <Fig bold>
              {priceText(x.pt)} {a}
            </Fig>{" "}
            and redeems for up to one {a} at maturity.
          </ExplainBullet>
        )}
        <ExplainBullet>
          The market matures on <Fig bold>{date}</Fig>, {maturityWords(t.expiry, x.m.timestamp)}.
        </ExplainBullet>
      </ExplainGroup>
      {tokens}
      {x.spot && (
        <ExplainGroup title="Prices">
          <ExplainBullet>
            The prices are the pool&rsquo;s spot rates: Pendle&rsquo;s 15-minute average is not ready on this market.
          </ExplainBullet>
        </ExplainGroup>
      )}
    </>
  );
}

function marketMarkdown(x: Ctx): string {
  const t = x.m.tokens;
  const a = x.asset;
  return [
    `# ${marketName(t)}, a Pendle market on Ethereum`,
    "",
    ...(x.tvl != null ? [`- Liquidity: ${x.tvl} ${a}`] : []),
    `- Implied APY: ${x.apy == null || x.empty ? "none" : apyText(x.apy)}`,
    ...(x.pt != null ? [`- PT price: ${priceText(x.pt)} ${a}`] : []),
    ...(x.yt != null ? [`- YT price: ${priceText(x.yt)} ${a}`] : []),
    ...(x.lp != null ? [`- LP price: ${priceText(x.lp)} ${a}`] : []),
    ...(x.sy != null ? [`- SY exchange rate: ${priceText(x.sy)} ${a}`] : []),
    `- Maturity: ${maturityDate(t.expiry)}${x.expired ? " (matured)" : ""}`,
    `- Yield-bearing token: ${symbolOf(t.yieldToken)} ${t.yieldToken.address}`,
    `- SY ${t.sy.address}, PT ${t.pt.address}, YT ${t.yt.address}, market (LP) ${t.market.address}`,
    "",
    `Read from Ethereum at block ${n(x.m.block)}.`,
  ].join("\n");
}

const NONE = <span className="text-rb-500">none</span>;

function headOf(x: Ctx): ProductHead {
  const m = x.m;
  const t = m.tokens;
  const marks = m.live.marks;
  const block = m.block;
  const dec = assetDecimals(t);
  const a = x.asset;
  const price = (leg: "PT" | "YT" | "LP", v: number | null) =>
    v == null ? (
      NONE
    ) : (
      <InAsset symbol={a} address={x.assetAddress}>
        <Prov info={priceProv(leg, marks.source, marks.twapSeconds, block, a, x.expired)} value={String(v)}>
          {priceText(v)}
        </Prov>
      </InAsset>
    );
  const contracts: ReadContract[] = [
    {
      name: "Pendle market",
      address: t.market.address,
      reads: "readState(router), expiry(), isExpired(), totalSupply(), getRewardTokens()",
    },
    { name: symbolOf(t.sy), address: t.sy.address, reads: "exchangeRate()" },
    marks.source === "oracle-twap"
      ? {
          name: "PendlePYLpOracle",
          address: PENDLE_ORACLE,
          reads: `getPtToSyRate, getYtToSyRate, getLpToSyRate (market, ${marks.twapSeconds})`,
        }
      : {
          name: "Pendle RouterStatic",
          address: PENDLE_ROUTER_STATIC,
          reads: "getPtToSyRate, getYtToSyRate, getLpToSyRate (market)",
        },
  ];
  return {
    scope: "market-head",
    title: marketTitleWithAsset(marketName(t), a),
    subtitle: (
      <div
        className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-rb-500"
        data-pendle-market-line=""
      >
        {x.expired && (
          <span
            className="rounded-full border border-rb-300 px-2 py-0.5 text-[11px] dark:border-rb-700"
            data-pendle-status="matured"
          >
            Matured
          </span>
        )}
        <UnderlyingLabel p={m} />
        <span>
          Splits {symbolOf(t.yieldToken)} into PT and YT; PT redeems for up to one {a} at maturity
        </span>
      </div>
    ),
    figures: [
      {
        slot: "sizeIn",
        label: W.liquidity,
        tip: TIP.tvl,
        value: (
          <span data-vital="tvl">
            {x.tvl == null || m.live.tvl?.asset == null ? (
              NONE
            ) : (
              <InAsset symbol={a} address={x.assetAddress}>
                <Prov
                  info={tvlProv(t.market.address, block)}
                  value={exact(m.live.tvl.asset, dec) ?? m.live.tvl.asset}
                  symbol={a}
                >
                  {x.tvl}
                </Prov>
              </InAsset>
            )}
          </span>
        ),
      },
      {
        slot: "rateIn",
        label: "Implied APY",
        tip: TIP.apy,
        value: (
          <span data-vital="implied-apy">
            {x.empty ? (
              <RevealTip tip={TIP.empty} label={`${W.noLiquidity}: ${TIP.empty}`} focusable wrap>
                <span className="text-rb-500">—</span>{" "}
                <span className="tip-underline text-[11px] font-normal text-rb-500" data-pendle-empty="">
                  {W.noLiquidity}
                </span>
              </RevealTip>
            ) : x.apy == null ? (
              <span className="text-rb-500">{x.expired ? "matured" : "none"}</span>
            ) : (
              <Prov
                info={impliedApyProv(t.market.address, block, m.live.state?.lastLnImpliedRate ?? null)}
                value={x.apy.toFixed(6)}
              >
                {apyText(x.apy)}
              </Prov>
            )}
          </span>
        ),
      },
      { slot: "price", label: "PT price", tip: TIP.pt, value: <span data-vital="pt-price">{price("PT", x.pt)}</span> },
      {
        slot: "term",
        label: "Maturity",
        value: (
          <span data-vital="maturity">
            <Prov info={maturityProv(t.market.address, t.expiry, block)} value={String(t.expiry)}>
              {maturityDate(t.expiry)}
            </Prov>
            <span className="block text-[11px] font-normal text-rb-500">{maturityWords(t.expiry, m.timestamp)}</span>
          </span>
        ),
      },
    ],
    structure: {
      kind: "tokens",
      yt: { label: W.ytPrice, tip: TIP.yt, value: price("YT", x.yt), hooks: { "data-pendle-price": "yt" } },
      lp: { label: W.lpPrice, tip: TIP.lp, value: price("LP", x.lp), hooks: { "data-pendle-price": "lp" } },
      sy: {
        label: W.syRate,
        tip: TIP.sy,
        hooks: { "data-pendle-price": "sy" },
        value:
          x.sy == null ? (
            NONE
          ) : (
            <InAsset symbol={a} address={x.assetAddress}>
              <Prov info={syRateProv(t.sy, block, a)} value={marks.syToAsset ?? ""}>
                {priceText(x.sy)}
              </Prov>
            </InAsset>
          ),
      },
    },
    notes: x.spot ? (
      <span data-pendle-spot="">Spot prices: Pendle&rsquo;s 15-minute average is not ready on this market</span>
    ) : undefined,
    readAt:
      block > 0
        ? {
            chainId: PENDLE_CHAIN_ID,
            block,
            blockTime: m.timestamp,
            receipt: (at) => stampProv(block, at, `Every figure on the ${marketName(t)} market`, contracts),
          }
        : null,
    tools: {
      links: [
        {
          item: "markets",
          title: "All Pendle markets",
          subtitle: "Every market Pendle's routers have named",
          href: `${ROOT}/markets`,
          internal: true,
        },
        about,
        {
          item: "market",
          title: "Market on Etherscan",
          subtitle: "The market contract, which is also its LP token",
          href: explorerUrl(PENDLE_CHAIN_ID, "address", t.market.address),
        },
        docs,
      ],
      exports: { markdown: { build: () => marketMarkdown(x), copySubtitle: "This market as Markdown, for an LLM" } },
    },
    explainer: { body: <MarketExplainer x={x} />, label: "market explanation" },
    learnMore: null,
    hooks: { "data-pendle-market-card": t.market.address },
    bandHooks: { "data-pendle-market-band": "" },
  };
}

function Term({ term, title, children }: { term: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1" title={title}>
      <dt className="text-[13px] text-rb-500">{term}</dt>
      <dd className="text-right text-[13px] tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

function Pool({ x }: { x: Ctx }) {
  const m = x.m;
  const t = m.tokens;
  const s = m.live.state;
  const fig = (what: "PT in the pool" | "SY in the pool" | "LP supply", raw: string | null, dec: number | null) =>
    raw == null ? (
      NONE
    ) : (
      <Prov info={poolStateProv(what, t.market.address, m.block)} value={exact(raw, dec) ?? ""}>
        {amountText(raw, dec)}
      </Prov>
    );
  return (
    <dl className="divide-y divide-rb-200 dark:divide-rb-800" data-pendle-pool="">
      <Term term="PT in the pool" title="The PT the pool holds, in PT">
        {fig("PT in the pool", s?.totalPt ?? null, t.pt.decimals)} PT
      </Term>
      <Term term="SY in the pool" title="The SY the pool holds, in SY">
        {fig("SY in the pool", s?.totalSy ?? null, t.sy.decimals)} SY
      </Term>
      <Term term="LP supply" title="Every LP token issued on the pool">
        {fig("LP supply", m.live.lpSupply, 18)} LP
      </Term>
    </dl>
  );
}

function sectionsOf(x: Ctx): ProductSection[] {
  const t = x.m.tokens;
  const token = (item: string, title: string, subtitle: string, address: string): SectionMenuLink => ({
    item,
    title: `${title} on Etherscan`,
    subtitle,
    href: explorerUrl(PENDLE_CHAIN_ID, "address", address),
  });
  return [
    {
      scope: "market-tokens",
      anatomy: "M2",
      title: "How the market is built",
      hooks: { "data-pendle-strip": "" },
      tools: {
        links: [
          token("yield-token", symbolOf(t.yieldToken), "The yield-bearing token", t.yieldToken.address),
          token("sy", symbolOf(t.sy), "The SY", t.sy.address),
          token("pt", symbolOf(t.pt), "The PT", t.pt.address),
          token("yt", symbolOf(t.yt), "The YT", t.yt.address),
        ],
      },
      body: <PendleTokenStrip m={x.m} />,
    },
    {
      scope: "market-pool",
      anatomy: "M2.1",
      title: "Pool",
      raised: "narrow",
      tools: {
        links: [
          {
            item: "market",
            title: "Market on Etherscan",
            subtitle: "The pool's contract",
            href: explorerUrl(PENDLE_CHAIN_ID, "address", t.market.address),
          },
        ],
      },
      body: <Pool x={x} />,
    },
  ];
}

export function PendleMarketProductPage({
  m,
  meta,
  initialSearch,
}: {
  m: PendleMarketPage;
  /** The outside tokens' symbols and decimals (lib/sources/api/pendle.ts outsideTokenMeta). */
  meta: Record<string, PendleTokenMeta>;
  initialSearch: string;
}) {
  const x = ctxOf(m);
  const market: Loadable<MarketModel> = { state: "ok", data: { head: headOf(x), sections: sectionsOf(x) } };
  return (
    <MarketPage
      header={{ protocol: protocolForHref(ROOT)!, title: marketTitleWithAsset(marketName(m.tokens), x.asset) }}
      market={market}
      what={`the ${marketName(m.tokens)} market`}
      hooks={{ "data-pendle-market-page": m.tokens.market.address }}
      focusSource={m.tokens}
    >
      <PositionReadProvider read={{ kind: "chain", block: m.block, at: m.timestamp }}>
        <PendleMarketEvents m={m} initialMeta={meta} initialSearch={initialSearch} />
      </PositionReadProvider>
    </MarketPage>
  );
}
