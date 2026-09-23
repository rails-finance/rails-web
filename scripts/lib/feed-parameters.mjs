// Published update parameters for push oracles, for the PriceFeed verifiers.
// ----------------------------------------------------------------------------
// Chainlink and RedStone keep a feed's heartbeat and deviation off-chain, so a
// grade's `heartbeatS` / `deviationPct` are checked against each provider's
// published list: Chainlink's reference data directory (what data.chain.link
// renders) and RedStone's relayer manifest in redstone-oracles-monorepo. Both
// are HTTP fetches, not RPC. A failed fetch returns null and the caller WARNs.

/** proxy address (lowercase) → { name, heartbeatS, deviationPct } */
export async function chainlinkDirectory(network = "mainnet") {
  try {
    const res = await fetch(`https://reference-data-directory.vercel.app/feeds-${network}.json`);
    if (!res.ok) return null;
    const feeds = await res.json();
    return new Map(
      feeds
        .filter((f) => f.proxyAddress)
        .map((f) => [
          f.proxyAddress.toLowerCase(),
          { name: f.name, heartbeatS: Number(f.heartbeat), deviationPct: Number(f.threshold) },
        ]),
    );
  } catch {
    return null;
  }
}

/** price feed address (lowercase) → { feedId, heartbeatS, deviationPct } */
export async function redstoneManifest(manifest = "ethereumMultiFeed") {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/redstone-finance/redstone-oracles-monorepo/main/packages/relayer-remote-config/main/relayer-manifests-multi-feed/${manifest}.json`,
    );
    if (!res.ok) return null;
    const m = await res.json();
    const base = m.updateTriggers ?? {};
    return new Map(
      Object.entries(m.priceFeeds ?? {})
        .filter(([, f]) => f.priceFeedAddress)
        .map(([feedId, f]) => {
          const t = { ...base, ...(f.updateTriggersOverrides ?? {}) };
          return [
            f.priceFeedAddress.toLowerCase(),
            { feedId, heartbeatS: t.timeSinceLastUpdateInMilliseconds / 1000, deviationPct: t.deviationPercentage },
          ];
        }),
    );
  } catch {
    return null;
  }
}
