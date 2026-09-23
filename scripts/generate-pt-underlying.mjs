#!/usr/bin/env node
// Pendle PT → underlying asset map, read from the PT contracts themselves.
// ----------------------------------------------------------------------------
//   node scripts/generate-pt-underlying.mjs          # rewrite lib/shared/pt-underlying.ts
//   node scripts/generate-pt-underlying.mjs --dry    # report only
//
// Why this file exists. A Pendle principal token is a dated claim on another
// asset, and neither icon CDN hosts a mark for one: every PT address 404s on
// Trust Wallet and DeFiLlama alike. The chip therefore fell to its initial
// letter, and since every one of these symbols begins "PT-", every PT on every
// page drew the same anonymous "P" — 149 tokens carrying 9,359 Morpho
// positions, all wearing one glyph.
//
// The underlying DOES have a mark (126 of the 139 that resolve, at the time of
// writing). Getting to it needs the underlying's ADDRESS, which is what the
// CDNs key on, and the hand-kept table in token-addresses.ts cannot supply it:
// Morpho Blue is permissionless, its PT underlyings run to 74 distinct assets,
// and a symbol-string parse of "PT-<asset>-<maturity>" would be guessing at
// the identity rather than reading it. The contract is not guessing. Pendle's
// PT exposes SY(), and the SY exposes yieldToken() — the asset the claim is
// on, stated by the token itself.
//
// Two interfaces answer, because two protocols mint tokens under this naming.
// Pendle's PT goes PT -> SY() -> yieldToken(). Spectra's goes PT -> getIBT(),
// its interest-bearing token; Spectra also offers underlying(), which resolves
// one level deeper than the symbol claims (PT-wstUSR-… answers USR there, not
// wstUSR), so getIBT() is the one that matches what the PT is named after and
// the one Pendle's yieldToken() is the analogue of. Ten of the 149 are Spectra
// — they are the ones whose maturity is a unix timestamp or a slashed date
// rather than Pendle's 27MAR2025.
//
// Read once here, checked in, so the page costs no chain call. A PT listed
// after the last run draws its letter plus the badge until this is re-run,
// which is the same graceful ending it had before — re-run when new PT markets
// appear.
//
// Sources for the candidate universe, mirroring audit-token-icons.mjs:
//   Ethereum — every Morpho Blue market the index has seen (/api/morpho/market-roster)
//   Base     — scripts/token-icon-universe.base.json

import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { base, mainnet } from "viem/chains";

const DRY = process.argv.includes("--dry");
const ZERO = "0x0000000000000000000000000000000000000000";
const symbolAbi = parseAbi(["function symbol() view returns (string)"]);
const syAbi = parseAbi(["function SY() view returns (address)"]);
const yieldTokenAbi = parseAbi(["function yieldToken() view returns (address)"]);
const ibtAbi = parseAbi(["function getIBT() view returns (address)"]);

const RPC = { 1: process.env.ALCHEMY_URL, 8453: process.env.ALCHEMY_BASE_URL ?? process.env.BASE_RPC_URL };

/** Multicall in chunks — 600+ tokens overflows a single call's gas budget. */
async function multi(client, contracts) {
  const out = [];
  for (let i = 0; i < contracts.length; i += 120) {
    out.push(...(await client.multicall({ contracts: contracts.slice(i, i + 120), allowFailure: true })));
  }
  return out;
}
const value = (r) => (r.status === "success" ? r.result : null);

/** Every token address any Morpho Blue market on Ethereum names (loan or
 *  collateral). market_params is the raw tuple — loanToken, collateralToken,
 *  oracle, irm, lltv — so only the first two entries are assets. */
async function mainnetUniverse() {
  const url = process.env.RAILS_API_URL;
  const res = await fetch(`${url}/api/morpho/market-roster`, {
    headers: process.env.API_BEARER_TOKEN ? { Authorization: `Bearer ${process.env.API_BEARER_TOKEN}` } : {},
  });
  if (!res.ok) throw new Error(`market-roster ${res.status}`);
  const body = await res.json();
  const rows = Array.isArray(body) ? body : Object.values(body).find(Array.isArray);
  const set = new Set();
  for (const m of rows) {
    const addrs = [...String(m.market_params).matchAll(/Address\((0x[0-9a-fA-F]{40})\)/g)].map((x) =>
      x[1].toLowerCase(),
    );
    if (addrs[0]) set.add(addrs[0]);
    if (addrs[1]) set.add(addrs[1]);
  }
  return [...set];
}

function baseUniverse() {
  const rows = JSON.parse(readFileSync("scripts/token-icon-universe.base.json", "utf8"));
  return [...new Set(rows.filter((r) => r.chainId === 8453).map((r) => r.address.toLowerCase()))];
}

async function forChain(chainId, chain, universe) {
  const rpc = RPC[chainId];
  if (!rpc) {
    console.log(`chain ${chainId}: no RPC url in env — skipped`);
    return null;
  }
  const client = createPublicClient({ chain, transport: http(rpc) });
  const symbols = await multi(
    client,
    universe.map((address) => ({ address, abi: symbolAbi, functionName: "symbol" })),
  );
  const pts = universe.filter((_, i) => /^PT-/i.test(String(value(symbols[i]) ?? "")));
  if (pts.length === 0) {
    console.log(`chain ${chainId}: no PT tokens among ${universe.length} — nothing to map`);
    return new Map();
  }
  const sy = await multi(
    client,
    pts.map((address) => ({ address, abi: syAbi, functionName: "SY" })),
  );
  const yieldToken = await multi(
    client,
    sy.map((r) => ({ address: value(r) ?? ZERO, abi: yieldTokenAbi, functionName: "yieldToken" })),
  );
  const ibt = await multi(
    client,
    pts.map((address) => ({ address, abi: ibtAbi, functionName: "getIBT" })),
  );
  const underlying = pts
    .map((_, i) => value(yieldToken[i]) ?? value(ibt[i]))
    .map((a) => (a && a !== ZERO ? a.toLowerCase() : null));
  // Name the underlyings too: the badge's title says what the claim is ON, and
  // a symbol read from the chain beats one parsed out of the PT's own name.
  const wanted = [...new Set(underlying.filter(Boolean))];
  const underlyingSymbols = await multi(
    client,
    wanted.map((address) => ({ address, abi: symbolAbi, functionName: "symbol" })),
  );
  const symbolOf = new Map(wanted.map((a, i) => [a, value(underlyingSymbols[i])]));

  const map = new Map();
  let unresolved = 0;
  pts.forEach((pt, i) => {
    const u = underlying[i];
    const sym = u ? symbolOf.get(u) : null;
    if (!u || !sym) {
      unresolved++;
      return;
    }
    map.set(pt, [u, sym]);
  });
  const viaIbt = pts.filter((_, i) => !value(yieldToken[i]) && value(ibt[i])).length;
  console.log(
    `chain ${chainId}: ${pts.length} PT tokens, ${map.size} mapped ` +
      `(${map.size - viaIbt} Pendle SY, ${viaIbt} Spectra IBT), ${unresolved} with no readable underlying`,
  );
  return map;
}

const l1 = await forChain(1, mainnet, await mainnetUniverse());
const l2 = await forChain(8453, base, baseUniverse());

const entries = (m) =>
  m === null
    ? "  // not regenerated on the last run — no RPC url for this chain in env."
    : [...m.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([pt, [u, sym]]) => `  "${pt}": ["${u}", ${JSON.stringify(sym)}],`)
        .join("\n");

const file = `// AUTO-GENERATED — do not edit by hand.
// Regenerate: node scripts/generate-pt-underlying.mjs
//
// Principal token → [underlying address, underlying symbol], read from each
// PT's own SY().yieldToken() (Pendle) or getIBT() (Spectra). A PT is a dated
// claim on the underlying, so the chip draws the underlying's mark and stamps
// a "PT" badge over it: the mark answers "a claim on what", the badge and the
// symbol answer "a claim".
//
// Keyed by the PT's lowercased address, because the address is the identity —
// "PT-sUSDE" names seven different tokens across seven maturities, and the
// symbol case ("sUSDE" vs the house table's "sUSDe") differs from the asset it
// claims. See components/shared/token-chip-icon.tsx.

/** [underlying token address (lowercase), underlying symbol as the chain states it] */
export type PtUnderlying = readonly [address: string, symbol: string];

export const PT_UNDERLYING_MAINNET: Record<string, PtUnderlying> = {
${entries(l1)}
};

export const PT_UNDERLYING_BASE: Record<string, PtUnderlying> = {
${entries(l2)}
};
`;

if (DRY) {
  console.log(`\n--dry: would write ${file.length} bytes to lib/shared/pt-underlying.ts`);
} else {
  writeFileSync("lib/shared/pt-underlying.ts", file);
  console.log(`\nwrote lib/shared/pt-underlying.ts (${file.length} bytes)`);
}
