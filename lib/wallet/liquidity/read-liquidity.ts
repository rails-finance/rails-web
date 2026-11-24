import "server-only";

// The wallet page's Liquidity section (W9; rails-ops decisions/0071): read at visit, after the
// page's main read, with no store behind it. Every owner route in LIQUIDITY_SOURCES at once,
// then, for each route's newest LIQUIDITY_CARDS_PER_SOURCE positions, the position read its
// explorer's page makes, which its card draws. Every request goes through liquidityHop.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { liquidityHop, type HopAnswer } from "@/lib/wallet/liquidity/hop";
import {
  LIQUIDITY_CARDS_PER_SOURCE,
  LIQUIDITY_SOURCES,
  ownerPath,
  positionPath,
  type LiquiditySource,
} from "@/lib/wallet/liquidity/sources";
import { PROTOCOLS } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";
import type { UniPositionRead, UniPositionsRead } from "@/lib/uniswap/types";
import type { AeroPositionRead, AeroPositionsRead } from "@/lib/aerodrome/types";
import type { BalPositionRead, BalPositionsRead } from "@/lib/balancer/types";
import type { LiquiditySourceRead, WalletCard, WalletLiquidity, WalletPosition } from "@/lib/wallet/types";

/** The whole read's budget, inside the page's 30 s: the section streams in after the page. */
const LIQUIDITY_BUDGET_MS = 25_000;
/** An owner route's wait: a cold one reads the wallet's NFTs and, for V4 and Balancer, logs. */
const OWNER_WAIT_MS = 15_000;
/** A position read's wait. */
const POSITION_WAIT_MS = 10_000;

/** One position an owner route named, with what its read and its card need. */
interface Named {
  path: string;
  /** The explorer's roster id and route slug, for the card's sidebar and link. */
  explorerId: string;
  slug: string;
  href: string;
  positionId: string;
  card: (data: unknown) => WalletCard;
}

const label = (id: string) => PROTOCOLS.find((e) => e.id === id)?.label ?? id;

/** The roster id of an explorer on a chain: Ethereum's keep their bare ids. */
const rosterId = (slug: string, s: LiquiditySource) =>
  PROTOCOLS.find((e) => e.slug === slug && e.chainId === s.chainId)?.id ?? slug;

function named(s: LiquiditySource, data: unknown, owner: string): Named[] {
  if (s.kind === "balancer") {
    const r = data as BalPositionsRead;
    return r.positions.map((p) => ({
      path: positionPath(s, { pool: p.pool }, owner),
      explorerId: rosterId("balancer-v3", s),
      slug: "balancer-v3",
      href: `${s.route}/position/${p.pool.toLowerCase()}/${owner}`,
      positionId: p.pool.toLowerCase(),
      card: (read) => ({ kind: "balancer", read: read as BalPositionRead }),
    }));
  }
  if (s.kind === "slipstream") {
    const r = data as AeroPositionsRead;
    return r.positions.map((p) => ({
      path: positionPath(s, { deployment: p.deployment, id: p.id }, owner),
      explorerId: rosterId(s.protocol, s),
      slug: s.protocol,
      href: `${s.route}/position/${p.deployment}/${p.id}`,
      positionId: `${p.deployment}:${p.id}`,
      card: (read) => ({ kind: "slipstream", read: read as AeroPositionRead }),
    }));
  }
  const r = data as UniPositionsRead;
  const protocol = s.protocol as "uniswap" | "pancakeswap";
  return r.positions.map((p) => {
    const slug = `${protocol}-${p.version}`;
    const route = s.route.replace(/-v3$/, `-${p.version}`);
    return {
      path: positionPath(s, { version: p.version, id: p.id }, owner),
      explorerId: rosterId(slug, s),
      slug,
      href: `${route}/position/${p.id}`,
      positionId: `${p.version}:${p.id}`,
      card: (read) => ({ kind: "uniswap", protocol, read: read as UniPositionRead }),
    };
  });
}

/** The pair, or the pool's symbol, for the card's link label. */
function marketOf(card: WalletCard): string | undefined {
  if (card.kind === "uniswap" || card.kind === "slipstream")
    return `${card.read.token0.symbol} / ${card.read.token1.symbol}`;
  if (card.kind === "balancer") return card.read.symbol ?? undefined;
  return undefined;
}

const headOf = (card: WalletCard) =>
  card.kind === "uniswap" || card.kind === "slipstream" || card.kind === "balancer" ? card.read.head : null;

async function readSource(
  s: LiquiditySource,
  owner: string,
  hop: { readerIp?: string; deadline: number },
): Promise<{ read: LiquiditySourceRead; positions: WalletPosition[] }> {
  const t0 = Date.now();
  const base = {
    key: s.key,
    what: `${s.name} on ${s.chainName}`,
    name: s.name,
    chainName: s.chainName,
    href: `${s.route}/${owner}`,
  };
  const answer: HopAnswer<{ truncated?: boolean }> = await liquidityHop(ownerPath(s, owner), {
    ...hop,
    waitMs: OWNER_WAIT_MS,
  });
  if (answer.kind !== "ok") {
    const state = answer.kind === "ceiling" ? "ceiling" : answer.kind === "refused" ? "refused" : "failed";
    return {
      read: { ...base, state, truncated: false, held: 0, drawn: 0, failed: 0, ms: Date.now() - t0 },
      positions: [],
    };
  }
  const all = named(s, answer.data, owner);
  const reads = await Promise.all(
    all.slice(0, LIQUIDITY_CARDS_PER_SOURCE).map(async (n) => {
      const r = await liquidityHop<unknown>(n.path, { ...hop, waitMs: POSITION_WAIT_MS });
      return r.kind === "ok" ? { n, card: n.card(r.data) } : null;
    }),
  );
  const positions: WalletPosition[] = [];
  for (const x of reads) {
    if (!x) continue;
    const head = headOf(x.card);
    positions.push({
      chain: s.chainId as ChainId,
      family: x.n.slug,
      familyName: label(x.n.explorerId),
      market: marketOf(x.card),
      positionId: x.n.positionId,
      href: x.n.href,
      status: "open",
      card: x.card,
      headRead: "read",
      ...(head ? { readAtBlock: head.block, readAt: head.time } : {}),
    });
  }
  return {
    read: {
      ...base,
      state: "ok",
      truncated: answer.data.truncated === true,
      held: all.length,
      drawn: positions.length,
      failed: reads.filter((x) => !x).length,
      ms: Date.now() - t0,
    },
    positions,
  };
}

/** Every owner route at once; a route that fails leaves its positions out and says so. */
export async function readWalletLiquidity(address: string, readerIp?: string): Promise<WalletLiquidity> {
  const t0 = Date.now();
  const owner = address.toLowerCase();
  const hop = { readerIp, deadline: t0 + LIQUIDITY_BUDGET_MS };
  const parts = await Promise.all(
    LIQUIDITY_SOURCES.map((s) =>
      // An answer the shaping cannot read counts as a route that did not answer.
      readSource(s, owner, hop).catch(() => ({
        read: {
          key: s.key,
          what: `${s.name} on ${s.chainName}`,
          name: s.name,
          chainName: s.chainName,
          href: `${s.route}/${owner}`,
          state: "failed" as const,
          truncated: false,
          held: 0,
          drawn: 0,
          failed: 0,
          ms: Date.now() - t0,
        },
        positions: [],
      })),
    ),
  );
  return {
    positions: parts.flatMap((p) => p.positions),
    sources: parts.map((p) => p.read),
    ms: Date.now() - t0,
  };
}
