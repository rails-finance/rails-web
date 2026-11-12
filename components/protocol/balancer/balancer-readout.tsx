"use client";

// The readout under the card (U5; rails-ops ui-jobs 569): a table of two
// columns, the block 30 days back and the block read now, the wallet's rows
// first, then the pool's, each figure traced to its reads
// (lib/balancer/provenance.ts). The section is one receipts scope its ⋮ arms
// (decision 0059).

import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { BalancerReadStamp } from "@/components/protocol/balancer/balancer-position-card";
import { balPosition } from "@/lib/balancer/position";
import { lineProv, type BalReceiptContext } from "@/lib/balancer/provenance";
import type { BalPositionRead } from "@/lib/balancer/types";
import { READOUT, readoutExplainer, readoutTable, type BalRow, type BalTable } from "@/lib/balancer/words";

const SCOPE = "balancer-readout";

function Figure({ row, text, c }: { row: BalRow; text: string; c: BalReceiptContext }) {
  const info = lineProv(row.key, row.part, c);
  return info ? <Prov info={info}>{text}</Prov> : <>{text}</>;
}

const markdown = (heading: string, title: string, t: BalTable) =>
  [
    `## ${heading}: ${title}`,
    ...t.groups.flatMap((g) => [
      "",
      `### ${g.title}`,
      "",
      t.then ? `| | ${t.then} | ${READOUT.now} |` : `| | ${READOUT.now} |`,
      t.then ? "|---|---:|---:|" : "|---|---:|",
      ...g.rows.map((r) =>
        t.then ? `| ${r.label} | ${r.single ? "" : (r.then ?? "—")} | ${r.now} |` : `| ${r.label} | ${r.now} |`,
      ),
    ]),
  ].join("\n");

export function BalancerReadout({ r, title }: { r: BalPositionRead; title: string }) {
  const p = balPosition(r);
  const c = { p, r };
  const table = readoutTable(p);
  const heading = READOUT.title(p);
  const cols = table.then
    ? "grid-cols-[minmax(0,1fr)_5rem_5rem] sm:grid-cols-[minmax(0,1fr)_7rem_7rem]"
    : "grid-cols-[minmax(0,1fr)_5rem] sm:grid-cols-[minmax(0,1fr)_7rem]";
  return (
    <ProvSection scope={SCOPE} data-anatomy="U5" data-pool-readout={`${r.pool}:${r.wallet}`}>
      <SectionHeading
        title={heading}
        stamp={<BalancerReadStamp c={c} what="Every figure in this section" />}
        menu={
          <SectionMenu
            scope={SCOPE}
            title={heading}
            exports={{ markdown: { build: () => markdown(heading, title, table) } }}
          />
        }
      />
      <div className="mt-2 max-w-2xl rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        {table.groups.map((g, gi) => (
          <div key={g.title} className={gi > 0 ? "mt-4" : undefined} data-readout-group={g.title}>
            <div className={`grid ${cols} gap-x-4 pb-1.5 text-xs text-rb-500`}>
              <span className="font-semibold text-foreground">{g.title}</span>
              {table.then && <span className="text-right">{gi === 0 ? table.then : ""}</span>}
              <span className="text-right">{gi === 0 ? READOUT.now : ""}</span>
            </div>
            <ul className="divide-y divide-rb-200 border-t border-rb-200 dark:divide-rb-500/30 dark:border-rb-500/30">
              {g.rows.map((row) => (
                <li
                  key={`${row.part}:${row.label}`}
                  className={`grid ${cols} gap-x-4 py-2 text-[13px] leading-snug tabular-nums`}
                  data-anatomy="U5.1"
                  data-pool-line={row.key}
                >
                  <span className="text-rb-500">{row.label}</span>
                  {table.then && (
                    <span className="text-right text-rb-500">
                      {row.single ? "" : row.then == null ? "—" : <Figure row={row} text={row.then} c={c} />}
                    </span>
                  )}
                  <span className="text-right text-foreground">
                    <Figure row={row} text={row.now} c={c} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
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
