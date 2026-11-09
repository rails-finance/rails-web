"use client";

// An Aave V4 spoke reserve's page (anatomy M3, ui-jobs 548): one asset on one
// spoke, drawn from one hub, at /<chain>/aave-v4/markets/<spoke>/<asset>[?hub=],
// mapped into the shared A3 shell (components/shared/product/reserve-page.tsx).
//   head (M3.1, M3.2): the symbol, its state tags, "A reserve of the <spoke>
//        spoke, drawn from the <hub> hub"; the band Supplied and Borrowed (this
//        spoke, the hub's total under each), Available, Supply rate, Borrow rate
//        and Utilisation (the hub), each figure naming its side;
//   M3.3 the rate curve, the hub strategy's constants and the premium;
//   M3.4 the hub asset's daily drawn rate; M3.5 the spoke's and the hub's
//        parameters; M3.6 one line (no store holds V4 config history);
//   M3.7, M3.8 the largest suppliers and borrowers of this spoke reserve.
// The head is one read (`/api/at-block/aave-v4/reserve`); a token the spoke lists
// from two hubs needs `?hub=`, and without it the page asks which.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import { readStampProv } from "@/components/shared/read-stamp";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { RailHeader } from "@/components/shared/rail-header";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { RateCurve } from "@/components/shared/product/rate-curve";
import { HoldersTable } from "@/components/shared/product/position-entry";
import { ReservePage, type ReservePageData } from "@/components/shared/product/reserve-page";
import { AaveV4DrawnRateHistory, type HistorySpan } from "@/components/protocol/aave-v4/aave-v4-drawn-rate-history";
import {
  useV4Read,
  type V4History,
  type V4Holders,
  type V4Read,
  type V4ReserveHead,
} from "@/lib/api/fetch-aave-v4-reserve";
import { aaveV4Modal } from "@/lib/aave-v4/event-templates";
import {
  hubsHref,
  isV4HubKey,
  settleHead,
  spokeHref,
  spokePositionsHref,
  v4Deployment,
  V4_HUB_LABEL,
  type V4Deployment,
  type V4Line,
  type V4ReserveFigures,
  type V4Spoke,
} from "@/lib/aave-v4/markets";
import {
  availableProv,
  curveProv,
  drawnRateProv,
  headValueProv,
  holderAmountProv,
  supplyRateProv,
  utilisationProv,
} from "@/lib/aave-v4/market-provenance";
import {
  amountText,
  pctText,
  V4Parameters,
  V4StateTags,
  type V4Names,
} from "@/components/protocol/aave-v4/aave-v4-market-parts";
import { headQuery, namesOf, PREMIUM_LINE, protocolOf, RATE_TIP, useV4Stored } from "@/lib/aave-v4/product";
import { chainMeta } from "@/lib/shared/chains";
import { formatCompactTitled } from "@/lib/shared/format-compact";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import type { Loadable, ProductHead, ProductSection, RateCurveModel, Missing } from "@/lib/shared/product/model";
import type { SectionMenuLink } from "@/components/shared/section-menu";

const NOTE = "text-[13px] text-rb-500";
const SUB = "block text-[11px] font-normal text-rb-500";
/** A deficit at or above this share of the hub's supply is shown under Available. */
const DEFICIT_SHOWN_SHARE = 0.0001;

const csvRows = (head: string[], rows: (string | number | null)[][]) =>
  [head, ...rows].map((r) => r.map((v) => (v == null ? "" : String(v))).join(",")).join("\n");

/** "of 340M on Core": the hub's total under a spoke figure. */
function hubTotal(f: V4ReserveFigures, tokens: number, names: V4Names) {
  const a = amountText(tokens, f.price, names.symbol);
  return (
    <span className={SUB} title={a.title}>
      of {a.display} on {names.hub}
    </span>
  );
}

function curveOf(f: V4ReserveFigures, names: V4Names): RateCurveModel | Missing {
  if (!f.curve || f.drawnApr == null) return { missing: "Curve not read for this hub asset." };
  return {
    ...f.curve,
    reserveFactor: f.liquidityFee ?? 0,
    premium: f.premiumRatio,
    now: { utilisation: f.utilisation, borrow: f.drawnApr, supply: f.supplyApr ?? 0 },
    symbol: names.symbol,
    receipt: curveProv(f, names),
  };
}

function ReserveExplainer({ f, names }: { f: V4ReserveFigures; names: V4Names }) {
  const usd = (n: number) => amountText(n, f.price, names.symbol).display;
  return (
    <>
      <ExplainGroup title="This reserve">
        <ExplainBullet>
          {names.spoke} has added <Fig bold>{usd(f.spokeSupplied)}</Fig> of {names.symbol} to the {names.hub} hub and
          owes it <Fig bold>{usd(f.spokeBorrowed)}</Fig>.
        </ExplainBullet>
        <ExplainBullet>
          Across every spoke, the {names.hub} hub holds <Fig bold>{usd(f.hubSupplied)}</Fig> and has lent{" "}
          <Fig bold>{usd(f.hubBorrowed)}</Fig>.
        </ExplainBullet>
        <ExplainBullet>
          <Fig bold>{usd(f.available)}</Fig> is available for this spoke to draw now.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Rates">
        {f.drawnApr != null && (
          <ExplainBullet>
            Borrowers pay the drawn rate, <Fig bold>{ratePercentText(f.drawnApr)}</Fig> a year, {PREMIUM_LINE}.
          </ExplainBullet>
        )}
        {f.supplyApr != null && (
          <ExplainBullet>
            Suppliers earn <Fig bold>{ratePercentText(f.supplyApr)}</Fig> a year: the drawn interest and the premium,
            less the {f.liquidityFee != null ? pctText(f.liquidityFee) : ""} liquidity fee.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Collateral">
        {f.collateralFactor != null ? (
          <ExplainBullet>
            {names.spoke} counts {pctText(f.collateralFactor)} of a wallet&apos;s {names.symbol} toward what it can
            borrow.
          </ExplainBullet>
        ) : (
          <ExplainBullet>
            Holding {names.symbol} adds nothing to what a wallet can borrow on {names.spoke}.
          </ExplainBullet>
        )}
        {f.frozen && <ExplainBullet>The reserve is frozen: no new supply or borrowing.</ExplainBullet>}
        {f.paused && <ExplainBullet>The reserve is paused: every action is suspended.</ExplainBullet>}
      </ExplainGroup>
    </>
  );
}

function reserveMarkdown(d: V4Deployment, f: V4ReserveFigures, names: V4Names): string {
  const usd = (n: number) => amountText(n, f.price, names.symbol).display;
  return [
    `# ${names.symbol}, a reserve of the ${names.spoke} spoke, drawn from the ${names.hub} hub`,
    "",
    `- Supplied (this spoke): ${usd(f.spokeSupplied)} of ${usd(f.hubSupplied)} on ${names.hub}`,
    `- Borrowed (this spoke): ${usd(f.spokeBorrowed)} of ${usd(f.hubBorrowed)} on ${names.hub}`,
    `- Available (hub): ${usd(f.available)}`,
    ...(f.supplyApr != null ? [`- Supply rate (hub): ${ratePercentText(f.supplyApr)} APR`] : []),
    ...(f.drawnApr != null ? [`- Borrow rate (hub): ${ratePercentText(f.drawnApr)} APR, ${PREMIUM_LINE}`] : []),
    ...(f.utilisation != null ? [`- Utilisation (hub): ${pctText(f.utilisation)}`] : []),
    "",
    `Read from the ${chainMeta(d.chainId).name} chain at block ${f.block.toLocaleString("en-US")}.`,
  ].join("\n");
}

function reserveHead(d: V4Deployment, sp: V4Spoke, l: V4Line, f: V4ReserveFigures, names: V4Names): ProductHead {
  const side = `Hub: ${names.hub}`;
  const sup = amountText(f.spokeSupplied, f.price, names.symbol);
  const bor = amountText(f.spokeBorrowed, f.price, names.symbol);
  const avail = amountText(f.available, f.price, names.symbol);
  const chain = chainMeta(d.chainId);
  const links: SectionMenuLink[] = [
    {
      item: "spoke",
      title: `${sp.name} reserves`,
      subtitle: "The spoke this reserve sits in",
      href: spokeHref(d, sp.slug),
      internal: true,
    },
    {
      item: "hubs",
      title: "Hubs",
      subtitle: `The ${names.hub} hub and its credit lines`,
      href: `${hubsHref(d)}#hub-${l.hub}`,
      internal: true,
    },
    {
      item: "positions",
      title: `${sp.name} positions`,
      subtitle: "Every position on the spoke",
      href: spokePositionsHref(d, sp.key),
      internal: true,
    },
    {
      item: "asset",
      title: names.symbol,
      subtitle: `${names.symbol} on ${chain.name}, across Rails`,
      href: `/assets/${chain.slug}/${l.underlying}`,
      internal: true,
    },
  ];
  const contracts = [
    {
      name: `${sp.name} spoke`,
      address: f.spokeAddress,
      reads: "getReserveConfig, getDynamicReserveConfig, getLiquidationConfig",
    },
    {
      name: `${names.hub} hub`,
      address: f.hubAddress,
      reads:
        "getAddedAssets, getAssetOwed, getAssetTotalOwed, getAssetLiquidity, getAssetDrawnRate, getAssetConfig, getSpokeAddedAssets, getSpokeTotalOwed, getSpokeConfig",
    },
    ...(f.oracle ? [{ name: `${sp.name} oracle`, address: f.oracle, reads: "getReservePrice, getReserveSource" }] : []),
    ...(f.strategy ? [{ name: `${names.hub} rate strategy`, address: f.strategy, reads: "getInterestRateData" }] : []),
  ];
  const deficit = f.hubSupplied > 0 && f.hubDeficit / f.hubSupplied >= DEFICIT_SHOWN_SHARE;
  return {
    scope: "reserve-head",
    title: `${names.symbol} reserve`,
    subtitle: (
      <p className="mt-1 text-[13px] text-rb-500" data-structure-line="">
        A reserve of the{" "}
        <Link href={spokeHref(d, sp.slug)} className={INLINE_LINK} data-reserve-market-link="">
          {sp.name}
        </Link>{" "}
        spoke, drawn from the{" "}
        <Link href={`${hubsHref(d)}#hub-${l.hub}`} className={INLINE_LINK} data-structure-hub={l.hub}>
          {names.hub}
        </Link>{" "}
        hub
      </p>
    ),
    figures: [
      {
        slot: "sizeIn",
        label: "Supplied",
        side: "This spoke",
        tip: sup.title,
        value: (
          <span data-vital="supplied">
            <Prov info={headValueProv(f, "spoke", "supplied", names)}>{sup.display}</Prov>
            <Prov info={headValueProv(f, "hub", "supplied", names)}>{hubTotal(f, f.hubSupplied, names)}</Prov>
          </span>
        ),
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        side: "This spoke",
        tip: bor.title,
        value: (
          <span data-vital="borrowed">
            <Prov info={headValueProv(f, "spoke", "borrowed", names)}>{bor.display}</Prov>
            <Prov info={headValueProv(f, "hub", "borrowed", names)}>{hubTotal(f, f.hubBorrowed, names)}</Prov>
          </span>
        ),
      },
      {
        slot: "sizeFree",
        label: "Available",
        side,
        tip: "The hub's liquidity, capped by the draw cap less what this spoke owes",
        value: (
          <span data-vital="available">
            <Prov info={availableProv(f, names)}>{avail.display}</Prov>
            {deficit && (
              <span className={SUB} data-reserve-deficit="">
                deficit {amountText(f.hubDeficit, f.price, names.symbol).display}
              </span>
            )}
          </span>
        ),
      },
      {
        slot: "rateIn",
        label: "Supply rate",
        side,
        tip: RATE_TIP.supply,
        value: (
          <span data-vital="supply-rate">
            {f.supplyApr != null ? <Prov info={supplyRateProv(f, names)}>{ratePercentText(f.supplyApr)}</Prov> : "—"}
          </span>
        ),
      },
      {
        slot: "rateOut",
        label: "Borrow rate",
        side,
        tip: RATE_TIP.borrow,
        value: (
          <span data-vital="borrow-rate">
            {f.borrowable === false ? (
              <span className="text-rb-500" data-prov-exempt="">
                not borrowable here
              </span>
            ) : (
              <>
                {f.drawnApr != null ? <Prov info={drawnRateProv(f, names)}>{ratePercentText(f.drawnApr)}</Prov> : "—"}
                <span className={SUB} data-prov-exempt="">
                  {PREMIUM_LINE}
                </span>
              </>
            )}
          </span>
        ),
      },
      {
        slot: "usage",
        label: "Utilisation",
        side,
        tip: "Drawn ÷ (drawn + liquidity) on the hub",
        value: (
          <span data-vital="utilisation">
            {f.utilisation != null ? (
              <Prov info={utilisationProv(f, names)}>{pctText(Math.round(f.utilisation * 1000) / 1000)}</Prov>
            ) : (
              "—"
            )}
          </span>
        ),
      },
    ],
    readAt: {
      chainId: d.chainId,
      block: f.block,
      blockTime: f.blockTime,
      readBy: f.readBy,
      receipt: (at) =>
        readStampProv({
          chainId: d.chainId,
          block: f.block,
          at,
          readBy: f.readBy,
          what: `Every ${names.symbol} figure on ${sp.name}`,
          contracts,
        }),
    },
    tools: {
      links,
      exports: {
        markdown: { build: () => reserveMarkdown(d, f, names), copySubtitle: "This reserve as Markdown, for an LLM" },
      },
    },
    explainer: { body: <ReserveExplainer f={f} names={names} />, label: "Show reserve explanation" },
    learnMore: null,
    anatomy: "M3.1",
    bandHooks: { "data-anatomy": "M3.2", "data-reserve-vitals": "" },
  };
}

/** The reads under the head: the hub asset's history and the holders. */
interface IndexedReads {
  history: V4Read<V4History>;
  /** The last history that arrived, kept while a longer span loads. */
  kept: V4History | null;
  span: HistorySpan;
  onSpan: (s: HistorySpan) => void;
  holders: V4Read<V4Holders>;
}

function missingLine(q: V4Read<unknown>, what: string, height: number) {
  if (q.state === "loading") return <SkeletonBlock height={height} />;
  if (q.state === "not-listed")
    return (
      <p className={NOTE} data-reserve-not-held="">
        Not held for this reserve.
      </p>
    );
  return (
    <p className={NOTE} data-reserve-read-failed="">
      Couldn&apos;t read the {what}. Reload to retry.
    </p>
  );
}

function indexedSections(
  d: V4Deployment,
  sp: V4Spoke,
  l: V4Line,
  names: V4Names,
  x: IndexedReads,
): { history: ProductSection; holders: ProductSection[] } {
  const h = x.kept;
  const history: ProductSection = {
    scope: "reserve-history",
    anatomy: "M3.4",
    title: "History",
    tools: {
      exports: h
        ? {
            csv: {
              filename: `aave-v4-${l.hub}-${names.symbol}-drawn-rate.csv`,
              build: () =>
                csvRows(
                  ["date", "close_block", "update_block", "drawn_apr"],
                  h.points.map((p) => [p.date, p.closeBlock, p.update.block, p.drawnApr]),
                ),
              subtitle: "Each day's closing drawn rate",
            },
          }
        : undefined,
    },
    body:
      d.chain === "base" ? (
        <p className={NOTE} data-reserve-not-indexed="">
          Not indexed yet on Base.
        </p>
      ) : h && h.points.length > 0 ? (
        <div className="rounded-lg bg-raised p-4">
          <AaveV4DrawnRateHistory
            h={h}
            symbol={names.symbol}
            hub={names.hub}
            span={x.span}
            onSpan={x.onSpan}
            loadingAll={x.history.state === "loading"}
          />
          <p className="mt-2 text-[12px] text-rb-500" data-history-gap-note="">
            The {names.hub} hub&apos;s drawn rate, every spoke drawing {names.symbol} from it alike. Utilisation is not
            held for past days.
          </p>
        </div>
      ) : x.history.state === "ok" ? (
        <p className={NOTE}>No rate history held for this hub asset.</p>
      ) : (
        missingLine(x.history, "hub asset's history", 320)
      ),
  };
  const hd = x.holders;
  const holders: ProductSection[] =
    hd.state === "ok"
      ? (["suppliers", "borrowers"] as const).map((side) => {
          const rows = hd.data[side];
          const amountLabel = side === "suppliers" ? "Supplied" : "Borrowed";
          return {
            scope: `reserve-${side}`,
            anatomy: side === "suppliers" ? "M3.7" : "M3.8",
            title: `Largest ${side}`,
            tools: {
              links: [
                {
                  item: "positions",
                  title: `${sp.name} positions`,
                  subtitle: "Every position on the spoke",
                  href: spokePositionsHref(d, sp.key),
                  internal: true,
                },
              ],
              exports: {
                csv: {
                  filename: `aave-v4-${sp.slug}-${names.symbol}-${side}.csv`,
                  build: () =>
                    csvRows(
                      ["rank", "wallet", "amount_raw", "decimals", "read_block"],
                      rows.map((r) => [r.rank, r.wallet, r.amount, l.decimals, r.readBlock]),
                    ),
                  subtitle: `The ten largest ${side}`,
                },
              },
            },
            body: (
              <HoldersTable
                side={side}
                amountLabel={amountLabel}
                unit={{ symbol: names.symbol, address: l.underlying }}
                refreshedAt={hd.data.refreshedAt}
                leftOut={hd.data.leftOut?.[side]?.length ?? 0}
                rows={rows.map((r) => {
                  const t = formatCompactTitled(Number(r.amount) / 10 ** l.decimals);
                  return {
                    wallet: r.wallet,
                    rank: r.rank,
                    href: `${d.root}/spoke/${sp.slug}/${r.wallet}`,
                    hooks: { "data-holder-amount": r.amount },
                    amount: (
                      <Prov
                        info={holderAmountProv(
                          side === "suppliers" ? "supplied" : "borrowed",
                          names.symbol,
                          r.wallet,
                          r.amount,
                          l.decimals,
                          r.readBlock,
                        )}
                      >
                        <span title={t.title}>{t.display}</span>
                      </Prov>
                    ),
                  };
                })}
              />
            ),
          };
        })
      : [
          {
            scope: "reserve-holders",
            anatomy: "M3.7 M3.8",
            title: "Largest suppliers and borrowers",
            tools: {},
            body: missingLine(hd, "largest suppliers and borrowers", 240),
          },
        ];
  return { history, holders };
}

/** Which hub, where the spoke lists the token from two. */
function HubChoice({ d, sp, lines }: { d: V4Deployment; sp: V4Spoke; lines: V4Line[] }) {
  const protocol = protocolOf(d);
  const symbol = lines[0].symbol;
  return (
    <div className="min-h-screen" data-anatomy="M3" data-reserve-hub-choice="">
      <div className="py-8">
        <header className="mb-6">
          <div className="mb-2.5">
            <RailHeader session={protocol.session} venue="subPage" />
          </div>
          <div className="mb-3">
            <DetailBackButton fallbackHref={spokeHref(d, sp.slug)} />
          </div>
          <h1 className="text-2xl font-semibold text-foreground" data-reserve-symbol="">
            {symbol}
          </h1>
        </header>
        <p className="text-[15px] text-foreground">
          {sp.name} lists {symbol} from {lines.length === 2 ? "two" : lines.length} hubs:{" "}
          {lines.map((l, i) => (
            <span key={l.hub}>
              {i > 0 && " · "}
              <Link
                href={`${spokeHref(d, sp.slug)}/${l.underlying}?hub=${l.hub}`}
                className={INLINE_LINK}
                data-hub-choice={l.hub}
              >
                {V4_HUB_LABEL[l.hub]}
              </Link>
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

export function AaveV4ReservePage({
  chain,
  slug,
  asset,
  hub,
}: {
  chain: string;
  slug: string;
  asset: string;
  hub?: string;
}) {
  const d = v4Deployment(chain);
  const stored = useV4Stored(d);
  const s = stored.state === "ok" ? stored.data : null;
  const sp = s?.spokes.find((x) => x.slug === slug) ?? null;
  const addr = asset.toLowerCase();
  const same = sp?.lines.filter((l) => l.underlying === addr) ?? [];
  const asked = isV4HubKey(hub) ? hub : null;
  const line = asked ? (same.find((l) => l.hub === asked) ?? null) : same.length === 1 ? same[0] : null;
  const choose = !line && same.length > 1;
  const head = useV4Read<V4ReserveHead>("head", sp && line ? headQuery(sp, line) : null);
  const [span, setSpan] = useState<HistorySpan>("1Y");
  const from = useMemo(
    () => (span === "All" ? null : new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)),
    [span],
  );
  const history = useV4Read<V4History>(
    "history",
    d.chain === "ethereum" && line ? { hub: line.hub, asset: addr, ...(from ? { from } : {}) } : null,
  );
  const holders = useV4Read<V4Holders>("holders", sp && line ? headQuery(sp, line) : null);
  const [kept, setKept] = useState<V4History | null>(null);
  useEffect(() => {
    if (history.state === "ok") setKept(history.data);
  }, [history]);

  if (sp && choose) return <HubChoice d={d} sp={sp} lines={same} />;

  const back = sp ? spokeHref(d, sp.slug) : `${d.root}/markets`;
  let reserve: Loadable<ReservePageData | null>;
  if (stored.state === "error") reserve = stored;
  else if (!s) reserve = { state: "loading" };
  else if (!sp || !line) reserve = { state: "ok", data: null };
  else if (head.state === "loading") reserve = { state: "loading" };
  else if (head.state === "not-listed") reserve = { state: "ok", data: null };
  else if (head.state !== "ok")
    reserve = { state: "error", message: head.state === "error" ? head.message : "The head read failed." };
  else {
    const f = settleHead(head.data);
    const names = namesOf(sp, line);
    const { history: historySection, holders: holderSections } = indexedSections(d, sp, line, names, {
      history,
      kept,
      span,
      onSpan: setSpan,
      holders,
    });
    reserve = {
      state: "ok",
      data: {
        identity: {
          symbol: line.symbol,
          address: line.underlying,
          tags: <V4StateTags f={f} line={line} names={names} />,
        },
        head: reserveHead(d, sp, line, f, names),
        sections: [
          {
            scope: "reserve-curve",
            anatomy: "M3.3",
            title: "Rate curve",
            raised: true,
            tools: {
              links: [
                {
                  item: "hubs",
                  title: "Hubs",
                  subtitle: `The ${names.hub} hub's assets`,
                  href: `${hubsHref(d)}#hub-${line.hub}`,
                  internal: true,
                },
              ],
            },
            body: <RateCurve curve={curveOf(f, names)} />,
          },
          historySection,
          {
            scope: "reserve-parameters",
            anatomy: "M3.5",
            title: "Parameters",
            raised: "narrow",
            tools: {
              links: [
                {
                  item: "spoke",
                  title: `${sp.name} reserves`,
                  subtitle: "Every reserve on the spoke",
                  href: spokeHref(d, sp.slug),
                  internal: true,
                },
              ],
              exports: {
                csv: {
                  filename: `aave-v4-${sp.slug}-${names.symbol}-parameters.csv`,
                  build: () =>
                    csvRows(
                      ["side", "parameter", "value"],
                      [
                        ["spoke", "collateral_factor", f.collateralFactor],
                        ["spoke", "max_liquidation_bonus", f.maxLiquidationBonus],
                        ["spoke", "liquidation_fee", f.liquidationFee],
                        ["spoke", "collateral_risk", f.collateralRisk],
                        ["spoke", "oracle_price_usd", f.price],
                        ["hub", "add_cap", f.addCap],
                        ["hub", "draw_cap", f.drawCap],
                        ["hub", "liquidity_fee", f.liquidityFee],
                      ],
                    ),
                  subtitle: "The spoke's and the hub's parameters",
                },
              },
            },
            body: <V4Parameters f={f} line={line} names={names} />,
          },
          {
            scope: "reserve-changes",
            anatomy: "M3.6",
            title: "Configuration changes",
            tools: {},
            body: (
              <p className={NOTE} data-reserve-changes-none="">
                No store holds Aave V4 configuration history yet, so this reserve&apos;s changes are not listed.
              </p>
            ),
          },
          ...holderSections,
        ],
      },
    };
  }

  return (
    <ReservePage
      protocol={protocolOf(d)}
      backHref={back}
      learnMore={aaveV4Modal("hubs")}
      reserve={reserve}
      what={sp?.name ?? "the spoke"}
      missing={{
        line: sp
          ? `${sp.name} has no reserve for ${addr}${asked ? ` from the ${V4_HUB_LABEL[asked]} hub` : ""}.`
          : `No Aave V4 spoke ${slug} here.`,
        link: { label: sp ? `All ${sp.name} reserves` : "All spokes", href: back },
      }}
      hooks={{ "data-reserve-page": addr, "data-market": sp?.key ?? slug, "data-reserve-hub": line?.hub ?? "" }}
    />
  );
}
