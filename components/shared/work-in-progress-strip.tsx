"use client";

// The strip an UNLAUNCHED surface carries.
// ----------------------------------------------------------------------------
// An explorer flagged `unlaunched` on the roster (lib/shared/protocols.ts)
// serves at its URL, is linked from nowhere and is out of the sitemap and out
// of search. A reader gets here by typing the address, so the page owes them
// the one thing the nav would otherwise have told them: this is not finished
// yet, and here is where the launch will be announced.
//
// MOUNTED ONCE, in the root layout, under the header. It reads the pathname
// and asks the roster whether that route is unlaunched, so it cannot miss a
// route the way a per-page banner can — and a route added under an unlaunched
// explorer tomorrow carries it without an edit. On every launched route it
// renders nothing at all, which is every route but these.
//
// It names its SUBJECT — "Aave V3 on Base", "Base coverage" — because a reader
// who typed one URL is looking at one surface, and "this page" would make them
// guess how wide the statement runs.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { explorerName, isLaunchedChain, protocolForPathname } from "@/lib/shared/protocols";
import { RAILS_X_AT, RAILS_X_URL } from "@/lib/shared/social";

/** The chain a `/coverage/<slug>` route is about, or undefined off those
 *  routes. The coverage pages are the one unlaunched surface that is not
 *  inside an explorer — a chain's front door goes dark with the last explorer
 *  on it (`isLaunchedChain`). */
function coverageChain(pathname: string | null): ChainId | undefined {
  const slug = pathname?.startsWith("/coverage/") ? pathname.slice("/coverage/".length) : undefined;
  return slug ? (Object.values(CHAINS).find((c) => c.slug === slug)?.id ?? undefined) : undefined;
}

/** What this route's strip is about, or undefined when the route is launched
 *  and there is no strip to draw. */
function unlaunchedSubject(pathname: string | null): string | undefined {
  const entry = protocolForPathname(pathname);
  if (entry) return entry.unlaunched ? explorerName(entry) : undefined;
  const chainId = coverageChain(pathname);
  if (chainId !== undefined && !isLaunchedChain(chainId)) return `${CHAINS[chainId].name} coverage`;
  return undefined;
}

export function WorkInProgressStrip() {
  const subject = unlaunchedSubject(usePathname());
  if (!subject) return null;

  return (
    <div data-work-in-progress className="notice-caution">
      <p className="mx-auto max-w-7xl px-4 py-2.5 text-sm text-foreground md:px-6">
        <span className="font-semibold">{subject} is a work in progress.</span>{" "}
        <span className="text-rb-500">
          Follow{" "}
          <Link
            href={RAILS_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-500 hover:underline"
          >
            {RAILS_X_AT}
          </Link>{" "}
          for the launch.
        </span>
      </p>
    </div>
  );
}
