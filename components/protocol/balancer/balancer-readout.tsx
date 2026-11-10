"use client";

// "How the share and its pool are doing" (U5·balancer; rails-ops ui-jobs 569):
// one line per measure over the last 30 days, the wallet's figure first, then
// the pool's, each part traced to its reads (lib/balancer/provenance.ts). The
// section is one receipts scope its ⋮ arms (decision 0059). The layout is
// Uniswap's readout (components/protocol/uniswap/uniswap-readout.tsx).

import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { BalancerReadStamp } from "@/components/protocol/balancer/balancer-position-card";
import { balPosition } from "@/lib/balancer/position";
import { lineProv } from "@/lib/balancer/provenance";
import type { BalPositionRead } from "@/lib/balancer/types";
import { READOUT, readoutExplainer, readoutLines, type BalLine } from "@/lib/balancer/words";

const SCOPE = "balancer-readout";

function Part({ text, info, muted }: { text: string; info: Provenance | null; muted: boolean }) {
  return (
    <p className={`text-[13px] leading-snug ${muted ? "text-rb-500" : "text-foreground"}`}>
      {info ? <Prov info={info}>{text}</Prov> : text}
    </p>
  );
}

const markdown = (title: string, lines: BalLine[]) =>
  [
    `## ${READOUT.title}: ${title}`,
    "",
    ...lines.map((l) => `- **${l.label}**: ${[l.yours, l.pool].filter(Boolean).join(" ")}`),
    "",
    READOUT.sub,
  ].join("\n");

export function BalancerReadout({ r, title }: { r: BalPositionRead; title: string }) {
  const p = balPosition(r);
  const c = { p, r };
  const lines = readoutLines(p);
  return (
    <ProvSection scope={SCOPE} data-anatomy="U5·balancer" data-pool-readout={`${r.pool}:${r.wallet}`}>
      <SectionHeading
        title={READOUT.title}
        stamp={<BalancerReadStamp c={c} what="Every figure in this section" />}
        menu={
          <SectionMenu
            scope={SCOPE}
            title={READOUT.title}
            exports={{ markdown: { build: () => markdown(title, lines) } }}
          />
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
              data-anatomy="U5.1·balancer"
              data-pool-line={l.key}
            >
              <span className="text-xs font-semibold text-rb-500 sm:pt-0.5">{l.label}</span>
              <div className="min-w-0 space-y-0.5">
                {l.yours && <Part text={l.yours} info={lineProv(l.key, "yours", c)} muted={false} />}
                {l.pool && <Part text={l.pool} info={lineProv(l.key, "pool", c)} muted={l.yours !== null} />}
              </div>
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
              {readoutExplainer().map((g) => (
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
