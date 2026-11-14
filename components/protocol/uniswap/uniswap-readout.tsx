"use client";

// The readout under a pool position's card (U2; rails-ops ui-jobs 556, 594): a
// then / now table (components/shared/then-now-table.tsx), the block 30 days
// back and the block read now, the position's rows first, then the pool's,
// each figure traced to its reads (lib/uniswap/provenance.ts). Every word is
// lib/uniswap/words.ts's; no colour carries a verdict. The section is one
// receipts scope (decision 0059).

import type { Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionReadStamp, readStampProv } from "@/components/shared/read-stamp";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { ThenNowTable, thenNowMarkdown, type ThenNowWords } from "@/components/shared/then-now-table";
import type { ChainId } from "@/lib/shared/chains";
import { poolPosition } from "@/lib/uniswap/position";
import { lineProv, readContracts, type UniReceiptContext } from "@/lib/uniswap/provenance";
import type { UniProtocol } from "@/lib/uniswap/deployments";
import type { BlockRef, UniPositionRead } from "@/lib/uniswap/types";
import {
  READOUT,
  readoutExplainer,
  readoutTable,
  type ExplainGroupWords,
  type PoolRow,
  type PoolTable,
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
  return (
    <PoolReadStamp chainId={c.r.chainId} head={c.r.head} then={c.r.then} contracts={readContracts(c)} what={what} />
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

/** A pool position's readout section (U2): Uniswap's and Aerodrome's pages share it, each with its
 *  own table, words and receipts. */
export function PoolReadout({
  scope,
  readoutKey,
  title,
  table,
  groups,
  prov,
  stamp,
}: {
  scope: string;
  /** `data-pool-readout`: the position's key. */
  readoutKey: string;
  title: string;
  table: PoolTable;
  groups: ExplainGroupWords[];
  prov: (row: PoolRow) => Provenance | null;
  stamp: React.ReactNode;
}) {
  const words: ThenNowWords = {
    then: table.then,
    now: READOUT.now,
    groups: table.groups.map((g) => ({
      title: g.title,
      rows: g.rows.map((row) => ({
        ...row,
        id: `${row.part}:${row.key}:${row.label}`,
        info: prov(row),
        data: { "data-pool-line": row.key },
      })),
    })),
  };
  const heading = READOUT.title(table);
  return (
    <ProvSection scope={scope} data-anatomy="U2" data-pool-readout={readoutKey}>
      <SectionHeading
        title={heading}
        stamp={stamp}
        menu={
          <SectionMenu
            scope={scope}
            title={heading}
            exports={{ markdown: { build: () => [`## ${heading}: ${title}`, ...thenNowMarkdown(words)].join("\n") } }}
          />
        }
      />
      <ThenNowTable {...words} rowAnatomy="U2.1" />
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

export function UniswapReadout({
  r,
  title,
  protocol = "uniswap",
}: {
  r: UniPositionRead;
  title: string;
  protocol?: UniProtocol;
}) {
  const p = poolPosition(r, protocol);
  const c = { p, r };
  return (
    <PoolReadout
      scope={READOUT_SCOPE}
      readoutKey={`${p.version}:${p.id}`}
      title={title}
      table={readoutTable(p)}
      groups={readoutExplainer(p)}
      prov={(row) => lineProv(row.key, c)}
      stamp={<UniswapReadStamp c={c} what="Every figure in this section" />}
    />
  );
}
