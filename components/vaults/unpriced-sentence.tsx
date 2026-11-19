// Which of the held vaults the chain's oracle declined, by asset — stated from
// the census header, never from a page of rows, with the count of positions
// that therefore carry no USD figure. Silent when every held vault is priced
// and when the census did not answer; says so when the census has not run its
// price pass at all.
//
// ONE COPY FOR BOTH CHAINS. It stood twice, once in each listing's intro
// drawer, and the two copies were the same sentence about the same census
// header shape. It now lives here and is read by both sections' about pages —
// the one place the sentence is drawn since the drawers became pages.

import { vaultIsUnpricedByOracle, type VaultCensusRow } from "@/lib/aave-vaults/vault-position";

const n = (v: number) => v.toLocaleString("en-US");

/** Whether UnpricedSentence draws anything for these rows, so a page that sets
 *  it in a list item can leave the item out with it. */
export function hasUnpricedSentence(census: readonly VaultCensusRow[]): boolean {
  if (census.length === 0) return false;
  const held = census.filter((c) => c.participants > 0);
  if (!held.some((c) => c.pricedBlock != null)) return true;
  return held.some((c) => vaultIsUnpricedByOracle(c));
}

export function UnpricedSentence({ census }: { census: readonly VaultCensusRow[] }) {
  // A census that did not answer leaves the line out, as every paragraph that
  // rests on the census does.
  if (census.length === 0) return null;
  const held = census.filter((c) => c.participants > 0);
  const priced = held.filter((c) => c.pricedBlock != null);
  if (priced.length === 0) {
    return (
      <span data-intro-unpriced data-unpriced-vaults="0" data-unpriced-assets="">
        The census has not yet priced any vault on this chain, so every card says not priced.
      </span>
    );
  }
  const declined = held.filter((c) => vaultIsUnpricedByOracle(c));
  if (declined.length === 0) return null;
  const assets = Array.from(new Set(declined.map((c) => c.assetSymbol ?? c.asset ?? "an asset without a symbol")));
  const positions = declined.reduce((s, c) => s + c.liveCount, 0);
  return (
    <span data-intro-unpriced data-unpriced-vaults={declined.length} data-unpriced-assets={assets.join(",")}>
      The oracle does not price {assets.length === 1 ? "the asset of" : "the assets of"} {n(declined.length)} held
      vaults ({assets.join(", ")}). Their {n(positions)} open positions carry no USD figure. An oracle answer of zero
      counts as a decline.
    </span>
  );
}
