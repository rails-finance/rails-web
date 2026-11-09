"use client";

// "How the position and its pool are doing" (U2; rails-ops ui-jobs 556, door
// 1): six lines beside the position card, each the holder's figure first,
// then the pool's, each part traced to its reads (lib/uniswap/provenance.ts).
// Range leads while the position is out of range. Every word is
// lib/uniswap/words.ts's; no colour carries a verdict. The section is one
// receipts scope its ⋮ arms (decision 0059).

import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionReadStamp, readStampProv } from "@/components/shared/read-stamp";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { poolPosition } from "@/lib/uniswap/position";
import { lineProv, readContracts, type UniReceiptContext } from "@/lib/uniswap/provenance";
import type { UniPositionRead } from "@/lib/uniswap/types";
import { READOUT, readoutExplainer, readoutLines, type ReadoutLine, type Seg } from "@/lib/uniswap/words";

export const READOUT_SCOPE = "uniswap-readout";

/** The section's read stamp: the head block's time; its receipt names the block and every contract read. */
export function UniswapReadStamp({ c, what }: { c: UniReceiptContext; what: string }) {
  const { r } = c;
  return (
    <SectionReadStamp
      chainId={1}
      block={r.head.block}
      blockTime={r.head.time}
      info={(at) => {
        const base = readStampProv({ chainId: 1, block: r.head.block, at, what, contracts: readContracts(c) });
        return {
          ...base,
          summary: `${what} was read by rails-server at block ${r.head.block.toLocaleString("en-US")} (${new Date(r.head.time * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC), and the 30-day figures at block ${r.then.block.toLocaleString("en-US")}. The stamp shows the head block's time.`,
          via: `rails-server · eth_call @ block ${r.head.block.toLocaleString("en-US")}`,
        };
      }}
    />
  );
}

/** A bullet's parts, the card's figures bold. */
export function Segs({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        typeof s === "string" ? (
          <span key={i}>{s}</span>
        ) : (
          <Fig key={i} bold>
            {s.fig}
          </Fig>
        ),
      )}
    </>
  );
}

function Part({ text, info, muted }: { text: string; info: Provenance | null; muted: boolean }) {
  return (
    <p className={`text-[13px] leading-snug ${muted ? "text-rb-500" : "text-foreground"}`}>
      {info ? <Prov info={info}>{text}</Prov> : text}
    </p>
  );
}

function Line({ line, c }: { line: ReadoutLine; c: UniReceiptContext }) {
  return (
    <li
      className="grid gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)]"
      data-anatomy="U2.1"
      data-pool-line={line.key}
    >
      <span className="text-xs font-semibold text-rb-500 sm:pt-0.5">{line.label}</span>
      <div className="min-w-0 space-y-0.5">
        {line.yours && <Part text={line.yours} info={lineProv(line.key, "yours", c)} muted={false} />}
        {line.pool && <Part text={line.pool} info={lineProv(line.key, "pool", c)} muted={line.yours !== null} />}
      </div>
    </li>
  );
}

const markdown = (title: string, lines: ReadoutLine[]) =>
  [
    `## ${READOUT.title}: ${title}`,
    "",
    ...lines.map((l) => `- **${l.label}**: ${[l.yours, l.pool].filter(Boolean).join(" ")}`),
    "",
    READOUT.sub,
  ].join("\n");

export function UniswapReadout({ r, title }: { r: UniPositionRead; title: string }) {
  const p = poolPosition(r);
  const c = { p, r };
  const lines = readoutLines(p);
  const groups = readoutExplainer(
    p,
    lines.map((l) => l.key),
  );
  return (
    <ProvSection scope={READOUT_SCOPE} data-anatomy="U2" data-pool-readout={`${p.version}:${p.id}`}>
      <SectionHeading
        title={READOUT.title}
        stamp={<UniswapReadStamp c={c} what="Every figure in this section" />}
        menu={
          <SectionMenu
            scope={READOUT_SCOPE}
            title={READOUT.title}
            exports={{ markdown: { build: () => markdown(title, lines) } }}
          />
        }
      >
        <p className="text-xs text-rb-500" data-pool-disclaimer="">
          {READOUT.sub}
        </p>
      </SectionHeading>
      <div className="mt-2 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        <ul className="divide-y divide-rb-200 dark:divide-rb-500/30">
          {lines.map((l) => (
            <Line key={l.key} line={l} c={c} />
          ))}
        </ul>
      </div>
      <SectionExplainer
        label={READOUT.explainerLabel}
        className="mt-2"
        slot={{
          body: (
            <>
              {groups.map((g) => (
                <ExplainGroup key={g.title} title={g.title}>
                  {g.bullets.map((b, i) => (
                    <ExplainBullet key={i}>
                      <Segs segs={b} />
                    </ExplainBullet>
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
