"use client";

// A CoW swap's lines under the grid (lib/cow/surplus.ts): the surplus,
// received beyond the limit signed on a sell order, and the fees in the
// trade's price. On an Aave V4 buy order the refund sentence of the
// explanation states the surplus with its receipt, so the fee line stands
// alone (`feeOnly`). Each figure carries its receipt
// (lib/cow/surplus-provenance.ts). Drawn as the Aave V3 card draws the
// amounts behind a swap (`data-event-row-lines`).

import { Prov } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ExactTip } from "@/components/shared/amount-text";
import { fmtPositionAmount } from "@/components/shared/position-row";
import { COW_FEE_LABEL, cowSurplusLabel, feeBpText, shiftRaw, type CowSwapView } from "@/lib/cow/surplus";
import { cowFeeProv, cowSurplusProv, type CowCoords, type CowTradeRaw } from "@/lib/cow/surplus-provenance";

export function CowSurplusLines({
  view,
  trade,
  coords,
  symbol,
  feeOnly = false,
  noFee = false,
}: {
  view: CowSwapView;
  trade: CowTradeRaw;
  coords: CowCoords;
  /** The surplus token's name on the card, where it differs from the token's symbol. */
  symbol?: string;
  /** Draw the fee line alone: the surplus is stated elsewhere on the card, with its receipt. */
  feeOnly?: boolean;
  /** Draw no fee line: the CoW trade card states no fee for this trade (lib/cow/settlement.ts `cardFee`). */
  noFee?: boolean;
}) {
  const sym = symbol ?? view.token.symbol ?? undefined;
  const exact = view.token.decimals == null ? view.surplus : shiftRaw(view.surplus, view.token.decimals);
  const text = view.token.decimals == null ? `${view.surplus} (raw)` : fmtPositionAmount(Number(exact));
  return (
    <div className="space-y-1 px-5 pb-2 text-sm" data-event-row-lines="" data-anatomy="T2.3">
      {!feeOnly && (
        <div className="text-rb-500" data-event-row-line="" data-cow-surplus={view.kind}>
          {cowSurplusLabel(view.kind, view.route)}{" "}
          <Prov
            info={cowSurplusProv(view, trade, coords)}
            value={exact}
            icon={sym ? <TokenChipIcon symbol={sym} address={view.token.address} size={14} /> : undefined}
          >
            <span className="font-semibold tabular-nums text-foreground">
              <ExactTip always text={text} exact={exact} symbol={sym} />
            </span>
          </Prov>
        </div>
      )}
      {!noFee && (
        <div className="text-rb-500" data-event-row-line="" data-cow-fee="">
          {COW_FEE_LABEL}{" "}
          <Prov info={cowFeeProv(view, trade, coords)} value={String(view.feeBp)}>
            <span className="font-semibold tabular-nums text-foreground">{feeBpText(view.feeBp)}</span>
          </Prov>
        </div>
      )}
    </div>
  );
}
