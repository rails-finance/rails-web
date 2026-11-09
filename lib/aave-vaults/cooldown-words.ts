// The cooldown, said in words — one sentence, in one place.
// ----------------------------------------------------------------------------
// An Umbrella stake token holds ONE cooldown record per address, and which of
// its four states the record is in is a comparison against the BLOCK's own
// timestamp rather than against the reader's clock (the loader makes that
// comparison; this file only says the answer). The end of a cooldown and the
// end of the window after it are stated as UTC instants, never as a countdown:
// a countdown would be a number that changes while nothing on chain has.
//
// It lived inside components/vaults/aave-ethereum-vault-view.tsx while the
// vault page's own paragraph was its only reader. The position card's context
// strip states the same fact now, so the sentence moved here and both surfaces
// import it — one wording, one place to change it.

import { utcInstant } from "@/components/vaults/aave-vault-format";
import type { AaveVaultHolderReading } from "@/lib/sources/chain/aave-ethereum-vault";

export type AaveVaultCooldown = NonNullable<AaveVaultHolderReading["cooldown"]>;

/** The cooldown state in a few words, for the holder card's Cooldown line. */
export function cooldownWords(cooldown: AaveVaultCooldown): string {
  switch (cooldown.state) {
    case "none":
      return "None";
    case "waiting":
      return `Ends ${utcInstant(cooldown.endOfCooldown)}`;
    case "open":
      return `Window open until ${utcInstant(cooldown.endOfCooldown + cooldown.withdrawalWindow)}`;
    case "expired":
      return "Window passed";
  }
}
