"use client";

// The Liquity V1 Trove card's collateral ratio (ui-jobs 209): the third
// headline and the lines under it in the opened layer, from the page's live
// read, inside the card's receipts scope:
//
//   • the headline: TroveManager.getCurrentICR, computed on the contract;
//   • "Liquidates at" the ETH price that brings the ratio to the 110% minimum,
//     and the price bar measuring the fall to it;
//   • the redemption queue: redemptions take the lowest-ratio Troves first, so
//     the ratio sets the Trove's place (the bar, the share of the queue's debt
//     ahead of it);
//   • the room left to borrow before the active minimum, and the system ratio
//     against the 150% that starts Recovery Mode.
//
// The redemption fees and the debt in front in LUSD are protocol-wide context
// and live on the system view and in the Explanation.

import { Prov } from "@/components/shared/provenance";
import { pct } from "@/components/shared/ratio-bar";
import { RiskFigure } from "@/components/shared/risk-footer-strip";
import { StatValue } from "@/components/shared/stat-value";
import { AmountText } from "@/components/shared/amount-text";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { fmtPrice } from "@/components/shared/price-pill";
import { RedemptionRunway } from "@/components/shared/redemption-runway";
import { LiquityV1Runway } from "@/components/protocol/liquity-v1/liquity-v1-runway";
import {
  icrProv,
  ratioConstantProv,
  borrowHeadroomProv,
  systemStateProv,
  liquidationPriceProv,
  queueShareProv,
} from "@/lib/liquity-v1/position-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
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
      <Prov info={icrProv()}>{pct(chain.icr)}</Prov>
    </StatValue>
  );
}

/** Under the headline: the liquidation price and its bar, the redemption
 *  queue, the room left to borrow and the system ratio. */
export function LiquityV1RiskDetail({ chain }: { chain: LiquityV1PositionChainResponse }) {
  if (!liquityV1HasRisk(chain)) return null;
  const liqPrice = chain.coll > 0 ? (chain.debt * chain.mcr) / chain.coll : null;
  // Headroom to the ACTIVE minimum: 110% normally; while the system is in
  // Recovery Mode a Trove below 150% is at risk, so that becomes the line.
  const activeRatio = chain.recoveryMode ? chain.ccr : chain.mcr;
  const activeLabel = pct(activeRatio);
  const headroomLusd = Math.max(0, (chain.coll * chain.price) / activeRatio - chain.debt);
  const queued = chain.debtInFront != null && chain.queueDebtTotal != null && chain.queueDebtTotal > 0;
  return (
    <>
      {liqPrice != null && (
        <div className="text-xs mt-0.5 text-rb-500 inline-flex items-center gap-1">
          Liquidates at
          <TokenChipIcon symbol={COLLATERAL_SYMBOL} size={14} filterable={false} />
          <Prov info={liquidationPriceProv({ debt: chain.debt, coll: chain.coll })}>{fmtPrice(liqPrice)}</Prov>
        </div>
      )}
      <div className="mt-1.5 max-w-72 space-y-1">
        <LiquityV1Runway chain={chain} />
        {queued && (
          <RedemptionRunway
            debtInFront={chain.debtInFront as number}
            queueDebtTotal={chain.queueDebtTotal as number}
            shareProv={queueShareProv()}
            markerTitle="This Trove's place in the redemption queue — everything left of the marker is redeemed first"
          />
        )}
        <RiskFigure alignStart>
          <Prov info={borrowHeadroomProv(activeLabel)}>
            <AmountText value={headroomLusd} format="compact" /> {DEBT_SYMBOL}
          </Prov>{" "}
          more to the{" "}
          {chain.recoveryMode ? (
            activeLabel
          ) : (
            <Prov info={ratioConstantProv("Minimum collateral ratio", "MCR")}>{activeLabel}</Prov>
          )}{" "}
          minimum
        </RiskFigure>
        <RiskFigure alignStart>
          system ratio <Prov info={systemStateProv("Total collateral ratio", "getTCR(price)")}>{pct(chain.tcr)}</Prov>
          {chain.recoveryMode ? (
            <>
              {" · "}
              <span className="font-semibold text-tone-caution">Recovery Mode: at risk below the system ratio</span>
            </>
          ) : (
            <>
              {" "}
              · Recovery Mode below{" "}
              <Prov info={ratioConstantProv("Critical collateral ratio", "CCR")}>{pct(chain.ccr)}</Prov>
            </>
          )}
        </RiskFigure>
      </div>
    </>
  );
}
