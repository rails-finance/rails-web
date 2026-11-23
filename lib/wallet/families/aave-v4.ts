// Aave V4 on Ethereum, Base and Arc, for the wallet view (decisions 0050 step
// 3 and 0071; SERVER-ONLY). On Ethereum and Base the card is the family's
// spoke-positions listing row, as rails-server's route answers it and the
// listing proxies pass it on unchanged, so no builder runs. On Arc the card
// is one spoke of GET /api/at-block/aave-v4-arc/wallet, which rails-server
// stores at each read of the wallet there. Every figure is that stored read's,
// at its block: no head read.

import type { AaveV4SpokePositionRow } from "@/lib/api/fetch-aave-v4-spoke-positions";
import { hfLabelV4 } from "@/lib/aave-v4/format";
import { arcWalletSpokes } from "@/lib/aave-v4-arc/position";
import type { ArcWalletRead } from "@/lib/aave-v4-arc/types";
import { ARC_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { WalletPosition, WalletPositionStatus } from "@/lib/wallet/types";
import {
  amountText,
  bufferFromHealth,
  historyBase,
  opt,
  plural,
  storeStamp,
  type WalletSummaryRow,
} from "@/lib/wallet/summary-row";
import type { FamilyModule } from "./module";

/** "$2.1M": a peak in dollars, for the History table. */
const usdText = (n: number | null | undefined) => (n != null && n > 0 ? `$${amountText(n, null)}` : undefined);

function sizeOf(supply: string | undefined, debt: string | undefined) {
  if (!supply && !debt) return {};
  return { size: [supply ?? "nothing supplied", debt].filter(Boolean).join(" / "), sizeNote: "highest recorded" };
}

const liquidations = (n: number | null | undefined) => (n != null && n > 0 ? plural(n, "liquidation") : undefined);

const asStatus = (s: WalletSummaryRow["status"]): WalletPositionStatus => s;

/** The risk fields of a stored health factor; none without debt. */
function healthOf(hf: number | null | undefined) {
  if (hf == null || !Number.isFinite(hf)) return {};
  return {
    buffer: bufferFromHealth(hf),
    riskFigure: { value: `${hfLabelV4(hf)} HF`, label: "Health factor" },
    liquidatable: hf < 1,
  };
}

// ── Aave V4, Ethereum and Base ──────────────────────────────────────────────

function aaveV4Lane(lane: "ethereum" | "base"): FamilyModule {
  const chain: ChainId = lane === "ethereum" ? MAINNET_CHAIN_ID : BASE_CHAIN_ID;
  const oracle = lane === "ethereum" ? "Aave V4 oracle" : "Aave V4 Base oracle";
  return {
    id: lane === "ethereum" ? "aave-v4" : "aave-v4-base",
    name: "Aave V4",
    chain,
    summaryChain: lane,
    summaryFamily: "aave-v4",
    async shape(rows) {
      return rows.map((r): WalletPosition => {
        const row = r.card as AaveV4SpokePositionRow;
        const status = asStatus(r.status);
        const base: WalletPosition = {
          chain,
          family: "aave-v4",
          familyName: "Aave V4",
          market: row.spokeName ?? opt(r.market),
          positionId: r.positionId,
          href: r.href,
          status,
          card: { kind: "aave-v4", lane, row, storedAtBlock: opt(r.readBlock) },
          collateralUsd: opt(r.collateralUsd),
          debtUsd: opt(r.debtUsd),
          usdSource: r.usdSource ?? oracle,
          usdOwnOracle: r.collateralUsd != null || r.debtUsd != null,
          headRead: "none",
          ...storeStamp(r),
        };
        if (status !== "open") {
          return {
            ...base,
            history: {
              ...historyBase(r),
              ...sizeOf(usdText(row.peakSupplyUsd), usdText(row.peakDebtUsd)),
              result: liquidations(row.liquidationCount),
            },
          };
        }
        return { ...base, ...healthOf(row.healthFactor), headRead: "stored" };
      });
    },
  };
}

export const aaveV4Ethereum = aaveV4Lane("ethereum");
export const aaveV4Base = aaveV4Lane("base");

// ── Aave V4 on Arc ──────────────────────────────────────────────────────────

/** The stored card of an Arc row (rails-server's arcWalletPositionRows): one
 *  spoke of the wallet read beside the read's head. Every row is open: a read
 *  at the head states what is held. */
type ArcSpokeRead = ArcWalletRead["spokes"][number];
interface ArcCard
  extends Pick<ArcWalletRead, "chainId" | "head" | "wallet">,
    Omit<ArcSpokeRead, "key" | "name" | "address"> {
  spoke: string;
  spokeName: string;
  spokeAddress: string;
}

/** The card as the Arc wallet read's answer with its one spoke. */
function arcReadOf(c: ArcCard): ArcWalletRead {
  return {
    chainId: c.chainId,
    head: c.head,
    provider: "",
    wallet: c.wallet,
    spokes: [
      {
        key: c.spoke,
        name: c.spokeName,
        address: c.spokeAddress,
        oracle: c.oracle,
        priceDecimals: c.priceDecimals,
        account: c.account,
        reserves: c.reserves,
      },
    ],
  };
}

export const aaveV4Arc: FamilyModule = {
  id: "aave-v4-arc",
  name: "Aave V4",
  chain: ARC_CHAIN_ID,
  summaryChain: "arc",
  summaryFamily: "aave-v4",
  async shape(rows) {
    return rows.map((r): WalletPosition => {
      const read = arcReadOf(r.card as ArcCard);
      const spoke = arcWalletSpokes(read)[0];
      return {
        chain: ARC_CHAIN_ID,
        family: "aave-v4",
        familyName: "Aave V4",
        market: spoke?.name ?? opt(r.market),
        positionId: r.positionId,
        href: r.href,
        status: "open",
        card: { kind: "aave-v4", lane: "arc", read },
        collateralUsd: opt(r.collateralUsd),
        debtUsd: opt(r.debtUsd),
        usdSource: r.usdSource ?? "Aave V4 Arc spoke oracle",
        usdOwnOracle: r.collateralUsd != null || r.debtUsd != null,
        ...healthOf(spoke?.healthFactor),
        headRead: "stored",
        ...storeStamp(r),
      };
    });
  },
};
