// The block a page read at, held against the head it read it from.
// ----------------------------------------------------------------------------
// A vault page reads the chain's head through rails-server first
// (lib/sources/api/head-reads-client.ts): rails-server names one head block a
// chain per 30 s and the page reads at that block. Under the counting proxy the
// script's own client reads the run's pin, which can be hours older, so a page
// that read through rails-server is held against rails-server's head; a page
// that fell back to the chain read through the proxy and is held against the
// pin. Either way the check's intent stands: the page is recent and states the
// block it read.

/** rails-server's head block for the chain, the one the page's reads were pinned to; null when it does not answer. */
export async function serverHeadBlock(env, chainId) {
  if (!env.RAILS_API_URL) return null;
  try {
    const res = await fetch(`${env.RAILS_API_URL}/api/at-block/head/block?chain=${chainId}`, {
      headers: env.API_BEARER_TOKEN ? { Authorization: `Bearer ${env.API_BEARER_TOKEN}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const b = Number((await res.json())?.blockNumber);
    return Number.isSafeInteger(b) && b > 0 ? b : null;
  } catch {
    return null;
  }
}

/**
 * Whether a page's block is recent: at or below rails-server's head and within
 * `tolerance` blocks of it, or within `tolerance` of the script's own head (a
 * chain read through the proxy's pin). `stamped` true (the answer carries
 * rails-server's read stamp) holds it to rails-server's head alone.
 */
export function pageBlockRecent({ page, server, own, tolerance, stamped = false }) {
  if (!Number.isSafeInteger(page) || page <= 0) return { ok: false, detail: `page block ${page}` };
  const viaServer = server != null && page <= server && server - page <= tolerance;
  const viaChain = !stamped && own != null && Math.abs(own - page) <= tolerance;
  const against = viaServer
    ? `rails-server's head ${server} (${server - page} blocks)`
    : viaChain
      ? `the run's pin ${own} (${Math.abs(own - page)} blocks, a chain read)`
      : `rails-server's head ${server ?? "unanswered"}, the run's pin ${own}${stamped ? " (stamped by rails-server)" : ""}`;
  return { ok: viaServer || viaChain, detail: `page ${page} against ${against}` };
}
