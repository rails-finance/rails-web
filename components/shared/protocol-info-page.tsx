// ProtocolInfoPage is the typed template every moved /info page follows (rails-ops
// standards/info-page-template.md); ProtocolInfoShell below is the older untyped
// shell, kept for the pages not yet moved and the exempt testnet page. `rg
// ProtocolInfoShell app` lists what is left to move.
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
import { CHAINS, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

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
  /** Slot 4: one section per view, each a few lines. */
  views: readonly [InfoView, ...InfoView[]];
  /** Slot 5: the search and filter line, only where the listing has them. */
  search?: ReactNode;
  /** The protocol's name as the pointer line spells it. */
  name: string;
  /** Slot 6: the official documentation, the page's final line. */
  docs: InfoDocLink;
}

export function ProtocolInfoPage({
  session,
  tracks,
  glossary,
  howItWorks,
  views,
  search,
  name,
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

        <h2 id="glossary" className={`${H} scroll-mt-20`}>
          Terms
        </h2>
        <dl className="mt-1.5 space-y-2" data-anatomy="I4">
          {glossary.map((t) => (
            <div key={t.term}>
              <dt className="inline font-semibold text-foreground">{t.term}</dt>
              <dd className="inline">
                {": "}
                {t.definition}{" "}
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

        <h2 className={H}>How it works</h2>
        <ul className={UL}>
          {howItWorks.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>

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
          An (i) on a card, panel or event explains its figures; the ? at the bottom right of the (i) panel opens what
          that kind of event means in {name}, with sources.
        </p>
      </div>
      <p className="mt-4 text-sm text-rb-500" data-anatomy="I3">
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
