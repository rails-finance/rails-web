import "server-only";

// The wallet page's Liquidity section (W9; rails-ops decisions/0071): read at visit, after the
// page's main read, with no store behind it. The eleven owner routes in LIQUIDITY_SOURCES at once,
// through liquidityHop, and nothing else: each route answers the head-only fields its listing card
// draws for the first `headRows` rows of its answer (lib/wallet/liquidity/cards.ts builds the card's
// read from them).
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { liquidityHop, type HopAnswer } from "@/lib/wallet/liquidity/hop";
import { walletPresence } from "@/lib/wallet/read-wallet";
import { presenceReads } from "@/lib/wallet/presence";
import {
  LIQUIDITY_HEAD_ROWS,
  LIQUIDITY_SOURCES,
  ownerPath,
  type LiquiditySource,
} from "@/lib/wallet/liquidity/sources";
import { balancerCardRead, slipstreamCardRead, uniCardRead } from "@/lib/wallet/liquidity/cards";
import { foundThrough } from "@/lib/balancer/provenance";
import { PROTOCOLS } from "@/lib/shared/protocols";
import type { ChainId } from "@/lib/shared/chains";
import type { UniPositionsRead } from "@/lib/uniswap/types";
import type { AeroPositionsRead } from "@/lib/aerodrome/types";
import type { BalPositionsRead } from "@/lib/balancer/types";
import type { LiquiditySourceRead, WalletCard, WalletLiquidity, WalletPosition } from "@/lib/wallet/types";

/** The read's budget from its start, and its end from the page's start: it starts once the page's
 *  main read has settled (up to 8 s), and the page's response ends at maxDuration, 30 s. */
const LIQUIDITY_BUDGET_MS = 25_000;
const PAGE_END_MS = 27_000;
/** An owner route's wait: a cold one reads the wallet's NFTs and, for V4 and Balancer, logs. */
const OWNER_WAIT_MS = 15_000;

/** One position an owner route named: its card where the row carries its head fields, else null. */
interface Named {
  /** The explorer's roster id and route slug, for the card's sidebar and link. */
  explorerId: string;
  slug: string;
  href: string;
  positionId: string;
  card: WalletCard | null;
}

const label = (id: string) => PROTOCOLS.find((e) => e.id === id)?.label ?? id;

/** The roster id of an explorer on a chain: Ethereum's keep their bare ids. */
const rosterId = (slug: string, s: LiquiditySource) =>
  PROTOCOLS.find((e) => e.slug === slug && e.chainId === s.chainId)?.id ?? slug;

function named(s: LiquiditySource, data: unknown, owner: string): Named[] {
  if (s.kind === "balancer") {
    const r = data as BalPositionsRead;
    return r.positions.map((p) => ({
      explorerId: rosterId("balancer-v3", s),
      slug: "balancer-v3",
      href: `${s.route}/position/${p.pool.toLowerCase()}/${owner}`,
      positionId: p.pool.toLowerCase(),
      card: { kind: "balancer", read: balancerCardRead(r, p) },
    }));
  }
  if (s.kind === "slipstream") {
    const r = data as AeroPositionsRead;
    return r.positions.map((p) => {
      const read = slipstreamCardRead(r, p);
      return {
        explorerId: rosterId(s.protocol, s),
        slug: s.protocol,
        href: `${s.route}/position/${p.deployment}/${p.id}`,
        positionId: `${p.deployment}:${p.id}`,
        card: read ? { kind: "slipstream", read } : null,
      };
    });
  }
  const r = data as UniPositionsRead;
  const protocol = s.protocol as "uniswap" | "pancakeswap";
  return r.positions.map((p) => {
    const slug = `${protocol}-${p.version}`;
    const route = s.route.replace(/-v3$/, `-${p.version}`);
    const read = uniCardRead(r, p);
    return {
      explorerId: rosterId(slug, s),
      slug,
      href: `${route}/position/${p.id}`,
      positionId: `${p.version}:${p.id}`,
      card: read ? { kind: "uniswap", protocol, read } : null,
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
    chainId: s.chainId,
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
      read: {
        ...base,
        state,
        truncated: false,
        held: 0,
        drawn: 0,
        failed: 0,
        headRows: LIQUIDITY_HEAD_ROWS,
        ms: Date.now() - t0,
      },
      positions: [],
    };
  }
  const all = named(s, answer.data, owner);
  const positions: WalletPosition[] = [];
  for (const n of all) {
    if (!n.card) continue;
    const head = headOf(n.card);
    positions.push({
      chain: s.chainId as ChainId,
      family: n.slug,
      familyName: label(n.explorerId),
      market: marketOf(n.card),
      positionId: n.positionId,
      href: n.href,
      status: "open",
      card: n.card,
      headRead: "read",
      ...(head ? { readAtBlock: head.block, readAt: head.time } : {}),
    });
  }
  // A row before the answer's headRows with no card could not be read; those past it carry no head
  // fields by design and are on the explorer's wallet page.
  const headRows = (answer.data as { headRows?: number }).headRows ?? LIQUIDITY_HEAD_ROWS;
  const failed = all.slice(0, headRows).filter((n) => !n.card).length;
  const through = s.kind === "balancer" ? foundThrough(answer.data as BalPositionsRead) : null;
  return {
    read: {
      ...base,
      state: "ok",
      truncated: answer.data.truncated === true,
      ...(through != null ? { foundThrough: through } : {}),
      held: all.length,
      drawn: positions.length,
      failed,
      headRows,
      ms: Date.now() - t0,
    },
    positions,
  };
}

/** Every owner route at once; a route that fails leaves its positions out and says so. */
/** `pageStart`: when the page's request began (epoch ms). */
export async function readWalletLiquidity(
  address: string,
  readerIp: string | undefined,
  pageStart: number,
): Promise<WalletLiquidity> {
  const t0 = Date.now();
  const owner = address.toLowerCase();
  const hop = { readerIp, deadline: Math.min(pageStart + PAGE_END_MS, t0 + LIQUIDITY_BUDGET_MS) };
  // A source whose check finds nothing makes no read and states nothing (decision 0073 point 2).
  const answers = await walletPresence(owner);
  const parts = await Promise.all(
    LIQUIDITY_SOURCES.filter((s) => presenceReads(answers.get(s.key))).map((s) =>
      // An answer the shaping cannot read counts as a route that did not answer.
      readSource(s, owner, hop).catch(() => ({
        read: {
          key: s.key,
          what: `${s.name} on ${s.chainName}`,
          chainId: s.chainId,
          name: s.name,
          chainName: s.chainName,
          href: `${s.route}/${owner}`,
          state: "failed" as const,
          truncated: false,
          held: 0,
          drawn: 0,
          failed: 0,
          headRows: LIQUIDITY_HEAD_ROWS,
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
