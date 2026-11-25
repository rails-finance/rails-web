// The families with no store, read at visit (rails-ops decision 0071, group 4,
// and 0073; SERVER-ONLY by use): Aave V3, Compound V3 and Morpho Blue on
// Optimism, Morpho Blue on Arc, Fluid on Base and Lido. Nothing is written to wallet_positions for them. Each
// module calls its explorer's per-wallet head route once per visit, through
// the wallet read's limiter (`apiHop`), and only once the summary and listing
// reads have settled (readWalletUncached starts them after `readSummary`).
// Its positions join the page's positions as head reads; a read that fails is
// named as a failed listing read is (`unanswered`).

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { isReadCeiling } from "@/lib/shared/read-ceiling";
import type { ChainId } from "@/lib/shared/chains";
import { protocolForSession } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { publicErrorMessage } from "@/lib/api/public-error";
import { apiHop, inChain } from "@/lib/wallet/api-hop";
import { withBudget } from "@/lib/wallet/summary-row";
import type { WalletFamilyRead, WalletPosition } from "@/lib/wallet/types";
import type { Presence } from "@/lib/wallet/presence";

export interface VisitModule {
  /** The family's id on this page (`aave-v3-optimism`). */
  id: string;
  name: string;
  chain: ChainId;
  /** The chain's name in the page's words ("Optimism"). */
  chainName: string;
  /** The explorer slug: the protocol section and the Protocol pill. */
  family: string;
  /** Whether the page reads the module: while its explorer is launched
   *  (`explorerLaunched`). */
  readonly on: boolean;
  /** The head route for the wallet, under RAILS_API_URL. */
  path(address: string): string;
  /** The presence check in front of the read (decision 0073 point 2; lib/wallet/presence-checks.ts). */
  presence: Presence;
  /** One position per position the answer holds; none where it holds nothing.
   *  Throws on an answer outside the route's shape. */
  shape(answer: unknown, address: string): WalletPosition[];
  /** A line the explorer states about the answer, drawn under the section: the Fluid read's
   *  "Rails read the newest 200". Null where it has none. */
  note?(answer: unknown): string | null;
}

/** What a failed read names: "Aave V3 on Optimism". */
export const visitWhat = (m: Pick<VisitModule, "name" | "chainName">) => `${m.name} on ${m.chainName}`;

/** The module's route, once, through the limiter. The budget runs from the
 *  call, the wait for a slot inside it. An answer that is not 200 fails. */
async function readOne(m: VisitModule, address: string, budgetMs: number, readerIp?: string): Promise<unknown> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  const path = m.path(address);
  return withBudget(budgetMs, (signal) =>
    apiHop(async () => {
      // Kept a minute, as the explorers' clients keep it.
      const res = await fetch(`${base}${path}`, createAuthFetchOptions({ next: { revalidate: 60 }, signal }, readerIp));
      if (res.ok) return res.json();
      const body = await res.json().catch(() => null);
      if (isReadCeiling(res.status, body)) throw new Error(`${path.split("?")[0]} is at its read ceiling`);
      throw new Error(`${path.split("?")[0]} answered ${res.status}`);
    }, signal),
  );
}

/** Whether an explorer is launched: a module read at visit is on from the
 *  change that takes its explorer's `unlaunched` flag off. Read at each call. */
export const explorerLaunched = (session: SessionProtocol): boolean => !protocolForSession(session)?.unlaunched;

export interface VisitRead {
  positions: WalletPosition[];
  /** A family entry for each module holding a position, or failing. */
  families: WalletFamilyRead[];
  /** What each failed read reads ("Morpho Blue on Optimism"). */
  failed: string[];
}

/** Every module that is on, at once. A module that is off makes no call. */
export async function readVisitFamilies(
  modules: VisitModule[],
  address: string,
  budgetMs: number,
  readerIp?: string,
): Promise<VisitRead> {
  const reading = modules.filter((m) => m.on);
  const settled = await Promise.allSettled(
    reading.map(async (m) => {
      const t0 = Date.now();
      try {
        const answer = await inChain(() => readOne(m, address, budgetMs, readerIp));
        return { m, ms: Date.now() - t0, positions: m.shape(answer, address), note: m.note?.(answer) ?? null };
      } catch (err) {
        throw { m, ms: Date.now() - t0, error: publicErrorMessage(err) };
      }
    }),
  );
  const out: VisitRead = { positions: [], families: [], failed: [] };
  for (const s of settled) {
    if (s.status === "fulfilled") {
      const { m, ms, positions, note } = s.value;
      if (positions.length === 0) continue;
      out.positions.push(...positions.map((p) => ({ ...p, readAtVisit: true as const })));
      out.families.push({
        id: m.id,
        name: m.name,
        chain: m.chain,
        positions: positions.length,
        open: positions.length,
        headRead: "read",
        ms,
        reads: 1,
        ...(note ? { note: { family: m.family, line: note } } : {}),
      });
    } else {
      const { m, ms, error } = s.reason as { m: VisitModule; ms: number; error: string };
      const what = visitWhat(m);
      out.failed.push(what);
      out.families.push({
        id: m.id,
        name: m.name,
        chain: m.chain,
        positions: 0,
        open: 0,
        headRead: "failed",
        ms,
        reads: 1,
        error,
        unanswered: { family: m.family, what },
      });
    }
  }
  return out;
}

/** The modules the page reads, by chain, for the empty state: "Aave V3,
 *  Compound V3 and Morpho Blue on Optimism; Morpho Blue on Arc". A module
 *  that is off is left out. */
export function visitFamiliesLine(modules: VisitModule[]): string {
  const byChain = new Map<string, string[]>();
  for (const m of modules) {
    if (!m.on) continue;
    const names = byChain.get(m.chainName) ?? [];
    if (!names.includes(m.name)) names.push(m.name);
    byChain.set(m.chainName, names);
  }
  const list = (n: string[]) => (n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);
  return [...byChain].map(([chain, names]) => `${list(names)} on ${chain}`).join("; ");
}

/** An open position's kind for the Kind pill: a loan where it owes. */
export const visitKind = (debt: number | null | undefined): "loans" | "deposits" =>
  (debt ?? 0) > 0 ? "loans" : "deposits";
