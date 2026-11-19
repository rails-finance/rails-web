// How "Where the assets are" states a market's substrates in words (rails-ops
// TO-DO-ipor-scoping §6.3 phase B). No `@/` imports: the markets test reads it.

import type { Substrate } from "./markets";

export interface MarketNames {
  names: Record<string, { symbol: string; named: boolean }>;
  childAssets: Record<string, string>;
  registries: Record<string, string>;
  morpho: Record<string, { loanToken: string; collateralToken: string; lltv: string } | null>;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A token or contract by the name its `symbol()` answers, else its short address. */
export const nameOf = (n: MarketNames, address: string) => {
  const m = n.names[address.toLowerCase()];
  return m?.named ? m.symbol : short(address);
};

/** An LLTV in WAD as a percentage: "86%", "94.5%". */
export const lltvText = (wad: string) =>
  `${(Number(BigInt(wad) / BigInt(1e12)) / 1e4).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** One substrate in words. */
export function substrateWords(s: Substrate, n: MarketNames): string {
  switch (s.kind) {
    case "address": {
      const coll = n.registries[s.address];
      if (coll) return `${nameOf(n, coll)} branch`;
      return nameOf(n, s.address);
    }
    case "morpho-market": {
      const m = n.morpho[s.id];
      if (!m) return `${short(s.id)}, not in Rails' catalog`;
      const pair =
        m.collateralToken === ZERO
          ? nameOf(n, m.loanToken)
          : `${nameOf(n, m.collateralToken)} / ${nameOf(n, m.loanToken)}`;
      return `${pair} ${lltvText(m.lltv)}`;
    }
    case "aave-v4-reserve": {
      const flags = [s.isCollateral && "collateral", s.canBorrow && "borrow"].filter(Boolean).join(", ");
      return `reserve ${s.reserveId} on spoke ${short(s.spoke)}${flags ? ` (${flags})` : ""}`;
    }
    case "euler-vault": {
      const flags = [s.isCollateral && "collateral", s.canBorrow && "borrow"].filter(Boolean).join(", ");
      return `${nameOf(n, s.vault)}${flags ? ` (${flags})` : ""}`;
    }
    case "euler-pool":
      return `EulerSwap pool ${nameOf(n, s.pool)}`;
    case "pool-id":
      return `pool ${short(s.id)}`;
    case "typed": {
      const coll = n.registries[s.address];
      return coll ? `${nameOf(n, coll)} branch (${s.type})` : `${s.type} ${nameOf(n, s.address)}`;
    }
    case "target":
      return `${nameOf(n, s.address)} ${s.selector}`;
    case "setting":
      return `${s.type} ${s.value}`;
    case "executor":
      return `executor ${nameOf(n, s.address)}`;
    case "remote-vault":
      return `vault ${short(s.address)} on chain ${s.chainId}`;
    case "raw":
      return short(s.hex);
  }
}

/** A market's substrates as one line: the first `max`, then "+N more". */
export function substratesLine(subs: readonly Substrate[], n: MarketNames, max = 4): string {
  const words = subs.map((s) => substrateWords(s, n));
  return words.length > max ? `${words.slice(0, max).join(", ")} +${words.length - max} more` : words.join(", ");
}
