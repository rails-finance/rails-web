// Vault shares on Ethereum and Base, for the wallet view (ui-jobs 783;
// SERVER-ONLY). One row per (vault, holder) the daily holder census states
// (rails-server mig 531): MetaMorpho on both chains, Yearn V3 and Aave's vaults
// (static aTokens, Umbrella stake tokens, savings GHO) on Ethereum. The card is
// the holder listing's VaultPositionRow, built from the stored row through the
// listing's mapper (`toRow`): the balance since the holder's last transfer.
//
// The head read is the listing's census read for the holder
// (rails-server /api/vaults/positions?chain=&holder=, every status, largest
// value first): each holding's census figures at the census block the row
// states (balance, share of the vault, the census's value at the Aave V3
// oracle and its priced block), the vault's asset from the census header, and
// the blocks' times from the at-block store. No chain read: the card is
// stamped with the census block. A stored open holding the answer lists as
// closed holds nothing at that row's census block, where it is at or past the
// stored last transfer (holdsNothingSince); one the answer does not list stays
// stored.
//
// The census value is a stored figure at the census block, so it is shown on
// the card and kept out of the section and wallet totals (wallet-sections.ts).

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { toRow, type BackendPositionRow } from "@/lib/vaults/position-row";
import { vaultPositionUsd, type VaultCensusRow, type VaultPositionRow } from "@/lib/aave-vaults/vault-position";
import { readBlockTimes } from "@/lib/sources/chain/vault-block-reads";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { historyBase, storeStamp, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import { holdsNothingSince } from "@/lib/wallet/holds-nothing";
import { VAULT_SHARES_FAMILY } from "@/lib/wallet/summary-counts";
import type { FamilyModule, HeadResult } from "./module";

/** The census families mig 531 writes, as rails-server's `families=` takes them. */
const CENSUS_FAMILIES: Record<number, string> = {
  [MAINNET_CHAIN_ID]: "morpho,yearn-v3,umbrella-stake,stata,sgho",
  [BASE_CHAIN_ID]: "morpho",
};

/** The route's most rows a page, and the most pages one visit reads a chain. */
const PAGE = 100;
const MAX_PAGES = 3;

/** The most holdings the page draws a chain. */
export const VAULT_DRAW_LIMIT = 100;

/** The card mig 531 stores: the listing's census fields. */
interface StoredVaultCard {
  family: string;
  symbol: string | null;
  shareDecimals: number | null;
  assetSymbol: string | null;
  balance: string;
  live: boolean;
  transferCount: number;
  firstBlock: number;
  lastBlock: number;
  shape: string | null;
  shapeDetail?: { codeSize?: number } | null;
}

/** The vault protocol's name for a census family. */
export function vaultProtocolName(family: string): string {
  if (family === "morpho") return "MetaMorpho";
  if (family === "yearn-v3") return "Yearn V3";
  return "Aave vaults";
}

/** The stored row as the listing's row: the census lane at the holder's last
 *  transfer, the block its balance last changed at. A holder with no code
 *  size stored is an EOA, code size 0. */
export function storedVaultRow(r: WalletSummaryRow, chainId: number): VaultPositionRow {
  const c = r.card as StoredVaultCard;
  const backend: BackendPositionRow = {
    chainId,
    vault: r.market ?? r.positionId.split("-")[0],
    holder: r.owner,
    family: c.family,
    symbol: c.symbol,
    shareDecimals: c.shareDecimals,
    balance: c.balance,
    live: c.live,
    transferCount: c.transferCount,
    firstBlock: c.firstBlock,
    lastBlock: c.lastBlock,
    shape: c.shape,
    shapeDetail: { ...c.shapeDetail, codeSize: c.shapeDetail?.codeSize ?? 0 },
    censusBlock: c.lastBlock,
    valueUsdE8: null,
    sharePpm: null,
  };
  const row = toRow(backend, chainId, null);
  return { ...row, value: { ...row.value, assetSymbol: c.assetSymbol } };
}

/** The holder's holdings as the census answers them, every status, up to
 *  MAX_PAGES pages, largest value first. */
async function readHolderCensus(
  chainId: number,
  holder: string,
  signal: AbortSignal,
  readerIp?: string,
): Promise<{ rows: BackendPositionRow[]; census: VaultCensusRow[]; reads: number }> {
  const base = process.env.RAILS_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("RAILS_API_URL is not set");
  const page = async (offset: number) => {
    const qs = new URLSearchParams({
      chain: String(chainId),
      holder: holder.toLowerCase(),
      families: CENSUS_FAMILIES[chainId],
      sortBy: "value",
      sortOrder: "desc",
      limit: String(PAGE),
      offset: String(offset),
    });
    const res = await fetch(`${base}/api/vaults/positions?${qs}`, {
      ...createAuthFetchOptions({ signal }, readerIp),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`/api/vaults/positions answered ${res.status}`);
    return (await res.json()) as {
      data?: BackendPositionRow[];
      pagination?: { total?: number };
      census?: VaultCensusRow[];
    };
  };
  const first = await page(0);
  const total = first.pagination?.total ?? first.data?.length ?? 0;
  const more = Math.min(MAX_PAGES, Math.ceil(total / PAGE)) - 1;
  const rest = await Promise.all(Array.from({ length: Math.max(0, more) }, (_, i) => page((i + 1) * PAGE)));
  const rows = [first, ...rest].flatMap((p) => p.data ?? []);
  return { rows, census: first.census ?? [], reads: 1 + rest.length };
}

const rowOf = (p: WalletPosition) => (p.card as { row: VaultPositionRow }).row;

function vaultsModule(chainId: typeof MAINNET_CHAIN_ID | typeof BASE_CHAIN_ID): FamilyModule {
  const base = chainId === BASE_CHAIN_ID;
  return {
    id: base ? "vaults-base" : "vaults",
    name: "Vault shares",
    chain: chainId,
    summaryChain: base ? "base" : "ethereum",
    summaryFamily: VAULT_SHARES_FAMILY,
    lineNames: base ? ["MetaMorpho vaults"] : ["MetaMorpho vaults", "Yearn V3 vaults", "Aave vaults"],
    drawLimit: VAULT_DRAW_LIMIT,
    async shape(rows) {
      return rows.map((r): WalletPosition => {
        const row = storedVaultRow(r, chainId);
        const p: WalletPosition = {
          chain: chainId,
          family: VAULT_SHARES_FAMILY,
          familyName: vaultProtocolName(row.family),
          market: row.symbol ?? undefined,
          positionId: r.positionId,
          href: r.href,
          status: r.status === "open" ? "open" : "closed",
          card: { kind: "vault", row, lane: "stored" },
          headRead: "none",
          ...storeStamp(r),
        };
        return p.status === "open" ? p : { ...p, history: historyBase(r) };
      });
    },
    async head(open, address, signal, _apiMs, { readerIp }): Promise<HeadResult> {
      if (open.length === 0) return { positions: open, reads: 0 };
      const answer = await readHolderCensus(chainId, address, signal, readerIp);
      const census = new Map(answer.census.map((c) => [c.vault.toLowerCase(), c]));
      const listed = new Map(
        answer.rows.map((b) => {
          const r = toRow(b, chainId, census.get(b.vault.toLowerCase()) ?? null);
          return [r.vault, r] as const;
        }),
      );
      // The blocks the cards name, from the at-block store; a block it does
      // not answer leaves its date out.
      const blocks = [
        ...new Set([...listed.values()].flatMap((r) => [r.census.firstBlock, r.census.lastBlock, r.census.block])),
      ].filter((b) => Number.isFinite(b) && b > 0);
      const times = blocks.length
        ? await readBlockTimes(chainId, blocks).catch(() => new Map<number, number>())
        : new Map<number, number>();
      signal.throwIfAborted();
      return {
        reads: answer.reads + (blocks.length ? 1 : 0),
        positions: open.map((p): WalletPosition => {
          const stored = rowOf(p);
          const r = listed.get(stored.vault);
          if (r && !r.census.live) {
            // The census row states nothing held at its census block.
            const head = holdsNothingSince(r.census.block, stored.census.lastBlock);
            return head != null
              ? { ...p, closedSince: { block: head }, headRead: "stored" }
              : { ...p, headRead: "stored" };
          }
          if (r) {
            const c = census.get(r.vault);
            const asset =
              c?.asset && c.assetSymbol != null && c.assetDecimals != null
                ? { address: c.asset.toLowerCase(), symbol: c.assetSymbol, decimals: c.assetDecimals }
                : null;
            const row: VaultPositionRow = {
              ...r,
              asset,
              firstSeenAt: times.get(r.census.firstBlock) ?? null,
              lastActivityAt: times.get(r.census.lastBlock) ?? null,
            };
            const usd = vaultPositionUsd(row);
            const priced = row.value.pricedBlock ?? row.census.block;
            return {
              ...p,
              card: { kind: "vault", row, lane: "census" },
              collateralUsd: usd ?? undefined,
              usdSource: usd != null ? `the Aave V3 oracle at census block ${priced}` : undefined,
              headRead: "stored",
              readAtBlock: row.census.block,
              readAt: times.get(row.census.block),
            };
          }
          // Not listed (past the pages read): the stored row stands.
          return { ...p, headRead: "stored" };
        }),
      };
    },
  };
}

export const vaultsEthereum = vaultsModule(MAINNET_CHAIN_ID);
export const vaultsBase = vaultsModule(BASE_CHAIN_ID);
