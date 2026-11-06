"use client";

// The event page's side column (rails-ops TO-DO-ui-jobs 236), in the spine's
// place beside the card, the same on every family: the page's h1 (the card's
// teaser where it has one, else the family's header in its title form,
// ui-jobs 286) with the event's ⋮ at its right on its first line (Inspect
// provenance, Copy link, Copy transaction hash, the explorer, View as
// Markdown, Copy for LLM; the design round of 6 Nov 2026), the Learn more
// link reading the modal's title (ui-jobs 380), the paragraph with the
// timeline link, the facts table (the family's rows less the one repeating
// the wallet heading's address, then the event's place, time, block and
// transaction), and the previous and next arrows.
// The family supplies the data and its words (`EventPageContract`); the
// shared words are `lib/shared/event-page-words.ts`. The table is identity
// and position, no figure that carries a receipt, so the provenance tripwire
// passes over it.

import { createContext, Fragment, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, FileText, Hash, Link2 } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { titleFigure, type EventTitle } from "@/lib/shared/event-title";
import { EventCardMenu, eventMarkdownHref, useMenuCopied } from "@/components/shared/event-card-menu";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { useChainId } from "@/lib/shared/chain-context";
import { chainMeta, explorerUrl } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { formatTimestamp } from "@/lib/shared/format-event";
import { EVENT_PAGE_WORDS as W } from "@/lib/shared/event-page-words";
import type { EventPageContract, EventPageFact, EventPageShell } from "@/lib/shared/explorer-adapter";
import { LearnMoreAsLinkContext } from "@/components/shared/learn-more-modal";
import { CHROME_HOVER } from "@/components/nav/chrome-hover";

/** The event page's shell, from the route's view: an `EventCard` inside it
 *  draws in page mode with this column. */
export const EventPageContext = createContext<EventPageShell | null>(null);

/** The event's Copy for LLM build, from a family's card to the column, which
 *  renders inside the card. Null where the family has none
 *  (`ExplorerAdapter.eventMarkdown`). */
export const EventMarkdownContext = createContext<(() => string) | null>(null);

/** The page's h1 (ui-jobs 307): the kind word and the event's main amounts, each
 *  with its token icon, as the family's contract states them. The figures
 *  repeat the card's, whose receipts trace them, so the h1 carries no receipt of
 *  its own. The symbol is spoken, not drawn: the icon is its mark. */
export function EventPageTitle({ title }: { title: EventTitle }) {
  const labelled = title.amounts.some((a) => a.label);
  return (
    <h1
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xl font-normal leading-tight text-foreground"
      data-event-page-title=""
      data-prov-exempt=""
    >
      {title.kind && <span className={title.amounts.length > 0 ? "text-rb-500" : undefined}>{title.kind}</span>}
      {title.amounts.map((a, i) => (
        <Fragment key={i}>
          {i > 0 && !labelled && <span className="text-rb-500">{W.title_and}</span>}
          <span className="inline-flex items-center gap-2.5" data-event-title-amount="">
            {a.label && <span className="text-rb-500">{a.label}</span>}
            <span>{titleFigure(a)}</span>
            <TokenChipIcon symbol={a.symbol} address={a.address} size={40} filterable={false} />
            <span className="sr-only">{a.symbol}</span>
          </span>
        </Fragment>
      ))}
    </h1>
  );
}

// ── The wallet heading's address ───────────────────────────────────────────
// The heading (H13, `DetailTopRow`) is a sibling of the card, so it hands its
// address over a small store; the facts table leaves out a row repeating it.
let headingWallet: string | null = null;
const headingListeners = new Set<() => void>();
const notifyHeading = () => headingListeners.forEach((l) => l());

/** The event page's wallet heading publishes its address. */
export function usePublishHeadingWallet(wallet: string | null | undefined) {
  const value = wallet ? wallet.toLowerCase() : null;
  useEffect(() => {
    if (!value) return;
    headingWallet = value;
    notifyHeading();
    return () => {
      if (headingWallet !== value) return;
      headingWallet = null;
      notifyHeading();
    };
  }, [value]);
}

function useHeadingWallet(): string | null {
  return useSyncExternalStore(
    (l) => {
      headingListeners.add(l);
      return () => headingListeners.delete(l);
    },
    () => headingWallet,
    () => null,
  );
}

const LINK = "text-blue-600 hover:underline dark:text-blue-400";
const TH = "w-24 py-1.5 pr-3 text-left align-top font-normal text-rb-500";
const TD = "min-w-0 py-1.5 align-top text-foreground";

/** A previous or next arrow: a 38px tile; at the end, a disabled one. */
function Step({ href, dir, data }: { href: string | null; dir: "previous" | "next"; data: Record<string, string> }) {
  const label = dir === "previous" ? W.previous : W.next;
  const arrow =
    dir === "previous" ? <ArrowLeft size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />;
  const box = "flex h-[38px] w-[38px] items-center justify-center rounded-lg";
  return href ? (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`${box} text-foreground transition-colors focus-ring ${CHROME_HOVER}`}
      {...data}
    >
      {arrow}
    </Link>
  ) : (
    <span
      role="link"
      aria-label={label}
      aria-disabled="true"
      className={`${box} text-rb-400 dark:text-rb-600`}
      {...data}
    >
      {arrow}
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

const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

/** The event's rows of its ⋮ on the event page. Each carries
 *  `data-menu-item`, the names the actions row had, for the verifiers. A copy
 *  row keeps the menu open and confirms in place, its icon a tick and its
 *  subtitle "Copied", as the card menu's copy rows do. */
function EventPageRows({ c, close }: { c: EventPageContract; close: () => void }) {
  const chainId = useChainId();
  const shareHref = useEventShareHref();
  const build = useContext(EventMarkdownContext);
  const [copied, copy] = useMenuCopied();
  const md = build && shareHref ? { href: eventMarkdownHref(shareHref), build } : null;
  const explorer = chainMeta(chainId).explorerName;
  // Copy for LLM copies the event's Markdown route (the page's URL with
  // `.md`), so a copy taken before the page's replay lands is the whole text;
  // where the read fails it copies the page's build.
  const readMarkdown = (m: { href: string; build: () => string }) =>
    fetch(m.href, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .catch(() => m.build());
  const tick = <Check size={16} />;
  return (
    <>
      {shareHref && (
        <ToolsMenuItem
          item="copy-link"
          icon={copied === "link" ? tick : <Link2 size={16} className="-rotate-45" />}
          title={W.copy_link}
          subtitle={copied === "link" ? W.copied : W.copy_link_hint}
          copied={copied === "link"}
          onClick={() => copy("link", `${window.location.origin}${shareHref}`)}
        />
      )}
      <ToolsMenuItem
        item="copy-tx-hash"
        icon={copied === "hash" ? tick : <Hash size={16} />}
        title={W.copy_hash}
        subtitle={copied === "hash" ? W.copied : shortHash(c.txHash)}
        copied={copied === "hash"}
        onClick={() => copy("hash", c.txHash)}
      />
      <ToolsMenuItem
        item="view-explorer"
        icon={<ExternalLink size={16} />}
        title={W.view_explorer(explorer)}
        subtitle={W.view_explorer_hint}
        href={explorerUrl(chainId, "tx-logs", c.txHash)}
        external
        onClick={close}
      />
      {md && (
        <>
          <ToolsMenuItem
            item="view-markdown"
            icon={<FileText size={16} />}
            title={W.view_markdown}
            subtitle={W.view_markdown_hint}
            href={md.href}
            external
            onClick={close}
          />
          <ToolsMenuItem
            item="copy-for-llm"
            icon={copied === "llm" ? tick : <Copy size={16} />}
            title={W.copy_llm}
            subtitle={copied === "llm" ? W.copied : W.copy_llm_hint}
            copied={copied === "llm"}
            onClick={() => copy("llm", readMarkdown(md))}
          />
        </>
      )}
    </>
  );
}

/** The page's h1 where the card has a teaser: the Explanation's first
 *  sentence (rails-ops decision 0045, "Ruled since"), under the Explanation's
 *  receipt rule (`data-prov-exempt`, as on T3), and under it a chip the
 *  sentence leaves out (a liquidation's claimable surplus). */
function EventPageSentence({ sentence, beside }: { sentence: ReactNode; beside?: ReactNode }) {
  return (
    <h1
      className="text-xl font-normal leading-snug text-foreground max-sm:text-lg"
      data-event-page-title=""
      data-event-page-sentence=""
      data-prov-exempt=""
    >
      {sentence}
      {beside && <span className="mt-2 flex">{beside}</span>}
    </h1>
  );
}

/** The h1's first line's height, where the ⋮ centres: the sentence's line
 *  (text-xl or, below sm, text-lg, leading-snug), the title's 40px icons, or
 *  the title's kind word alone (text-2xl, leading-tight). */
function firstLine(c: EventPageContract, sentence: boolean): string {
  if (sentence) return "h-[1.71875rem] max-sm:h-[1.546875rem]";
  if (c.title !== "head" && c.title.amounts.length === 0) return "h-[1.875rem]";
  return "h-10";
}

/** The column. `sentence`: the card's teaser, which stands as the h1 in place
 *  of the route's title; `beside` follows it. `learnMore`: the card's Learn
 *  more slot, drawn as a text link under the h1. `provScope`: the card's
 *  receipts scope, which the ⋮'s Inspect provenance arms (ui-jobs 284). */
export function EventPageAside({
  page,
  sentence,
  beside,
  learnMore,
  provScope,
}: {
  page: EventPageShell;
  sentence?: ReactNode;
  beside?: ReactNode;
  learnMore?: ReactNode;
  provScope: string;
}) {
  const c = page.contract;
  const shareHref = useEventShareHref();
  const heading = useHeadingWallet();
  // The holder or owner row says what the wallet heading above already says.
  const facts = heading ? c.facts.filter((f) => (f.full ?? f.value).toLowerCase() !== heading) : c.facts;
  return (
    <div className="space-y-4 pb-4 pt-3 text-sm sm:pb-0 sm:pr-6" data-event-page-side="">
      <div className="space-y-2 pb-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {sentence ? <EventPageSentence sentence={sentence} beside={beside} /> : page.title}
          </div>
          <span className={`flex shrink-0 items-center ${firstLine(c, !!sentence)}`} data-event-head-menu="">
            <EventCardMenu
              shareHref={shareHref}
              provScope={{ id: provScope, hint: W.provenance_hint }}
              pageRows={(close) => <EventPageRows c={c} close={close} />}
            />
          </span>
        </div>
        {learnMore != null && (
          <div>
            <LearnMoreAsLinkContext.Provider value>{learnMore}</LearnMoreAsLinkContext.Provider>
          </div>
        )}
      </div>
      <p className="leading-relaxed text-rb-500" data-event-page-paragraph="">
        {c.words.paragraph}{" "}
        <a href={c.timelineHref} className={LINK}>
          {c.words.timelineLink}
        </a>
      </p>
      <table className="w-full table-fixed border-collapse" data-event-page-facts="" data-prov-exempt="">
        <tbody className="divide-y divide-rb-200 dark:divide-rb-800">
          {facts.map((f) => (
            <FactRow key={f.key} fact={f} />
          ))}
          <tr data-fact="event">
            <th scope="row" className={TH}>
              {W.event}
            </th>
            <td className={TD}>{W.event_of(c.n, c.total)}</td>
          </tr>
          <tr data-fact="time">
            <th scope="row" className={TH}>
              {W.time}
            </th>
            <td className={TD}>
              {formatDate(page.timestamp)} {formatTimestamp(page.timestamp)} UTC
            </td>
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
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="block min-w-0 truncate font-mono text-xs leading-5" title={c.txHash} data-tx-hash="">
                  {c.txHash}
                </span>
                <CopyFact value={c.txHash} label={W.copy_hash} name="transaction" />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <nav aria-label={W.steps} className="flex justify-end gap-1" data-event-page-links="">
        <Step href={c.previousHref} dir="previous" data={{ "data-event-prev": "" }} />
        <Step href={c.nextHref} dir="next" data={{ "data-event-next": "" }} />
      </nav>
    </div>
  );
}
