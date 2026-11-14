"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { RevealTip } from "@/components/shared/reveal-tip";
import { PROTOCOLS, historyOf } from "@/lib/shared/protocols";
import { CHAINS } from "@/lib/shared/chains";
import { HISTORY_NONE, historyDate, historyWords, type HistoryKind } from "@/lib/shared/history-tier";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

/** A from-date line's link to the status page, where the fill's progress shows (decision 0064 point 3). */
function ProgressLink({ id, kind }: { id: string; kind: HistoryKind }) {
  if (kind !== "from-date") return null;
  const chain = PROTOCOLS.find((p) => p.id === id)?.chainId;
  return (
    <>
      {" "}
      <Link href={chain ? `/status/${CHAINS[chain].slug}` : "/status"} className={INLINE_LINK} data-history-progress>
        See how far it has read
      </Link>
    </>
  );
}

/** Each from-date explorer's start time, asked once per page load. */
const starts = new Map<string, Promise<number | null>>();

function startTime(id: string): Promise<number | null> {
  let p = starts.get(id);
  if (!p) {
    p = fetch(`/api/history-start?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ time: number | null }>) : { time: null }))
      .then((r) => r.time)
      .catch(() => null);
    starts.set(id, p);
  }
  return p;
}

/** The tag's name and line for a roster entry: a from-date explorer's start
 *  date is read after the page loads, and the words name no date until it
 *  answers. Null for an explorer with no tag. */
export function useHistoryWords(id: string): { kind: HistoryKind; name: string; line: string } | null {
  const kind = historyOf(id);
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== "from-date") return;
    let live = true;
    startTime(id).then((t) => live && setDate(historyDate(t)));
    return () => {
      live = false;
    };
  }, [id, kind]);
  return kind ? { kind, ...historyWords(kind, date) } : null;
}

function Pill({ kind, name, anatomy, title }: { kind: HistoryKind; name: string; anatomy: boolean; title?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-rb-300 px-1.5 py-px text-[9px] font-semibold uppercase leading-[12px] tracking-wider text-rb-500 dark:border-rb-500 dark:text-rb-400"
      data-anatomy={anatomy ? "H23" : undefined}
      data-history={kind}
      title={title}
    >
      {name}
    </span>
  );
}

/** The coverage legend's tag (H23.1), one per kind; a from-date tag names no
 *  date, since the legend speaks for every explorer of that kind. */
export function HistoryLegendTag({ kind }: { kind: HistoryKind }) {
  return <Pill kind={kind} name={historyWords(kind, null).name} anatomy />;
}

/** The history tag (H23; rails-ops decisions 0061 and 0063): one neutral
 *  outlined pill, kept off the green of the home example's "Live position"
 *  pill, for a roster entry with a `history`. `tip` is where the tag's line
 *  goes: "bubble" opens it on a tap (`RevealTip`), "title" leaves a hover
 *  title (a home tile, which is a link and would clip a bubble), and `false`
 *  adds nothing, for a tag drawn beside the line. The 12px line height keeps
 *  a tile's row height. Draws nothing for an explorer indexed from deployment. */
export function HistoryTag({ id, tip = "bubble" }: { id: string; tip?: "bubble" | "title" | false }) {
  const w = useHistoryWords(id);
  if (!w) return null;
  const pill = (
    <Pill kind={w.kind} name={w.name} anatomy={tip !== "bubble"} title={tip === "title" ? w.line : undefined} />
  );
  if (tip !== "bubble") return pill;
  return (
    <span className="inline-flex shrink-0" data-anatomy="H23">
      <RevealTip tip={w.line} label={`${w.name}: ${w.line}`} wrap focusable>
        {pill}
      </RevealTip>
    </span>
  );
}

/** The tag beside its line, on a row of its own (H23.2): a front door's row
 *  under the name. */
export function HistoryLine({ id, className }: { id: string; className: string }) {
  const w = useHistoryWords(id);
  if (!w) return null;
  return (
    <p className={className} data-anatomy="H23.2" data-history-line={w.kind}>
      <HistoryTag id={id} tip={false} />
      <span>
        {w.line}
        <ProgressLink id={id} kind={w.kind} />
      </span>
    </p>
  );
}

/** The info page's row under I1 (H23.2): the tag, its line in foreground,
 *  and for an explorer not yet indexed what waits on the index, muted. */
export function InfoHistoryLine({ id }: { id: string }) {
  const w = useHistoryWords(id);
  if (!w) return null;
  return (
    <p className="mt-3 max-w-3xl text-sm text-rb-500" data-anatomy="H23.2" data-history-line={w.kind}>
      <span className="mr-2 inline-flex align-[1px]">
        <HistoryTag id={id} tip={false} />
      </span>
      <span className="text-foreground">{w.line}</span>
      {w.kind === "none" && <> {HISTORY_NONE.waits}</>}
      <ProgressLink id={id} kind={w.kind} />
    </p>
  );
}

/** A page head's title with the tag after it, for an explorer with a
 *  `history`; the title alone otherwise. The same place on every position and
 *  wallet head. */
export function HistoryTitleRow({ id, children }: { id: string; children: ReactNode }) {
  if (!historyOf(id)) return <>{children}</>;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {children}
      <HistoryTag id={id} />
    </div>
  );
}
