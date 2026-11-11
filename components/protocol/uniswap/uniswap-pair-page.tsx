// One pair's pools under a Uniswap-family explorer (G10.1; rails-ops ui-jobs
// 568, 573, 575), at `<route>/pairs/<pair>`: the chain's pairs as chips, the
// pair chosen, then the explorer's version's hookless pools for it, each a
// card (components/start/pair-door.tsx), as /start's pair step draws them for
// Ethereum. One read of rails-server's pair route at the head and 30, 60 and
// 90 days back.
//
// SERVER-ONLY: the read uses the bearer token.

import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { PairDoorCards } from "@/components/start/pair-door";
import { InFocusSymbol, StartOutOfFocus } from "@/components/start/start-focus";
import { fetchUniswapPair } from "@/lib/api/fetch-uniswap";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { uniExplorer, type UniChainId, type UniProtocol } from "@/lib/uniswap/deployments";
import { CHAIN_PAIRS, chainPair, pairCards } from "@/lib/uniswap/pairs";
import type { UniswapVersion } from "@/lib/uniswap/types";
import { PAIR_DOOR, versionLabel } from "@/lib/uniswap/words";

const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:focus-visible:ring-teal-400";

export async function UniswapPairPage({
  version,
  pair,
  protocol = "uniswap",
  chainId = 1,
}: {
  version: UniswapVersion;
  pair: string;
  protocol?: UniProtocol;
  chainId?: UniChainId;
}) {
  const spec = chainPair(chainId, pair);
  if (!spec) notFound();
  const x = uniExplorer(protocol, chainId, version);
  const { tokens, pairs } = CHAIN_PAIRS[chainId];
  const answer = await fetchUniswapPair(tokens[spec.base].param, tokens[spec.quote].param, protocol, chainId);
  const cards = answer.kind === "ok" ? pairCards(answer.data, pair, protocol).filter((c) => c.version === version) : [];
  return (
    <div className="py-8" data-anatomy="G10.1" data-uniswap-pair={`${x.id}:${pair}`}>
      <header className="mb-5">
        <DetailTopRow session={x.id as SessionProtocol} fallbackHref={x.route} showStamp={false} tools={false} />
        <HistoryTitleRow id={x.id}>
          <h2 className="text-lg font-semibold text-foreground">{PAIR_DOOR.heading(spec.base, spec.quote)}</h2>
        </HistoryTitleRow>
        <p className="text-xs text-rb-500">
          {versionLabel(version, protocol)} · {x.deployment.chainName}
        </p>
      </header>
      <ul className="mb-6 flex flex-wrap gap-2" aria-label={PAIR_DOOR.listQuestion}>
        {Object.entries(pairs).map(([k, p]) => (
          <li key={k}>
            <Link
              href={`${x.route}/pairs/${k}`}
              scroll={false}
              aria-current={k === pair ? "page" : undefined}
              data-uniswap-pair-chip={k}
              className={`${CHIP} ${
                k === pair
                  ? "border-teal-600 font-medium text-foreground dark:border-teal-400"
                  : "border-rb-200 text-rb-500 hover:border-teal-600 dark:border-rb-600 dark:hover:border-teal-400"
              }`}
            >
              {PAIR_DOOR.chip(p.base, p.quote)}
            </Link>
          </li>
        ))}
      </ul>
      {answer.kind === "ok" ? (
        // Focus: the cards show where the pair's symbols are in focus, as on /start.
        <InFocusSymbol
          symbols={[spec.base, spec.quote]}
          fallback={<StartOutOfFocus what={PAIR_DOOR.chip(spec.base, spec.quote)} />}
        >
          <PairDoorCards base={spec.base} quote={spec.quote} cards={cards} protocol={protocol} v4={version === "v4"} />
        </InFocusSymbol>
      ) : (
        <p className="text-sm text-rb-500">{PAIR_DOOR.unanswered}</p>
      )}
    </div>
  );
}
