// How the IPOR Fusion factsheet states a fee and names a role. No `@/`
// imports: scripts/test/ipor-fusion-words.test.mjs reads it.

import { IPOR_ROLES } from "./addresses";

/** Basis points as a percentage: 500 → "5%", 30 → "0.3%". */
export const bpsText = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** A role's name on the page: Rails's word where it has one (owner, curator,
 *  Atomist), else IPOR's constant, flagged so the page sets it as code. */
export function roleName(roleId: string): { text: string; constant: boolean } {
  const r = IPOR_ROLES[roleId];
  if (!r) return { text: `role ${roleId}`, constant: true };
  return r.word ? { text: r.word, constant: false } : { text: r.constant, constant: true };
}
