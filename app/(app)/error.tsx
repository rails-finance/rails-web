"use client";

// A read that threw past every loader's catch lands here instead of Next's
// default error page (rails-ops ui-jobs 461). The look is RouteNotFound's body
// (components/shared/route-not-found.tsx); Retry re-renders the segment.

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page render failed:", error);
  }, [error]);
  return (
    <div className="py-8">
      <div className="py-12 text-center text-sm text-rb-500" data-page-error="" data-anatomy="H18">
        <p>
          This page could not be read.{" "}
          <button type="button" onClick={reset} className="text-rb-700 underline underline-offset-4 dark:text-rb-300">
            Retry
          </button>
        </p>
      </div>
    </div>
  );
}
