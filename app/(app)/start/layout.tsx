// The /start question stack (G1; rails-ops ui-jobs 478) lives here, under the
// "Start here" heading (G7), so its levels stay mounted from one step to the
// next; the page draws the leaf. It stands in the app shell (the brand rail,
// the profile corner, the app footer; ui-jobs 496), as every page it leads to
// does.

import type { ReactNode } from "react";
import { StartStack } from "@/components/start/start-stack";
import { PROFILE_CLEARANCE } from "@/lib/shared/ui-grammar";

export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    // The app pages' py-8: the heading's 38px line is the column's first row,
    // centred on the rail's glyph and the profile control (H20) from md.
    <div className="mx-auto max-w-5xl pt-8 pb-16">
      {/* The page heading (G7); the questions below are its sections. */}
      <div className={`mb-10 max-w-2xl ${PROFILE_CLEARANCE}`} data-anatomy="G7">
        <h1 className="flex min-h-[38px] items-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Start here
        </h1>
        <p className="mt-2 text-rb-500">Start here to discover how Rails explorers can benefit you.</p>
      </div>
      <StartStack>{children}</StartStack>
    </div>
  );
}
