"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChainSwitcher } from "@/components/nav/chain-switcher";
import { HeaderThemeToggle } from "@/components/nav/header-theme-toggle";
import { BookmarksModal } from "@/components/nav/bookmarks-modal";

/** Marketing routes — everything under app/(site). Group names don't appear in
 *  the URL and the header sits above both group layouts, so the split has to be
 *  restated here by prefix. Keep in sync with app/(site)/. (The old top-level
 *  chain directories are gone — the per-chain coverage pages are the
 *  directory now, and /coverage's prefix already covers them.) */
const SITE_PREFIXES = ["/about", "/blog", "/coverage", "/privacy", "/pulse", "/terms"];

function isSiteRoute(pathname: string | null) {
  if (!pathname) return false;
  return SITE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Always-on Rails wordmark on the left. Rails is the platform; the active
 *  rail's identity lives on the page itself (`ProtocolIdentity` above the
 *  detail back row, the mark in the listing h1), not in the chrome. No
 *  "Explorer" sublabel — there isn't a single explorer, there are mono-rails. */
function RailsLogo() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-1.5 text-foreground hover:text-blue-500 transition-colors shrink-0"
    >
      <svg width={30} height={30} viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <path
          fill="currentColor"
          style={{ opacity: 0.85 }}
          d="M 79.763 159.671 L 111.637 159.671 L 52.168 41.625 L 20.295 41.625 L 79.763 159.671 Z"
        />
        <path
          fill="currentColor"
          style={{ opacity: 0.85 }}
          d="M 98.578 97.056 L 130.451 97.056 L 105.044 47.853 L 73.171 47.853 L 98.578 97.056 Z"
        />
        <path
          fill="currentColor"
          d="M 148.892 142.388 L 180.766 142.388 L 155.359 93.185 L 123.486 93.185 L 148.892 142.388 Z"
        />
      </svg>
      <span className="text-base tracking-wide font-semibold">Rails</span>
    </Link>
  );
}

/** Release-stage pill right of the wordmark, on every page — the site is in
 *  beta, and the chrome says so once, site-wide, instead of a per-rail label.
 *  Caution-500 is the house "not settled yet" signal (the anatomy the old
 *  per-rail BETA pill used). */
function BetaPill() {
  return (
    <span className="ml-2 rounded bg-caution-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
      Beta
    </span>
  );
}

/** Bookmark icon that opens the central bookmarks modal — the one surface that
 *  collects the per-protocol bookmark lists in one place. */
function BookmarksButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-lg p-2.5 text-rb-700 transition-colors duration-150 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-rb-300"
      aria-label="Bookmarks"
      title="Bookmarks"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}

export function HeaderBar() {
  const pathname = usePathname();
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Home alone paints its own top-section gradient from the very top of the
  // viewport, so there the header floats over it (absolute, no reserved band)
  // instead of stacking above it — otherwise the body background shows through
  // the header strip and breaks the gradient. HomeHero's top padding reserves
  // the room. So `isHome` owns POSITIONING.
  //
  // Chrome — the "Open an explorer" CTA in place of the hamburger, and no
  // bookmarks icon — is marketing chrome, and it belongs to every app/(site)
  // page, not home alone: bookmarks are an app-side affordance and marketing
  // pages have nothing to bookmark. So `isMarketing` owns CHROME.
  const isHome = pathname === "/";
  const isMarketing = isHome || isSiteRoute(pathname);

  return (
    <header className={isHome ? "absolute inset-x-0 top-0 z-40" : "relative z-40 mb-2"}>
      <div className="max-w-7xl mx-auto py-4 px-4 md:px-6 flex items-center">
        <RailsLogo />
        <BetaPill />
        {/* Right-hand control cluster. `ml-auto` pushes it hard right — it used
            to yield (`md:ml-0`) to the inline site-links nav that sat here, but
            that nav is retired, so the cluster owns the push outright. The
            switcher trails it, rightmost: on app routes a chain trigger
            ("Ethereum ▾" — the chain, never the protocol; identity lives on
            the page), on marketing routes the "Open an explorer" pill. Both
            open the same roster panel. Bookmarks and the theme toggle lead —
            the switcher opens a panel, so it anchors the cluster's outer edge
            rather than sitting in the middle of it. The hamburger is retired
            with it — the site's own pages and socials live in the footers
            (SiteFooter on marketing routes, AppFooter's quiet Coverage link
            on app routes). */}
        <div className="ml-auto flex items-center gap-1">
          {!isMarketing && <BookmarksButton onClick={() => setShowBookmarks(true)} />}
          <HeaderThemeToggle />
          <ChainSwitcher variant={isMarketing ? "cta" : "chain"} />
        </div>
      </div>
      {showBookmarks && <BookmarksModal onClose={() => setShowBookmarks(false)} />}
    </header>
  );
}
