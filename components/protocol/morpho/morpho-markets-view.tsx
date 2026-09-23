"use client";

// Morpho protocol view — every Blue market, in two pages rather than one scroll.
// ----------------------------------------------------------------------------
// The claim: a Blue market's whole risk surface is ONE number. The lltv is the borrow limit
// and the liquidation line at once — no gap, no second tick — and the liquidation incentive
// is derived from it rather than set. There are only nine such numbers on the whole protocol.
//
// TWO VIEWS, ONE SHAPE. The roster is thousands of markets, and until 2026-08-26 this file
// drew every funded one on one page: 1,233 rows on Base, 1,290 on Ethereum, most of them
// repetition — 720 of Base's rows were one cbBTC/GMORPHO market minted 720 times with 720
// oracles, and 997 of Ethereum's held under 0.1% of their token's book. So:
//
//   • MorphoMarketsOverview  — /<chain>/morpho/markets: the roster counts, the lltv spread,
//     and ONE row per loan token (what it is lent against, how much, how used). No market
//     rows at all. Each row is the way into…
//   • MorphoLoanTokenView    — /<chain>/morpho/markets/<loan token>: that token's markets,
//     shaped by lib/morpho/markets-shape: the material ones as rows, a same-collateral
//     same-lltv FAMILY as one entry with its rows behind a disclosure, and the dust and the
//     never-funded behind two counted disclosures. Nothing is dropped; the reader chooses
//     what to open.
//
// WHY THE BAR IS UTILISATION AND NOT A LADDER: Fluid's view draws each vault's aggregate
// borrowed share against its rungs. Morpho cannot be drawn that way, and the reason is a fact
// about the protocol rather than a gap in the read — Blue's Market struct carries no total
// collateral at all (collateral is per-position state), so a market-wide LTV does not exist
// to plot. The lltv is therefore STATED as the number it is, and the bar shows the one
// aggregate ratio Blue does keep: borrow ÷ supply. That needs no oracle, which is why this
// whole page never asks one.
//
// Grouping is by loan token because that is Morpho's real structure and the curator's own
// axis — a PYUSD vault picks among PYUSD markets. It is also the only place a total is a
// quantity: a sum within a group is one token, and groups are never ranked against each other.
//
// A CLIENT COMPONENT for weight, which is counter-intuitive and worth recording: rendered as
// a server component the one-page version came to 7.2MB, 5.5MB of it flight payload, because
// React serialises the whole element tree — every row's ten elements and their className
// strings — into the RSC stream. A client component's flight payload carries only its PROPS,
// so the roster crosses once as compact data and the rows exist only as SSR'd HTML. Same
// pixels, roughly a third of the bytes; the split into two pages then cuts what any one
// request carries by an order of magnitude on top. It hydrates to nothing interactive: every
// disclosure is a native <details>, which needs no JavaScript to open.
//
// Rows, not cards, and no animation: a framer node per row is what froze the listing shells
// (see the listing entrance incident). Per-row title attributes are kept to facts true of THAT
// row only; the rules that hold for every row are stated once, in the page's prose, rather
// than repeated a thousand times into the payload.
//
// Provenance: each view owns ONE <ProvReceiptsScope>. Each rendered figure that is a
// single read or a clean arithmetic over reads carries a <Prov> from lib/morpho/markets-
// provenance — the lltv, the stored sizes, the group and family totals, the borrow ÷ supply
// ratio, and the live borrow rate. The roster COUNTS (markets, funded, loan tokens…) are
// cardinalities over the censused roster, not a figure read from a slot, so they carry
// data-prov-exempt rather than a receipt that would overclaim; and the never-funded list is a
// bulk restatement of lltvs already receipted for the funded markets on the same value, exempt
// so it does not bloat the payload the client-component split exists to keep small.

import Link from "next/link";
import { RatioBar } from "@/components/shared/ratio-bar";
import { shortMarketId, MORPHO_ADDRESSES } from "@/lib/morpho/asset-catalog";
import { chainMeta, explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { amount, pctText } from "@/lib/morpho/markets-format";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { VitalsBand } from "@/components/shared/vitals-band";
import {
  type MorphoMarketCoords,
  morphoLltvProv,
  morphoMarketSizeProv,
  morphoGroupTotalProv,
  morphoGroupUtilizationProv,
  morphoFamilyTotalProv,
  morphoLoanTokenSupplyProv,
  morphoUtilizationProv,
  morphoBorrowRateProv,
  morphoSupplyRateProv,
  morphoFeeProv,
} from "@/lib/morpho/markets-provenance";
import type {
  MorphoEmptyRun,
  MorphoLoanGroupSummary,
  MorphoLoanTokenViewData,
  MorphoMarketFamily,
  MorphoMarketsOverviewData,
  MorphoMarketsStampData,
} from "@/lib/morpho/markets-shape";
import type { MorphoMarketRow } from "@/lib/sources/chain/morpho-markets";

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The per-token page, one per loan token, under the overview's own path. */
const loanTokenHref = (chainId: ChainId, token: string) =>
  `/${chainMeta(chainId).slug}/morpho/markets/${token.toLowerCase()}`;

/** For turning a span of blocks into a span of time in the family prose. Nominal
 *  block times, stated as "about". */
const SECONDS_PER_BLOCK: Record<ChainId, number> = { 1: 12, 8453: 2, 11155111: 12 };

/** The page's headline instrument: every lltv in use across the protocol, with how many
 *  markets sit on each. Nine bars is the whole parameter space — that IS the claim. */
function LltvSpread({
  lltvs,
  total,
  block,
}: {
  lltvs: { lltv: number; markets: number; funded: number }[];
  total: number;
  block: number;
}) {
  const max = Math.max(...lltvs.map((l) => l.markets), 1);
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <h2 className="text-sm font-semibold text-foreground">The whole risk surface: {lltvs.length} numbers</h2>
      <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
        Every one of the {total.toLocaleString("en-US")} markets Morpho Blue has ever created sits on one of these{" "}
        {lltvs.length} loan-to-values, and governance has enabled each of them. A market&rsquo;s lltv is fixed when it
        is created and can never be changed — the market id is the hash of its parameters, so changing one would make a
        different market.
      </p>
      <div className="mt-3 grid gap-1.5">
        {lltvs.map((l) => (
          <div key={l.lltv} className="flex items-center gap-2.5 text-[11px] tabular-nums">
            <span className="w-12 shrink-0 text-right text-foreground">
              <Prov info={morphoLltvProv({ blockNumber: block })}>{pctText(l.lltv)}</Prov>
            </span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-rb-200 dark:bg-rb-500/30">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
                style={{ width: `${(l.markets / max) * 100}%` }}
              />
            </div>
            {/* Counts over the censused roster — how many markets share this lltv — not a
                figure read from a slot, so exempt rather than dressed as a receipt. */}
            <span
              className="w-28 shrink-0 text-rb-500"
              data-prov-exempt=""
              title="How many markets sit on this lltv — a count over the censused roster, not a slot read."
            >
              <span className="text-foreground">{l.markets}</span> markets
              {l.funded > 0 && <> · {l.funded} funded</>}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 max-w-3xl text-[11px] leading-relaxed text-rb-500">
        The bottom row is lltv 0: markets where nobody can ever borrow, because zero collateral value supports zero
        debt. Most exist so a vault can hold uninvested cash inside Blue rather than outside it.
      </p>
    </div>
  );
}

// ── one market ───────────────────────────────────────────────────────────────

/** The column heads for a run of MarketRows — stated once above each run, in the
 *  same widths, rather than repeated as a title on every cell. */
function MarketColumns() {
  return (
    <div
      className="flex items-center gap-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-rb-500"
      data-prov-exempt=""
      title="Column heads, not figures."
    >
      <span className="w-32 shrink-0">collateral</span>
      <span className="w-24 shrink-0">borrow ÷ supply</span>
      <span className="w-14 shrink-0 text-right">lltv</span>
      <span className="w-20 shrink-0 text-right">supplied</span>
      <span className="w-24 shrink-0 text-right">utilisation</span>
      <span className="w-24 shrink-0 text-right">borrow apr</span>
      <span className="w-24 shrink-0 text-right">supply apr</span>
      <span className="w-16 shrink-0 text-right">fee</span>
      <span className="shrink-0">market</span>
    </div>
  );
}

function MarketRow({ m, block, chainId }: { m: MorphoMarketRow; block: number; chainId: ChainId }) {
  const label = m.isIdle ? "idle — no collateral" : (m.collateralSymbol ?? "unnamed collateral");
  const coords: MorphoMarketCoords = {
    blockNumber: block,
    marketId: m.id,
    loanSymbol: m.loanSymbol,
    collateralSymbol: m.collateralSymbol,
    irm: m.irm,
  };
  return (
    <div className="flex items-center gap-3 px-1 py-1.5 text-[11px] tabular-nums">
      <a
        href={explorerUrl(chainId, "address", m.collateralToken)}
        target="_blank"
        rel="noopener noreferrer"
        className={`w-32 shrink-0 truncate ${m.isIdle ? "text-rb-500" : m.collateralNamed ? "text-foreground" : "font-mono text-rb-500"}`}
      >
        {label}
      </a>

      {/* RatioBar carries the mt-2.5 its card-tier callers want under a header row; these are
          rows, not cards, so the offset is zeroed rather than the instrument re-drawn. */}
      <div className="w-24 shrink-0 [&>div]:mt-0">
        {m.utilization != null ? (
          <RatioBar fill={m.utilization} ticks={[]} />
        ) : (
          <div className="h-2.5 rounded-full bg-rb-200 dark:bg-rb-500/30" />
        )}
      </div>

      <span className="w-14 shrink-0 text-right text-foreground">
        <Prov info={morphoLltvProv(coords)}>{pctText(m.lltv)}</Prov>
      </span>

      {/* An amount is only a quantity if its token's decimals() can be trusted to scale it.
          Where it can't, the ratio and the rate still stand (both are unit-free) but the size
          is not stated — a wrong number is worse than an absent one. */}
      {m.amountsTrusted ? (
        <span className="w-20 shrink-0 text-right text-foreground">
          <Prov info={morphoMarketSizeProv("supplied", coords)}>{amount(m.totalSupply)}</Prov>
        </span>
      ) : (
        <span
          className="w-20 shrink-0 text-right text-rb-500"
          title="This market's loan token misreports its own decimals, so its balances cannot be scaled to a quantity."
        >
          not stated
        </span>
      )}

      <span className="w-24 shrink-0 text-right text-rb-500">
        {m.utilization != null ? (
          <>
            util <Prov info={morphoUtilizationProv(coords)}>{pctText(m.utilization, 0)}</Prov>
          </>
        ) : (
          <>no supply</>
        )}
      </span>

      <span className="w-24 shrink-0 text-right text-rb-500">
        {/* borrowApr is a FRACTION, the convention lib/sources/chain/morpho-position.ts sets
            and position-to-markdown.ts echoes (borrowApr * 100). Rendering it as a percent
            directly understates every rate on the page by 100x — an 800% market read as 8%. */}
        {m.borrowApr != null ? (
          <>
            <span className="text-foreground">
              <Prov info={morphoBorrowRateProv(coords)}>{pctText(m.borrowApr, 2)}</Prov>
            </span>{" "}
            borrow
          </>
        ) : (
          <span title="This market names no interest rate model, so there is no rate to ask for.">no IRM</span>
        )}
      </span>

      <span className="w-24 shrink-0 text-right text-rb-500">
        {m.supplyApr != null ? (
          <>
            <span className="text-foreground">
              <Prov info={morphoSupplyRateProv(coords)}>{pctText(m.supplyApr, 2)}</Prov>
            </span>{" "}
            supply
          </>
        ) : (
          <span title="This market names no interest rate model, so there is no supply rate to derive.">no IRM</span>
        )}
      </span>

      <span className="w-16 shrink-0 text-right text-rb-500">
        fee <Prov info={morphoFeeProv(coords)}>{pctText(m.fee, 0)}</Prov>
      </span>

      {/* A market id is a mapping key inside the singleton, not an account — it has no
          Etherscan page, so it opens the market's own page here instead. The oracle beside it
          is a real contract and links to the explorer. */}
      <Link
        href={morphoMarketHref(chainId, m.loanToken, m.id)}
        prefetch={false}
        className="shrink-0 font-mono text-rb-500 hover:text-blue-500 hover:underline"
        title={m.id}
      >
        {shortMarketId(m.id)}
      </Link>
      {m.oracle ? (
        <a
          href={explorerUrl(chainId, "address", m.oracle)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external shrink-0 text-rb-500"
        >
          oracle
        </a>
      ) : (
        <span className="shrink-0 text-rb-500">no oracle</span>
      )}
    </div>
  );
}

function MarketRun({ markets, block, chainId }: { markets: MorphoMarketRow[]; block: number; chainId: ChainId }) {
  return (
    <div>
      <MarketColumns />
      <div className="divide-y divide-rb-300/25 dark:divide-rb-700/25">
        {markets.map((m) => (
          <MarketRow key={m.id} m={m} block={block} chainId={chainId} />
        ))}
      </div>
    </div>
  );
}

/** The never-funded tail — the same chips on both views: a bulk restatement of each
 *  created market's immutable lltv, exempt (its receipt is the one the funded markets
 *  on the same value already carry) so listing it does not bloat the payload. */
function NeverFunded({ runs, count, loanSymbol }: { runs: MorphoEmptyRun[]; count: number; loanSymbol: string }) {
  if (count === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-foreground">Created, never funded</h2>
      <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
        {count.toLocaleString("en-US")} {loanSymbol} markets hold no supply at this block. Creating a market on Blue is
        permissionless and costs only gas, so most of them were simply never used — they carry the parameters they were
        born with and nothing else. They are listed because the roster is the protocol&rsquo;s, not ours; markets born
        with the same collateral and the same loan-to-value are one line with a count.
      </p>
      {/* A native disclosure: no state, no client bundle, and it still works if JS never
          arrives — the list is in the HTML either way. */}
      <details className="mt-2 group">
        <summary className="cursor-pointer list-none text-[11px] text-blue-500 hover:underline">
          <span className="group-open:hidden">Show {count.toLocaleString("en-US")} empty markets</span>
          <span className="hidden group-open:inline">Hide empty markets</span>
        </summary>
        <div
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-rb-500"
          data-prov-exempt=""
          title="Each entry's lltv is the immutable market parameter already receipted for the funded markets on the same value (id == keccak(params)); the never-funded roster is listed for completeness, not re-traced per market."
        >
          {runs.map((r) => (
            <span key={`${r.collateralSymbol ?? "idle"}:${r.lltv}`}>
              <span className={r.collateralSymbol && !r.collateralNamed ? "font-mono" : ""}>
                {r.collateralSymbol ?? "idle"}
              </span>{" "}
              / {loanSymbol} · <span className="text-foreground">{pctText(r.lltv)}</span>
              {r.count > 1 && <> ×{r.count}</>}
            </span>
          ))}
        </div>
      </details>
    </section>
  );
}

export function MorphoMarketsStamp({
  data,
  chainId = MAINNET_CHAIN_ID,
  blue = MORPHO_ADDRESSES.MORPHO_BLUE,
}: {
  /** Three scalars (lib/morpho/markets-shape stampOf) — never the response,
   *  whose roster would ride along as this client component's props. */
  data: MorphoMarketsStampData;
  chainId?: ChainId;
  blue?: string;
}) {
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
      </a>{" "}
      · every market&rsquo;s state read from the{" "}
      <a
        href={explorerUrl(chainId, "address", blue)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        Morpho Blue singleton
      </a>{" "}
      · roster censused at block {data.censusBlock.toLocaleString("en-US")}
    </p>
  );
}

// ── the overview: one row per loan token ─────────────────────────────────────

function LoanTokenColumns() {
  return (
    <div
      className="flex items-center gap-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-rb-500"
      data-prov-exempt=""
      title="Column heads, not figures."
    >
      <span className="w-36 shrink-0">loan token</span>
      <span className="w-20 shrink-0 text-right">markets</span>
      <span className="w-20 shrink-0 text-right">supplied</span>
      <span className="w-20 shrink-0 text-right">borrowed</span>
      <span className="w-24 shrink-0">borrow ÷ supply</span>
      <span className="w-12 shrink-0 text-right">util</span>
      <span className="min-w-0 flex-1">lent against</span>
    </div>
  );
}

function LoanTokenRow({ g, block, chainId }: { g: MorphoLoanGroupSummary; block: number; chainId: ChainId }) {
  const coords: MorphoMarketCoords = { blockNumber: block, loanSymbol: g.loanSymbol, loanToken: g.loanToken };
  const util = g.totalSupply > 0 ? g.totalBorrow / g.totalSupply : null;
  const overIssued =
    g.amountsTrusted && g.loanTokenSupply != null && g.loanTokenSupply > 0 && g.totalSupply > g.loanTokenSupply * 1.001;
  return (
    <div className="flex items-center gap-3 px-1 py-1.5 text-[11px] tabular-nums">
      <span className="flex w-36 shrink-0 items-baseline gap-1.5 truncate">
        <Link
          href={loanTokenHref(chainId, g.loanToken)}
          className={`hover:underline ${g.loanNamed ? "font-semibold text-foreground" : "font-mono text-rb-500"}`}
        >
          {g.loanSymbol}
        </Link>
        {/* A symbol is a claim the token makes about itself, and anyone can mint a token that
            claims to be USDC — several addresses on each roster do. Where a symbol is not
            unique it cannot identify the row, so the address is shown alongside it. */}
        {g.ambiguous && (
          <span
            className="font-mono text-[10px] text-rb-500"
            title={`${g.loanToken} — more than one token on this roster calls itself ${g.loanSymbol}. Only the address distinguishes them.`}
          >
            {shortAddr(g.loanToken)}
          </span>
        )}
      </span>

      {/* Counts over the roster's per-market state, not a slot read. */}
      <span
        className="w-20 shrink-0 text-right text-rb-500"
        data-prov-exempt=""
        title={`${g.funded} of this token's ${g.markets} markets hold supply; ${g.borrowing} have borrowing. Counts over the roster, not a slot read.`}
      >
        <span className="text-foreground">{g.funded}</span>
        <span className="text-rb-500"> / {g.markets}</span>
      </span>

      {g.amountsTrusted ? (
        <>
          <span className="w-20 shrink-0 text-right text-foreground">
            <Prov info={morphoGroupTotalProv("supplied", coords)}>{amount(g.totalSupply)}</Prov>
          </span>
          <span className="w-20 shrink-0 text-right text-foreground">
            <Prov info={morphoGroupTotalProv("borrowed", coords)}>{amount(g.totalBorrow)}</Prov>
          </span>
        </>
      ) : (
        <span
          className="w-[10.75rem] shrink-0 text-right text-rb-500"
          title={`${g.loanSymbol} misreports its own decimals, so a total over it would not be a quantity of anything.`}
        >
          not stated
        </span>
      )}

      <div className="w-24 shrink-0 [&>div]:mt-0">
        {util != null ? (
          <RatioBar fill={util} ticks={[]} />
        ) : (
          <div className="h-2.5 rounded-full bg-rb-200 dark:bg-rb-500/30" />
        )}
      </div>
      <span className="w-12 shrink-0 text-right text-rb-500">
        {util != null ? <Prov info={morphoGroupUtilizationProv(coords)}>{pctText(util, 0)}</Prov> : "—"}
      </span>

      {/* Which collaterals carry this token's book — names and market counts over the
          roster, biggest book first. Not a figure. */}
      <span
        className="min-w-0 flex-1 truncate text-rb-500"
        data-prov-exempt=""
        title="Collateral names and market counts over the roster — biggest book first — not a slot read."
      >
        {g.against.map((c, i) => (
          <span key={c.collateralToken ?? "idle"}>
            {i > 0 && " · "}
            <span className={c.collateralToken ? "text-foreground" : ""}>{c.symbol}</span>
            {c.markets > 1 && <span className="text-rb-500"> ×{c.markets}</span>}
          </span>
        ))}
        {g.collaterals > g.against.length && <span> · +{g.collaterals - g.against.length} more</span>}
        {overIssued && (
          <span
            className="text-caution-500"
            title="This token's books stand above the amount of the token that exists — see the token's page."
          >
            {" "}
            · books exceed the token
          </span>
        )}
      </span>
    </div>
  );
}

export function MorphoMarketsOverview({
  data,
  chainId = MAINNET_CHAIN_ID,
}: {
  /** The response with each group reduced to its summary (lib/morpho/markets-
   *  shape overviewData) — the roster itself never crosses to this view. */
  data: MorphoMarketsOverviewData;
  /** Which chain's explorer the addresses link into, and which path the rows
   *  open. Defaults to Ethereum. */
  chainId?: ChainId;
}) {
  // Hook first (before the early return), so the receipts registry is stable across renders
  // regardless of the stale branch — the compound-markets-view / maple-pools-view order.
  const registry = useReceiptRegistry();
  if (data.chainStale) {
    return <p className="text-sm text-rb-500">The market roster could not be read from chain at this block.</p>;
  }

  // A token whose markets have never held anything has nothing to state on a row beyond its
  // name; those are listed on demand, because "anyone can create a market and most are never
  // used" is a fact about Morpho, not a blemish to hide.
  const funded = data.groups.filter((g) => g.funded > 0);
  const unfunded = data.groups.filter((g) => g.funded === 0);

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The vitals band. Roster COUNTS are cardinalities over the censused
          roster, not figures read from a slot — so each carries
          data-prov-exempt rather than being dressed as a receipt.

          The two SIZE slots and USAGE are empty on purpose at this level: the
          roster spans many different loan tokens, and every market measures in
          its own, so there is no unit a protocol-wide supplied / borrowed
          total — or the ratio between them — could be stated in. Those figures
          appear one row down, per loan token, where the unit is single. Do not
          add a USD total here. */}
      <VitalsBand
        className="mb-4"
        vitals={[
          {
            slot: "roster",
            label: "Markets",
            value: <span data-prov-exempt="">{data.summary.total.toLocaleString("en-US")}</span>,
            title:
              "Morpho Blue's only market-making entry point always emits CreateMarket, so this roster is every market that exists — not a sample. A count over the censused catalog, not a slot read.",
          },
        ]}
        notes={
          <>
            <span
              data-prov-exempt=""
              title="How many markets carry supply / carry borrowing at this block — counts over the roster's per-market state, not a single slot read."
            >
              <span className="text-foreground">{data.summary.funded.toLocaleString("en-US")}</span> hold supply ·{" "}
              <span className="text-foreground">{data.summary.borrowed.toLocaleString("en-US")}</span> have borrowing
            </span>
            <span
              data-prov-exempt=""
              title="A count over the roster — how many markets hold no supply — not a slot read."
            >
              <span className="text-foreground">{data.summary.neverFunded.toLocaleString("en-US")}</span> never funded
            </span>
            {data.summary.idleMarkets > 0 && (
              <span
                data-prov-exempt=""
                title="No collateral token, no oracle, no IRM: nothing can be borrowed. A place to hold cash inside Blue. A count over the roster, not a slot read."
              >
                <span className="text-foreground">{data.summary.idleMarkets}</span> idle markets
              </span>
            )}
            <span
              data-prov-exempt=""
              title="Distinct loan tokens across the roster — a count over the markets, not a slot read."
            >
              <span className="text-foreground">{data.summary.loanTokens}</span> loan tokens ·{" "}
              <span className="text-foreground">{funded.length}</span> with funded markets
            </span>
          </>
        }
      />

      <div className="mb-5">
        <LltvSpread lltvs={data.summary.lltvs} total={data.summary.total} block={data.blockNumber} />
      </div>

      <section className="rounded-xl bg-raised px-4 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">One row per loan token</h2>
        <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
          Every market measures in its loan token, so that is the unit of every figure on its row and the only unit the
          row can be totalled in. Rows are ordered by how many of their markets hold money, not by size — the totals are
          in different tokens and do not compare. Open a row for that token&rsquo;s markets, one by one.
        </p>
        <div className="mt-3">
          <LoanTokenColumns />
          <div className="divide-y divide-rb-300/25 dark:divide-rb-700/25">
            {funded.map((g) => (
              <LoanTokenRow key={g.loanToken} g={g} block={data.blockNumber} chainId={chainId} />
            ))}
          </div>
        </div>
        {unfunded.length > 0 && (
          <details className="mt-3 group">
            <summary className="cursor-pointer list-none text-[11px] text-blue-500 hover:underline">
              <span className="group-open:hidden">
                Show {unfunded.length} loan tokens whose markets have never been funded
              </span>
              <span className="hidden group-open:inline">Hide unfunded loan tokens</span>
            </summary>
            <div
              className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-rb-500"
              data-prov-exempt=""
              title="Names and market counts over the roster — no figure here is a slot read."
            >
              {unfunded.map((g) => (
                <span key={g.loanToken} title={g.loanToken}>
                  <Link href={loanTokenHref(chainId, g.loanToken)} className="hover:underline">
                    <span className={g.loanNamed ? "text-foreground" : "font-mono"}>{g.loanSymbol}</span>
                  </Link>
                  {g.ambiguous && <span className="font-mono"> {shortAddr(g.loanToken)}</span>} ·{" "}
                  {g.markets === 1 ? "1 market" : `${g.markets} markets`}
                </span>
              ))}
            </div>
          </details>
        )}
      </section>

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}

// ── one loan token ───────────────────────────────────────────────────────────

function FamilyEntry({
  f,
  g,
  block,
  chainId,
}: {
  f: MorphoMarketFamily;
  g: MorphoLoanTokenViewData;
  block: number;
  chainId: ChainId;
}) {
  const coords: MorphoMarketCoords = {
    blockNumber: block,
    loanSymbol: g.loanSymbol,
    loanToken: g.loanToken,
    collateralSymbol: f.collateralSymbol,
  };
  const coll = f.collateralSymbol ?? shortAddr(f.collateralToken);
  const span = f.lastBlock - f.firstBlock;
  const minutes = Math.round((span * SECONDS_PER_BLOCK[chainId]) / 60);
  return (
    <section className="rounded-xl bg-raised px-4 py-3.5">
      <h2 className="text-sm font-semibold text-foreground">
        <span data-prov-exempt="" title="A count over the roster, not a slot read.">
          {f.markets.length} markets
        </span>{" "}
        that are one market {f.oracles} times over: {g.loanSymbol} against{" "}
        <a
          href={explorerUrl(chainId, "address", f.collateralToken)}
          target="_blank"
          rel="noopener noreferrer"
          className={f.collateralNamed ? "" : "font-mono"}
        >
          {coll}
        </a>{" "}
        at <Prov info={morphoLltvProv({ blockNumber: block, loanSymbol: g.loanSymbol })}>{pctText(f.lltv)}</Prov>
      </h2>
      <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
        Every one of these has the same collateral, the same loan-to-value and{" "}
        {f.irms === 1 ? "the same interest-rate model" : `one of ${f.irms} interest-rate models`}; they differ only in
        the oracle they name — {f.oracles} different oracles — and they were created between blocks{" "}
        {f.firstBlock.toLocaleString("en-US")} and {f.lastBlock.toLocaleString("en-US")}, {span.toLocaleString("en-US")}{" "}
        blocks and about {minutes} minutes apart. A market&rsquo;s id is the hash of its parameters, so changing the
        oracle alone is enough to mint a new one.
        {f.allPinned && (
          <>
            {" "}
            Every one of them sits at 100% utilisation: nothing was ever supplied here beyond what was borrowed, and the
            books have compounded from there.
          </>
        )}
      </p>
      <p className="mt-1.5 text-[11px] tabular-nums text-rb-500">
        Together they book{" "}
        <span className="text-foreground">
          <Prov info={morphoFamilyTotalProv("supplied", coords, f.markets.length)}>{amount(f.totalSupply)}</Prov>
        </span>{" "}
        supplied ·{" "}
        <span className="text-foreground">
          <Prov info={morphoFamilyTotalProv("borrowed", coords, f.markets.length)}>{amount(f.totalBorrow)}</Prov>
        </span>{" "}
        borrowed, in {g.loanSymbol}.
      </p>
      <details className="mt-2 group">
        <summary className="cursor-pointer list-none text-[11px] text-blue-500 hover:underline">
          <span className="group-open:hidden">Show all {f.markets.length} markets</span>
          <span className="hidden group-open:inline">Hide the {f.markets.length} markets</span>
        </summary>
        <div className="mt-3">
          <MarketRun markets={f.markets} block={block} chainId={chainId} />
        </div>
      </details>
    </section>
  );
}

export function MorphoLoanTokenView({
  block,
  group: g,
  chainId = MAINNET_CHAIN_ID,
}: {
  /** The head block the roster was read at. */
  block: number;
  /** This token alone, already shaped (lib/morpho/markets-shape
   *  loanTokenViewData) — the rest of the roster never crosses. */
  group: MorphoLoanTokenViewData;
  chainId?: ChainId;
}) {
  const registry = useReceiptRegistry();
  const coords: MorphoMarketCoords = { blockNumber: block, loanSymbol: g.loanSymbol, loanToken: g.loanToken };
  const shape = g;
  const util = g.totalSupply > 0 ? g.totalBorrow / g.totalSupply : null;
  // Blue credits accrued interest to a market's stored supply with no token moving, so a
  // group's book can stand above the amount of the asset that exists. Where it does, say so
  // — it is the difference between a claim about Morpho's bookkeeping and a claim about the
  // world, and only the first is what the figure beside it means.
  //
  // The 0.1% margin is not a fudge of the comparison: both figures are Numbers scaled from
  // 18-decimal integers, so a book that exactly equals its token's supply lands a hair
  // either side of it at random. Flagging that would put a caution on a rounding tie. What is
  // being named here is a book that has outrun its asset by an amount that means something.
  const overIssued =
    g.amountsTrusted && g.loanTokenSupply != null && g.loanTokenSupply > 0 && g.totalSupply > g.loanTokenSupply * 1.001;
  const familiesCoverIt = overIssued && shape.familySupply > (g.loanTokenSupply ?? 0);

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The vitals band. Unlike the overview one level up, this surface DOES
          have a common unit — every market here measures in {g.loanSymbol} —
          so the size slots and the one ratio Blue keeps can be stated. They
          disappear for a token that misreports its own decimals: the caveat in
          the notes is the reason, and it must stay visible. */}
      <VitalsBand
        vitals={[
          {
            slot: "roster",
            label: "Markets",
            value: <span data-prov-exempt="">{g.markets.toLocaleString("en-US")}</span>,
            title: "Counts over this token's markets on the censused roster, not a slot read.",
          },
          g.amountsTrusted && {
            slot: "sizeIn" as const,
            label: "Supplied",
            value: (
              <Prov info={morphoGroupTotalProv("supplied", coords)}>
                {amount(g.totalSupply)} {g.loanSymbol}
              </Prov>
            ),
          },
          g.amountsTrusted && {
            slot: "sizeOut" as const,
            label: "Borrowed",
            value: (
              <Prov info={morphoGroupTotalProv("borrowed", coords)}>
                {amount(g.totalBorrow)} {g.loanSymbol}
              </Prov>
            ),
          },
          g.amountsTrusted &&
            util != null && {
              slot: "usage" as const,
              label: "Utilisation",
              value: <Prov info={morphoGroupUtilizationProv(coords)}>{pctText(util, 0)}</Prov>,
              title: `Σ borrow ÷ Σ supply across this loan token's markets, both in ${g.loanSymbol} — the one aggregate ratio Blue keeps. Blue's Market struct carries no total collateral, so there is no protocol-wide LTV to state.`,
            },
        ]}
        notes={
          <>
            <span data-prov-exempt="" title="Counts over this token's markets on the censused roster, not a slot read.">
              <span className="text-foreground">{g.funded.toLocaleString("en-US")}</span> hold supply ·{" "}
              <span className="text-foreground">{g.borrowing.toLocaleString("en-US")}</span> have borrowing
            </span>
            {!g.amountsTrusted && (
              <span
                title={`${g.loanSymbol} misreports its own decimals, so a total over it would not be a quantity of anything.`}
              >
                totals not stated — {g.loanSymbol} misreports its decimals
              </span>
            )}
            {g.amountsTrusted && g.loanTokenSupply != null && (
              <span>
                <span className="text-foreground">
                  <Prov info={morphoLoanTokenSupplyProv(coords)}>{amount(g.loanTokenSupply)}</Prov>
                </span>{" "}
                {g.loanSymbol} exists
              </span>
            )}
            {g.ambiguous && (
              <span
                className="font-mono"
                title={`More than one token on this roster calls itself ${g.loanSymbol}. Only the address distinguishes them.`}
              >
                {g.loanToken}
              </span>
            )}
          </>
        }
      />

      {overIssued && (
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-caution-500">
          These books stand above the token itself: only{" "}
          <Prov info={morphoLoanTokenSupplyProv(coords)}>{amount(g.loanTokenSupply ?? 0)}</Prov> {g.loanSymbol} exists.
          Blue credits accrued interest to a market&rsquo;s stored supply without any token moving, so a market left at
          full utilisation while its rate climbs compounds its own book past the asset behind it. The figures here are
          what the contract stores, stated as it stores them.
          {familiesCoverIt && (
            <>
              {" "}
              The{" "}
              {shape.families
                .map((f) => `${f.markets.length}-market ${f.collateralSymbol ?? "unnamed"}`)
                .join(" and ")}{" "}
              {shape.families.length === 1 ? "family below accounts for" : "families below account for"} nearly all of
              it.
            </>
          )}
        </p>
      )}

      <div className="mt-5 grid gap-2.5">
        {shape.material.length > 0 && (
          <section className="rounded-xl bg-raised px-4 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">
              {shape.families.length > 0 || shape.dust.length > 0 ? "The markets that carry the book" : "Markets"}
            </h2>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
              Biggest book first. The bar is borrow ÷ supply, the one aggregate ratio Blue keeps; the lltv beside it is
              the market&rsquo;s whole risk surface. Sizes are the balance each market last settled, never projected
              forward; the rates are live.
            </p>
            <div className="mt-3">
              <MarketRun markets={shape.material} block={block} chainId={chainId} />
            </div>
          </section>
        )}

        {shape.families.map((f) => (
          <FamilyEntry key={`${f.collateralToken}:${f.lltv}`} f={f} g={g} block={block} chainId={chainId} />
        ))}

        {shape.dust.length > 0 && (
          <section className="rounded-xl bg-raised px-4 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">
              <span data-prov-exempt="" title="A count over this token's markets, not a slot read.">
                {shape.dust.length.toLocaleString("en-US")} more funded markets
              </span>
              , each below 0.1% of the book
            </h2>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
              Funded, and real, and each holding less than a thousandth of what the markets above hold between them.
              Every figure on their rows carries the same receipt as the rows above.
            </p>
            <details className="mt-2 group">
              <summary className="cursor-pointer list-none text-[11px] text-blue-500 hover:underline">
                <span className="group-open:hidden">Show {shape.dust.length.toLocaleString("en-US")} markets</span>
                <span className="hidden group-open:inline">Hide them</span>
              </summary>
              <div className="mt-3">
                <MarketRun markets={shape.dust} block={block} chainId={chainId} />
              </div>
            </details>
          </section>
        )}
      </div>

      <NeverFunded runs={shape.empties} count={shape.emptiesCount} loanSymbol={g.loanSymbol} />

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
