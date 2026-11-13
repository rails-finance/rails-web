"use client";

// The Moonwell position card's risk figures from the page's live Comptroller
// read (rails-ops TO-DO-position-card 322; ui-jobs 632), as slots of the
// shared card, in Moonwell's docs' words ("Credit and Liquidations"):
//
//   • the Credit remaining headline: the credit limit less the debt, over the
//     credit limit, the docs' percentage ("[$600 − $100] ÷ $600 = 83.3%"). The
//     credit limit is the collateral-factor-weighted capacity, proven exact
//     against getAccountLiquidity by scripts/verify-moonwell-chain.mjs;
//   • the panel's rows: the credit limit and the credit remaining in dollars
//     (the Comptroller's account liquidity, or its shortfall below zero). The
//     drop the collateral basket can take before liquidation is the headline's
//     share, so the panel does not repeat it.
//
// The verdict in words is the Explanation's.

import { serverReadOf } from "@/lib/shared/server-head-read";
import { Prov } from "@/components/shared/provenance";
import type { PositionCardHead, PositionPanelRow } from "@/components/shared/position-card";
import { formatCompactUsd } from "@/lib/shared/format-compact";
import { creditRemainingShare, creditRemainingText } from "@/lib/moonwell/credit-remaining";
import { moonwellCapacityProv, comptrollerVerdictProv, type MoonwellLane } from "@/lib/moonwell/position-provenance";
import { useMoonwellDeployment } from "@/lib/moonwell/deployment-context";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";

const CREDIT_REMAINING_TIP =
  "The share of the credit limit still unborrowed: the credit limit less the debt, over the credit limit. The credit limit is each entered market's supply counted up to its collateral factor. At 0% the account can be liquidated.";

/** Which Comptroller, through which route, every receipt here names. */
function useLane(): MoonwellLane {
  const dep = useMoonwellDeployment();
  return { comptroller: dep.comptroller, positionRoute: dep.positionRoute };
}

function CreditShareValue({ share, chain }: { share: number; chain: MoonwellChainResponse }) {
  const lane = useLane();
  return (
    <Prov
      info={moonwellCapacityProv(
        "Credit remaining",
        "(credit limit − debt value) ÷ credit limit",
        lane,
        serverReadOf(chain),
      )}
    >
      {creditRemainingText(share)}
    </Prov>
  );
}

function LimitValue({ chain }: { chain: MoonwellChainResponse }) {
  const lane = useLane();
  return (
    <Prov
      info={moonwellCapacityProv(
        "Credit limit",
        "Σ entered supply × price × collateral factor",
        lane,
        serverReadOf(chain),
      )}
    >
      {formatCompactUsd(chain.collateralCapacityUsd)}
    </Prov>
  );
}

function RemainingValue({ chain }: { chain: MoonwellChainResponse }) {
  const lane = useLane();
  const short = chain.shortfallUsd > 0;
  return (
    <Prov info={comptrollerVerdictProv("Credit remaining", lane, serverReadOf(chain))}>
      {short ? `−${formatCompactUsd(chain.shortfallUsd)}` : formatCompactUsd(chain.liquidityUsd)}
    </Prov>
  );
}

/** The Credit remaining headline for an account with debt; null without debt.
 *  Pending while the read is out, a dash where the credit limit is zero. */
export function moonwellCreditHead(chain: MoonwellChainResponse | null, hasDebt: boolean): PositionCardHead | null {
  if (!hasDebt) return null;
  const base = { id: "credit-remaining", label: "Credit remaining", labelTip: CREDIT_REMAINING_TIP };
  if (!chain) return { ...base, value: null, pending: true };
  const share = chain.debtValueUsd > 0 ? creditRemainingShare(chain.collateralCapacityUsd, chain.debtValueUsd) : null;
  if (share == null) return { ...base, value: null };
  return { ...base, value: <CreditShareValue share={share} chain={chain} /> };
}

/** The panel rows the read adds on the debt side: the credit limit and the
 *  credit remaining in dollars. */
export function moonwellRiskRows(chain: MoonwellChainResponse | null): PositionPanelRow[] {
  if (!chain || !(chain.debtValueUsd > 0)) return [];
  return [
    {
      id: "credit-limit",
      label: "Credit limit",
      tip: "The most the account can borrow: each entered market's supply in dollars times its collateral factor, added up.",
      value: <LimitValue chain={chain} />,
    },
    {
      id: "credit-remaining-usd",
      label: "Credit remaining",
      tip: "How many more dollars the account can borrow: the credit limit less the debt, as the Comptroller's account liquidity states it. Below zero it is the shortfall, and the account can be liquidated.",
      value: <RemainingValue chain={chain} />,
    },
  ];
}
