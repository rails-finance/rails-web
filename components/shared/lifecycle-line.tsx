"use client";

// A closing or closed explorer's state (rails-ops TO-DO-ui-jobs 612, 621): the
// pill and the line beside it, from the roster's `lifecycle`
// (lib/shared/lifecycle.ts). Drawn under the rail header's title row, under a
// position page's wallet heading and on the home tile. Nothing for a live
// explorer.

import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { PROTOCOLS } from "@/lib/shared/protocols";
import { LIFECYCLE_WORD, lifecycleDay, lifecycleProv, type ProtocolLifecycle } from "@/lib/shared/lifecycle";

const entryOf = (id: string) => PROTOCOLS.find((p) => p.id === id);

/** The pill: "Closed" or "Closing", in the shut-down status tag's caution. */
export function LifecycleTag({ lifecycle, title }: { lifecycle: ProtocolLifecycle; title?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-caution-600/60 px-1.5 py-px text-[9px] font-semibold uppercase leading-[12px] tracking-wider text-caution-700 dark:border-caution-400/60 dark:text-caution-400"
      data-anatomy="H24"
      data-lifecycle={lifecycle.state}
      title={title}
    >
      {LIFECYCLE_WORD[lifecycle.state]}
    </span>
  );
}

/** The home tile's tag, its line as a hover title. */
export function LifecycleTileTag({ id }: { id: string }) {
  const entry = entryOf(id);
  const lc = entry?.lifecycle;
  if (!lc) return null;
  return <LifecycleTag lifecycle={lc} title={`${lc.lead} ${lifecycleDay(lc)}${lc.rest}`} />;
}

/** The pill and its line, the date carrying the announcement's receipt (H24.1). */
export function LifecycleLine({ id, className = "" }: { id: string; className?: string }) {
  // Its own receipts scope, so the date opens its receipt on every venue,
  // the rail header's included.
  const registry = useReceiptRegistry();
  const entry = entryOf(id);
  const lc = entry?.lifecycle;
  if (!entry || !lc) return null;
  return (
    <ProvReceiptsScope registry={registry}>
      <p
        className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] leading-relaxed text-rb-500 ${className}`}
        data-anatomy="H24.1"
        data-lifecycle-line={lc.state}
      >
        <span className="inline-flex translate-y-[-1px]">
          <LifecycleTag lifecycle={lc} />
        </span>
        <span>
          {lc.lead} <Prov info={lifecycleProv(entry.label, lc)}>{lifecycleDay(lc)}</Prov>
          {lc.rest}
        </span>
      </p>
    </ProvReceiptsScope>
  );
}
