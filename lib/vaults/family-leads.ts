// Each vault family's lead (rails-ops ui-jobs 776): the first sentence of its
// vaults info page, which the /vaults overview's card for that family
// repeats (over all its chains, ui-jobs 782). One source: the info pages render their first sentence from
// here, so the card cannot drift from the page. Maple's comes from its info
// page's Pools page section; sBOLD has no info page, so its lead heads the
// vault's page.
//
// Pure strings, no imports, so client and server code both read them.

export type FamilyLeadProtocol = "morpho" | "aave" | "yearn" | "maple" | "sbold" | "ipor-fusion";

const CHAIN: Record<number, string> = { 1: "Ethereum", 8453: "Base", 42161: "Arbitrum" };

/** The MetaMorpho roster's lead on Ethereum or Base. */
export const metaMorphoLead = (chainId: number) => metaMorphoLeadOn([chainId]);

/** The lead over several chains' rosters, as the /vaults family card states
 *  it (ui-jobs 782): "… made on Base and Ethereum, …". */
export const metaMorphoLeadOn = (chainIds: readonly number[]) => {
  const names = chainIds.map((c) => CHAIN[c] ?? String(c));
  const on = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  // Each chain has its own pair of factories, so the form over several chains
  // names no number.
  return names.length > 1
    ? `The MetaMorpho rosters list every vault the MetaMorpho factories made on ${on}, with each vault’s totals and share price.`
    : `The MetaMorpho roster lists every vault the two MetaMorpho factories made on ${on}, with each vault’s totals and share price.`;
};

export const AAVE_VAULTS_LEAD =
  "The Aave vault roster lists every ERC-4626 vault Aave publishes on Ethereum, with each vault’s totals and share price.";

export const YEARN_VAULTS_LEAD =
  "The Yearn V3 roster lists every vault the V3 factories deployed on Ethereum, endorsed or not, with each vault’s totals and share price.";

export const MAPLE_POOLS_LEAD =
  "The pools page shows each pool's cash available to pay exits, its fixed-term and open-term loans, and its exit rate.";

export const SBOLD_LEAD =
  "sBOLD is one ERC-4626 vault over BOLD that deposits it into Liquity V2’s three Stability Pools.";

/** The IPOR Fusion roster's lead: what its vault is. */
export const IPOR_FUSION_LEAD =
  "An IPOR Fusion vault takes deposits of one token and issues shares for them. Its curator moves the token into other protocols through fuses, small contracts that each act in one protocol.";

/** A family's lead; MetaMorpho's names the chains given. */
export function vaultFamilyLead(p: FamilyLeadProtocol, chainIds: readonly number[]): string {
  switch (p) {
    case "morpho":
      return metaMorphoLeadOn(chainIds);
    case "aave":
      return AAVE_VAULTS_LEAD;
    case "yearn":
      return YEARN_VAULTS_LEAD;
    case "maple":
      return MAPLE_POOLS_LEAD;
    case "sbold":
      return SBOLD_LEAD;
    case "ipor-fusion":
      return IPOR_FUSION_LEAD;
  }
}
