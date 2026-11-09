"use client";

// The head of every product page (rails-ops ui-jobs 549 and 550; decision 0059
// points 3, 4, 7 and 10): an A1 panel, an A2 market page, an A3 reserve page.
// One receipts scope (`ProvSection`): the heading row with the read stamp
// ("Read 10:12 UTC"), the "?" and the section ⋮ at its right; the subtitle;
// the vitals band (identity, figures in their slots, the aside and its links);
// the (i) slot under the band. A3 passes its h1 as `heading` and the shell
// puts the stamp, "?" and ⋮ beside it.

import Link from "next/link";
import type { ReactNode } from "react";
import { VitalsBand } from "@/components/shared/vitals-band";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { SectionReadStamp } from "@/components/shared/read-stamp";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import type { EntryLink, ProductHead, ReadAt, SectionTools } from "@/lib/shared/product/model";

/** "Read 10:12 UTC", or nothing while the read is out. */
export function ReadStamp({ readAt }: { readAt: ReadAt | null }) {
  if (!readAt || readAt.block <= 0) return null;
  return (
    <SectionReadStamp
      chainId={readAt.chainId}
      block={readAt.block}
      blockTime={readAt.blockTime}
      readBy={readAt.readBy}
      info={readAt.receipt}
    />
  );
}

/** A section's ⋮ from its tools. */
export function ToolsFor({ scope, title, tools }: { scope: string; title: string; tools: SectionTools }) {
  return <SectionMenu scope={scope} title={title} hint={tools.hint} links={tools.links} exports={tools.exports} />;
}

/** The links at the foot of a head, "View … →". */
export function EntryLinks({ entries }: { entries: EntryLink[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-auto flex flex-col gap-1 pt-3">
      {entries.map((e) => (
        <Link
          key={e.href + e.label}
          href={e.href}
          className={`inline-flex items-center gap-1 text-[13px] font-medium ${INLINE_LINK}`}
          {...e.hooks}
        >
          {e.label}
          <span aria-hidden>→</span>
        </Link>
      ))}
    </div>
  );
}

export function ProductHeadSection({
  head,
  heading,
  className = "mb-8",
}: {
  head: ProductHead;
  /** The page's h1 row in place of the section heading (A3). */
  heading?: ReactNode;
  className?: string;
}) {
  const title = head.title;
  const titleNode = head.titleHref ? (
    <Link
      href={head.titleHref}
      className="transition-colors hover:text-blue-600 dark:hover:text-[var(--text-link)]"
      title={`View ${title} positions`}
    >
      {title}
    </Link>
  ) : (
    title
  );
  const stamp = <ReadStamp readAt={head.readAt} />;
  const help = head.learnMore ? <LearnMore inline content={head.learnMore} ariaLabel={`${title}, learn more`} /> : null;
  const menu = <ToolsFor scope={head.scope} title={title} tools={head.tools} />;
  const entries = head.entries ?? [];
  const lead =
    head.purpose || head.summary ? (
      <>
        {head.purpose && <p className="text-[13px] leading-relaxed text-rb-500">{head.purpose}</p>}
        {head.summary}
      </>
    ) : null;
  const aside =
    head.aside || entries.length ? (
      <>
        {head.aside}
        <EntryLinks entries={entries} />
      </>
    ) : null;
  return (
    <ProvSection scope={head.scope} className={className} data-anatomy={head.anatomy} {...head.hooks}>
      {heading ? (
        <div className="flex items-start justify-between gap-3" data-section-heading="">
          <div className="min-w-0">
            {heading}
            {head.subtitle}
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            {stamp}
            {help}
            {menu}
          </div>
        </div>
      ) : (
        <SectionHeading title={titleNode} stamp={stamp} help={help} menu={menu}>
          {head.subtitle}
        </SectionHeading>
      )}
      <div className="mt-3" {...head.bandHooks}>
        <VitalsBand
          lead={lead}
          aside={aside}
          notes={head.notes}
          vitals={head.figures.map((f) =>
            f.slot === "usage"
              ? { slot: "usage" as const, label: f.label, value: f.value, title: f.tip ?? f.label, side: f.side }
              : { slot: f.slot, label: f.label, value: f.value, title: f.tip, side: f.side },
          )}
        />
      </div>
      <SectionExplainer slot={{ body: head.explainer.body }} label={head.explainer.label} className="mt-2" />
    </ProvSection>
  );
}
