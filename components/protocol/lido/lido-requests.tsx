"use client";

// A wallet's Lido withdrawal requests (U9; rails-ops ui-jobs 570): one row per
// request the wallet owns (U9.1), the newest first, with its stETH at request,
// when it was made, and whether it waits, is ready to claim (with the ETH it
// pays) or was claimed, each state word explaining itself on hover or press;
// the (i) says what the requests mean for the wallet. One receipts scope its ⋮ arms; the read stamp's
// receipt names the ids the queue holds for the wallet.

import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionReadStamp, readStampProv } from "@/components/shared/read-stamp";
import { lidoStake } from "@/lib/lido/stake";
import { readContracts, requestProv, requestsFinderProv } from "@/lib/lido/provenance";
import { REQUEST_CAP, type LidoStakeRead } from "@/lib/lido/types";
import { REQUESTS, requestsExplainer } from "@/lib/lido/words";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { TitleTip } from "@/components/shared/reveal-tip";
import { TipLabel } from "@/components/shared/tip-label";

const SCOPE = "lido-requests";
const TONE = {
  waiting: "text-rb-500",
  claimable: "text-foreground font-semibold",
  claimed: "text-rb-500",
} as const;

export function LidoRequests({ r }: { r: LidoStakeRead }) {
  const s = lidoStake(r);
  const finder = requestsFinderProv(r);
  const summary = REQUESTS.summary(s);
  return (
    <ProvSection scope={SCOPE} data-anatomy="U9" data-lido-requests={r.wallet.toLowerCase()}>
      <SectionHeading
        title={REQUESTS.title}
        stamp={
          <SectionReadStamp
            chainId={1}
            block={r.head.block}
            blockTime={r.head.time}
            info={(at) => {
              const base = readStampProv({
                chainId: 1,
                block: r.head.block,
                at,
                what: "Every figure in this section",
                contracts: readContracts(r).slice(2),
              });
              return {
                ...base,
                summary: `Requests found — ${finder.summary.split(" — ")[1]} ${base.summary}`,
                inputs: [...(finder.inputs ?? []), ...(base.inputs ?? [])],
              };
            }}
          />
        }
        menu={<SectionMenu scope={SCOPE} title={REQUESTS.title} />}
      >
        <p className="text-xs text-rb-500">{REQUESTS.sub}</p>
      </SectionHeading>
      {s.requests.length === 0 ? (
        <p className="mt-3 text-sm text-rb-500" data-lido-requests-none="">
          {REQUESTS.none}
        </p>
      ) : (
        <>
          {summary && <p className="mt-3 text-sm text-foreground">{summary}</p>}
          <ul className="mt-3 divide-y divide-rb-200 rounded-xl border border-rb-200 px-4 dark:divide-rb-500/30 dark:border-rb-500/30">
            {s.requests.map((q) => {
              const info = requestProv(q, r);
              const claim = REQUESTS.claim(q);
              return (
                <li
                  key={q.id}
                  className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)_auto]"
                  data-anatomy="U9.1"
                  data-lido-request={q.id}
                  data-state={q.state}
                >
                  <span className="text-xs font-semibold tabular-nums text-rb-500 sm:pt-0.5">#{q.id}</span>
                  <p className="min-w-0 text-[13px] leading-snug text-foreground">
                    <Prov info={info}>{REQUESTS.row(q)}</Prov>
                  </p>
                  <p className={`text-[13px] leading-snug ${TONE[q.state]}`}>
                    <Prov info={info}>
                      <TitleTip title={REQUESTS.tip(q)}>
                        <TipLabel text={claim ?? REQUESTS.state[q.state]} tip={REQUESTS.tip(q)} />
                      </TitleTip>
                    </Prov>
                  </p>
                </li>
              );
            })}
          </ul>
          <SectionExplainer
            label={REQUESTS.explainerLabel}
            className="mt-2"
            slot={{
              body: (
                <>
                  {requestsExplainer(s).map((g) => (
                    <ExplainGroup key={g.title} title={g.title}>
                      {g.bullets.map((b, i) => (
                        <ExplainBullet key={i}>{b}</ExplainBullet>
                      ))}
                    </ExplainGroup>
                  ))}
                </>
              ),
            }}
          />
        </>
      )}
      {s.truncated && <p className="mt-3 text-sm text-rb-500">{REQUESTS.truncated(s.requestCount, REQUEST_CAP)}</p>}
    </ProvSection>
  );
}
