"use client";

// A reserve's configuration changes as a timeline (anatomy M3.6; Aave V3 and its
// forks, Aave V4): the spine and rows of a position's Activity timeline (L3),
// one row a change, newest first, each a T1 card on the shared event-card shell
// (components/shared/event-card.tsx), as CoW's trades are. The node is the
// protocol change's sliders with the governance badge; the head is the change
// in plain words with the figure that moved, then where it was set and the
// time, the date on a day's first row. Opened (T2, T3): the Explanation, what
// the setting does and what this change means for suppliers and borrowers,
// and the Figures, the change in full with its receipt. No number: a change
// is not an account's event. The first `pageSize` rows, then the control for
// the rest. Each family's words and explanations come from its generator
// (lib/shared/aave-reserve-config-explain.ts, lib/aave-v4/config-explain.ts).

import { useState } from "react";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { EventDateContext } from "@/components/shared/event-time";
import { ExplainBullet } from "@/components/shared/explain-groups";
import { SpineLine } from "@/components/shared/spine-line";
import { EventCaptionContext, SpineViewProvider } from "@/components/shared/mobile-spine";
import type { Provenance } from "@/components/shared/provenance";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";

const NOTE = "text-[12px] text-rb-500";

/** One change as a row. */
export interface ConfigChangeItem {
  kind: string;
  block: number;
  logIndex: number;
  timestamp: number;
  txHash: string;
  /** The change in full (the Figures cell, the CSV). */
  words: string;
  /** The head's plain words ("Draw cap raised"). */
  headline: string;
  /** The figure that moved ("40.0M → 50.0M USDC"). */
  figure?: string;
  /** Where it was set ("Main spoke"), and its hook value ("spoke"). */
  setOn?: { text: string; side: string };
  receipt: Provenance;
  /** What the setting does and what this change means; none, no Explanation. */
  bullets: string[];
}

const utcDay = (ts: number) => Math.floor(ts / 86_400);
const datePrefix = (ts: number, aboveTs: number | null): string | null =>
  aboveTs != null && utcDay(aboveTs) === utcDay(ts) ? null : `${shortDate(ts)} ${shortDateYear(ts)}`;

function ChangeRow({ c, family, isLast }: { c: ConfigChangeItem; family: string; isLast: boolean }) {
  const slots: EventCardSlots = {
    event: {
      id: `${c.block}-${c.logIndex}-${c.kind}`,
      family,
      txHash: c.txHash,
      blockNumber: c.block,
      timestamp: c.timestamp,
    },
    spine: { icon: "protocol-change", actor: "governance", isLast },
    head: {
      label: c.headline,
      deltas: [],
      ...(c.figure ? { figure: { text: c.figure } } : {}),
      ...(c.setOn ? { tag: { text: c.setOn.text, hook: c.setOn.side } } : {}),
    },
    caption: c.headline,
    cells: [
      {
        kind: "stat",
        key: "change",
        label: "Change",
        changed: true,
        figure: "config-change",
        value: { after: { text: c.words, info: c.receipt, value: c.words } },
      },
    ],
    ledgers: { none: "A configuration change moves no balance." },
    explainer: {
      body: c.bullets.length ? (
        <ul className="space-y-1 text-sm leading-snug text-rb-500" data-change-explain="">
          {c.bullets.map((b) => (
            <ExplainBullet key={b}>{b}</ExplainBullet>
          ))}
        </ul>
      ) : null,
    },
    learnMore: null,
  };
  return (
    <div
      data-change-row=""
      data-change-kind={c.kind}
      data-change-block={c.block}
      data-change-words={c.words}
      {...(c.setOn ? { "data-change-side": c.setOn.side } : {})}
    >
      <EventCard slots={slots} avatar={null} />
    </div>
  );
}

export function ConfigChangeTimeline({
  family,
  items,
  held = "",
  automatorNote = false,
  pageSize,
}: {
  /** The card's open-state family ("aave-v4-config"). */
  family: string;
  /** Newest first. */
  items: ConfigChangeItem[];
  /** Where the history starts, above the rows. */
  held?: string;
  /** SparkLend's line on its automatic cap steps. */
  automatorNote?: boolean;
  pageSize: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, pageSize);
  return (
    <>
      {held && (
        <p className={`${NOTE} mb-1`} data-change-log-held="">
          {held}
        </p>
      )}
      {automatorNote && (
        <p className={`${NOTE} mb-1`} data-change-log-automator="">
          SparkLend raises and lowers its caps automatically in small steps, so the cap rows include those steps.
        </p>
      )}
      {items.length === 0 ? (
        <p className={NOTE} data-change-log-empty="">
          No changes held for this reserve.
        </p>
      ) : (
        <>
          {/* Under 640px each row is its spine segment with the head as the
              caption, one card open at a time, as on a position's timeline. */}
          <SpineViewProvider>
            <div className="relative flex flex-col gap-2" data-change-timeline="">
              <SpineLine />
              {shown.map((c, i) => (
                <EventDateContext.Provider
                  key={`${c.block}:${c.logIndex}:${c.kind}`}
                  value={datePrefix(c.timestamp, i > 0 ? shown[i - 1].timestamp : null)}
                >
                  <EventCaptionContext.Provider value={{ kind: c.headline, ts: c.timestamp }}>
                    <ChangeRow c={c} family={family} isLast={i === shown.length - 1} />
                  </EventCaptionContext.Provider>
                </EventDateContext.Provider>
              ))}
            </div>
          </SpineViewProvider>
          {items.length > pageSize && (
            <button
              type="button"
              onClick={() => setAll((a) => !a)}
              className={`mt-2 text-[12px] ${INPLACE_TEXT}`}
              data-change-log-more=""
            >
              {all ? `Show the latest ${pageSize}` : `Show all ${items.length} changes`}
            </button>
          )}
        </>
      )}
    </>
  );
}
