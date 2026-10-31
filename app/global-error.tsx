"use client";

// The root boundary: an error the root layout itself threw (rails-ops ui-jobs
// 461). It replaces the layout, so it draws its own html and body, in the
// root layout's ground and the (app) boundary's line.

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("root render failed:", error);
  }, [error]);
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground min-h-screen min-w-[320px] font-sans">
        <div className="py-20 text-center text-sm text-rb-500" data-page-error="" data-anatomy="H18">
          <p>
            This page could not be read.{" "}
            <button type="button" onClick={reset} className="text-rb-700 underline underline-offset-4 dark:text-rb-300">
              Retry
            </button>
          </p>
        </div>
      </body>
    </html>
  );
}
