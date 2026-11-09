// ui-jobs 554, step 1: the mock's parts, styled after the readout section
// (components/vaults/vault-health.tsx). None is shared with the live pages.

import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import type { MockLine } from "@/lib/mock-554/read";

export const MUTED = "text-rb-500 dark:text-rb-400";
export const LINK = "text-[var(--text-link)] hover:underline";

/** A note on the mock: what is live and what is not. */
export function MockNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 rounded-lg border border-dashed border-rb-300 px-3 py-2 text-xs text-rb-500 dark:border-rb-600">
      <span className="font-semibold">Mock (ui-jobs 554).</span> {children}
    </div>
  );
}

/** One section with one line, as the readout draws its lines, and the
 *  receipt written out under it. */
export function MockSection({ title, line }: { title: string; line: MockLine }) {
  return (
    <section className="mb-6" data-mock-554={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <span className={MUTED} title="The section's ⋮: exports and Inspect provenance">
          <MoreVertical size={16} aria-hidden />
        </span>
      </div>
      <div className="mt-2 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <span className="text-xs font-semibold text-rb-500 sm:pt-0.5">{line.label}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{line.headline}</p>
            <p className="text-[13px] leading-snug text-foreground">{line.sentence}</p>
            {line.gap && <p className={`text-[13px] leading-snug ${MUTED}`}>{line.gap}</p>}
            <p className={`mt-2 text-[11px] leading-snug break-words ${MUTED}`}>Receipt: {line.receipt}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
