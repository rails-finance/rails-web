"use client";

// A protocol change in the event history (rails-ops TO-DO-ui-jobs 448;
// reference/lifetime-price-chart.md, ruling 10a): the market-note row
// (`NoteRowShell`'s T1 shape, as a rate note draws) with its own spine glyph,
// the sliders, and the governance badge. One row per gap between two of the
// account's events: a lone change states its words at rest ("WBTC collateral
// factor 70 % → 60 %"); more read "Protocol changes" with their count and
// dates. Opened, the days newest first and one line per change: its name, its value before and after inside the
// receipt, each side's contract linked, and the transaction that made it.
// Not an event of the account's, so no number, no ⋮ and no share link, and
// left out of every count (lib/shared/protocol-change-note.ts). A change a
// rate note states has no row (ui-jobs 449).

import { NoteRowShell } from "@/components/shared/note-row-shell";
import { CountChip } from "@/components/shared/count-chip";
import { Prov } from "@/components/shared/provenance";
import { useChainId } from "@/lib/shared/chain-context";
import { explorerUrl } from "@/lib/shared/chains";
import { changeWords, type FlowChange, type FlowChangeLink } from "@/lib/shared/flows-changes";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import type { ProtocolChangeGroup } from "@/lib/shared/protocol-change-note";

const dayStamp = (day: number) => `${shortDate(day * 86_400)} ${shortDateYear(day * 86_400)}`;

/** The row's head when a day holds several changes. */
export const PROTOCOL_CHANGES_T1 = "Protocol changes";

/** One side of a change: the value, then its contract's short address linked
 *  to the explorer; a side that is the address alone is the link. The events
 *  row's tip and the history's line draw the same. */
export function ChangeSide({ value, link }: { value: string; link?: FlowChangeLink }) {
  if (!link) return <>{value}</>;
  const a = (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-dotted underline-offset-2"
      data-flow-change-link=""
    >
      {link.text}
    </a>
  );
  return link.text === value ? (
    a
  ) : (
    <>
      {value} ({a})
    </>
  );
}

/** A change's values inside its receipt: "6 % → 9.21 %", or "set to …". */
export function ChangeValues({ change: c }: { change: FlowChange }) {
  return (
    <Prov info={c.prov} value={c.to}>
      {c.from != null ? (
        <>
          <ChangeSide value={c.from} link={c.fromLink} /> → <ChangeSide value={c.to} link={c.toLink} />
        </>
      ) : (
        <>
          set to <ChangeSide value={c.to} link={c.toLink} />
        </>
      )}
    </Prov>
  );
}

/** The changes in one gap, as one row. */
export function ProtocolChangeRow({ group }: { group: ProtocolChangeGroup }) {
  const chainId = useChainId();
  const all = group.days.flatMap((d) => d.notes.map((n) => n.change));
  const newest = dayStamp(group.days[0].day);
  const oldest = dayStamp(group.days[group.days.length - 1].day);
  const dates = newest === oldest ? newest : `${oldest} – ${newest}`;
  const one = all.length === 1;
  const words = changeWords(all[0]);
  return (
    <div
      data-anatomy="L7.1"
      data-protocol-change={group.id}
      data-protocol-change-days={group.days.map((d) => d.day).join(",")}
      data-protocol-change-blocks={all.map((c) => c.block).join(",")}
    >
      <NoteRowShell
        icon="protocol-change"
        label={one ? `Protocol change, ${words}, ${dates}` : `${PROTOCOL_CHANGES_T1}, ${all.length}, ${dates}`}
        marker={{ attr: "data-protocol-change-row", value: group.id }}
        spine={{ actor: "governance" }}
        header={
          <span
            className="inline-flex min-w-0 max-w-full items-center text-sm text-rb-500 max-sm:text-xs"
            data-head-kind=""
          >
            {one ? (
              <>
                <span className="max-sm:hidden">{words}</span>
                {/* A phone's caption stands over the spine: the name alone,
                    its values in the opened line. */}
                <span className="sm:hidden">{all[0].name}</span>
              </>
            ) : (
              <>
                {PROTOCOL_CHANGES_T1}
                <CountChip count={all.length} />
              </>
            )}
          </span>
        }
        meta={
          <span className="evt-meta ml-auto inline-flex min-h-6 items-center gap-2 whitespace-nowrap">
            <span className="text-xs text-foreground">{dates}</span>
          </span>
        }
      >
        <div className="space-y-2.5 px-5 pb-3 pt-3 text-sm max-sm:text-xs">
          {group.days.map((d) => {
            // One transaction for the day's changes: its link stands by the date.
            const hashes = [...new Set(d.notes.map((n) => n.change.txHash ?? ""))];
            const dayTx = hashes.length === 1 && hashes[0] ? hashes[0] : null;
            const txLink = (hash: string) => (
              <a
                href={explorerUrl(chainId, "tx", hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-external text-xs"
                data-protocol-change-tx={hash}
              >
                transaction
              </a>
            );
            return (
              <div key={d.day} data-protocol-change-day={d.day}>
                <div className="text-xs text-rb-500">
                  {dayStamp(d.day)}
                  {dayTx && <> · {txLink(dayTx)}</>}
                </div>
                <ul className="mt-0.5 space-y-1">
                  {d.notes.map(({ change: c, id }) => (
                    <li
                      key={id}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                      data-protocol-change-item=""
                      data-protocol-change-words={changeWords(c)}
                      data-flow-change-name={c.name}
                      data-flow-change-from={c.from ?? ""}
                      data-flow-change-to={c.to}
                      data-flow-change-block={c.block}
                    >
                      <span>
                        <span className="font-semibold">{c.name}</span> <ChangeValues change={c} />
                      </span>
                      {c.txHash && !dayTx && txLink(c.txHash)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="text-xs text-rb-500">
            {one
              ? "A change the protocol made to every position. It isn't included in this page's event counts."
              : "Changes the protocol made to every position. They aren't included in this page's event counts."}
          </p>
        </div>
      </NoteRowShell>
    </div>
  );
}
