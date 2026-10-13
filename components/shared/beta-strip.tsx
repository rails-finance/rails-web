"use client";

// The strip every launched page carries while Rails is in beta.
// ----------------------------------------------------------------------------
// One line above the header, site-wide: the product changes often and the
// reader is invited to say what they see. "Send feedback" opens the same
// FeedbackModal the footers' FeedbackCluster does (→ /api/feedback).
//
// MOUNTED ONCE, in the root layout, above the header (WorkInProgressStrip sits
// below it). An unlaunched route already carries that strip, so this one
// renders nothing there — a reader sees one strip at a time, and the louder
// one wins.
//
// DISMISSIBLE, and the dismissal is remembered per browser in localStorage.
// The stored state is read after mount and the strip draws nothing until it
// has been, so a reader who dismissed it never sees it flash in on load. With
// storage unavailable the strip shows and the close still hides it for the
// session.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";

import { FeedbackModal } from "@/components/shared/feedback-modal";
import { unlaunchedSubject } from "@/components/shared/work-in-progress-strip";

const STORAGE_KEY = "rails-beta-strip-dismissed";

/** The explorers live under app/(app) at /ethereum, /base and /sepolia, which
 *  is where BrandRail is mounted. Everything else is marketing. */
function isExplorerRoute(pathname: string | null): boolean {
  return /^\/(ethereum|base|sepolia)(\/|$)/.test(pathname ?? "");
}

export function BetaStrip() {
  const pathname = usePathname();
  // null until the stored state has been read on the client.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Storage blocked: show the strip.
    }
    setDismissed(stored);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage blocked: hidden for this session only.
    }
  };

  if (dismissed !== false || unlaunchedSubject(pathname)) return null;

  return (
    // Spans the viewport, so on an explorer it reserves the rail's 56px the
    // way WorkInProgressStrip does. bg-sunken is the dark recessed tone
    // (--surface-sunken); no rule under it, and no caution colour: this is
    // information.
    <div data-anatomy="H14" className={`bg-sunken${isExplorerRoute(pathname) ? " md:pl-14" : ""}`}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm leading-5 text-foreground md:px-6">
        <p className="min-w-0 flex-1 leading-5">
          <span className="font-semibold">Rails is in beta and changing often.</span>{" "}
          <span className="text-rb-500">We&rsquo;d love to hear from you</span>
          <span className="text-rb-500"> &mdash; </span>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="cursor-pointer font-medium text-teal-600 hover:underline dark:text-teal-500"
          >
            <MessageSquarePlus className="mr-1 inline-block h-3.5 w-3.5 align-middle" aria-hidden="true" />
            Send feedback
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
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
