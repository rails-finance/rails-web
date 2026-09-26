// Which of the held vaults the chain's oracle declined, by asset — stated from
// the census header, never from a page of rows, with the count of positions
// that therefore carry no USD figure. Silent when every held vault is priced;
// says so when the census has not run its price pass at all.
//
// ONE COPY FOR BOTH CHAINS. It stood twice, once in each listing's intro
// drawer, and the two copies were the same sentence about the same census
// header shape. It now lives here and is read by both sections' about pages —
// the one place the sentence is drawn since the drawers became pages.

import { vaultIsUnpricedByOracle, type VaultCensusRow } from "@/lib/aave-vaults/vault-position";

const n = (v: number) => v.toLocaleString("en-US");

export function UnpricedSentence({ census }: { census: readonly VaultCensusRow[] }) {
  const held = census.filter((c) => c.participants > 0);
  const priced = held.filter((c) => c.pricedBlock != null);
  if (priced.length === 0) {
    return (
      <span data-intro-unpriced data-unpriced-vaults="0" data-unpriced-assets="">
        The census has not yet priced any vault on this chain, so every card states its value as not priced rather than
        as a figure.
      </span>
    );
  }
  const declined = held.filter((c) => vaultIsUnpricedByOracle(c));
  if (declined.length === 0) return null;
  const assets = Array.from(new Set(declined.map((c) => c.assetSymbol ?? c.asset ?? "an asset without a symbol")));
  const positions = declined.reduce((s, c) => s + c.liveCount, 0);
  return (
    <span data-intro-unpriced data-unpriced-vaults={declined.length} data-unpriced-assets={assets.join(",")}>
      That oracle does not price {assets.length === 1 ? "the asset of" : "the assets of"} {n(declined.length)} of the
      held vaults — {assets.join(", ")} — so their {n(positions)} open positions carry no USD figure and are stated as
      not priced, never guessed; a zero from the oracle is the oracle declining, not a reading of value.
    </span>
  );
}
