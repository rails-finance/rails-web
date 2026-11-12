"use client";

// The readout under the stake card (U8; rails-ops ui-jobs 570, 594): the then /
// now table (rails-ops standards/reading-contract.md §3) of the wallet's shares
// and what they earned, then Lido's share rate, each figure traced to its reads
// (lib/lido/provenance.ts). Why the shares changed, and why Earned states no
// figure, are in the section's (i). The section is one receipts scope its ⋮
// arms (decision 0059).

import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { LidoReadStamp } from "@/components/protocol/lido/lido-stake-card";
import { lidoStake } from "@/lib/lido/stake";
import { lineProv } from "@/lib/lido/provenance";
import type { LidoStakeRead } from "@/lib/lido/types";
import { READOUT, readoutExplainer, readoutTable } from "@/lib/lido/words";
import { ThenNowTable, thenNowMarkdown, type ThenNowWords } from "@/components/shared/then-now-table";

const SCOPE = "lido-readout";

export function LidoReadout({ r }: { r: LidoStakeRead }) {
  const s = lidoStake(r);
  const c = { s, r };
  const words = readoutTable(s, r.then.time);
  const table: ThenNowWords = {
    then: words.then,
    now: READOUT.now,
    groups: words.groups.map((g) => ({
      title: g.title,
      rows: g.rows.map((row) => ({
        ...row,
        id: row.label,
        info: row.withheld ? null : lineProv(row.key, c),
        data: { "data-lido-line": row.key, ...(row.withheld ? { "data-window-withheld": row.withheld } : {}) },
      })),
    })),
  };
  return (
    <ProvSection scope={SCOPE} data-anatomy="U8" data-lido-readout={r.wallet.toLowerCase()}>
      <SectionHeading
        title={READOUT.title}
        stamp={<LidoReadStamp c={c} what="Every figure in this section" />}
        menu={
          <SectionMenu
            scope={SCOPE}
            title={READOUT.title}
            exports={{ markdown: { build: () => [`## ${READOUT.title}`, ...thenNowMarkdown(table)].join("\n") } }}
          />
        }
      />
      <ThenNowTable {...table} rowAnatomy="U8.1" />
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
