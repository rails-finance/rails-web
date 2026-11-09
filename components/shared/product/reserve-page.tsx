"use client";

// A reserve page (archetype A3, rails-ops ui-jobs 549; anatomy M3): one asset
// in one market. The rail header and the back control (H7.1), then the head
// (M3.1 and M3.2 as one section: the asset's mark, its symbol as the h1 and
// its state tags, the read stamp, "?" and ⋮ at the right, the subtitle, the
// vitals band, the (i)), then the family's sections in its order, each its own
// receipts scope under a heading row with its ⋮: the rate curve (M3.3), the
// history (M3.4), the parameters (M3.5), the change log (M3.6) and the largest
// holders (M3.7, M3.8).

import Link from "next/link";
import type { ReactNode } from "react";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { RailHeader } from "@/components/shared/rail-header";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import type { ProtocolEntry } from "@/lib/shared/protocols";
import type { Hooks, Loadable, ProductHead, ProductSection, ReserveIdentity } from "@/lib/shared/product/model";
import { ProductHeadSection, ToolsFor } from "@/components/shared/product/product-head";
import { ProductFailed, ProductLoading } from "@/components/shared/product/market-page";

/** One section under the head. */
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
    <ProvSection scope={s.scope} className="mb-8" data-anatomy={s.anatomy} {...s.hooks}>
      <SectionHeading title={s.title} help={help} menu={<ToolsFor scope={s.scope} title={s.title} tools={s.tools} />} />
      <div className="mt-3">{body}</div>
    </ProvSection>
  );
}

/** What the page has once the head read answers. */
export interface ReservePageData {
  identity: ReserveIdentity;
  head: ProductHead;
  sections: ProductSection[];
}

export function ReservePage({
  protocol,
  backHref,
  learnMore,
  reserve,
  missing,
  what,
  hooks,
}: {
  protocol: ProtocolEntry;
  /** Where the back control falls back to: the market page. */
  backHref: string;
  learnMore?: Parameters<typeof LearnMore>[0]["content"];
  reserve: Loadable<ReservePageData | null>;
  /** The page when the market lists no such reserve: a line and a link. */
  missing: { line: string; link: { label: string; href: string } };
  /** The market's name, for the failure line. */
  what: string;
  hooks?: Hooks;
}) {
  const data = reserve.state === "ok" ? reserve.data : null;
  const h1 = (
    <div className="flex flex-wrap items-center gap-2">
      {data && (
        <TokenChipIcon symbol={data.identity.symbol} address={data.identity.address} size={28} filterable={false} />
      )}
      <h1 className="text-2xl font-semibold text-foreground" data-reserve-symbol="">
        {data?.identity.symbol ?? "Reserve"}
      </h1>
      {data?.identity.tags && <span className="flex flex-wrap items-center gap-1.5">{data.identity.tags}</span>}
      {learnMore && <LearnMore content={learnMore} inline />}
    </div>
  );
  let body: ReactNode;
  if (reserve.state === "loading") body = <ProductLoading height={480} />;
  else if (reserve.state === "error") body = <ProductFailed what={what} message={reserve.message} />;
  else if (!data)
    body = (
      <div className="py-12 text-center text-rb-500" data-reserve-missing="">
        <p className="mb-1">{missing.line}</p>
        <Link
          href={missing.link.href}
          className="text-[13px] text-blue-600 hover:underline dark:text-[var(--text-link)]"
        >
          {missing.link.label}
        </Link>
      </div>
    );
  else body = data.sections.map((s) => <ProductSectionBlock key={s.scope} s={s} />);

  return (
    <div className="min-h-screen" data-anatomy="M3" {...hooks}>
      <div className="py-8">
        <header className="mb-6">
          <div className="mb-2.5">
            <RailHeader session={protocol.session} venue="subPage" />
          </div>
          <div className="mb-3">
            <DetailBackButton fallbackHref={backHref} />
          </div>
          {data ? (
            <ProductHeadSection head={data.head} heading={h1} className="mt-0" />
          ) : (
            <div data-anatomy="M3.1">{h1}</div>
          )}
        </header>
        {body}
      </div>
    </div>
  );
}
