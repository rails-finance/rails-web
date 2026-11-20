// The vault fronts page's loading state (ui-jobs 774): the /vaults head and the
// heading (ui-jobs 776). The
// rows are a hand-kept list, so the wait is short and draws no listing skeleton.

import { VaultIndexHead } from "@/components/vaults/vault-index-head";
import { FRONTS_TITLE } from "@/lib/vaults/fronts-words";

export default function Loading() {
  return (
    <div className="min-h-screen py-8" aria-busy="true">
      <VaultIndexHead venue="fronts" />
      <h1 className="mt-4 text-lg font-semibold text-foreground">{FRONTS_TITLE}</h1>
    </div>
  );
}
