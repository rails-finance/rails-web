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
import type { ChainId } from "@/lib/shared/chains";
import { poolPosition } from "@/lib/uniswap/position";
import { lineProv, readContracts, type UniReceiptContext } from "@/lib/uniswap/provenance";
import type { BlockRef, UniPositionRead } from "@/lib/uniswap/types";
import {
  READOUT,
  readoutExplainer,
  readoutLines,
  type ExplainGroupWords,
  type ReadoutLine,
  type Seg,
} from "@/lib/uniswap/words";

export const READOUT_SCOPE = "uniswap-readout";

/** A pool position's read stamp: the head block's time; its receipt names the block, the window's
 *  block and every contract read. Uniswap's and Aerodrome's pages share it. */
export function PoolReadStamp({
  chainId,
  head,
  then,
  contracts,
  what,
}: {
  chainId: ChainId;
  head: BlockRef;
  then: BlockRef;
  contracts: { name: string; address: string; reads: string }[];
  what: string;
}) {
  return (
    <SectionReadStamp
      chainId={chainId}
      block={head.block}
      blockTime={head.time}
      info={(at) => {
        const base = readStampProv({ chainId, block: head.block, at, what, contracts });
        return {
          ...base,
          summary: `${what} was read by rails-server at block ${head.block.toLocaleString("en-US")} (${new Date(head.time * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC), and the 30-day figures at block ${then.block.toLocaleString("en-US")}. The stamp shows the head block's time.`,
          via: `rails-server · eth_call @ block ${head.block.toLocaleString("en-US")}`,
        };
      }}
    />
  );
}

/** The section's read stamp. */
export function UniswapReadStamp({ c, what }: { c: UniReceiptContext; what: string }) {
  return <PoolReadStamp chainId={1} head={c.r.head} then={c.r.then} contracts={readContracts(c)} what={what} />;
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

type LineProv = (key: ReadoutLine["key"], part: "yours" | "pool") => Provenance | null;

function Line({ line, prov }: { line: ReadoutLine; prov: LineProv }) {
  return (
    <li
      className="grid gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)]"
      data-anatomy="U2.1"
      data-pool-line={line.key}
    >
      <span className="text-xs font-semibold text-rb-500 sm:pt-0.5">{line.label}</span>
      <div className="min-w-0 space-y-0.5">
        {line.yours && <Part text={line.yours} info={prov(line.key, "yours")} muted={false} />}
        {line.pool && <Part text={line.pool} info={prov(line.key, "pool")} muted={line.yours !== null} />}
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

/** A pool position's readout section (U2): Uniswap's and Aerodrome's pages share it, each with its
 *  own lines, words and receipts. */
export function PoolReadout({
  scope,
  readoutKey,
  title,
  lines,
  groups,
  prov,
  stamp,
}: {
  scope: string;
  /** `data-pool-readout`: the position's key. */
  readoutKey: string;
  title: string;
  lines: ReadoutLine[];
  groups: ExplainGroupWords[];
  prov: LineProv;
  stamp: React.ReactNode;
}) {
  return (
    <ProvSection scope={scope} data-anatomy="U2" data-pool-readout={readoutKey}>
      <SectionHeading
        title={READOUT.title}
        stamp={stamp}
        menu={
          <SectionMenu
            scope={scope}
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
            <Line key={l.key} line={l} prov={prov} />
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

export function UniswapReadout({ r, title }: { r: UniPositionRead; title: string }) {
  const p = poolPosition(r);
  const c = { p, r };
  const lines = readoutLines(p);
  return (
    <PoolReadout
      scope={READOUT_SCOPE}
      readoutKey={`${p.version}:${p.id}`}
      title={title}
      lines={lines}
      groups={readoutExplainer(
        p,
        lines.map((l) => l.key),
      )}
      prov={(key, part) => lineProv(key, part, c)}
      stamp={<UniswapReadStamp c={c} what="Every figure in this section" />}
    />
  );
}
