// The vault families' leads (lib/vaults/family-leads.ts; ui-jobs 776, 782):
// MetaMorpho's info page states one chain, its /vaults card every chain it holds.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { metaMorphoLead, metaMorphoLeadOn, vaultFamilyLead } from "../../lib/vaults/family-leads.ts";

test("one chain reads as the info page's sentence", () => {
  assert.equal(metaMorphoLeadOn([8453]), metaMorphoLead(8453));
  assert.match(metaMorphoLead(8453), /^The MetaMorpho roster lists every vault .+ made on Base, /);
});

test("the family card names every chain, in order", () => {
  assert.match(metaMorphoLeadOn([8453, 1]), /^The MetaMorpho rosters list every vault .+ made on Base and Ethereum, /);
  assert.match(metaMorphoLeadOn([8453, 1, 42161]), / made on Base, Ethereum and Arbitrum, /);
});

test("a single-chain family's lead is its page's, whatever chains are given", () => {
  assert.equal(vaultFamilyLead("aave", [1]), vaultFamilyLead("aave", [1, 8453]));
  assert.equal(vaultFamilyLead("morpho", [1]), metaMorphoLead(1));
});
