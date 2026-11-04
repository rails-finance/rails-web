// One wallet's protocols, each with its open and closed counts, kept in the
// browser (rails-ops ui-jobs 492): what a bookmark row draws under its name.
// Read from /api/chain/wallet/<address>/summary, the read behind the wallet
// view's "N more positions" line (lib/wallet/summary-counts.ts; rails-server's
// stored summary rows, no chain read, kept 60 s on the server). The browser
// keeps each answer under `rails-wallet-summaries`, keyed by address, for
// SUMMARY_MAX_AGE_MS; a failed read is not kept. Client-safe.

import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { PROTOCOLS } from "@/lib/shared/protocols";
import type { WalletCounts, WalletCountsChain } from "@/lib/wallet/summary-counts";

/** One protocol on one chain, as the wallet view counts it. */
export interface WalletSummaryProtocol {
  chain: WalletCountsChain;
  /** The summary rows' family (`aave-v3`). */
  family: string;
  /** The roster id, the glyph key (`liquity`); the family where the roster has none. */
  protocolId: string;
  name: string;
  open: number;
  /** Closed, liquidated or redeemed. */
  closed: number;
  /** The position's page when the protocol holds one position; otherwise absent. */
  href?: string;
}

export interface WalletSummary {
  address: string;
  /** `<chain>/<family>` → the protocol's counts. */
  protocols: Record<string, WalletSummaryProtocol>;
  /** When this browser read it, ms since the epoch. */
  readAt: number;
}

const STORAGE_KEY = "rails-wallet-summaries";
/** How long a kept summary stands before the next visit reads it again. */
export const SUMMARY_MAX_AGE_MS = 15 * 60_000;
/** The most wallets kept; the oldest reads go first. */
const MAX_KEPT = 200;

const chainIdOf = (slug: WalletCountsChain): ChainId | undefined =>
  Object.values(CHAINS).find((c) => c.slug === slug)?.id;

function fromCounts(c: WalletCounts, readAt: number): WalletSummary {
  const protocols: Record<string, WalletSummaryProtocol> = {};
  for (const f of c.families) {
    const chainId = chainIdOf(f.chain);
    const entry = PROTOCOLS.find((e) => e.chainId === chainId && e.slug === f.family);
    const held = c.positions.filter((p) => p.chain === f.chain && p.family === f.family);
    protocols[`${f.chain}/${f.family}`] = {
      chain: f.chain,
      family: f.family,
      protocolId: entry?.id ?? f.family,
      name: entry?.label ?? f.family,
      open: f.open,
      closed: f.closed,
      ...(held.length === 1 ? { href: held[0].href } : {}),
    };
  }
  return { address: c.address, protocols, readAt };
}

function readAll(): Record<string, WalletSummary> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const held: unknown = raw ? JSON.parse(raw) : null;
    return held && typeof held === "object" && !Array.isArray(held) ? (held as Record<string, WalletSummary>) : {};
  } catch {
    return {};
  }
}

function keep(summary: WalletSummary): void {
  try {
    const all = readAll();
    all[summary.address] = summary;
    const kept = Object.values(all)
      .sort((a, b) => b.readAt - a.readAt)
      .slice(0, MAX_KEPT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept.map((s) => [s.address, s]))));
  } catch {
    /* storage full or blocked: the summary still draws this visit */
  }
}

/** The kept summary for `address` while it is under the max age. */
export function keptWalletSummary(address: string): WalletSummary | null {
  const s = readAll()[address.toLowerCase()];
  return s && typeof s.readAt === "number" && Date.now() - s.readAt < SUMMARY_MAX_AGE_MS ? s : null;
}

// One read per address at a time, across the rows of one page.
const inFlight = new Map<string, Promise<WalletSummary>>();

/** Read the summary from the route and keep it. Rejects when the read failed. */
export function readWalletSummary(address: string): Promise<WalletSummary> {
  const key = address.toLowerCase();
  let read = inFlight.get(key);
  if (!read) {
    read = fetch(`/api/chain/wallet/${key}/summary`)
      .then(async (r) => {
        const c = (await r.json().catch(() => null)) as WalletCounts | null;
        if (!r.ok || !c || c.error) throw new Error(c?.error ?? `summary answered ${r.status}`);
        const summary = fromCounts(c, Date.now());
        keep(summary);
        return summary;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, read);
  }
  return read;
}
