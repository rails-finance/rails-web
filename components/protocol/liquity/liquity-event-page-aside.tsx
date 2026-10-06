"use client";

// The Liquity V2 event page's side column (rails-ops TO-DO-ui-jobs 236), in
// the spine's place beside the card: the paragraph with the timeline link, a
// table of the facts the card does not show (branch, Trove id, holder, the
// event's place, block), and the previous, next and timeline links. The words
// are the strings file's `page_words` (content/liquity-v2/event-prose.yaml).
// The table is identity and position, no figure that carries a receipt, so
// the provenance tripwire passes over it.

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { PAGE_WORDS } from "@/lib/liquity/event-templates";
import { eventOf, holderName } from "@/lib/liquity/event-page";
import { listingHrefForWallet } from "@/lib/shared/protocols";

const LINK = "text-blue-600 hover:underline dark:text-blue-400";
const TH = "w-24 py-1.5 pr-3 text-left align-top font-normal text-rb-500";
const TD = "min-w-0 py-1.5 align-top text-foreground";

export interface LiquityEventPageAsideProps {
  collSymbol: string;
  troveId: string;
  /** The holder's wallet; a closed Trove's is its last owner (`last`). */
  owner: string | null;
  ownerEns: string | null;
  lastOwner: boolean;
  n: number;
  total: number;
  blockNumber: number;
  /** Null at the first or last event. */
  previousHref: string | null;
  nextHref: string | null;
  /** The trove page's `?at=` landing. */
  timelineHref: string;
}

/** A previous or next event link; at the end, a disabled one. */
function Step({ href, label, data }: { href: string | null; label: string; data: Record<string, string> }) {
  return href ? (
    <Link href={href} aria-label={label} className={LINK} {...data}>
      {label}
    </Link>
  ) : (
    <span role="link" aria-label={label} aria-disabled="true" className="text-rb-400" {...data}>
      {label}
    </span>
  );
}

function CopyTroveId({ troveId }: { troveId: string }) {
  const [copied, setCopied] = useState(false);
  const label = copied ? PAGE_WORDS.copied : PAGE_WORDS.copy_trove;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(troveId).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={label}
      title={label}
      className="shrink-0 cursor-pointer text-rb-500 hover:text-foreground"
      data-copy-trove-id=""
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
    </button>
  );
}

export function LiquityEventPageAside(p: LiquityEventPageAsideProps) {
  const holderHref = p.owner ? listingHrefForWallet("liquity-v2", p.owner) : null;
  const holder = holderName(p.owner, p.ownerEns);
  return (
    <div className="space-y-4 pb-4 pt-3 text-sm sm:pb-0 sm:pr-6" data-event-page-side="">
      <p className="leading-relaxed text-rb-500" data-event-page-paragraph="">
        {PAGE_WORDS.paragraph}{" "}
        <a href={p.timelineHref} className={LINK}>
          {PAGE_WORDS.timeline_link}
        </a>
      </p>
      <table className="w-full table-fixed border-collapse" data-event-page-facts="" data-prov-exempt="">
        <tbody className="divide-y divide-rb-200 dark:divide-rb-800">
          <tr>
            <th scope="row" className={TH}>
              {PAGE_WORDS.branch}
            </th>
            <td className={TD}>{p.collSymbol}</td>
          </tr>
          <tr>
            <th scope="row" className={TH}>
              {PAGE_WORDS.trove}
            </th>
            <td className={TD}>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate font-mono text-xs" title={p.troveId} data-trove-id="">
                  {p.troveId}
                </span>
                <CopyTroveId troveId={p.troveId} />
              </span>
            </td>
          </tr>
          <tr>
            <th scope="row" className={TH}>
              {p.lastOwner ? PAGE_WORDS.last_holder : PAGE_WORDS.holder}
            </th>
            <td className={`${TD} truncate`}>
              {holderHref ? (
                <Link href={holderHref} className={LINK} title={p.owner ?? undefined}>
                  {holder}
                </Link>
              ) : (
                holder
              )}
            </td>
          </tr>
          <tr>
            <th scope="row" className={TH}>
              {PAGE_WORDS.event}
            </th>
            <td className={TD}>{eventOf(p.n, p.total)}</td>
          </tr>
          <tr>
            <th scope="row" className={TH}>
              {PAGE_WORDS.block}
            </th>
            <td className={`${TD} font-mono text-xs leading-5`}>{p.blockNumber}</td>
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1" data-event-page-links="">
        <Step href={p.previousHref} label={PAGE_WORDS.previous} data={{ "data-event-prev": "" }} />
        <Step href={p.nextHref} label={PAGE_WORDS.next} data={{ "data-event-next": "" }} />
        <a href={p.timelineHref} aria-label={PAGE_WORDS.in_timeline} className={LINK} data-event-in-timeline="">
          {PAGE_WORDS.in_timeline}
        </a>
      </div>
    </div>
  );
}
