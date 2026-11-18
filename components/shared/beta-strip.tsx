"use client";

// The strip the app pages carry while Rails is in beta.
// ----------------------------------------------------------------------------
// One line above the header on the explorer routes only (none on marketing): the product changes often and the
// reader is invited to say what they see. "Tell us what you think." opens the same
// FeedbackModal the footers' FeedbackCluster does (→ /api/feedback).
//
// MOUNTED ONCE, in the root layout, above the header (WorkInProgressStrip sits
// below it), and gated by path so that the header's mobile bar stays under it. An unlaunched route already carries that strip, so this one
// renders nothing there — a reader sees one strip at a time, and the louder
// one wins.
//
// DISMISSIBLE, and the dismissal is remembered per browser in a cookie
// (`rails-beta-strip-dismissed=1`). The server renders the strip on every
// explorer route; a script in the root layout's head reads the cookie before
// first paint and marks <html data-beta-dismissed>, which hides it
// (app/globals.css), so the strip neither flashes in for a reader who
// dismissed it nor pushes the page down after hydration for one who has not.
// The layout stays static: reading the cookie with `cookies()` there would
// make every route dynamic. The same script moves the older localStorage flag
// into the cookie once.

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";

import { FeedbackModal } from "@/components/shared/feedback-modal";
import { unlaunchedSubject } from "@/components/shared/work-in-progress-strip";

import { BETA_STRIP_COOKIE as COOKIE } from "@/lib/shared/beta-strip-script";

/** The explorers live under app/(app) at /ethereum, /base and /sepolia, which
 *  is where BrandRail is mounted. Everything else is marketing, and gets no strip. */
function isExplorerRoute(pathname: string | null): boolean {
  return /^\/(ethereum|base|sepolia)(\/|$)/.test(pathname ?? "");
}

export function BetaStrip() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const dismiss = () => {
    setDismissed(true);
    document.documentElement.dataset.betaDismissed = "1";
    document.cookie = `${COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
  };

  if (dismissed || !isExplorerRoute(pathname) || unlaunchedSubject(pathname)) return null;

  return (
    // Spans the viewport, so on an explorer it reserves the rail's 56px the
    // way WorkInProgressStrip does. bg-sunken is the dark recessed tone
    // (--surface-sunken); no rule under it, and no caution colour: this is
    // information.
    <div data-anatomy="H14" data-beta-strip="" className="bg-sunken md:pl-14">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm leading-5 text-foreground md:px-6">
        <p className="flex min-w-0 flex-1 items-center justify-between gap-3 leading-5">
          <span className="font-semibold">Rails is in beta.</span>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="shrink-0 cursor-pointer text-right font-medium text-teal-600 hover:underline dark:text-teal-500"
          >
            <MessageSquarePlus className="mr-1 inline-block h-3.5 w-3.5 align-middle" aria-hidden="true" />
            Tell us what you think.
          </button>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-my-2 -mr-2 shrink-0 cursor-pointer rounded p-1.5 text-rb-500 hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {feedbackOpen && <FeedbackModal initialType="general" onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
