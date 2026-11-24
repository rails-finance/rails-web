// The protocol docs each vault family's info page cites (rails-ops ui-jobs
// 773): the info page and /vaults/products link the same page from here.
// Aave's are its first-party sources (lib/aave-vaults/first-party-sources.ts).
//
// Pure strings, no imports, so client and server code both read them.

/** Morpho's Vaults V1 roles: the MetaMorpho info page and the vault card's modal. */
export const MORPHO_VAULT_V1_ROLES_DOCS = "https://docs.morpho.org/curate/concepts/roles/#morpho-vaults-v1-roles";

/** Yearn's introduction: the Yearn V3 info page. */
export const YEARN_DOCS = "https://docs.yearn.fi/getting-started/intro";

/** Maple's lender introduction: the Maple info page's docs link. */
export const MAPLE_LENDER_DOCS = {
  label: "Maple documentation",
  href: "https://docs.maple.finance/maple-institutional-for-lenders/introduction",
};

/** IPOR's fuse page: the IPOR Fusion info page, roster and vault page. */
export const IPOR_FUSION_DOCS = {
  title: "IPOR's documentation",
  subtitle: "ipor.io/docs: What is a fuse",
  href: "https://ipor.io/docs/build-on-fusion/architecture-overview/what-is-a-fuse",
};
