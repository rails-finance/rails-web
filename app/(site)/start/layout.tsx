// The /start question stack (G1; rails-ops ui-jobs 478) lives here, under the
// "Start Here" heading (G7), so its levels stay mounted from one step to the
// next; the page draws the leaf.

import type { ReactNode } from "react";
import { StartStack } from "@/components/start/start-stack";

export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:pt-10 md:px-6">
      {/* The page heading (G7); the questions below are its sections. */}
      <div className="mb-10 max-w-2xl" data-anatomy="G7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Start Here</h1>
        <p className="mt-2 text-rb-500">
          If you are new to Rails and want to discover how our explorers can benefit you.
        </p>
      </div>
      <StartStack>{children}</StartStack>
    </div>
  );
}
