// ProtocolInfoPage is the typed template every /info page follows (rails-ops
// standards/info-page-template.md). ProtocolInfoShell below is the untyped shell
// that only the exempt testnet page (Polaris on Sepolia) still uses.
//
// ProtocolInfoShell — the one shell for every explorer's /info page: the rail
// header with the (i) lit, then the intro prose that used to live behind the
// listing's (i) drawer (the intro slot grammar, charter §8a — the copy moved
// here, reframed for a standalone page), then the standing door to /coverage.
// No recency stamp — this page reads no chain state.
//
// The blurb arrives as `children` from the explorer's own info/page.tsx, so
// each protocol's prose lives beside its route while the anatomy lives here,
// once.

import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { RailHeader } from "@/components/shared/rail-header";
import { protocolForSession } from "@/lib/shared/protocols";
import { CHAINS, explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { FOOT_LINK, INLINE_LINK } from "@/lib/shared/ui-grammar";
import { shortAddress } from "@/lib/shared/asset-roster";
import { InfoHistoryLine } from "@/components/shared/history-tag";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";

/** Slot I6, the pointer line, where an explorer passes no `guide`: true of a
 *  page whose cards carry all four controls (label tip, (i), ?, ⋮). */
const GUIDE_DEFAULT =
  "Press a figure's label to read what it means. The (i) under a card says what its figures mean for that position, and the ? beside it explains how that kind of position works. A card's ⋮ menu traces each figure to the chain.";

/** Slot I6 for an explorer whose cards have no ?, passed as its `guide`. */
export const GUIDE_NO_LEARN_MORE =
  "Press a figure's label to read what it means. The (i) under a section says what its figures mean for the wallet. A section's ⋮ menu traces each figure to the chain.";

export interface InfoDocLink {
  label: string;
  href: string;
}

/** A contract that names a term the docs never use (rails-ops standards/info-page-template.md,
 *  glossary): its address on the explorer's chain, and the function, event or contract name
 *  carrying the word, as read. */
export interface InfoContractSource {
  kind: "contract";
  address: string;
  /** Defaults to the explorer's chain. */
  chainId?: ChainId;
  /** What carries the word: `name() is "Slipstream Position NFT v1.2" at block 159,483,363`. */
  carries: string;
}

/** A term's source: a docs page (after "Docs:") or a contract (after "Contract:"). */
export type InfoTermSource = InfoDocLink | InfoContractSource;

const isContractSource = (s: InfoTermSource): s is InfoContractSource => "kind" in s && s.kind === "contract";

export interface InfoTerm {
  term: string;
  /** One or two sentences, plain English, the practical figure before the formula. */
  definition: string;
  /** The protocol's official docs or FAQ, or for a term the docs never use the contract that
   *  names it: at least one, by this type and scripts/test/info-glossary-sources.test.mjs. */
  sources: readonly [InfoTermSource, ...InfoTermSource[]];
}

export interface InfoView {
  /** "Listing", "Position page", "System page": the view as the rail names it. */
  heading: string;
  body: ReactNode;
}

/** One contract Rails reads for an explorer (slot 2a). */
export interface InfoReadContract {
  /** The contract's name as the protocol calls it. */
  name: string;
  /** Linked off-site to the chain's explorer; absent for a set of contracts
   *  ("each market's token"). */
  address?: string;
  /** What Rails reads from it, in plain words. */
  reads: ReactNode;
}

/** Slot 2a, "How Rails reads it" (decision 0059 point 6). */
export interface InfoReads {
  /** The chain the addresses are on; the explorer's own where absent. */
  chainId?: ChainId;
  contracts: readonly [InfoReadContract, ...InfoReadContract[]];
  /** One line on the read: live at each page load, or Rails's server store and how often. */
  how: ReactNode;
  /** Facts a researcher needs that the product pages no longer carry, a paragraph each. */
  notes?: readonly ReactNode[];
}

export const READS_HEADING = "How Rails reads it";

/** A glossary term's sources: docs links after a muted "Docs:", contracts after a muted "Contract:",
 *  each address linked to the chain's explorer as slot 2a links it. */
function TermSources({ sources, chainId }: { sources: readonly InfoTermSource[]; chainId: ChainId }) {
  const docs = sources.filter((s): s is InfoDocLink => !isContractSource(s));
  const contracts = sources.filter(isContractSource);
  return (
    <>
      {docs.length > 0 && (
        <>
          {" "}
          <span className="text-rb-400">Docs:</span>{" "}
          {docs.map((l, i) => (
            <span key={l.href}>
              {i > 0 && ", "}
              <a href={l.href} className={INLINE_LINK} target="_blank" rel="noopener">
                {l.label}
              </a>
            </span>
          ))}
        </>
      )}
      {contracts.length > 0 && (
        <>
          {" "}
          <span className="text-rb-400">Contract:</span>{" "}
          {contracts.map((c, i) => {
            const chain = c.chainId ?? chainId;
            return (
              <span key={c.address} data-info-term-contract="">
                {i > 0 && ", "}
                <a
                  href={explorerUrl(chain, "address", c.address)}
                  target="_blank"
                  rel="noopener"
                  className="link-external font-mono text-[12px]"
                  title={`${c.address} on ${CHAINS[chain].explorerName}`}
                >
                  {shortAddress(c.address)}
                </a>
                , {c.carries}
              </span>
            );
          })}
        </>
      )}
    </>
  );
}

/** Slot 2a: one row per contract, its address linked off-site (pink), then the
 *  line on the read and any notes. */
function InfoReadsSection({ reads, chainId }: { reads: InfoReads; chainId: ChainId }) {
  const chain = reads.chainId ?? chainId;
  return (
    <section data-anatomy="I8" data-info-reads="">
      <h2 className={H}>{READS_HEADING}</h2>
      <ul className={UL}>
        {reads.contracts.map((c) => (
          <li key={c.name} data-info-read={c.name}>
            <span className="font-semibold text-foreground">{c.name}</span>
            {c.address && (
              <>
                {" "}
                <a
                  href={explorerUrl(chain, "address", c.address)}
                  target="_blank"
                  rel="noopener"
                  className="link-external font-mono text-[12px]"
                  title={`${c.address} on ${CHAINS[chain].explorerName}`}
                >
                  {shortAddress(c.address)}
                </a>
              </>
            )}
            {": "}
            {c.reads}
          </li>
        ))}
      </ul>
      <p className="mt-2">{reads.how}</p>
      {reads.notes?.map((n, i) => (
        <p key={i} className="mt-2">
          {n}
        </p>
      ))}
    </section>
  );
}

/** The docs' words, quoted exactly, and the page they are on. */
export interface InfoDocsQuote {
  words: string;
  href: string;
}

/** One figure the chain holds, with its receipt where one exists. */
export interface InfoChainFigure {
  words: string;
  prov?: Provenance;
}

/** One place where the protocol's docs and its contracts or chain say
 *  different things (ui-jobs 609): the difference in one line, the docs'
 *  words as quoted links, and what the chain holds, each figure with its
 *  receipt where one exists. */
export interface InfoDocsAndChain {
  /** The difference, one plain sentence. */
  claim: string;
  docs: {
    /** Words before the quotes, where the docs side is what a page shows
     *  rather than a sentence it states. */
    lead?: string;
    /** The label before the quotes; "Docs" where absent, "Site" for the
     *  protocol's website. */
    label?: string;
    quotes: readonly [InfoDocsQuote, ...InfoDocsQuote[]];
    /** The day the pages were read, "12 Nov 2026". */
    read?: string;
  };
  /** Drawn in order, separated by semicolons. */
  chain: readonly [InfoChainFigure, ...InfoChainFigure[]];
}

export const DOCS_AND_CHAIN_HEADING = "Where the docs and the chain differ";

const DOCS_AND_CHAIN_SCOPE = "docs-and-chain";

/** The docs-and-chain section, after the glossary whose terms it qualifies.
 *  Drawn only where an explorer passes at least one entry. One receipts
 *  scope, and its inspector layer rides with it. A page that passes no
 *  docsAndChain may mount a receipt and a layer of its own. */
function InfoDocsAndChainSection({ items }: { items: readonly InfoDocsAndChain[] }) {
  return (
    <div className="mt-5">
      <ProvSection scope={DOCS_AND_CHAIN_SCOPE} data-anatomy="I9" data-info-docs-chain="">
        <SectionHeading title={DOCS_AND_CHAIN_HEADING} />
        <ul className={UL}>
          {items.map((d) => (
            <li key={d.claim} data-info-docs-chain-item="">
              {d.claim} <span className="text-rb-400">{d.docs.label ?? "Docs"}:</span>{" "}
              {d.docs.lead && `${d.docs.lead} `}
              {d.docs.quotes.map((q, i) => (
                <span key={i}>
                  {i > 0 && (i === d.docs.quotes.length - 1 ? " and " : ", ")}
                  <a href={q.href} className={INLINE_LINK} target="_blank" rel="noopener">
                    &ldquo;{q.words}&rdquo;
                  </a>
                </span>
              ))}
              {d.docs.read && ` (read ${d.docs.read})`}. <span className="text-rb-400">Chain:</span>{" "}
              {d.chain.map((c, i) => (
                <span key={i}>
                  {i > 0 && "; "}
                  {c.prov ? <Prov info={c.prov}>{c.words}</Prov> : c.words}
                </span>
              ))}
              .
            </li>
          ))}
        </ul>
      </ProvSection>
      <ProvInspectorLayer />
    </div>
  );
}

/** The glossary's heading: one word, one place to change it. */
export const GLOSSARY_HEADING = "Glossary";

/** The anchor of a glossary entry; `GlossaryLink` and the entry's id share it. */
export function glossaryId(term: string): string {
  return `glossary-${term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

/** A link from running text to a glossary entry on the same page. Use it at the first use of a term. */
export function GlossaryLink({ term, children }: { term: string; children?: ReactNode }) {
  return (
    <a href={`#${glossaryId(term)}`} className={INLINE_LINK}>
      {children ?? term}
    </a>
  );
}

const H = "mt-5 text-sm font-semibold text-foreground";
const UL = "mt-1.5 list-disc space-y-1 pl-5";

export function ProtocolInfoShell({ session, children }: { session: SessionProtocol; children: ReactNode }) {
  // Coverage is per-chain routes; the door leads to the matrix that actually
  // contains this explorer's row.
  const chainId = protocolForSession(session)?.chainId ?? MAINNET_CHAIN_ID;
  return (
    <div className="py-8">
      <div className="mb-6">
        <RailHeader session={session} venue="info" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground" data-anatomy="I1">
        About this explorer
      </h1>
      {/* A div, not a <p>: the blurbs are multi-paragraph and carry their own
          <p> elements. max-w-3xl matches the sub-page intro measure. */}
      <div className="mt-3 max-w-3xl space-y-2 text-sm text-rb-500" data-anatomy="I2">
        {children}
      </div>
      {/* The door to the chain's coverage page — every protocol keeps it,
          ungated. The structural coverage note itself renders only there (its
          audit reader wants that register); the intro above carries any
          reader-facing consequence in plain words instead. */}
      <p className="mt-4 text-sm text-rb-500" data-anatomy="I3">
        <Link href={`/coverage/${CHAINS[chainId].slug}`} className={FOOT_LINK}>
          See what Rails covers on each {CHAINS[chainId].name} explorer
        </Link>
      </p>
    </div>
  );
}

export interface ProtocolInfoPageProps {
  session: SessionProtocol;
  /** Slot 1: what the explorer tracks, one or two sentences, with what it does not cover. */
  tracks: ReactNode;
  /** Slot 2: each term defined once, linked to the protocol's official docs or FAQ. */
  glossary: readonly [InfoTerm, ...InfoTerm[]];
  /** Slot 3: how the protocol works, three or four items, the distinguishing feature first. */
  howItWorks: readonly [ReactNode, ...ReactNode[]];
  /** Slot 2a, "How Rails reads it": omitted on an explorer that reads no contract directly. */
  reads?: InfoReads;
  /** Slot 4: one section per view, each a few lines. */
  views: readonly [InfoView, ...InfoView[]];
  /** Slot 5: the search and filter line, only where the listing has them. */
  search?: ReactNode;
  /** Slot I6, how to read the pages, where the explorer's pages differ from the
   *  default sentence (`GUIDE_NO_LEARN_MORE` where its cards have no ?). */
  guide?: ReactNode;
  /** One sentence naming what a reader might expect here and will not find, shown beside the coverage door. Omit it when nothing is expected and missing. */
  notCovered?: string;
  /** Slot 6: the official documentation, the page's final line. */
  docs: InfoDocLink;
  /** After the glossary: where the protocol's docs and its contracts or chain
   *  differ, with both sources. Absent or empty, nothing is drawn. */
  docsAndChain?: readonly InfoDocsAndChain[];
}

export function ProtocolInfoPage({
  session,
  tracks,
  glossary,
  howItWorks,
  reads,
  views,
  search,
  guide,
  notCovered,
  docs,
  docsAndChain,
}: ProtocolInfoPageProps) {
  const entry = protocolForSession(session);
  const chainId = entry?.chainId ?? MAINNET_CHAIN_ID;
  return (
    <div className="py-8">
      <div className="mb-6">
        <RailHeader session={session} venue="info" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground" data-anatomy="I1">
        About this explorer
      </h1>
      {/* Decisions 0061 and 0063: an explorer with a `history` opens with
          its tag and line. */}
      {entry?.history && <InfoHistoryLine id={entry.id} />}
      <div className="mt-3 max-w-3xl space-y-2 text-sm text-rb-500" data-anatomy="I2">
        <p>{tracks}</p>

        <h2 className={H}>How it works</h2>
        <ul className={UL}>
          {howItWorks.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>

        {reads && <InfoReadsSection reads={reads} chainId={chainId} />}

        <h2 id="glossary" className={`${H} scroll-mt-20`}>
          {GLOSSARY_HEADING}
        </h2>
        <dl className="mt-1.5 space-y-2" data-anatomy="I4">
          {glossary.map((t) => (
            <div key={t.term} id={glossaryId(t.term)} className="scroll-mt-20">
              <dt className="inline font-semibold text-foreground">{t.term}</dt>
              <dd className="inline">
                {": "}
                {t.definition}
                <TermSources sources={t.sources} chainId={chainId} />
              </dd>
            </div>
          ))}
        </dl>

        {docsAndChain && docsAndChain.length > 0 && <InfoDocsAndChainSection items={docsAndChain} />}

        {views.map((v) => (
          <section key={v.heading}>
            <h2 className={H}>{v.heading}</h2>
            <div className="mt-1.5">{v.body}</div>
          </section>
        ))}

        {search && (
          <p className="mt-5" data-anatomy="I5">
            {search}
          </p>
        )}

        <p className="mt-5" data-anatomy="I6">
          {guide ?? GUIDE_DEFAULT}
        </p>
      </div>
      <p className="mt-4 text-sm text-rb-500" data-anatomy="I3">
        {notCovered && <span className="block">{notCovered}</span>}
        <Link href={`/coverage/${CHAINS[chainId].slug}`} className={FOOT_LINK}>
          See what Rails covers on each {CHAINS[chainId].name} explorer
        </Link>
      </p>
      <p className="mt-2 text-sm text-rb-500" data-anatomy="I7">
        Official documentation:{" "}
        <a href={docs.href} className={INLINE_LINK} target="_blank" rel="noopener">
          {docs.label}
        </a>
      </p>
    </div>
  );
}
