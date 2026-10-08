"use client";

// The event page's side column (rails-ops TO-DO-ui-jobs 236), in the spine's
// place beside the card, the same on every family: the page's h1 (the
// family's header in its title form, ui-jobs 286), the actions row (the
// timeline, the explorer, the Markdown, Copy link, Copy transaction hash, Copy
// for LLM, Show provenance; ui-jobs 291, 294, 284 and 308), the paragraph
// with the timeline link, the facts table (the family's rows, then the
// event's place, block and transaction), and the previous and next links.
// The family supplies the data and its words (`EventPageContract`); the
// shared words are `lib/shared/event-page-words.ts`. The table is identity
// and position, no figure that carries a receipt, so the provenance tripwire
// passes over it.

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { eventMarkdownHref, useMenuCopied } from "@/components/shared/event-card-menu";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { ProvScopeToggle } from "@/components/shared/prov-inspector";
import { useChainId } from "@/lib/shared/chain-context";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";
import { EVENT_PAGE_WORDS as W } from "@/lib/shared/event-page-words";
import type { EventPageContract, EventPageFact, EventPageShell } from "@/lib/shared/explorer-adapter";

/** The event page's shell, from the route's view: an `EventCard` inside it
 *  draws in page mode with this column. */
export const EventPageContext = createContext<EventPageShell | null>(null);

/** The event's Copy for LLM build, from a family's card to the column, which
 *  renders inside the card. Null where the family has none
 *  (`ExplorerAdapter.eventMarkdown`). */
export const EventMarkdownContext = createContext<(() => string) | null>(null);

/** The page's h1 where the family's header has no title form: the
 *  contract's heading, which the browser title also carries. */
export function EventPageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-2xl font-normal leading-tight text-foreground" data-event-page-title="">
      {children}
    </h1>
  );
}

const LINK = "text-blue-600 hover:underline dark:text-blue-400";
const ACTION = `${LINK} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rb-400 rounded-sm`;
const TH = "w-24 py-1.5 pr-3 text-left align-top font-normal text-rb-500";
const TD = "min-w-0 py-1.5 align-top text-foreground";

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

/** A facts row's copy button: a tick for a moment after the copy. */
function CopyFact({ value, label, name }: { value: string; label: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const words = copied ? W.copied : label;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={words}
      title={words}
      className="shrink-0 cursor-pointer text-rb-500 hover:text-foreground"
      data-copy-fact={name}
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
    </button>
  );
}

function FactRow({ fact }: { fact: EventPageFact }) {
  const full = fact.full ?? fact.value;
  const text = fact.href ? (
    <Link href={fact.href} className={LINK} title={full}>
      {fact.value}
    </Link>
  ) : (
    fact.value
  );
  return (
    <tr data-fact={fact.key}>
      <th scope="row" className={TH}>
        {fact.label}
      </th>
      {fact.mono || fact.copy ? (
        <td className={TD}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={`min-w-0 truncate${fact.mono ? " font-mono text-xs" : ""}`} title={full}>
              {text}
            </span>
            {fact.copy && <CopyFact value={full} label={fact.copy} name={fact.key} />}
          </span>
        </td>
      ) : (
        <td className={`${TD} truncate`}>{text}</td>
      )}
    </tr>
  );
}

/** "Copy for LLM": it copies the event's Markdown route (the page's URL with
 *  `.md`), so a copy taken before the page's replay lands is the whole text;
 *  where the read fails it copies the page's build. */
function CopyForLlm({ href, build }: { href: string; build: () => string }) {
  const [copied, copy] = useMenuCopied();
  const read = () =>
    fetch(href, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .catch(() => build());
  return (
    <button
      type="button"
      className={ACTION}
      title={W.copy_llm_hint}
      data-menu-item="copy-for-llm"
      data-copied={copied ? "" : undefined}
      onClick={() => copy("llm", read())}
    >
      {copied ? W.copied : W.copy_llm}
    </button>
  );
}

/** The row under the title: the links, then the copy buttons. Each item
 *  carries `data-menu-item`, the names the row's ⋮ had, for the verifiers. */
function EventActions({ c }: { c: EventPageContract }) {
  const chainId = useChainId();
  const shareHref = useEventShareHref();
  const build = useContext(EventMarkdownContext);
  const [copied, copy] = useMenuCopied();
  const md = build && shareHref ? { href: eventMarkdownHref(shareHref), build } : null;
  const explorer = chainMeta(chainId).explorerName;
  return (
    <div role="group" aria-label={W.actions} className="flex flex-wrap gap-x-4 gap-y-1" data-event-page-actions="">
      <a href={c.timelineHref} className={ACTION} title={c.words.timelineHint} data-menu-item="view-timeline">
        {W.in_timeline}
      </a>
      <a
        href={explorerUrl(chainId, "tx-logs", c.txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className={ACTION}
        title={W.explorer_hint(explorer)}
        data-menu-item="view-explorer"
      >
        {explorer}
      </a>
      {md && (
        <a
          href={md.href}
          target="_blank"
          rel="noopener noreferrer"
          className={ACTION}
          title={W.view_markdown_hint}
          data-menu-item="view-markdown"
        >
          {W.view_markdown}
        </a>
      )}
      {shareHref && (
        <button
          type="button"
          className={ACTION}
          title={W.copy_link_hint}
          data-menu-item="copy-link"
          data-copied={copied === "link" ? "" : undefined}
          onClick={() => copy("link", `${window.location.origin}${shareHref}`)}
        >
          {copied === "link" ? W.copied : W.copy_link}
        </button>
      )}
      <button
        type="button"
        className={ACTION}
        title={W.copy_hash_hint}
        data-menu-item="copy-tx-hash"
        data-copied={copied === "hash" ? "" : undefined}
        onClick={() => copy("hash", c.txHash)}
      >
        {copied === "hash" ? W.copied : W.copy_hash}
      </button>
      {md && <CopyForLlm href={md.href} build={md.build} />}
      <ProvScopeToggle
        variant="plain"
        scope={c.eventId}
        className={ACTION}
        words={{ show: W.show_provenance, hide: W.hide_provenance }}
        title={W.provenance_hint}
      />
    </div>
  );
}

export function EventPageAside({ page }: { page: EventPageShell }) {
  const c = page.contract;
  return (
    <div className="space-y-4 pb-4 pt-3 text-sm sm:pb-0 sm:pr-6" data-event-page-side="">
      <div className="space-y-2 pb-2">
        {page.title}
        <EventActions c={c} />
      </div>
      <p className="leading-relaxed text-rb-500" data-event-page-paragraph="">
        {c.words.paragraph}{" "}
        <a href={c.timelineHref} className={LINK}>
          {c.words.timelineLink}
        </a>
      </p>
      <table className="w-full table-fixed border-collapse" data-event-page-facts="" data-prov-exempt="">
        <tbody className="divide-y divide-rb-200 dark:divide-rb-800">
          {c.facts.map((f) => (
            <FactRow key={f.key} fact={f} />
          ))}
          <tr data-fact="event">
            <th scope="row" className={TH}>
              {W.event}
            </th>
            <td className={TD}>{W.event_of(c.n, c.total)}</td>
          </tr>
          <tr data-fact="block">
            <th scope="row" className={TH}>
              {W.block}
            </th>
            <td className={`${TD} font-mono text-xs leading-5`}>{c.blockNumber}</td>
          </tr>
          <tr data-fact="transaction">
            <th scope="row" className={TH}>
              {W.transaction}
            </th>
            <td className={TD}>
              <span className="block min-w-0 truncate font-mono text-xs leading-5" title={c.txHash} data-tx-hash="">
                {c.txHash}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1" data-event-page-links="">
        <Step href={c.previousHref} label={W.previous} data={{ "data-event-prev": "" }} />
        <Step href={c.nextHref} label={W.next} data={{ "data-event-next": "" }} />
      </div>
    </div>
  );
}
