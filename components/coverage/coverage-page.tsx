import Link from "next/link";
import { Ban, Check, Clock } from "lucide-react";
import type { Metadata } from "next";

import {
  CAPABILITIES,
  COVERAGE_NOTES,
  EXPLORERS_WITHOUT_LISTING,
  VIEW_NOTES,
  cellFor,
  coverageExplorers,
  coverageRows,
  type ComingSoonEntry,
} from "@/lib/shared/coverage";
import { explorerName, isLaunchedChain } from "@/lib/shared/protocols";
import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";
import { ChainToggleLinks } from "@/components/shared/chain-toggle";
import { InfoDisclosure } from "@/components/shared/info-disclosure";
import { DepthMatrix } from "@/components/coverage/depth-matrix";
import { CapabilityPill } from "@/components/coverage/capability-sheet";
import { CoverageDrawerBody } from "@/components/coverage/drawer-body";
import { SITE_URL } from "@/lib/shared/page-metadata";

// The coverage surface is one page component behind two per-chain routes
// (/coverage/ethereum, /coverage/base). The toggle at the top links between
// them — the URL says the chain, so the rows carry no chain mark.

/** The canonical path of a chain's coverage page — what every "See detailed
 *  coverage" door across the site points at. */
function coverageHref(chainId: ChainId): string {
  return `/coverage/${CHAINS[chainId].slug}`;
}

const coverageBlurb = (chainId: ChainId) =>
  `What every Rails explorer on ${CHAINS[chainId].name} gives you, and how deep each one currently goes — position dashboards, oracle pricing, chain verification, exports.`;

/** Metadata for a chain's coverage route — built here so the two thin route
 *  files can't drift apart. */
export function coverageMetadata(chainId: ChainId): Metadata {
  const blurb = coverageBlurb(chainId);
  const url = `${SITE_URL}${coverageHref(chainId)}`;
  return {
    title: `Coverage — ${CHAINS[chainId].name}`,
    description: blurb,
    openGraph: {
      title: `Rails Coverage — ${CHAINS[chainId].name}`,
      description: blurb,
      url,
      images: ["/og/home.png"],
    },
    alternates: { canonical: url },
    // A chain whose every explorer is unlaunched has an unlaunched front door:
    // the page still serves, and it is out of the sitemap and out of search
    // along with the explorers it lists.
    ...(isLaunchedChain(chainId) ? {} : { robots: { index: false, follow: false } }),
  };
}

/**
 * Announced explorers that aren't in the roster yet. NOT roster entries on
 * purpose: everything keyed off PROTOCOLS (the matrix, the headline count,
 * bookmarks, sessions) states what's built, and these aren't — each joins the
 * roster in its own go-live commit and leaves this list in the same change.
 * `iconId` points at an existing protocol's mark where the brand is shared;
 * `chainId` places the row on the right chain's page (Ethereum if unset).
 *
 * Empty on purpose — it is a live list, not a dead one. LlamaLend V2 was the
 * single entry ("deployed but still empty — the explorer arrives once there
 * are positions to show"); V2 shipped, and it did NOT arrive as a separate
 * explorer. The llamalend explorer covers both generations — versioned asset
 * catalog, V1/V2 market sections, a V2 badge on the position card — so V2
 * needed no roster entry of its own, and announcing it as unbuilt had become
 * false. Its route now redirects into the V2 markets section.
 */
const COMING_SOON: ComingSoonEntry[] = [];

/** The shared foundation — identical in every explorer, so it renders as a
 *  checklist, not a comparison. Phrased as what the reader gets. */
const FOUNDATION: { title: string; detail: string }[] = [
  {
    title: "Every position, not just yours",
    detail: "browse all open positions in the protocol, search any wallet",
  },
  {
    title: "Read-only by design",
    detail: "no wallet connection, no signatures, no permissions; works when the official frontend doesn't",
  },
  {
    title: "Full position history",
    detail: "every action as a card: what happened, what it changed, what it cost in gas, linked to the transaction",
  },
  {
    title: "No modeled state",
    detail: "every number replayed from the protocol's own on-chain events, nothing estimated or interpolated",
  },
  {
    title: "Provenance on every figure",
    detail: "open a receipt showing exactly which contract event or storage read produced a number",
  },
  {
    title: "Live",
    detail: "follows the chain head, updated as blocks land",
  },
  {
    title: "Lifetime economics",
    detail: "the position's flows over its whole life, interest split from principal where the flows reconcile",
  },
  {
    title: "Bookmarks",
    detail: "pin wallets and positions across explorers",
  },
];

/** Small counts read better as words in prose. Falls back to the digits rather
 *  than growing a table — a roster with ten listing exceptions has a bigger
 *  problem than its grammar. */
const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];
const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);

/** "MetaMorpho V1.0 and MetaMorpho V1.1" — the registry's family names joined
 *  for prose; three or more take an Oxford comma. */
const joinFamilies = (families: readonly string[]): string =>
  families.length <= 2 ? families.join(" and ") : `${families.slice(0, -1).join(", ")}, and ${families.at(-1)}`;

export function CoveragePage({ chainId }: { chainId: ChainId }) {
  // Explorers ON THIS PAGE'S CHAIN that cannot browse every open position —
  // the caveat under the foundation names them, so it must not name an
  // explorer the matrix above doesn't show.
  const listingExceptions = coverageExplorers(chainId).filter((p) => EXPLORERS_WITHOUT_LISTING.has(p.id));
  // A vault is still never a row in the matrix — but the PROTOCOL whose factory
  // deployed it is, and that is where the vaults live now (rails-ops decision
  // 0028). So this page has no Vaults section beneath the matrix: Morpho Blue
  // on Base and Aave vaults on Ethereum each carry their own row, with the
  // capabilities a vault layer can have stated on it and the two risk columns
  // ruled out with a `why` rather than left reading "not yet".

  return (
    <div className="min-h-screen">
      {/* Lead */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-10 text-center">
        <h1 className="font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,48px)]">
          What Rails <span className="marketing">Covers</span>
        </h1>
        {/* The chain is the URL: the toggle is a pair of links between the two
            per-chain routes, the same segmented pill the home grid renders in
            button form. */}
        <div className="mt-6 flex justify-center">
          <ChainToggleLinks chainId={chainId} basePath="/coverage" />
        </div>
        <p className="text-base md:text-lg font-normal leading-relaxed text-rb-500 max-w-2xl mx-auto mt-5">
          Details of the protocols we cover and the depth in which we cover them.
        </p>
      </section>

      {/* ── Per-explorer depth matrix (desktop). Client: each row opens its
            own drawer — the protocol view + any structural note. ── */}
      <DepthMatrix comingSoon={COMING_SOON} chainId={chainId} />

      {/* ── Per-explorer depth (mobile): one stacked card per explorer. On
            desktop each capability's definition lives in the matrix's own
            column-header popovers (DepthMatrix above); the card stack never
            shows a capability's `detail` inline, so on mobile it lives one
            tap away instead — CapabilityPill (below) turns each included-
            capability pill into a bottom-sheet trigger for its own
            definition. ── */}
      <section className="max-w-7xl mx-auto px-4 pb-16 md:hidden">
        <div className="flex flex-col gap-3">
          {coverageRows(COMING_SOON, chainId).map((row) => {
            // A coming-soon card makes no capability claims — same rule as
            // the desktop row: icon, linked name, a neutral pill, one muted
            // note. No capability pills, no drawer.
            if (row.kind === "soon") {
              const soon = row.entry;
              return (
                <div key={soon.id} className="rounded-2xl bg-raised p-4">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Link href={soon.href} className="flex items-center gap-2.5">
                      <ProtocolIcon id={soon.iconId} className="h-7 w-7 shrink-0" />
                      <span className="font-semibold text-foreground">{soon.label}</span>
                    </Link>
                    <span className="rounded-full bg-rb-200 px-2 py-0.5 text-[10px] font-medium text-rb-500 dark:bg-rb-800 dark:text-rb-400">
                      Coming soon
                    </span>
                  </div>
                  <p className="text-xs text-rb-500 mt-2">{soon.note}</p>
                </div>
              );
            }

            const p = row.entry;
            const included = CAPABILITIES.filter((cap) => {
              const cell = cellFor(p.id, cap.key);
              return cell === true || (typeof cell === "object" && "except" in cell);
            });
            const noted = CAPABILITIES.filter((cap) => {
              const cell = cellFor(p.id, cap.key);
              return cell !== true && cell !== false;
            });
            return (
              <div key={p.id} className="rounded-2xl bg-raised p-4">
                <Link href={p.href} className="flex items-center gap-2.5">
                  <ProtocolIcon id={p.id} className="h-7 w-7 shrink-0" />
                  <span className="font-semibold text-foreground">{p.label}</span>
                </Link>
                <p className="text-xs text-rb-500 mt-1">{p.desc}</p>
                {included.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {included.map((cap) => (
                      <CapabilityPill key={cap.key} label={cap.label} detail={cap.detail} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-rb-500 mt-2">The full foundation above; the deeper surfaces are next.</p>
                )}
                {noted.map((cap) => {
                  const cell = cellFor(p.id, cap.key);
                  if (cell === true || cell === false) return null;
                  const except = "except" in cell;
                  const awaiting = "awaiting" in cell;
                  const Mark = except ? Check : awaiting ? Clock : Ban;
                  return (
                    <p key={cap.key} className="text-xs text-rb-500 mt-2 flex items-start gap-1.5">
                      <Mark className="h-3.5 w-3.5 shrink-0 mt-px text-rb-400" aria-hidden="true" />
                      <span>
                        {cap.label} — {except ? `all but ${cell.except}` : awaiting ? cell.awaiting : cell.why}
                      </span>
                    </p>
                  );
                })}
                {/* The same drawer that opens from the protocol's matrix row on
                    desktop — the protocol view one-liner plus any structural
                    note. Inside the disclosure, not inline: 18 always-visible
                    extra sentences would bloat the stack, and the content
                    already ships once in the always-mounted table rows above.
                    Plain InfoDisclosure: the card is a rounded-2xl bg-raised
                    surface, exactly the host the default background fill was
                    designed for. */}
                {(COVERAGE_NOTES[p.id] || VIEW_NOTES[p.id]) && (
                  <InfoDisclosure className="mt-3" label={`about the ${explorerName(p)} explorer`}>
                    <CoverageDrawerBody viewNote={VIEW_NOTES[p.id]} coverageNote={COVERAGE_NOTES[p.id]} />
                  </InfoDisclosure>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── The shared foundation — the page-closing band. Every explorer has
            all of it, so it renders as a checklist, not a comparison; it inherits
            the bg-raised band that closed the page before. ── */}
      <div className="bg-raised">
        <section className="max-w-7xl mx-auto px-4 md:px-6 py-14">
          <h2 className="text-xs font-medium tracking-[0.12em] uppercase text-rb-500 mb-5">In every explorer</h2>
          {/* An explorer on this chain that cannot keep the first item's
              promise is named rather than letting the claim stand for all. */}
          {listingExceptions.length > 0 && (
            <p className="text-sm text-rb-500 mb-5 max-w-3xl">
              {listingExceptions.length === 1 ? "With one exception:" : `With ${countWord(listingExceptions.length)} exceptions:`}{" "}
              {listingExceptions.map((p, i) => (
                <span key={p.id}>
                  {/* A comma-only join reads as an unfinished list once there
                      are more than two, so the last item takes a conjunction. */}
                  {i > 0 && (i === listingExceptions.length - 1 ? (listingExceptions.length > 2 ? ", and " : " and ") : ", ")}
                  <Link href={p.href} className="text-blue-500 hover:underline">
                    {explorerName(p)}
                  </Link>
                </span>
              ))}{" "}
              {listingExceptions.length === 1 ? "opens" : "open"} on a wallet rather than a list — the set of open
              positions is not something that chain will yet give up. Everything a single wallet holds is unaffected.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-4">
            {FOUNDATION.map((item) => (
              <div key={item.title} className="flex gap-3">
                <Check className="h-[18px] w-[18px] text-green-500 shrink-0 mt-0.5" aria-hidden="true" />
                <p>
                  <span className="font-semibold text-foreground">{item.title}</span>
                  <span className="body-text"> — {item.detail}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
