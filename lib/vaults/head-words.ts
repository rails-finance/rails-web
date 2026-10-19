// A vault holder row's timeline head as words (rails-ops decision 0045,
// TO-DO-ui-jobs 367): the Aave vaults, Yearn and Morpho Base, which share the
// row (components/vaults/vault-timeline-row.tsx). The kind is a past
// participle; a transfer's counterparty is its clause. The figures are on the
// spine's flank, the Figures sheet and the Explanation.

import type { VaultHolderEvent } from "@/lib/shared/vault-holder-timeline";

export const VAULT_HEAD_WORDS = {
  sep: "·",
  deposited: "Deposited",
  withdrew: "Withdrew",
  transferred: "Transferred",
  noChange: "No change",
  cooldownStarted: "Cooldown started",
  /** A transfer's spine leg, for the spoken label. */
  legSent: "Sent",
  legReceived: "Received",
} as const;

export function vaultT1Kind(kind: VaultHolderEvent["kind"]): string {
  const W = VAULT_HEAD_WORDS;
  switch (kind) {
    case "deposit":
      return W.deposited;
    case "withdrawal":
      return W.withdrew;
    case "transfer-in":
    case "transfer-out":
      return W.transferred;
    case "transfer-self":
      return W.noChange;
    case "cooldown":
      return W.cooldownStarted;
  }
}
