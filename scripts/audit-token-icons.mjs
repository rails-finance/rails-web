#!/usr/bin/env node
// Token-icon census — which assets would draw as a letter, and fetch the rest.
// ----------------------------------------------------------------------------
// The chip (components/shared/token-chip-icon.tsx) resolves a mark in order:
// local PNG by symbol → local PNG by address → Trust Wallet (chain, address)
// → DeFiLlama (chain, address) → the initial-letter glyph. Nothing tells us
// which assets end at the letter until a reader meets one, so this walks a
// universe of (chain, address) and asks each tier the way the chip does.
//
//   node scripts/audit-token-icons.mjs                 # report only
//   node scripts/audit-token-icons.mjs --fetch         # also pull the misses
//   node scripts/audit-token-icons.mjs --universe scripts/token-icon-universe.base.json
//
// A miss is fetched from CoinGecko's contract endpoint (image.large) into
// public/icons/tokens/<address>.png — address-named, so the manifest resolves
// it by address on any page — and the manifest is regenerated. CoinGecko's
// free tier allows ~30 calls/min; misses are few, and the loop paces itself.
//
// Every run also rewrites lib/shared/token-addresses.base.ts — the Base
// symbol → address table the chip consults on a Base page. Call sites hand
// the chip a symbol and nothing else, and the hand-kept TOKEN_ADDRESSES is
// Ethereum's, so without this table a Base-only symbol (USDbC, AERO, VVV)
// had no address to ask either CDN about and drew as its initial. An
// address that answers no symbol() is a contract, not a token (basedollar's
// catalog lists trove managers next to its branches) and is left out.
//
// The universe file is a list of { chainId, address, seenIn[] }. The Base one
// is assembled from the rosters (Seamless / Aave V3 reserves, the Moonwell
// mTokens' underlyings, the Comets' base + collateral assets, basedollar's
// branches) plus every Morpho Blue market the index has seen activity on —
// Morpho is open-ended, so re-run the assembly when new markets show up.
// Symbols are read from the chain (symbol()) rather than trusted from a file.
//
// The chip also wears an underlying's mark for a few wrapper tokens
// (ICON_SYMBOL_ALIASES in token-chip-icon.tsx — Seamless's rWETH, basedollar's
// wcbBTC …); this census does not know that map, so those count as missing
// here while drawing fine on the page. Read the missing list with that in mind.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const FETCH = args.includes("--fetch");
const universeArg = args.includes("--universe") ? args[args.indexOf("--universe") + 1] : null;
const universePath = resolve(root, universeArg || "scripts/token-icon-universe.base.json");

const RPC = {
  1: process.env.ALCHEMY_URL || "https://ethereum.publicnode.com",
  8453: process.env.BASE_RPC_URL || "https://base.gateway.tenderly.co",
};
const TRUST_WALLET_CHAIN = { 1: "ethereum", 8453: "base" };
const COINGECKO_PLATFORM = { 1: "ethereum", 8453: "base" };

const manifestSrc = readFileSync(resolve(root, "lib/shared/local-token-icons.ts"), "utf8");
// Manifest keys are bare identifiers where they can be (`usdc: "usdc.png"`)
// and quoted otherwise (addresses, "1inch") — match both.
const local = new Set([...manifestSrc.matchAll(/^\s+(?:"([^"]+)"|([\w$]+)):/gm)].map((m) => m[1] ?? m[2]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(chainId, to, data) {
  const res = await fetch(RPC[chainId], {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "rails-icon-audit/1" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  return json.result ?? null;
}

// symbol(): a string per ABI, or bytes32 on a few old tokens (MKR-style).
async function symbolOf(chainId, address) {
  const r = await rpc(chainId, address, "0x95d89b41");
  if (!r || r === "0x") return null;
  const hex = r.slice(2);
  if (hex.length === 64) return Buffer.from(hex, "hex").toString("utf8").replace(/\0+$/, "");
  const len = parseInt(hex.slice(64, 128), 16);
  return Buffer.from(hex.slice(128, 128 + len * 2), "hex").toString("utf8");
}

function checksum(address) {
  // EIP-55 without pulling viem into a script: keccak via node's crypto is not
  // available, so ask viem if installed (it is — the app depends on it).
  return getAddress(address);
}
const { getAddress } = await import("viem");

// Does a tier hold a mark for this address? The question is existence, so the
// request is a HEAD — it was a GET, which pulled the whole PNG down to read
// its status line and then dropped it, ~70 full images a run on the Base
// universe. Both CDNs answer HEAD 200.
//
// A 405/501 means the host refuses the method, NOT that the icon is absent, and
// treating it as absent would file a mark that renders fine as MISSING — and
// then `--fetch` would go buy a second copy of it from CoinGecko. So a refusal
// falls back to the GET, which is the only case that still pays for a body.
async function head(url) {
  const send = (method) =>
    fetch(url, {
      method,
      headers: { "user-agent": "rails-icon-audit/1" },
      signal: AbortSignal.timeout(15_000),
    });
  try {
    const res = await send("HEAD");
    if (res.status !== 405 && res.status !== 501) return res.ok;
    return (await send("GET")).ok;
  } catch {
    return false;
  }
}

const trustWalletUrl = (chainId, address) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${TRUST_WALLET_CHAIN[chainId]}/assets/${checksum(address)}/logo.png`;
const llamaUrl = (chainId, address) =>
  `https://token-icons.llamao.fi/icons/tokens/${chainId}/${address.toLowerCase()}?h=24&w=24`;

async function fetchFromCoinGecko(chainId, address) {
  const url = `https://api.coingecko.com/api/v3/coins/${COINGECKO_PLATFORM[chainId]}/contract/${address.toLowerCase()}`;
  const res = await fetch(url, {
    headers: { "user-agent": "rails-icon-audit/1" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) {
    await sleep(65_000);
    return fetchFromCoinGecko(chainId, address);
  }
  if (!res.ok) return null;
  const json = await res.json();
  const img = json?.image?.large || json?.image?.small;
  if (!img) return null;
  const png = await fetch(img, { signal: AbortSignal.timeout(20_000) });
  if (!png.ok) return null;
  const buf = Buffer.from(await png.arrayBuffer());
  // CoinGecko serves PNG almost always; the manifest is PNG-only, so refuse
  // anything else rather than write a mislabelled file.
  if (!(buf[0] === 0x89 && buf[1] === 0x50)) return null;
  const out = resolve(root, `public/icons/tokens/${address.toLowerCase()}.png`);
  writeFileSync(out, buf);
  return out;
}

const universe = JSON.parse(readFileSync(universePath, "utf8"));
const rows = [];
const notTokens = [];
for (const u of universe) {
  const address = u.address.toLowerCase();
  const symbol = await symbolOf(u.chainId, address);
  if (!symbol) {
    notTokens.push(address);
    continue;
  }
  let tier;
  if (local.has(symbol.toLowerCase()) || local.has(address)) tier = "local";
  else if (await head(trustWalletUrl(u.chainId, address))) tier = "trustwallet";
  else if (await head(llamaUrl(u.chainId, address))) tier = "llama";
  else tier = "MISSING";
  rows.push({ ...u, address, symbol, tier });
  process.stderr.write(`${tier.padEnd(11)} ${symbol.padEnd(14)} ${address}  (${u.seenIn.join(", ")})\n`);
}

// The Base symbol → address table. Two addresses claiming one symbol is a
// real ambiguity (which mark?) and stops the run rather than picking one.
const bySymbol = new Map();
for (const r of rows.filter((r) => r.chainId === 8453)) {
  const prev = bySymbol.get(r.symbol);
  if (prev && prev !== r.address)
    throw new Error(`symbol ${r.symbol} names two Base addresses: ${prev} and ${r.address}`);
  bySymbol.set(r.symbol, r.address);
}
const table = [...bySymbol.entries()].sort(([a], [b]) => a.localeCompare(b));
writeFileSync(
  resolve(root, "lib/shared/token-addresses.base.ts"),
  `// AUTO-GENERATED — do not edit by hand.
// Source: scripts/token-icon-universe.base.json, symbols read from the chain.
// Regenerate: node scripts/audit-token-icons.mjs
//
// Base (8453) symbol → address, for the token chip's CDN lookup on a Base
// page. See getTokenAddress in lib/shared/token-addresses.ts.
export const BASE_TOKEN_ADDRESSES: Record<string, string> = {
${table.map(([s, a]) => `  ${/^[A-Za-z_$][\w$]*$/.test(s) ? s : JSON.stringify(s)}: "${a}",`).join("\n")}
};
`,
);
console.log(`\nlib/shared/token-addresses.base.ts: ${table.length} Base symbols`);
if (notTokens.length)
  console.log(`${notTokens.length} address(es) answer no symbol() — contracts, not tokens; skipped`);

const missing = rows.filter((r) => r.tier === "MISSING");
console.log(
  `${rows.length} assets: ${rows.filter((r) => r.tier === "local").length} local, ${rows.filter((r) => r.tier === "trustwallet").length} Trust Wallet, ${rows.filter((r) => r.tier === "llama").length} DeFiLlama, ${missing.length} missing`,
);

if (FETCH && missing.length) {
  let got = 0;
  for (const m of missing) {
    const out = await fetchFromCoinGecko(m.chainId, m.address);
    console.log(`${out ? "fetched" : "NOT FOUND"}  ${m.symbol.padEnd(14)} ${m.address}`);
    if (out) got++;
    await sleep(2_500);
  }
  if (got) {
    execSync("node scripts/gen-token-icon-manifest.mjs", { cwd: root, stdio: "inherit" });
    console.log(`${got} icon(s) written to public/icons/tokens and the manifest regenerated.`);
  }
  const still = missing.length - got;
  if (still) console.log(`${still} still missing — no source has a mark; the letter glyph stands.`);
} else if (missing.length) {
  console.log("Re-run with --fetch to pull the misses from CoinGecko.");
}
