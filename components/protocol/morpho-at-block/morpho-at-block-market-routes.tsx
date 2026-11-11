// The markets pages of Morpho Blue read on visit, Arc's and Optimism's
// (rails-ops ui-jobs 577 and 578): the shared roster, loan-token and market
// pages (lib/morpho/roster.tsx, lib/morpho/product.tsx) on rails-server's
// markets and market reads (lib/morpho-at-block/markets.ts). Each chain's route
// files are one line on these.
//
// The roster: every market from the CreateMarket list read at the head when the
// page opens. The test-token and never-supplied markets stay off the list and
// its counts, named in one line under the head with the idle market, which
// stays listed. A market the list leaves out keeps its page and says why; an
// idle market's page says what it is.
//
// SERVER-ONLY: the reads use the bearer token.

import { cache, type ComponentProps } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MorphoLoanTokenPage, MorphoRosterPage } from "@/lib/morpho/roster";
import { loanTokenViewData, marketViewData, rosterData, withRosterMarks } from "@/lib/morpho/markets-shape";
import type { MorphoMarketPage } from "@/lib/morpho/product";
import { morphoMarketHref } from "@/lib/morpho/market-routes";
import { fetchMorphoAtBlockMarket, fetchMorphoAtBlockMarkets } from "@/lib/api/fetch-morpho-at-block";
import { atBlockMarketResponse, atBlockMarketsResponse, atBlockRosterMarks } from "@/lib/morpho-at-block/markets";
import { atBlockUnlisted } from "@/lib/morpho-at-block/unlisted";
import { MARKET_LIST_WORDS } from "@/lib/morpho-at-block/words";
import { STALE_MARKETS } from "@/lib/morpho-at-block/stale";
import { ZERO_ADDRESS, type MorphoAtBlockDeployment } from "@/lib/morpho-at-block/types";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

type Dep = MorphoAtBlockDeployment;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const MARKET_ID = /^0x[0-9a-f]{64}$/;
const hook = (dep: Dep, name: string, value: string) => ({ [`data-morpho-${dep.key}-${name}`]: value });

/** One markets read per request: the loan-token page's metadata and body share it. */
const loadMarkets = cache(async (api: Dep["api"]) => {
  const a = await fetchMorphoAtBlockMarkets({ api });
  return a.kind === "ok" ? atBlockMarketsResponse(a.data) : null;
});
/** One market read per request: the market page's metadata and body share it. */
const loadMarket = cache((api: Dep["api"], id: string) => fetchMorphoAtBlockMarket({ api }, id));

/** `/<chain>/morpho/markets`: the roster. */
export async function MorphoAtBlockMarketsRoute({ dep }: { dep: Dep }) {
  const answer = await fetchMorphoAtBlockMarkets(dep);
  if (answer.kind !== "ok")
    return <MorphoRosterPage data={rosterData(STALE_MARKETS, null, "none")} chainId={dep.chainId} />;
  const d = rosterData(atBlockMarketsResponse(answer.data), null, "none");
  const u = atBlockUnlisted(answer.data);
  const unlisted = MARKET_LIST_WORDS.unlisted(u.test, u.never);
  const loanOf = (m: { loanToken: string }) =>
    m.loanToken !== ZERO_ADDRESS ? (answer.data.tokens[m.loanToken]?.symbol ?? null) : null;
  const note = (
    <div className="mb-6 max-w-2xl space-y-1 text-[13px] leading-relaxed text-rb-500" {...hook(dep, "list-note", "")}>
      {unlisted && <p {...hook(dep, "unlisted", `${u.test}:${u.never}`)}>{unlisted}</p>}
      {u.idles.map((m) => {
        const loan = loanOf(m);
        return (
          <p key={m.id} {...hook(dep, "idle", "")}>
            {loan ? MARKET_LIST_WORDS.idleLends(loan) : MARKET_LIST_WORDS.idle}{" "}
            <Link href={morphoMarketHref(dep.chainId, m.loanToken, m.id)} className={INLINE_LINK}>
              {MARKET_LIST_WORDS.idleLink}
            </Link>
            .
          </p>
        );
      })}
    </div>
  );
  return (
    <MorphoRosterPage
      data={withRosterMarks(d, atBlockRosterMarks(answer.data))}
      chainId={dep.chainId}
      note={note}
      unfundedLabel={MARKET_LIST_WORDS.emptyNow}
      unfundedWords={MARKET_LIST_WORDS.emptyNowWords}
    />
  );
}

/** `/<chain>/morpho/markets/<loan token>`: the metadata. */
export async function morphoAtBlockLoanTokenMetadata(dep: Dep, loanToken: string): Promise<Metadata> {
  const token = loanToken.toLowerCase();
  if (!ADDRESS.test(token)) return { title: `Morpho Blue markets on ${dep.chain}` };
  const g = (await loadMarkets(dep.api))?.groups.find((x) => x.loanToken === token);
  const name = g?.loanNamed ? g.loanSymbol : `${token.slice(0, 6)}…${token.slice(-4)}`;
  return {
    title: `${name} markets · Morpho Blue on ${dep.chain}`,
    description: `Every Morpho Blue market on ${dep.chain} that lends ${name}: its collateral, LLTV, size, rates and utilisation.`,
    alternates: { canonical: `${dep.route}/markets/${token}` },
    robots: { index: false },
  };
}

/** `/<chain>/morpho/markets/<loan token>`: one loan token's markets. */
export async function MorphoAtBlockLoanTokenRoute({ dep, loanToken }: { dep: Dep; loanToken: string }) {
  const token = loanToken.toLowerCase();
  if (!ADDRESS.test(token)) notFound();
  const data = await loadMarkets(dep.api);
  if (!data)
    return (
      <p className="py-12 text-center text-sm text-rb-500">
        The market roster could not be read from the chain. Reload to try again.
      </p>
    );
  const g = data.groups.find((x) => x.loanToken === token);
  if (!g) notFound();
  return (
    <MorphoLoanTokenPage
      g={loanTokenViewData(data, g)}
      block={data.blockNumber}
      fromLogs={false}
      chainId={dep.chainId}
    />
  );
}

/** `/<chain>/morpho/markets/<loan token>/<market id>`: the metadata. */
export async function morphoAtBlockMarketMetadata(dep: Dep, loanToken: string, marketId: string): Promise<Metadata> {
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) return { title: `Morpho Blue market on ${dep.chain}` };
  const a = await loadMarket(dep.api, id);
  const m = a.kind === "ok" ? atBlockMarketResponse(a.data).market : null;
  // The idle market that names no loan token is named as the idle market.
  const pair = !m
    ? "Morpho Blue market"
    : m.isIdle && m.loanToken === ZERO_ADDRESS
      ? "Idle market"
      : m.isIdle
        ? `${m.loanSymbol} idle market`
        : `${m.collateralSymbol ?? "no collateral"} / ${m.loanSymbol}`;
  return {
    title: `${pair} · Morpho Blue on ${dep.chain}`,
    description: `One Morpho Blue market on ${dep.chain}, ${pair}: what it holds, what it pays and charges, its rate curve, its oracle price and its terms.`,
    alternates: { canonical: `${dep.route}/markets/${token}/${id}` },
    robots: { index: false },
  };
}

/** `/<chain>/morpho/markets/<loan token>/<market id>`: the shared market page's props for one market,
 *  with the feeds its oracle names. The route renders `MorphoMarketPage` itself, so Focus's check
 *  (scripts/check-focus.mjs) finds the page's declaration within its depth. */
export async function morphoAtBlockMarketPageProps(
  dep: Dep,
  loanToken: string,
  marketId: string,
): Promise<ComponentProps<typeof MorphoMarketPage>> {
  const token = loanToken.toLowerCase();
  const id = marketId.toLowerCase();
  if (!ADDRESS.test(token) || !MARKET_ID.test(id)) notFound();
  const a = await loadMarket(dep.api, id);
  if (a.kind === "not-found") notFound();
  const data = a.kind === "ok" ? atBlockMarketResponse(a.data) : null;
  if (data && data.params.loanToken !== token) notFound();
  const m = a.kind === "ok" ? a.data.market : null;
  const idle = m != null && m.collateralToken === ZERO_ADDRESS && m.oracle === ZERO_ADDRESS && m.irm === ZERO_ADDRESS;
  const idleLoan = idle && m.loanToken !== ZERO_ADDRESS && a.kind === "ok" ? a.data.tokens[m.loanToken]?.symbol : null;
  const line = m?.unlisted
    ? MARKET_LIST_WORDS.page[m.unlisted]
    : idle
      ? idleLoan
        ? MARKET_LIST_WORDS.idleLendsPage(idleLoan)
        : MARKET_LIST_WORDS.idlePage
      : null;
  const note = line ? (
    <p className="mb-6 max-w-2xl text-[13px] text-rb-500" {...hook(dep, "market-note", m?.unlisted ?? "idle")}>
      {line}
    </p>
  ) : null;
  return {
    data: data ? marketViewData(data) : null,
    chainId: dep.chainId,
    pair: "Morpho Blue market",
    positions: { href: dep.route, label: `A wallet's Morpho Blue positions on ${dep.chain}` },
    note,
  };
}
