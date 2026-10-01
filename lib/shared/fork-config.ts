// Dormant registry: protocol ids that the Liquity V2 trove helper
// (`trove-economics`) should also treat as Liquity-style troves. Empty on
// purpose.
//
// The forks we ship (Ebisu, Asymmetry) render through their own fork event
// cards + provenance factory, not this liquity-v2-specific helper, so
// nothing needs listing here today — the `|| FORK_ALL_IDS.has(p)` branch in
// that helper is a seam kept for the case where a fork should reuse the
// canonical liquity-v2 trove UI directly. Where the fuller fork roster
// (branches, addresses, stablecoins, decimals) now lives is an open question
// (rails-ops decision 0007); add ids here only if a fork joins that path.

export const FORK_ALL_IDS = new Set<string>();
