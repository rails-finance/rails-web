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
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { shortAddress } from "@/lib/shared/asset-roster";

export interface InfoDocLink {
  label: string;
  href: string;
}

export interface InfoTerm {
  term: string;
  /** One or two sentences, plain English, the practical figure before the formula. */
  definition: string;
  /** The protocol's official docs or FAQ, at least one. */
  sources: readonly [InfoDocLink, ...InfoDocLink[]];
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
                  rel="noopener noreferrer"
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
        <Link href={`/coverage/${CHAINS[chainId].slug}`} className={INLINE_LINK}>
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
  /** One sentence naming what a reader might expect here and will not find, shown beside the coverage door. Omit it when nothing is expected and missing. */
  notCovered?: string;
  /** Slot 6: the official documentation, the page's final line. */
  docs: InfoDocLink;
}

export function ProtocolInfoPage({
  session,
  tracks,
  glossary,
  howItWorks,
  reads,
  views,
  search,
  notCovered,
  docs,
}: ProtocolInfoPageProps) {
  const chainId = protocolForSession(session)?.chainId ?? MAINNET_CHAIN_ID;
  return (
    <div className="py-8">
      <div className="mb-6">
        <RailHeader session={session} venue="info" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground" data-anatomy="I1">
        About this explorer
      </h1>
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
                {t.definition} <span className="text-rb-400">Docs:</span>{" "}
                {t.sources.map((l, i) => (
                  <span key={l.href}>
                    {i > 0 && ", "}
                    <a href={l.href} className={INLINE_LINK} target="_blank" rel="noopener noreferrer">
                      {l.label}
                    </a>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>

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
          Tap the (i) beside any figure to see where it comes from. Inside, the ? explains that kind of event in
          general.
        </p>
      </div>
      <p className="mt-4 text-sm text-rb-500" data-anatomy="I3">
        {notCovered && <span className="block">{notCovered}</span>}
        <Link href={`/coverage/${CHAINS[chainId].slug}`} className={INLINE_LINK}>
          See what Rails covers on each {CHAINS[chainId].name} explorer
        </Link>
      </p>
      <p className="mt-2 text-sm text-rb-500" data-anatomy="I7">
        Official documentation:{" "}
        <a href={docs.href} className={INLINE_LINK} target="_blank" rel="noopener noreferrer">
          {docs.label}
        </a>
      </p>
    </div>
  );
}
