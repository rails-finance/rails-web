// The vault roster a page should draw: the box's, when the web would take it,
// else the baked one. For the vault verifiers.
// ----------------------------------------------------------------------------
// The Base MetaMorpho and Yearn V3 pages serve the roster rails-server writes
// (GET /api/vaults/roster, mig 283) over the catalogue this repo bakes, and fall
// back to the baked one when the served roster is unreadable or does not contain
// it (lib/morpho-base/vault-roster.ts, lib/yearn/vault-roster.ts). A verifier
// that compared a page against the baked parse alone would go red the morning
// the box finds a vault the bake lacks, which is the drift the served roster
// exists to remove. So a verifier asks the box here, applies the web's own
// acceptance rule, and states which roster it is judging.
//
// The box is not the page under test: it is a separate system whose answer the
// page is expected to carry. Whether the box's roster is itself the chain's is
// scripts/verify/verify-vault-roster.mjs, which sweeps the creation logs.
//
// Reads RAILS_API_URL and API_BEARER_TOKEN from the env object it is handed
// (the caller's .env.local); never prints either.

/** The stored roster for (chain, family), or null with the reason. */
export async function fetchServedRoster(env, chainId, family) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN)
    return { roster: null, why: "RAILS_API_URL or API_BEARER_TOKEN missing" };
  try {
    const res = await fetch(`${env.RAILS_API_URL}/api/vaults/roster?chain=${chainId}&family=${family}`, {
      headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { roster: null, why: `GET /api/vaults/roster answered ${res.status}` };
    return { roster: await res.json(), why: null };
  } catch (e) {
    return { roster: null, why: `GET /api/vaults/roster failed (${e.name})` };
  }
}

/**
 * The roster the page should draw, by the web's rule: the served one when its
 * block is at or after `bakedBlock` and it holds every baked row with the same
 * immutables (`same(served, baked)` decides which fields), else the baked rows.
 * Returns { source, block, blockTime, rows, factories, served, why } where
 * `rows` are the served roster's own row objects or the caller's baked rows.
 */
export async function expectedRoster(env, { chainId, family, bakedRows, bakedBlock, same }) {
  const { roster, why } = await fetchServedRoster(env, chainId, family);
  const baked = (reason) => ({
    source: "baked",
    block: bakedBlock,
    blockTime: null,
    rows: bakedRows,
    factories: null,
    served: roster,
    why: reason,
  });
  if (!roster) return baked(why);
  if (roster.rosterBlock < bakedBlock)
    return baked(`served block ${roster.rosterBlock} is older than the baked ${bakedBlock}`);
  const byAddress = new Map(roster.vaults.map((v) => [v.address, v]));
  for (const b of bakedRows) {
    const s = byAddress.get(b.address);
    if (!s) return baked(`served roster lacks baked ${b.address}`);
    if (!same(s, b)) return baked(`served roster disagrees with baked ${b.address}`);
  }
  return {
    source: "served",
    block: roster.rosterBlock,
    blockTime: roster.rosterBlockTime,
    rows: roster.vaults,
    factories: roster.factories,
    served: roster,
    why: null,
  };
}
