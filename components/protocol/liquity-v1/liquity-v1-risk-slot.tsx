"use client";

// The Liquity V1 Trove card's collateral ratio and panel rows (ui-jobs 209,
// TO-DO-position-card 322), from the page's live read, inside the card's
// receipts scope:
//
//   • the third headline: TroveManager.getCurrentICR, computed on the contract;
//   • the panel's queue rows: redemptions take the lowest-ratio Troves first,
//     so the ratio sets the Trove's place (the debt and Troves in front);
//   • "Liquidates at" the ETH price that brings the ratio to the 110% minimum;
//   • the room left to borrow before the active minimum;
//   • Recovery Mode, while it is on, as the card's notice.
//
// The redemption fees and the system ratio are protocol-wide context and live
// on the system view and in the Explanation.

import { AlertTriangle } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { StatValue } from "@/components/shared/stat-value";
import { AmountText } from "@/components/shared/amount-text";
import { TokenFigure } from "@/components/shared/token-figure";
import { FadeNumber } from "@/components/ui/FadeNumber";
import { fmtLusd } from "@/lib/liquity-v1/event-figures";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fmtPrice } from "@/components/shared/price-pill";
import type { PositionPanelColumns } from "@/components/shared/position-card";
import {
  icrProv,
  ratioConstantProv,
  borrowHeadroomProv,
  systemStateProv,
  liquidationPriceProv,
  queueShareProv,
  debtInFrontProv,
  trovesAheadProv,
} from "@/lib/liquity-v1/position-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { V1_WORDS } from "@/lib/liquity-v1/event-templates";
import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";

/** Whether the read describes an active Trove with debt and a live ratio. */
export function liquityV1HasRisk(chain: LiquityV1PositionChainResponse): boolean {
  return !chain.chainStale && chain.troveStatus === "active" && chain.debt > 0 && chain.icr != null;
}

/** The headline: the Trove's collateral ratio. */
export function LiquityV1RiskHeadline({ chain }: { chain: LiquityV1PositionChainResponse }) {
  if (chain.icr == null) return null;
  return (
    <StatValue>
      <Prov info={icrProv()}>
        <FadeNumber value={chain.icr * 100} decimals={1} />%
      </Prov>
    </StatValue>
  );
}

/** The panel: the redemption queue on the left, the liquidation price and the
 *  room to borrow on the right. */
export function liquityV1Panel(chain: LiquityV1PositionChainResponse): PositionPanelColumns {
  if (!liquityV1HasRisk(chain)) return [[], []];
  const liqPrice = chain.coll > 0 ? (chain.debt * chain.mcr) / chain.coll : null;
  // Headroom to the ACTIVE minimum: 110% normally; while the system is in
  // Recovery Mode a Trove below 150% is at risk, so that becomes the line.
  const activeRatio = chain.recoveryMode ? chain.ccr : chain.mcr;
  const activeLabel = pct(activeRatio);
  const headroomLusd = Math.max(0, (chain.coll * chain.price) / activeRatio - chain.debt);
  const share =
    chain.debtInFront != null && chain.queueDebtTotal != null && chain.queueDebtTotal > 0
      ? Math.min(1, chain.debtInFront / chain.queueDebtTotal)
      : null;
  return [
    [
      ...(chain.debtInFront != null
        ? [
            {
              id: "debt-in-front",
              label: "Debt in front",
              tip: V1_WORDS.tip_debt_in_front,
              value: (
                <>
                  <TokenFigure symbol={DEBT_SYMBOL} figure={`${fmtLusd(chain.debtInFront)} ${DEBT_SYMBOL}`}>
                    <Prov info={debtInFrontProv()}>
                      <AmountText value={chain.debtInFront} format="compact" />
                    </Prov>
                  </TokenFigure>
                  {share != null && (
                    <span className="text-rb-500">
                      {" "}
                      · <Prov info={queueShareProv()}>{pct(share)}</Prov> of the queue
                    </span>
                  )}
                </>
              ),
            },
          ]
        : []),
      ...(chain.trovesAhead != null
        ? [
            {
              id: "troves-in-front",
              label: "Troves in front",
              tip: "How many Troves sit ahead of this one in the redemption queue, counted from the same sweep of the protocol's sorted Trove list.",
              value: <Prov info={trovesAheadProv()}>{chain.trovesAhead.toLocaleString("en-US")}</Prov>,
            },
          ]
        : []),
    ],
    [
      ...(liqPrice != null
        ? [
            {
              id: "liquidates-at",
              label: "Liquidates at",
              tip: "The ETH price at which this Trove's collateral ratio reaches the 110% minimum: its debt times 110% over its collateral, from the TroveManager's reads at the latest block.",
              value: (
                <span className="inline-flex items-center gap-1">
                  <TokenChipIcon symbol={COLLATERAL_SYMBOL} size={14} filterable={false} />
                  <Prov info={liquidationPriceProv({ debt: chain.debt, coll: chain.coll })}>{fmtPrice(liqPrice)}</Prov>
                </span>
              ),
            },
          ]
        : []),
      {
        id: "room-to-borrow",
        label: "Room to borrow",
        tip: `The LUSD this Trove could still owe before its ratio falls to the ${activeLabel} minimum${chain.recoveryMode ? " that Recovery Mode applies" : ""}, from its collateral at the PriceFeed price at the latest block.`,
        value: (
          <Prov info={borrowHeadroomProv(activeLabel)}>
            <AmountText value={headroomLusd} format="compact" />
          </Prov>
        ),
        asset: { symbol: DEBT_SYMBOL, figure: `${fmtLusd(headroomLusd)} ${DEBT_SYMBOL}` },
      },
    ],
  ];
}

/** Recovery Mode while it is on: the minimum that puts a Trove at risk rises
 *  to the system ratio. Null otherwise. */
export function liquityV1RecoveryNotice(chain: LiquityV1PositionChainResponse) {
  if (!liquityV1HasRisk(chain) || !chain.recoveryMode) return null;
  return (
    <div className="notice-caution flex items-start gap-2 p-3 mb-2 text-sm text-caution-700 dark:text-caution-400">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <p>
        Recovery Mode is on. The system ratio is{" "}
        <Prov info={systemStateProv("Total collateral ratio", "getTCR(price)")}>{pct(chain.tcr)}</Prov>, under the{" "}
        <Prov info={ratioConstantProv("Critical collateral ratio", "CCR")}>{pct(chain.ccr)}</Prov> critical ratio, and a
        Trove below the system ratio is at risk of liquidation.
      </p>
    </div>
  );
}
