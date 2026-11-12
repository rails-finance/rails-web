"use client";

// The readout under the card (U5; rails-ops ui-jobs 569): a table of two
// columns, the block 30 days back and the block read now, the wallet's rows
// first, then the pool's, each figure traced to its reads
// (lib/balancer/provenance.ts). The section is one receipts scope its ⋮ arms
// (decision 0059).

import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { ThenNowTable, thenNowMarkdown, type ThenNowWords } from "@/components/shared/then-now-table";
import { BalancerReadStamp } from "@/components/protocol/balancer/balancer-position-card";
import { balPosition } from "@/lib/balancer/position";
import { lineProv } from "@/lib/balancer/provenance";
import type { BalPositionRead } from "@/lib/balancer/types";
import { READOUT, readoutExplainer, readoutTable } from "@/lib/balancer/words";

const SCOPE = "balancer-readout";

export function BalancerReadout({ r, title }: { r: BalPositionRead; title: string }) {
  const p = balPosition(r);
  const c = { p, r };
  const words = readoutTable(p);
  const table: ThenNowWords = {
    then: words.then,
    now: READOUT.now,
    groups: words.groups.map((g) => ({
      title: g.title,
      rows: g.rows.map((row) => ({
        ...row,
        id: `${row.part}:${row.label}`,
        info: lineProv(row.key, row.part, c),
        data: { "data-pool-line": row.key },
      })),
    })),
  };
  const heading = READOUT.title(p);
  return (
    <ProvSection scope={SCOPE} data-anatomy="U5" data-pool-readout={`${r.pool}:${r.wallet}`}>
      <SectionHeading
        title={heading}
        stamp={<BalancerReadStamp c={c} what="Every figure in this section" />}
        menu={
          <SectionMenu
            scope={SCOPE}
            title={heading}
            exports={{
              markdown: { build: () => [`## ${heading}: ${title}`, ...thenNowMarkdown(table)].join("\n") },
            }}
          />
        }
      />
      <ThenNowTable {...table} rowAnatomy="U5.1" />
      <SectionExplainer
        label={READOUT.explainerLabel}
        className="mt-2"
        slot={{
          body: (
            <>
              {readoutExplainer(r.chainId).map((g) => (
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
