"use client";

// Morpho Blue's product adapter (rails-ops ui-jobs 549 step 5; decisions 0043
// and 0059): one market's page on the R2 shell. A Morpho market is one
// isolated pair, so its page carries what an R3 page would: the head (house
// labels, APR in the tips, the LLTV beside the pair), the AdaptiveCurveIRM's
// curve, the oracle's price, the parameters, then the family's sections the
// route hands in ("Supplied by vaults", the positions listing) and the holders
// section, missing until Rails's server ranks Morpho's accounts.
//
// Surface rules (decision 0059): sizes in the loan token, never dollars; the
// read time in the head's stamp with the block and the contracts in its
// receipt; the market id and the oracle, IRM and token addresses in receipts
// and the ⋮s, off the surface. Morpho has no caps, and its fee stands where a
// reserve factor would.

import Link from "next/link";
import type { ReactNode } from "react";
import { ExplainBullet, ExplainGroup, ExplainSub, Fig } from "@/components/shared/explain-groups";
import { readStampProv } from "@/components/shared/read-stamp";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { MarketPage } from "@/components/shared/product/market-page";
import { ProductSectionBlock } from "@/components/shared/product/product-head";
import { RateCurve } from "@/components/shared/product/rate-curve";
import { ProvSection, SectionHeading, SectionMenu, type SectionMenuLink } from "@/components/shared/section-menu";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { AmountText } from "@/components/shared/amount-text";
import { ratePercentText } from "@/lib/shared/rate-percent";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { protocolForHref } from "@/lib/shared/protocols";
import { morphoBlueContract } from "@/lib/morpho/asset-catalog";
import { morphoLoanTokenHref } from "@/lib/morpho/market-routes";
import { amount, pctText } from "@/lib/morpho/markets-format";
import { oracleAge, publishedText } from "@/lib/morpho/oracle-age";
import { oracleFeedAgeProv, oraclePriceProv } from "@/lib/morpho/position-provenance";
import {
  adaptiveBorrowRate,
  adaptiveCurveTerms,
  CURVE_STEEPNESS,
  DOUBLING_DAYS_AT_FULL,
  isAdaptiveCurveIrm,
  rateAtTargetYearly,
  TARGET_UTILISATION,
} from "@/lib/morpho/adaptive-curve";
import {
  MORPHO_MARKETS_LANE,
  morphoBorrowRateProv,
  morphoCurveProv,
  morphoFeeProv,
  morphoLastUpdateProv,
  morphoLiquidationIncentiveProv,
  morphoLltvProv,
  morphoMarketLiquidityProv,
  morphoMarketSizeProv,
  morphoRateAtTargetProv,
  morphoSupplyRateProv,
  morphoUtilizationProv,
  type MorphoMarketCoords,
} from "@/lib/morpho/markets-provenance";
import type { MorphoMarketViewData } from "@/lib/morpho/markets-shape";
import { lifBonusText, lifText, LLTV_TIP, morphoApy, morphoPair, MORPHO_TERMS } from "@/lib/morpho/terms";
import type { Loadable, MarketModel, Missing, ProductSection, RateCurveModel } from "@/lib/shared/product/model";

// ── Words ────────────────────────────────────────────────────────────────────

const DOCS = "https://docs.morpho.org";
const NOTE = "text-[13px] text-rb-500";

const RATE_TIP = {
  supply:
    "What suppliers earn a year, compounded: the borrow rate times utilization, less the market's fee, compounded over a year",
  borrow: "What borrowers pay a year, compounded: the market's rate model's borrow rate compounded over a year",
};
const TIP = {
  available:
    "Loan assets available in the market now: supplied less borrowed, what suppliers can withdraw or borrowers take",
  util: "Borrowed ÷ supplied, both in the loan asset",
};

const CURVE_HELP: LearnMoreContent = {
  title: "How the rate curve works",
  intro:
    "The AdaptiveCurveIRM is the only interest rate model Morpho's governance has approved; a market names it or, as an idle market, none. It sets the borrow rate from the market's utilization, the share of its supply on loan, and moves the whole curve over time to pull utilization towards its target of 90%.",
  detailsHeading: "The model's terms:",
  details: [
    { bold: "Rate at target", text: "the borrow rate at 90% utilization." },
    {
      bold: "Steepness",
      text: "the curve runs from a quarter of the rate at target with nothing borrowed to four times it with everything borrowed.",
    },
    {
      bold: "Adapting",
      text: "while utilization is above 90% the rate at target rises, and below it the rate falls; the further from 90%, the faster.",
    },
  ],
  extraParagraphs: [
    "Suppliers earn the borrow rate times utilization, less the market's fee. The chart and the page state each rate as an APY, compounded over a year.",
  ],
  links: [{ label: "Morpho docs: interest rate models", url: `${DOCS}/learn/concepts/irm/` }],
};

// ── The read ─────────────────────────────────────────────────────────────────

interface Ctx {
  d: MorphoMarketViewData;
  chainId: ChainId;
  c: MorphoMarketCoords;
  coll: string;
  pair: string;
  explorer: string;
  chainName: string;
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const ZERO_LOAN_TOKEN = "0x0000000000000000000000000000000000000000";
/** An idle market that names no loan token (Arc's first market, ui-jobs 577): it is called the
 *  idle market, never by a token. */
const namesNoToken = (m: { isIdle: boolean; loanToken: string }) => m.isIdle && m.loanToken === ZERO_LOAN_TOKEN;

function ctxOf(d: MorphoMarketViewData, chainId: ChainId): Ctx {
  const m = d.market;
  const coll = m.isIdle ? "no collateral" : (m.collateralSymbol ?? shortAddr(m.collateralToken));
  return {
    d,
    chainId,
    c: {
      fromLogs: d.totalsSource === "sieve",
      chainId,
      blockNumber: d.blockNumber,
      marketId: m.id,
      loanSymbol: m.loanSymbol,
      collateralSymbol: m.collateralSymbol,
      irm: m.irm,
      loanToken: m.loanToken,
    },
    coll,
    pair: namesNoToken(m) ? "Idle market" : m.isIdle ? `${m.loanSymbol} idle market` : morphoPair(m.loanSymbol, coll),
    explorer: chainMeta(chainId).explorerName,
    chainName: chainMeta(chainId).name,
  };
}

/** The Supply APY's receipt, with the figures it is derived from. */
const supplyProv = (x: Ctx): Provenance =>
  morphoSupplyRateProv(x.c, {
    borrowYearly: x.d.market.borrowApr,
    utilization: x.d.market.utilization,
    fee: x.d.market.fee,
    supplyYearly: x.d.market.supplyApr,
  });

/** The market id rides the LLTV's receipt: the id is the hash of the parameters. */
function lltvProv(x: Ctx): Provenance {
  const p = morphoLltvProv(x.c);
  return {
    ...p,
    inputs: [
      ...(p.inputs ?? []),
      { label: "market id", value: x.d.market.id, kind: "chain", note: "keccak256 of the five parameters" },
    ],
  };
}

/** The rate at target and the curve's point now, where the IRM is the chain's AdaptiveCurveIRM. */
function curveRead(x: Ctx): { rat: number; u: number; elapsed: number } | null {
  const m = x.d.market;
  if (!x.d.rateAtTarget || !isAdaptiveCurveIrm(x.chainId, m.irm)) return null;
  const u = m.utilization ?? 0;
  const elapsed = Math.max(0, x.d.timestamp - m.lastUpdate);
  return { rat: rateAtTargetYearly(x.d.rateAtTarget, u, elapsed), u, elapsed };
}

// ── Figures ──────────────────────────────────────────────────────────────────

function Size({ x, side }: { x: Ctx; side: "supplied" | "borrowed" | "available" }) {
  const m = x.d.market;
  // An idle market that names no loan token (Arc's first market) holds nothing to size.
  if (namesNoToken(m))
    return (
      <span className="text-rb-500" title="This market names no loan asset, collateral, oracle or rate model.">
        no loan asset
      </span>
    );
  if (!m.amountsTrusted)
    return (
      <span
        className="text-rb-500"
        title={
          m.loanDecimalsUnread
            ? "The chain did not answer for the loan asset's decimals. The sizes show once it does."
            : `${m.loanSymbol} misreports its own decimals, so its balances cannot be stated.`
        }
      >
        {m.loanDecimalsUnread ? "not loaded" : "not stated"}
      </span>
    );
  const n = side === "supplied" ? m.totalSupply : side === "borrowed" ? m.totalBorrow : m.totalSupply - m.totalBorrow;
  const info =
    side === "available"
      ? morphoMarketLiquidityProv(x.c)
      : morphoMarketSizeProv(side === "supplied" ? "supplied" : "borrowed", x.c);
  return (
    <Prov info={info}>
      {amount(n)} {m.loanSymbol}
    </Prov>
  );
}

const noRate = (m: MorphoMarketViewData["market"]) => (
  <span className="text-rb-500" title="This market names no rate model, so it has no rate.">
    none
  </span>
);

// ── The (i) ──────────────────────────────────────────────────────────────────

function MarketExplainer({ x }: { x: Ctx }) {
  const m = x.d.market;
  const size = (n: number) => `${amount(n)} ${m.loanSymbol}`;
  if (namesNoToken(m))
    return (
      <ExplainGroup title="This market">
        <ExplainBullet>
          This idle market names no loan asset, collateral, oracle or rate model, so nothing can be supplied to it or
          borrowed from it.
        </ExplainBullet>
      </ExplainGroup>
    );
  if (m.isIdle)
    return (
      <ExplainGroup title="This market">
        <ExplainBullet>
          An idle market holds {m.loanSymbol} with no collateral, oracle or rate model, so nothing can be borrowed from
          it. Vaults use one to keep {m.loanSymbol} inside Morpho Blue.
        </ExplainBullet>
        {m.amountsTrusted && (
          <ExplainBullet>
            It holds <Fig bold>{size(m.totalSupply)}</Fig>.
          </ExplainBullet>
        )}
      </ExplainGroup>
    );
  const k = curveRead(x);
  return (
    <>
      <ExplainGroup title="This reserve">
        <ExplainBullet>
          Suppliers lend {m.loanSymbol} here, and borrowers take it against {x.coll}. The market shares nothing with any
          other Morpho market.
        </ExplainBullet>
        {m.amountsTrusted && (
          <ExplainBullet>
            Suppliers have put in <Fig bold>{size(m.totalSupply)}</Fig>
            {m.totalBorrow > 0 ? (
              <>
                , and borrowers owe <Fig bold>{size(m.totalBorrow)}</Fig>.
              </>
            ) : (
              ", none of it borrowed."
            )}
          </ExplainBullet>
        )}
        {m.amountsTrusted && (
          <ExplainBullet>
            <Fig bold>{size(m.totalSupply - m.totalBorrow)}</Fig> can be withdrawn or borrowed now.
          </ExplainBullet>
        )}
        <ExplainBullet>
          The sizes are as the market last settled, on <Fig bold>{publishedText(m.lastUpdate, x.d.timestamp)}</Fig>:
          Morpho Blue adds interest only when someone uses the market.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Rates">
        {m.borrowApr != null && (
          <ExplainBullet>
            Suppliers earn a Supply APY of <Fig bold>{ratePercentText(morphoApy(m.supplyApr ?? 0))}</Fig>.
          </ExplainBullet>
        )}
        {m.borrowApr != null && (
          <ExplainBullet
            sub={
              k && (
                <ExplainSub>
                  The rate model aims for 90% utilization. Above it the rates climb steeply and rise further every day;
                  below it they ease. At 90% the borrow rate is <Fig bold>{ratePercentText(k.rat)}</Fig> a year now.
                </ExplainSub>
              )
            }
          >
            Borrowers pay a Borrow APY of <Fig bold>{ratePercentText(morphoApy(m.borrowApr))}</Fig>.
          </ExplainBullet>
        )}
        {m.borrowApr != null && (
          <ExplainBullet>
            Utilization <Fig bold>{pctText(m.utilization)}</Fig> is the share of the supply on loan. The supply rate is
            the borrow rate times it
            {m.fee > 0 ? (
              <>
                , less the <Fig bold>{pctText(m.fee, 0)}</Fig> fee
              </>
            ) : null}
            .
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Collateral and liquidation">
        <ExplainBullet>
          A borrower may owe up to <Fig bold>{pctText(m.lltv)}</Fig> of their collateral&apos;s value at the
          oracle&apos;s price, the LLTV. Past it, anyone can repay the debt and take collateral with a{" "}
          <Fig bold>{lifBonusText(m.liquidationIncentive ?? 1)}</Fig>.
        </ExplainBullet>
        <ExplainBullet>
          The market keeps its LLTV and its Liquidation Incentive Factor for its whole life, as set when it was created.
        </ExplainBullet>
      </ExplainGroup>
    </>
  );
}

// ── The head ─────────────────────────────────────────────────────────────────

function marketMarkdown(x: Ctx): string {
  const m = x.d.market;
  const sz = (n: number) =>
    namesNoToken(m) ? "no loan asset" : m.amountsTrusted ? `${amount(n)} ${m.loanSymbol}` : "not stated";
  return [
    `# ${x.pair}, a Morpho Blue market on ${x.chainName}`,
    "",
    `- Supplied: ${sz(m.totalSupply)}`,
    `- Borrowed: ${sz(m.totalBorrow)}`,
    `- ${MORPHO_TERMS.marketLiquidity}: ${sz(m.totalSupply - m.totalBorrow)}`,
    ...(m.supplyApr != null ? [`- ${MORPHO_TERMS.supplyRate}: ${ratePercentText(morphoApy(m.supplyApr))}`] : []),
    ...(m.borrowApr != null ? [`- ${MORPHO_TERMS.borrowRate}: ${ratePercentText(morphoApy(m.borrowApr))}`] : []),
    ...(m.utilization != null ? [`- ${MORPHO_TERMS.utilization}: ${pctText(m.utilization)}`] : []),
    `- LLTV: ${pctText(m.lltv)}`,
    ...(m.liquidationIncentive != null
      ? [`- ${MORPHO_TERMS.lif}: ${lifText(m.liquidationIncentive)} (${lifBonusText(m.liquidationIncentive)})`]
      : []),
    `- Fee: ${pctText(m.fee, 0)}`,
    `- Market id: ${m.id}`,
    "",
    `Read from ${x.chainName} at block ${x.d.blockNumber.toLocaleString("en-US")}. Sizes as the market last settled.`,
  ].join("\n");
}

function headOf(x: Ctx, positions: { href: string; label: string } | null): MarketModel["head"] {
  const m = x.d.market;
  const blue = morphoBlueContract(x.chainId);
  const loanHref = morphoLoanTokenHref(x.chainId, m.loanToken);
  const links: SectionMenuLink[] = [
    ...(namesNoToken(m)
      ? []
      : [
          {
            item: "loan-token",
            title: `All ${m.loanSymbol} markets`,
            subtitle: `Every Morpho Blue market that lends ${m.loanSymbol}`,
            href: loanHref,
            internal: true,
          },
        ]),
    ...(positions
      ? [
          {
            item: "positions",
            title: positions.label,
            subtitle: "The positions Rails holds",
            href: positions.href,
            internal: true,
          },
        ]
      : []),
    {
      item: "blue",
      title: `Morpho Blue on ${x.explorer}`,
      subtitle: "The contract that holds every market",
      href: explorerUrl(x.chainId, "address", blue.address),
    },
    { item: "docs", title: "Morpho's docs", subtitle: "Markets", href: `${DOCS}/learn/concepts/blue/` },
  ];
  const contracts = [
    {
      name: blue.name,
      address: blue.address,
      reads: "market(id): the supplied and borrowed totals, the last update and the fee",
    },
    ...(m.irm
      ? [
          {
            name: "AdaptiveCurveIRM",
            address: m.irm,
            reads: "borrowRateView(params, market) and rateAtTarget(id)",
          },
        ]
      : []),
    ...(m.oracle
      ? [{ name: `${x.pair} oracle`, address: m.oracle, reads: "price() and its feeds' latest rounds" }]
      : []),
  ];
  return {
    scope: "market-head",
    title: x.pair,
    subtitle: (
      <p className="mt-1 text-[13px] text-rb-500" data-morpho-market-line="">
        {namesNoToken(m) ? (
          <>No loan asset, collateral, oracle or rate model</>
        ) : m.isIdle ? (
          <>An idle {m.loanSymbol} market</>
        ) : (
          <>
            Lends {m.loanSymbol} against {x.coll} · LLTV <Prov info={lltvProv(x)}>{pctText(m.lltv)}</Prov>
          </>
        )}
        {!namesNoToken(m) && (
          <>
            {" "}
            ·{" "}
            <Link
              href={loanHref}
              prefetch={false}
              className="text-blue-600 hover:underline dark:text-[var(--text-link)]"
            >
              All {m.loanSymbol} markets
            </Link>
          </>
        )}
      </p>
    ),
    figures: [
      {
        slot: "sizeIn",
        label: "Supplied",
        value: (
          <span data-vital="supplied">
            <Size x={x} side="supplied" />
          </span>
        ),
      },
      {
        slot: "sizeOut",
        label: "Borrowed",
        value: (
          <span data-vital="borrowed">
            <Size x={x} side="borrowed" />
          </span>
        ),
      },
      {
        slot: "sizeFree",
        label: MORPHO_TERMS.marketLiquidity,
        tip: TIP.available,
        value: (
          <span data-vital="available">
            <Size x={x} side="available" />
          </span>
        ),
      },
      {
        slot: "rateIn",
        label: MORPHO_TERMS.supplyRate,
        tip: RATE_TIP.supply,
        value: (
          <span data-vital="supply-rate">
            {m.supplyApr != null ? (
              <Prov info={supplyProv(x)}>{ratePercentText(morphoApy(m.supplyApr))}</Prov>
            ) : (
              noRate(m)
            )}
          </span>
        ),
      },
      {
        slot: "rateOut",
        label: MORPHO_TERMS.borrowRate,
        tip: RATE_TIP.borrow,
        value: (
          <span data-vital="borrow-rate">
            {m.borrowApr != null ? (
              <Prov info={morphoBorrowRateProv(x.c, m.borrowApr)}>{ratePercentText(morphoApy(m.borrowApr))}</Prov>
            ) : (
              noRate(m)
            )}
          </span>
        ),
      },
      {
        slot: "usage",
        label: MORPHO_TERMS.utilization,
        tip: TIP.util,
        value: (
          <span data-vital="utilisation">
            {m.utilization != null ? (
              <Prov info={morphoUtilizationProv(x.c)}>{pctText(m.utilization)}</Prov>
            ) : (
              <span className="text-rb-500">no supply</span>
            )}
          </span>
        ),
      },
    ],
    notes:
      m.lastUpdate > 0 ? (
        <span>
          Sizes as last settled,{" "}
          <span className="text-foreground">
            <Prov info={morphoLastUpdateProv(x.c)}>{publishedText(m.lastUpdate, x.d.timestamp)}</Prov>
          </span>
        </span>
      ) : undefined,
    readAt:
      x.d.blockNumber > 0
        ? {
            chainId: x.chainId,
            block: x.d.blockNumber,
            blockTime: x.d.timestamp,
            receipt: (at) =>
              readStampProv({
                chainId: x.chainId,
                block: x.d.blockNumber,
                at,
                what: `Every figure on the ${x.pair} market`,
                contracts,
              }),
          }
        : null,
    tools: {
      links,
      exports: { markdown: { build: () => marketMarkdown(x), copySubtitle: "This market as Markdown, for an LLM" } },
    },
    explainer: { body: <MarketExplainer x={x} />, label: "market explanation" },
    learnMore: null,
    anatomy: "M3.1",
    bandHooks: { "data-anatomy": "M3.2", "data-reserve-vitals": "" },
  };
}

// ── The sections ─────────────────────────────────────────────────────────────

function curveOf(x: Ctx): RateCurveModel | Missing {
  const m = x.d.market;
  if (m.isIdle || !m.irm) return { missing: "This market names no rate model, so nothing can be borrowed from it." };
  if (!isAdaptiveCurveIrm(x.chainId, m.irm))
    return {
      missing: "This market uses a rate model other than Morpho's AdaptiveCurveIRM, which Rails does not draw.",
    };
  const k = curveRead(x);
  if (!k) return { missing: "The rate model's rate at target could not be read." };
  const borrow = adaptiveBorrowRate(k.rat, k.u);
  return {
    ...adaptiveCurveTerms(k.rat),
    kinkLabel: MORPHO_TERMS.target,
    utilizationWord: MORPHO_TERMS.utilizationText,
    form: { of: (rate: number) => morphoApy(rate), borrow: MORPHO_TERMS.borrowRate, supply: MORPHO_TERMS.supplyRate },
    reserveFactor: m.fee,
    now: {
      utilisation: m.utilization,
      borrow,
      supply: borrow * k.u * (1 - m.fee),
    },
    symbol: m.loanSymbol,
    receipt: morphoCurveProv(x.c),
  };
}

function Term({ term, title, children }: { term: string; title?: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-rb-500" title={title}>
        {term}
      </dt>
      <dd className="text-right tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

function CurveTerms({ x }: { x: Ctx }) {
  const k = curveRead(x);
  if (!k || !x.d.rateAtTarget) return null;
  return (
    <dl className="mt-4 grid max-w-md grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]" data-rate-terms="">
      <Term term="Rate at target" title="The borrow rate a year at the target utilization, as the model holds it now">
        <Prov
          info={morphoRateAtTargetProv(x.c, {
            stored: x.d.rateAtTarget,
            settledUtilisation: k.u,
            elapsed: k.elapsed,
          })}
        >
          {ratePercentText(k.rat)} a year
        </Prov>
      </Term>
      <Term term={MORPHO_TERMS.targetUtilization} title="The utilization the model steers the market towards">
        <span data-prov-exempt="">{pctText(TARGET_UTILISATION, 0)}</span>
      </Term>
      <Term
        term="Steepness"
        title="The borrow rate at 100% utilization over the rate at target; at 0% it is the inverse"
      >
        <span data-prov-exempt="">{CURVE_STEEPNESS}×</span>
      </Term>
      <Term
        term="Adapts"
        title="How fast the rate at target moves: at 100% utilization it doubles in this time, and at 0% it halves"
      >
        <span data-prov-exempt="">doubles in {DOUBLING_DAYS_AT_FULL.toFixed(1)} days at 100%</span>
      </Term>
    </dl>
  );
}

function OraclePrice({ x }: { x: Ctx }) {
  const m = x.d.market;
  if (!m.oracle) return <p className={NOTE}>This market names no oracle.</p>;
  if (x.d.oraclePrice == null) return <p className={NOTE}>The oracle gave no price at this read.</p>;
  const age = oracleAge({
    chainStale: false,
    oraclePublishedAt: x.d.oraclePublishedAt,
    oracleFeeds: x.d.oracleFeeds,
    timestamp: x.d.timestamp,
  });
  const coords = { marketId: m.id, marketLabel: morphoPair(m.loanSymbol, x.coll) };
  return (
    <div className="text-[13px] text-rb-500" data-morpho-oracle-price="">
      <p className="tabular-nums">
        1 {x.coll} ={" "}
        <span className="text-[15px] font-semibold text-foreground">
          <Prov
            info={oraclePriceProv(
              {
                collSym: x.coll,
                loanSym: m.loanSymbol,
                oracle: m.oracle,
                block: x.d.blockNumber,
                lane: MORPHO_MARKETS_LANE,
                surface: "market",
              },
              coords,
            )}
          >
            <AmountText value={x.d.oraclePrice} /> {m.loanSymbol}
          </Prov>
        </span>
      </p>
      <p className="mt-1.5 max-w-2xl leading-relaxed">
        The price every position here is measured at for borrowing and liquidation.{" "}
        {age && x.d.oracleFeeds && x.d.oraclePublishedAt != null ? (
          <>
            {age.feedCount > 1 ? `Its oldest of ${age.feedCount} feeds published it ` : "Its feed published it "}
            <span className="text-foreground">
              <Prov
                info={oracleFeedAgeProv(
                  {
                    feeds: x.d.oracleFeeds,
                    publishedAt: x.d.oraclePublishedAt,
                    readTimestamp: x.d.timestamp,
                    oracle: m.oracle,
                    block: x.d.blockNumber,
                    lane: MORPHO_MARKETS_LANE,
                  },
                  coords,
                )}
              >
                {age.published}
              </Prov>
            </span>
            , {age.age} before this read. The oracle does not check how old its feeds are.
          </>
        ) : (
          "The oracle names no feed Rails can read a time from."
        )}
      </p>
    </div>
  );
}

function Parameters({ x }: { x: Ctx }) {
  const m = x.d.market;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]" data-reserve-parameters="">
      <Term term={MORPHO_TERMS.loanAsset}>{namesNoToken(m) ? "none" : m.loanSymbol}</Term>
      <Term term="Collateral">{m.isIdle ? "none" : x.coll}</Term>
      <Term term="LLTV" title={LLTV_TIP}>
        {m.isIdle ? "none" : <Prov info={lltvProv(x)}>{pctText(m.lltv)}</Prov>}
      </Term>
      {m.liquidationIncentive != null && (
        <Term
          term={MORPHO_TERMS.lif}
          title="The collateral value a liquidator receives per unit of debt repaid; set by the LLTV. Less 1, it is the liquidator's bonus"
        >
          <Prov info={morphoLiquidationIncentiveProv(x.c)}>{lifText(m.liquidationIncentive)}</Prov>
          <span className="block text-rb-500">{lifBonusText(m.liquidationIncentive)}</span>
        </Term>
      )}
      <Term term="Fee" title="The share of borrowers' interest the protocol keeps; suppliers earn the rest">
        <Prov info={morphoFeeProv(x.c)}>{pctText(m.fee, 0)}</Prov>
      </Term>
      <Term term="Caps" title="Morpho Blue sets no supply or borrow cap on a market; vaults set their own">
        none
      </Term>
    </dl>
  );
}

function missingBody(line: string): ReactNode {
  return (
    <p className={NOTE} data-reserve-missing-section="">
      {line}
    </p>
  );
}

function sectionsOf(x: Ctx): ProductSection[] {
  const m = x.d.market;
  const link = (item: string, title: string, subtitle: string, address: string): SectionMenuLink => ({
    item,
    title,
    subtitle,
    href: explorerUrl(x.chainId, "address", address),
  });
  return [
    {
      scope: "market-curve",
      anatomy: "M3.3",
      title: "Rate curve",
      raised: true,
      learnMore: CURVE_HELP,
      tools: {
        links: m.irm ? [link("rate-model", `Rate model on ${x.explorer}`, "The AdaptiveCurveIRM", m.irm)] : [],
      },
      body: (
        <>
          <RateCurve curve={curveOf(x)} />
          <CurveTerms x={x} />
        </>
      ),
    },
    {
      scope: "market-oracle",
      anatomy: "M3.5.1",
      title: "Oracle price",
      raised: "narrow",
      tools: {
        links: m.oracle ? [link("oracle", `Oracle on ${x.explorer}`, `The price feed for ${x.pair}`, m.oracle)] : [],
      },
      body: <OraclePrice x={x} />,
    },
    {
      scope: "market-parameters",
      anatomy: "M3.5",
      title: "Parameters",
      raised: "narrow",
      tools: {
        links: [
          ...(namesNoToken(m)
            ? []
            : [link("loan-token", `${m.loanSymbol} on ${x.explorer}`, "The loan asset", m.loanToken)]),
          ...(m.isIdle
            ? []
            : [link("collateral", `${x.coll} on ${x.explorer}`, "The collateral token", m.collateralToken)]),
        ],
        exports: { markdown: { build: () => marketMarkdown(x), copySubtitle: "This market as Markdown, for an LLM" } },
      },
      body: <Parameters x={x} />,
    },
  ];
}

// ── The positions section ────────────────────────────────────────────────────

/** The positions listing fixed to this market, in a section with its own ⋮ (R6). */
function PositionsSection({ x, all, children }: { x: Ctx; all: { href: string; label: string }; children: ReactNode }) {
  return (
    <ProvSection scope="market-positions" className="mb-8" data-anatomy="R6" data-market-positions="">
      <SectionHeading
        title="Positions"
        menu={
          <SectionMenu
            scope="market-positions"
            title="Positions"
            links={[
              {
                item: "positions",
                title: all.label,
                subtitle: "Every position Rails holds",
                href: all.href,
                internal: true,
              },
            ]}
          />
        }
      >
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-rb-500">
          Every borrower in the {x.pair.endsWith("market") ? x.pair : `${x.pair} market`}.
        </p>
      </SectionHeading>
      <div className="-mt-6">{children}</div>
    </ProvSection>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

const FAILED = "This market could not be read at this block. This page reads the chain; try again shortly.";

export function MorphoMarketPage({
  data,
  chainId,
  pair,
  vaults,
  note,
  listing,
  positions,
  readCeiling = false,
}: {
  /** Null where the read failed. */
  data: MorphoMarketViewData | null;
  /** The read was refused at the daily read ceiling (lib/shared/read-ceiling.ts). */
  readCeiling?: boolean;
  chainId: ChainId;
  /** The pair's name from the roster, for the header when the read failed. */
  pair: string;
  /** "Supplied by vaults", where the chain has a vault roster. */
  vaults?: ReactNode;
  /** A line under the head about this market's place on the explorer (Arc's unlisted and idle
   *  markets, ui-jobs 577). */
  note?: ReactNode;
  /** The positions listing fixed to this market, where the explorer has one. */
  listing?: ReactNode;
  /** Every position on the explorer: the ⋮'s link, and the head's entry where there is no listing. */
  positions: { href: string; label: string };
}) {
  const root = `/${chainMeta(chainId).slug}/morpho`;
  const x = data ? ctxOf(data, chainId) : null;
  const market: Loadable<MarketModel> = x
    ? {
        state: "ok",
        data: {
          head: {
            ...headOf(x, positions),
            entries: listing ? undefined : [{ label: positions.label, href: positions.href }],
          },
          sections: sectionsOf(x),
        },
      }
    : { state: "error", message: FAILED, ceiling: readCeiling };
  const holders: ProductSection | null = x
    ? {
        scope: "market-holders",
        anatomy: "M3.7 M3.8",
        title: "Largest suppliers and borrowers",
        tools: {
          links: [
            {
              item: "positions",
              title: positions.label,
              subtitle: "Every position Rails holds",
              href: positions.href,
              internal: true,
            },
          ],
        },
        body: missingBody(
          listing
            ? "No ranking yet. Rails's server ranks suppliers and borrowers for the Aave family's reserves only; the positions below are every borrower in this market."
            : "No ranking yet. Rails's server ranks suppliers and borrowers for the Aave family's reserves only.",
        ),
      }
    : null;
  return (
    <MarketPage
      header={{ protocol: protocolForHref(root)!, title: x?.pair ?? pair }}
      market={market}
      what={`the ${pair} market`}
      hooks={{ "data-morpho-market-page": data?.market.id }}
    >
      {note}
      {vaults}
      {holders && <ProductSectionBlock s={holders} />}
      {x && listing && (
        <PositionsSection x={x} all={positions}>
          {listing}
        </PositionsSection>
      )}
    </MarketPage>
  );
}
