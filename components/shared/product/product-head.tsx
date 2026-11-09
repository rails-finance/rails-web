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
import type {
  EntryLink,
  MarketStructure,
  ProductHead,
  ProductSection,
  ReadAt,
  SectionTools,
  StructureFigure,
} from "@/lib/shared/product/model";

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
    <div className="mt-auto flex flex-col gap-1 pt-3" data-anatomy="R6">
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

/** One structure term in the band's foot: "Rebalance from 88%". */
function Term({ f }: { f: StructureFigure }) {
  return (
    <span title={f.tip} data-structure-term="" {...f.hooks}>
      {f.label} <span className="text-foreground">{f.value}</span>
    </span>
  );
}

/** A head's structure terms, in the band's foot before its notes. */
function StructureTerms({ s }: { s: MarketStructure }) {
  if (s.kind === "comet")
    return (
      <>
        <Term f={s.kink} />
        <Term f={s.reserves} />
        <Term f={s.minBorrow} />
      </>
    );
  return (
    <>
      <Term f={s.ticks} />
      <Term f={s.rebalance} />
      <Term f={s.liquidation} />
    </>
  );
}

/** One section under a head (A2's family sections, A3's sections): its own
 *  receipts scope under a heading row with its "?" and ⋮. */
export function ProductSectionBlock({ s }: { s: ProductSection }) {
  const help = s.learnMore ? <LearnMore inline content={s.learnMore} ariaLabel={`${s.title}, learn more`} /> : null;
  const body =
    s.raised === "narrow" ? (
      <div className="max-w-xl rounded-lg bg-raised p-4">{s.body}</div>
    ) : s.raised ? (
      <div className="rounded-lg bg-raised p-4">{s.body}</div>
    ) : (
      s.body
    );
  return (
    <ProvSection scope={s.scope} className="mb-8" data-anatomy={s.anatomy || undefined} {...s.hooks}>
      <SectionHeading title={s.title} help={help} menu={<ToolsFor scope={s.scope} title={s.title} tools={s.tools} />} />
      <div className="mt-3">{body}</div>
    </ProvSection>
  );
}

export function ProductHeadSection({
  head,
  heading,
  titled = true,
  className = "mb-8",
}: {
  head: ProductHead;
  /** The page's h1 row in place of the section heading (A3). */
  heading?: ReactNode;
  /** False on a single-object page whose h1 names the object: the row keeps
   *  the subtitle, read stamp, "?" and ⋮, and draws no repeated title (Miles,
   *  9 Nov 2026). */
  titled?: boolean;
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
    <ProvSection
      scope={head.scope}
      className={className}
      data-anatomy={head.anatomy ? `${head.anatomy} R0` : "R0"}
      {...head.hooks}
    >
      {heading || !titled ? (
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
          // A head with no purpose keeps the lead column, so stacked heads on a
          // roster align their figures and links.
          lead={lead ?? (aside ? <span aria-hidden /> : null)}
          aside={aside}
          notes={
            head.structure || head.notes ? (
              <>
                {head.structure && <StructureTerms s={head.structure} />}
                {head.notes}
              </>
            ) : undefined
          }
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
