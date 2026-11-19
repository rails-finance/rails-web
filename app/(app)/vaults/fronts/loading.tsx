// The vault fronts page's loading state (ui-jobs 774): the heading alone. The
// rows are a hand-kept list, so the wait is short and draws no listing skeleton.

import { FRONTS_TITLE } from "@/lib/vaults/fronts-words";

export default function Loading() {
  return (
    <div className="min-h-screen py-8" aria-busy="true">
      <h1 className="text-2xl font-semibold text-foreground">{FRONTS_TITLE}</h1>
    </div>
  );
}
