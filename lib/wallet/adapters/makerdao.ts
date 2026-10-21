// MakerDAO on Ethereum, for the wallet view (decision 0050, step 2). The vault
// listing filtered to the owner EOA, then, for an open vault, the Vat read the
// vault page makes (/api/chain/makerdao/vault/<id>): the collateral at the
// OSM price, the debt in DAI, and the liquidation price against `mat`.

import { fetchMakerVaults } from "@/lib/api/fetch-makerdao-vaults";
import type { MakerVaultState } from "@/lib/sources/chain/makerdao-position";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import { amountText, hopJson, walletReadContext, type WalletReadContext } from "@/lib/wallet/read-context";

export async function readWalletPositions(address: string, ctx?: WalletReadContext): Promise<WalletPosition[]> {
  const c = ctx ?? (await walletReadContext());
  const answer = await fetchMakerVaults({
    owner: address,
    limit: 100,
    baseUrl: c.hop.baseUrl,
    headers: c.hop.headers,
    signal: c.signal,
  });
  return Promise.all(
    answer.data.map(async (s): Promise<WalletPosition> => {
      const status: WalletPositionStatus =
        s.status === "liquidated" ? "liquidated" : s.status === "closed" ? "closed" : "open";
      const id = s.cdpId ?? s.urn;
      const base: WalletPosition = {
        chain: MAINNET_CHAIN_ID,
        family: "makerdao",
        familyName: "MakerDAO",
        market: s.ilk,
        positionId: id,
        href: `/ethereum/makerdao/${id}`,
        status,
        card: { kind: "makerdao", row: s },
        usdSource: "MakerDAO OSM price, debt in DAI",
      };
      if (status !== "open") {
        const parts = [
          s.peak.collateral > 0 ? amountText(s.peak.collateral, s.collateralSymbol) : null,
          s.peak.debtDai != null && s.peak.debtDai > 0 ? amountText(s.peak.debtDai, "DAI") : null,
        ].filter(Boolean);
        return {
          ...base,
          history: {
            closedAt: s.activity.lastEventAt ?? undefined,
            size: parts.length ? parts.join(" / ") : undefined,
            sizeNote: parts.length ? "highest recorded" : undefined,
            result: s.everLiquidated ? "liquidated by auction" : undefined,
            txCount: s.activity.txCount,
          },
        };
      }
      const q = s.cdpId ? "" : `?ilk=${encodeURIComponent(s.ilk)}`;
      const live = await hopJson<{ state: MakerVaultState | null }>(
        c,
        `/api/chain/makerdao/vault/${encodeURIComponent(id)}${q}`,
      );
      const st = live?.state;
      if (!st) {
        return {
          ...base,
          collateralUsd: s.collateral.valueUsd ?? undefined,
          debtUsd: s.debt.dai ?? undefined,
        };
      }
      const cr = st.collateralUsd != null && st.debtDai > 0 ? st.collateralUsd / st.debtDai : null;
      return {
        ...base,
        collateralUsd: st.collateralUsd ?? undefined,
        debtUsd: st.debtDai,
        buffer:
          st.liquidationPriceUsd != null && st.priceUsd != null && st.priceUsd > 0
            ? 1 - st.liquidationPriceUsd / st.priceUsd
            : undefined,
        riskFigure:
          cr != null
            ? {
                value: `${(cr * 100).toFixed(1)}% CR`,
                label: st.matRatio != null ? `liquidates below ${(st.matRatio * 100).toFixed(0)}%` : "Collateral ratio",
              }
            : undefined,
        liquidatable: cr != null && st.matRatio != null ? cr < st.matRatio : undefined,
        debtRate: st.debtDai > 0 ? (st.stabilityFeeApr ?? undefined) : undefined,
        readAtBlock: st.atBlock,
        readAt: st.blockTimestamp,
      };
    }),
  );
}
