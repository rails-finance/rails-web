// The vault fronts page's loading state (ui-jobs 774, 782): the /vaults head
// alone. The rows are a hand-kept list, so the wait is short and draws no
// listing skeleton.

import { VaultIndexHead } from "@/components/vaults/vault-index-head";

export default function Loading() {
  return (
    <div className="min-h-screen py-8" aria-busy="true">
      <VaultIndexHead venue="fronts" />
    </div>
  );
}
