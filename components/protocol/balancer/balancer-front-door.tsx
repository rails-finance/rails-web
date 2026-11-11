"use client";

// Balancer V3's front door (N5; rails-ops ui-jobs 569): Uniswap's
// (`PoolFrontDoor`), landing on a wallet's pool shares on the chain, then the
// index's count of the pool shares held on the chain (U11; decision 0063).

import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { PoolFrontDoor } from "@/components/protocol/uniswap/uniswap-front-door";
import { BAL_CHAINS, type BalChainId } from "@/lib/balancer/chains";
import { countProv } from "@/lib/balancer/provenance";
import { COUNT_WORDS, FRONT_DOOR, LABEL } from "@/lib/balancer/words";
import { explorerHref } from "@/lib/shared/protocols";

const SCOPE = "balancer-count";

/** The count as the page passes it: null where the index did not answer. */
export type BalCount = { through: number; positions: number; holders: number } | null;

function Count({ chainId, count }: { chainId: BalChainId; count: BalCount }) {
  if (!count)
    return (
      <p className="mt-10 text-sm text-rb-500" data-balancer-count="">
        {COUNT_WORDS.unanswered}
      </p>
    );
  const c = { chainId, ...count };
  const cells = [
    { key: "positions", label: COUNT_WORDS.positions, tip: COUNT_WORDS.positionsTip, value: count.positions },
    { key: "holders", label: COUNT_WORDS.holders, tip: COUNT_WORDS.holdersTip, value: count.holders },
  ] as const;
  return (
    <ProvSection scope={SCOPE} className="mt-10 w-full max-w-xl" data-anatomy="U11" data-balancer-count="">
      <SectionHeading title={COUNT_WORDS.title} menu={<SectionMenu scope={SCOPE} title={COUNT_WORDS.title} />} />
      <dl className="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        {cells.map((x) => (
          <div key={x.key} data-balancer-count-cell={x.key}>
            <dt className="text-xs font-semibold text-rb-500" title={x.tip}>
              {x.label}
            </dt>
            <dd className="text-sm text-foreground tabular-nums">
              <Prov info={countProv(x.key, c)}>{x.value.toLocaleString("en-US")}</Prov>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-rb-500">{COUNT_WORDS.line(BAL_CHAINS[chainId].name)}</p>
    </ProvSection>
  );
}

export function BalancerFrontDoor({ chainId, count }: { chainId: BalChainId; count: BalCount }) {
  const c = BAL_CHAINS[chainId];
  return (
    <PoolFrontDoor
      id={c.session}
      label={LABEL}
      line={FRONT_DOOR.line(c.name)}
      route={explorerHref(chainId, c.session)}
      below={<Count chainId={chainId} count={count} />}
    />
  );
}
