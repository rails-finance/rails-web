// Compound V3 on Ethereum and Base, for the wallet view (decision 0050, step
// 3; SERVER-ONLY). The card is the listing row, built by the family's listing
// builder (which reads the Comets' prices); the head read is one call of the
// existing wallet reader (loadCompoundWalletFromChain), which reads every
// Comet of the deployment for the wallet at one block: the health factor,
// the contract's isLiquidatable, the borrow rate and the borrowed balance.
// The reader runs over rails-server's answer first (/api/at-block/compound/
// position, at the chain's block B shared with the other families), waiting
// up to 3.5 s for it (walletApiWait), then reads the chain.

import {
  buildCompoundPositionRows,
  type CompoundPositionSummary,
  type RawCompoundPositionRow,
} from "@/lib/sources/api/compound-positions";
import { COMPOUND_DEPLOYMENT, type CometDeployment } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import { loadCompoundWalletFromChain } from "@/lib/sources/chain/compound-position";
import { withServerHead } from "@/lib/sources/api/lender-position-head";
import { chainClient } from "@/lib/sources/chain/rpc";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { WalletPosition } from "@/lib/wallet/types";
import { amountText, bufferFromHealth, historyBase, plural, scaled, storeStamp } from "@/lib/wallet/summary-row";
import type { FamilyModule, HeadResult } from "./module";

const priceOf = (s: CompoundPositionSummary, address: string): number | undefined =>
  s.priceByAddress?.[address.toLowerCase()];

/** The row's collateral in dollars at its Comet's prices; undefined the
 *  moment one leg is unpriced. */
function collateralUsdOf(s: CompoundPositionSummary): number | undefined {
  let sum = 0;
  for (const c of s.collateral) {
    if (c.amount <= 0) continue;
    const p = priceOf(s, c.address);
    if (c.decimalsUnread || p == null) return undefined;
    sum += c.amount * p;
  }
  return sum;
}

function lane(name: "ethereum" | "base"): FamilyModule {
  const chain: ChainId = name === "ethereum" ? MAINNET_CHAIN_ID : BASE_CHAIN_ID;
  const deployment: CometDeployment = name === "ethereum" ? COMPOUND_DEPLOYMENT : COMPOUND_BASE_DEPLOYMENT;
  const oracle = name === "ethereum" ? "Compound V3 Comet prices" : "Compound V3 Base Comet prices";
  return {
    id: name === "ethereum" ? "compound-v3" : "compound-v3-base",
    name: "Compound V3",
    chain,
    summaryChain: name,
    summaryFamily: "compound-v3",
    async shape(rows) {
      const cards = await buildCompoundPositionRows(
        rows.map((r) => r.card as RawCompoundPositionRow),
        deployment,
      );
      return rows.map((r, i): WalletPosition => {
        const s = cards[i];
        const base: WalletPosition = {
          chain,
          family: "compound-v3",
          familyName: "Compound V3",
          market: s.marketLabel,
          positionId: r.positionId,
          href: r.href,
          status: r.status,
          card: { kind: "compound-v3", lane: name, row: s },
          usdSource: oracle,
          headRead: "none",
          ...storeStamp(r),
        };
        if (r.status !== "open") {
          const coll = [...s.peak.collateral].sort((a, b) => b.amount - a.amount);
          const parts = [
            coll[0]
              ? `${amountText(coll[0].amount, coll[0].symbol)}${coll.length > 1 ? ` +${coll.length - 1}` : ""}`
              : null,
            s.peak.borrowedBase > 0 ? amountText(s.peak.borrowedBase, s.base.symbol) : null,
            s.peak.lentBase > 0 && s.peak.borrowedBase === 0
              ? `${amountText(s.peak.lentBase, s.base.symbol)} lent`
              : null,
          ].filter(Boolean);
          return {
            ...base,
            history: {
              ...historyBase(r),
              size: parts.length ? parts.join(" / ") : undefined,
              sizeNote: parts.length ? "highest recorded" : undefined,
              result: (r.liquidationCount ?? 0) > 0 ? plural(r.liquidationCount!, "absorb") : undefined,
            },
          };
        }
        return base;
      });
    },
    async head(open, address, signal, apiMs): Promise<HeadResult> {
      if (open.length === 0) return { positions: open, reads: 0 };
      const served = await withServerHead(
        { kind: "compound", family: "compound-v3", deployment: name, wallet: address },
        (client) => loadCompoundWalletFromChain(address, deployment, { reader: client }),
        { timeoutMs: apiMs, signal },
      ).catch(() => null);
      const wallet = served
        ? { ...served.answer, head: served.head }
        : await loadCompoundWalletFromChain(address, deployment, { reader: chainClient(chain) });
      if (wallet.chainStale) return { reads: 1, positions: open.map((p) => ({ ...p, headRead: "failed" })) };
      // rails-server's answer states its block's time; the chain reader states none, so its stamp is the read's.
      const at = served ? served.head.blockTime : Math.floor(Date.now() / 1000);
      return {
        reads: 1,
        positions: open.map((p): WalletPosition => {
          const s = (p.card as { row: CompoundPositionSummary }).row;
          const live = wallet.positions.find((x) => x.comet.toLowerCase() === s.comet.toLowerCase());
          // A Comet the sweep found empty: the account holds nothing there at head.
          const borrowed = live ? scaled(live.borrowBalanceRaw, live.baseDecimals) : 0;
          const basePrice = priceOf(s, s.base.address);
          const debtUsd = basePrice != null ? borrowed * basePrice : undefined;
          const hf = live?.healthFactor ?? null;
          return {
            ...p,
            collateralUsd: collateralUsdOf(s),
            debtUsd,
            usdOwnOracle: true,
            buffer: bufferFromHealth(hf),
            riskFigure:
              hf != null ? { value: `${hf >= 100 ? ">100" : hf.toFixed(2)} HF`, label: "Health factor" } : undefined,
            liquidatable: live ? live.isLiquidatable : undefined,
            debtRate: live && borrowed > 0 ? live.borrowApr : undefined,
            headRead: "read",
            readAtBlock: wallet.blockNumber,
            readAt: at,
          };
        }),
      };
    },
  };
}

export const compoundV3Ethereum = lane("ethereum");
export const compoundV3Base = lane("base");
