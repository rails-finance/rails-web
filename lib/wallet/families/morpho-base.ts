// Morpho Blue on Base, for the wallet view (decision 0071; SERVER-ONLY). One
// row per (market, borrower) (mig 515): the card is the Base listing row,
// built from the summary row's `card` by the listing's builder in its listed
// custody. The stored card's market totals are not read (mig 516 takes them
// off), so a closed card, which owes nothing, is the stored row alone.
//
// The head read is one Multicall at one Base block over the wallet's open
// markets: each position's slots, the market's totals and its oracle's price.
// The builder takes those as the row and its market, so every figure on an
// open card is at that block. A pair the read finds holding nothing (mig 515's
// open rule, `morphoOpenRaw`) keeps the sweep's card, marked `closedSince`.

import { parseAbi } from "viem";
import {
  buildMorphoPositionRows,
  type MorphoListedLane,
  type RawMorphoListedMarket,
  type RawMorphoPositionRow,
} from "@/lib/sources/api/morpho-positions";
import { parseMarketParams } from "@/lib/morpho/asset-catalog";
import { morphoOpenRaw } from "@/lib/morpho/position-legs";
import { MORPHO_BASE_DEPLOYMENT } from "@/lib/sources/chain/morpho-deployments";
import { morphoBaseVaultOwnerNote } from "@/lib/morpho-base/vault-owner-note";
import { chainClient } from "@/lib/sources/chain/rpc";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { historyBase, plural, storeStamp, type WalletSummaryRow } from "@/lib/wallet/summary-row";
import { DOLLAR_LOANS } from "./ethereum-single";
import type { FamilyModule, HeadResult } from "./module";

const BLUE_ABI = parseAbi([
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
]);
const ORACLE_ABI = parseAbi(["function price() view returns (uint256)"]);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** The stored card with its market totals left out. */
const storedRow = (r: WalletSummaryRow): RawMorphoPositionRow => ({
  ...(r.card as RawMorphoPositionRow),
  total_borrow_assets: null,
  total_borrow_shares: null,
});

const lane: MorphoListedLane = { chainId: BASE_CHAIN_ID, markets: [] };

export const morphoBase: FamilyModule = {
  id: "morpho-base",
  name: "Morpho Blue",
  chain: BASE_CHAIN_ID,
  summaryChain: "base",
  summaryFamily: "morpho",
  async shape(rows) {
    const vaultOwner = rows.length ? morphoBaseVaultOwnerNote(rows[0].owner) : null;
    // The builder leaves out a row whose market params it cannot decode, so
    // each card finds its summary row by id.
    const cards = await buildMorphoPositionRows(
      rows.map((r) => {
        const raw = storedRow(r);
        return { ...raw, market_params: raw.market_params ?? "" };
      }),
      lane,
    );
    const byId = new Map(rows.map((r) => [r.positionId, r]));
    return cards.flatMap((s): WalletPosition[] => {
      const r = byId.get(s.positionId);
      if (!r) return [];
      const base: WalletPosition = {
        chain: BASE_CHAIN_ID,
        family: "morpho",
        familyName: "Morpho Blue",
        market: s.marketLabel,
        positionId: r.positionId,
        href: r.href,
        status: r.status,
        card: { kind: "morpho-base", row: s, read: "listing", vaultOwner },
        headRead: "none",
        ...storeStamp(r),
      };
      if (r.status === "open") return [base];
      // The Base lane records no peaks (mig 515), so the History row states no size.
      return [
        {
          ...base,
          history: {
            ...historyBase(r),
            result: (r.liquidationCount ?? 0) > 0 ? plural(r.liquidationCount!, "liquidation") : undefined,
          },
        },
      ];
    });
  },
  async head(open, address, signal, _apiMs, { rows }): Promise<HeadResult> {
    if (open.length === 0) return { positions: open, reads: 0 };
    const byId = new Map(rows.map((r) => [r.positionId, r]));
    const targets = open.flatMap((p) => {
      const r = byId.get(p.positionId);
      const raw = r ? storedRow(r) : null;
      const params = raw?.market_params ? parseMarketParams(raw.market, raw.market_params) : null;
      return raw && params ? [{ p, raw, params }] : [];
    });
    if (targets.length === 0) return { positions: open.map((p) => ({ ...p, headRead: "failed" })), reads: 0 };

    const client = chainClient(BASE_CHAIN_ID);
    signal.throwIfAborted();
    const head = await client.getBlock();
    signal.throwIfAborted();
    const blockNumber = head.number;
    const blue = MORPHO_BASE_DEPLOYMENT.blue as `0x${string}`;
    const priced = (t: (typeof targets)[number]) => !t.params.isIdle && t.params.oracle !== ZERO_ADDR;
    const contracts = targets.flatMap((t) => [
      {
        address: blue,
        abi: BLUE_ABI,
        functionName: "position",
        args: [t.params.marketId as `0x${string}`, address as `0x${string}`],
      } as const,
      { address: blue, abi: BLUE_ABI, functionName: "market", args: [t.params.marketId as `0x${string}`] } as const,
      ...(priced(t)
        ? [{ address: t.params.oracle as `0x${string}`, abi: ORACLE_ABI, functionName: "price" } as const]
        : []),
    ]);
    const results = await client.multicall({ contracts, allowFailure: true, blockNumber });
    signal.throwIfAborted();

    const block = Number(blockNumber);
    const at = Number(head.timestamp);
    const readAt = new Date(at * 1000).toISOString();
    const read = new Map<string, { raw: RawMorphoPositionRow; market: RawMorphoListedMarket }>();
    // Pairs the read finds holding nothing: the sweep's card stays.
    const closed = new Set<string>();
    let i = 0;
    for (const t of targets) {
      const pos = results[i++];
      const mkt = results[i++];
      const price = priced(t) ? results[i++] : null;
      if (pos.status !== "success" || mkt.status !== "success") continue;
      const [, borrowShares, collateral] = pos.result as readonly [bigint, bigint, bigint];
      if (!morphoOpenRaw(collateral.toString(), borrowShares.toString())) {
        closed.add(t.p.positionId);
        continue;
      }
      const [tsa, tss, tba, tbs, lastUpdate, fee] = mkt.result as readonly bigint[];
      read.set(t.p.positionId, {
        raw: {
          ...t.raw,
          coll_raw: collateral.toString(),
          // The builder converts the shares through the totals below (toAssetsUp).
          borr_raw: "0",
          bsh_raw: borrowShares.toString(),
          total_borrow_assets: tba.toString(),
          total_borrow_shares: tbs.toString(),
          chain_block: block,
          chain_read_at: readAt,
        },
        market: {
          market: t.raw.market.replace(/^0x/, "").toLowerCase(),
          loanToken: t.params.loanToken,
          collateralToken: t.params.collateralToken,
          oracle: t.params.oracle,
          irm: t.params.irm,
          lltv: t.params.lltv,
          block,
          totalSupplyAssets: tsa.toString(),
          totalSupplyShares: tss.toString(),
          totalBorrowAssets: tba.toString(),
          totalBorrowShares: tbs.toString(),
          lastUpdate: lastUpdate.toString(),
          fee: fee.toString(),
          priceRaw: price?.status === "success" ? String(price.result) : null,
          refreshedAt: readAt,
        },
      });
    }
    const got = [...read.values()];
    const cards = await buildMorphoPositionRows(
      got.map((g) => g.raw),
      { chainId: BASE_CHAIN_ID, markets: got.map((g) => g.market) },
    );
    const cardById = new Map(cards.map((s) => [s.positionId, s]));

    return {
      reads: 1,
      positions: open.map((p): WalletPosition => {
        // The figures stay the sweep's, so the section states no total (rule 743).
        if (closed.has(p.positionId)) return { ...p, closedSince: { block }, headRead: "stored" };
        const s = cardById.get(p.positionId);
        if (!s) return { ...p, headRead: "failed" };
        const prior = p.card as { vaultOwner: ReturnType<typeof morphoBaseVaultOwnerNote> };
        const debt = s.borrowed.amount;
        const value = s.listed?.collateralValue ?? null;
        const ltv = debt > 0 && value != null && value > 0 ? debt / value : null;
        return {
          ...p,
          card: { kind: "morpho-base", row: s, read: "wallet", vaultOwner: prior.vaultOwner },
          buffer: ltv != null && s.lltv > 0 ? 1 - ltv / s.lltv : undefined,
          riskFigure: ltv != null ? { value: `${pct(ltv)} LTV`, label: `LLTV ${pct(s.lltv)}` } : undefined,
          liquidatable: ltv != null ? ltv > s.lltv : undefined,
          dustUsd: DOLLAR_LOANS.has(s.loanSymbol.toUpperCase()) && value != null ? value : undefined,
          headRead: "read",
          readAtBlock: block,
          readAt: at,
        };
      }),
    };
  },
};
