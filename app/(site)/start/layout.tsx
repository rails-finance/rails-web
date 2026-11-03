// The /start question stack (G1; rails-ops ui-jobs 478) lives here, under the
// "Rails Pathfinder" heading (G7), so its levels stay mounted from one step to
// the next; the page draws the leaf.

import type { ReactNode } from "react";
import { SkipToSearch } from "@/components/start/start-chrome";
import { StartStack } from "@/components/start/start-stack";

export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:pt-10 md:px-6">
      {/* The page heading (G7) level with "Skip, just search"; the questions
          below are its sections. */}
      <div className="mb-10 flex flex-wrap items-start justify-between gap-x-6 gap-y-3" data-anatomy="G7">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Rails Pathfinder</h1>
          <p className="mt-2 text-rb-500">
            Start here if you are new to Rails and want to discover how our explorers can benefit you.
          </p>
        </div>
        <div className="pt-1.5">
          <SkipToSearch />
        </div>
      </div>
      <StartStack>{children}</StartStack>
    </div>
  );
}
