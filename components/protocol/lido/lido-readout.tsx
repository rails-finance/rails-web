"use client";

// "How the stake changed over 30 days" (U8; rails-ops ui-jobs 570): the
// wallet's shares then and now, the share rate then and now, and what the shares
// earned at the rate's change where they match at both reads (otherwise the
// line says why it states none), each figure traced to its reads. The Shares
// line names what changed them from the requests made since the past read
// (lib/lido/stake.ts `shareCause`)
// (lib/lido/provenance.ts). The section is one receipts scope its ⋮ arms
// (decision 0059). The layout is Balancer's and Uniswap's readout.

import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { LidoReadStamp } from "@/components/protocol/lido/lido-stake-card";
import { lidoStake } from "@/lib/lido/stake";
import { lineProv } from "@/lib/lido/provenance";
import type { LidoStakeRead } from "@/lib/lido/types";
import { READOUT, readoutExplainer, readoutLines, type LidoLine } from "@/lib/lido/words";

const SCOPE = "lido-readout";

const markdown = (lines: LidoLine[]) =>
  [`## ${READOUT.title}`, "", ...lines.map((l) => `- **${l.label}**: ${l.text}`), "", READOUT.sub].join("\n");

export function LidoReadout({ r }: { r: LidoStakeRead }) {
  const s = lidoStake(r);
  const c = { s, r };
  const lines = readoutLines(s, r.then.time);
  return (
    <ProvSection scope={SCOPE} data-anatomy="U8" data-lido-readout={r.wallet.toLowerCase()}>
      <SectionHeading
        title={READOUT.title}
        stamp={<LidoReadStamp c={c} what="Every figure in this section" />}
        menu={
          <SectionMenu scope={SCOPE} title={READOUT.title} exports={{ markdown: { build: () => markdown(lines) } }} />
        }
      >
        <p className="text-xs text-rb-500">{READOUT.sub}</p>
      </SectionHeading>
      <div className="mt-2 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        <ul className="divide-y divide-rb-200 dark:divide-rb-500/30">
          {lines.map((l) => (
            <li
              key={l.key}
              className="grid gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)]"
              data-anatomy="U8.1"
              data-lido-line={l.key}
            >
              <span className="text-xs font-semibold text-rb-500 sm:pt-0.5">{l.label}</span>
              {l.withheld ? (
                <p className="min-w-0 text-[13px] leading-snug text-rb-500" data-window-withheld={l.withheld}>
                  {l.text}
                </p>
              ) : (
                <p className="min-w-0 text-[13px] leading-snug text-foreground">
                  <Prov info={lineProv(l.key, c)}>{l.text}</Prov>
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
      <SectionExplainer
        label={READOUT.explainerLabel}
        className="mt-2"
        slot={{
          body: (
            <>
              {readoutExplainer(s).map((g) => (
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
    </ProvSection>
  );
}
