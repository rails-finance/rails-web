// Fluid on Ethereum, for the wallet view (decision 0050, step 2). The listing
// route filtered to the NFT's current owner, then, for an open NFT with debt,
// the VaultResolver read the position page makes: the position ratio against
// the vault's liquidation threshold, in the vault's own token pair. Fluid
// states no dollars, so its positions add nothing to the tiles' sums.

import { fetchFluidPositions } from "@/lib/api/fetch-fluid-positions";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import { amountText, hopJson, walletReadContext, type WalletReadContext } from "@/lib/wallet/read-context";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export async function readWalletPositions(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  const c = ctx ?? (await walletReadContext());
  const answer = await fetchFluidPositions({
    wallet: address,
    limit: 100,
    baseUrl: c.hop.baseUrl,
    headers: c.hop.headers,
    signal: c.signal,
  });
  return Promise.all(
    answer.data.map(async (s): Promise<WalletPosition> => {
      const status: WalletPositionStatus = s.status === "open" ? "open" : s.fullyLiquidated ? "liquidated" : "closed";
      const pair = [s.supplySymbol, s.borrowSymbol].filter(Boolean).join(" / ");
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "fluid",
        familyName: "Fluid",
        market: pair || undefined,
        positionId: s.nftId,
        href: `/ethereum/fluid/${s.nftId}`,
        status,
        card: { kind: "fluid", row: s },
      };
      if (status !== "open") {
        // The peaks arrive as decimal strings in each leg's own units.
        const col = Number(s.peakCol) || 0;
        const debt = Number(s.peakDebt) || 0;
        const parts = [
          col > 0 ? amountText(col, s.supplySymbol) : null,
          debt > 0 ? amountText(debt, s.borrowSymbol) : null,
        ].filter(Boolean);
        return {
          ...base,
          history: {
            closedAt: (s.fullyLiquidated ? s.lastLiquidationAt : null) ?? s.lastActivityAt ?? undefined,
            openedAt: s.firstActivityAt ?? undefined,
            size: parts.length ? parts.join(" / ") : undefined,
            sizeNote: parts.length ? "highest recorded" : undefined,
            result:
              s.liquidationCount > 0
                ? `${s.liquidationCount} ${s.liquidationCount === 1 ? "liquidation" : "liquidations"}`
                : undefined,
            txCount: s.txCount,
          },
        };
      }
      const live = await hopJson<FluidPositionChainResponse>(
        c,
        `/api/chain/fluid/position?nft=${encodeURIComponent(s.nftId)}`,
      );
      if (!live || !live.found || live.isSupplyPosition || live.ratio == null || live.liquidationThreshold <= 0) {
        return live?.found ? { ...base, readAtBlock: live.blockNumber, readAt: Math.floor(Date.now() / 1000) } : base;
      }
      return {
        ...base,
        buffer: 1 - live.ratio / live.liquidationThreshold,
        riskFigure: { value: `${pct(live.ratio)} ratio`, label: `liquidates above ${pct(live.liquidationThreshold)}` },
        liquidatable: live.ratio > live.liquidationThreshold,
        debtRate: live.borrowRatePct != null ? live.borrowRatePct / 100 : undefined,
        readAtBlock: live.blockNumber,
        readAt: Math.floor(Date.now() / 1000),
      };
    }),
  );
}
