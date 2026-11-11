"use client";

// Lido's front door (N5; rails-ops ui-jobs 570): Uniswap's and Balancer's
// layout (`PoolFrontDoor`), the shared search landing on a wallet's stake,
// then Lido's totals at the head (U10), each with its receipt.

import Link from "next/link";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { FrontDoorSearch } from "@/components/shared/front-door-search";
import { ReadTierTag, isReadOnVisit } from "@/components/shared/read-tier-tag";
import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { PoolReadStamp } from "@/components/protocol/uniswap/uniswap-readout";
import { READ_TIER } from "@/lib/shared/read-tier";
import { NAV_PILL } from "@/lib/shared/ui-grammar";
import { lidoTotals } from "@/lib/lido/stake";
import { totalsProv } from "@/lib/lido/provenance";
import type { LidoProtocolRead } from "@/lib/lido/types";
import { FRONT_DOOR, LABEL, num, rateText } from "@/lib/lido/words";

const ID = "lido";
const ROUTE = "/ethereum/lido";
const SCOPE = "lido-totals";

function Totals({ r }: { r: LidoProtocolRead }) {
  const t = lidoTotals(r);
  const cells = [
    { key: "pooled", label: FRONT_DOOR.pooled, tip: FRONT_DOOR.pooledTip, value: `${num(t.pooledEth)} ETH`, sub: null },
    { key: "shares", label: FRONT_DOOR.shares, tip: FRONT_DOOR.sharesTip, value: num(t.shares), sub: null },
    {
      key: "rate",
      label: FRONT_DOOR.rate,
      tip: FRONT_DOOR.rateTip,
      value: rateText(t.rate),
      sub: FRONT_DOOR.rateSub(t),
    },
    {
      key: "queue",
      label: FRONT_DOOR.queue,
      tip: FRONT_DOOR.queueTip,
      value: `${num(t.unfinalized)} stETH`,
      sub: FRONT_DOOR.queueSub(t),
    },
  ] as const;
  return (
    <ProvSection scope={SCOPE} className="mt-10 w-full max-w-xl" data-anatomy="U10" data-lido-totals="">
      <SectionHeading
        title={FRONT_DOOR.totalsTitle}
        stamp={
          <PoolReadStamp
            chainId={1}
            head={r.head}
            then={r.then}
            what="Every figure in this section"
            contracts={[
              {
                name: "Lido stETH",
                address: r.steth,
                reads: "getTotalPooledEther, getTotalShares, getPooledEthByShares(1e18)",
              },
              {
                name: "Lido WithdrawalQueueERC721",
                address: r.queue,
                reads: "unfinalizedStETH, getLastRequestId, getLastFinalizedRequestId",
              },
            ]}
          />
        }
        menu={<SectionMenu scope={SCOPE} title={FRONT_DOOR.totalsTitle} />}
      />
      <dl className="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        {cells.map((c) => (
          <div key={c.key} data-lido-total={c.key}>
            <dt className="text-xs font-semibold text-rb-500" title={c.tip}>
              {c.label}
            </dt>
            <dd className="text-sm text-foreground tabular-nums">
              <Prov info={totalsProv(c.key, r, t)}>{c.value}</Prov>
            </dd>
            {c.sub && (
              <dd className="text-xs text-rb-500">
                <Prov info={totalsProv(c.key, r, t)}>{c.sub}</Prov>
              </dd>
            )}
          </div>
        ))}
      </dl>
    </ProvSection>
  );
}

export function LidoFrontDoor({ r }: { r: LidoProtocolRead | null }) {
  const tiered = isReadOnVisit(ID);
  return (
    <div
      className="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12"
      data-anatomy="N5"
      data-front-door={ID}
    >
      <h1 className={`${tiered ? "mb-4" : "mb-8"} flex items-center gap-3`}>
        <ProtocolIcon id={ID} className="h-11 w-11 shrink-0 text-foreground" />
        <span className="text-3xl font-semibold leading-none text-foreground">{LABEL}</span>
      </h1>
      {tiered && (
        <p
          className="mb-8 flex max-w-xl flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-rb-500"
          data-anatomy="H23.2"
          data-read-tier-line=""
        >
          <ReadTierTag tip={false} />
          <span>{READ_TIER.line}</span>
        </p>
      )}
      <div className="w-full max-w-xl">
        <FrontDoorSearch href={(wallet) => `${ROUTE}/${wallet}`} />
      </div>
      <p className="mt-6 max-w-xl text-center text-sm text-rb-500">{FRONT_DOOR.line}</p>
      {r ? <Totals r={r} /> : <p className="mt-10 text-sm text-rb-500">{FRONT_DOOR.unanswered}</p>}
      <nav aria-label="Explorer sections" className="mt-6 flex justify-center">
        <Link href={`${ROUTE}/info`} className={NAV_PILL}>
          About {LABEL} on Rails
        </Link>
      </nav>
    </div>
  );
}
