// The /start question stack (G1; rails-ops ui-jobs 478) lives here so its
// levels stay mounted from one step to the next; the page draws the leaf.

import type { ReactNode } from "react";
import { SkipToSearch } from "@/components/start/start-chrome";
import { StartStack } from "@/components/start/start-stack";

export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-28 pb-16 md:px-6">
      <div className="mb-6 flex justify-end">
        <SkipToSearch />
      </div>
      <StartStack>{children}</StartStack>
    </div>
  );
}
