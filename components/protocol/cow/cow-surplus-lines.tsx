"use client";

// A CoW swap's two lines under the grid (lib/cow/surplus.ts): the surplus,
// received beyond the limit signed on a sell order or returned to the wallet
// from the unused limit on a buy order, and the fees in the trade's price.
// Each figure carries its receipt (lib/cow/surplus-provenance.ts). Drawn as
// the Aave V3 card draws the amounts behind a swap (`data-event-row-lines`).

import { Prov } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ExactTip } from "@/components/shared/amount-text";
import { fmtPositionAmount } from "@/components/shared/position-row";
import { COW_FEE_LABEL, COW_SURPLUS_LABEL, feeBpText, shiftRaw, type CowSwapView } from "@/lib/cow/surplus";
import { cowFeeProv, cowSurplusProv, type CowCoords, type CowTradeRaw } from "@/lib/cow/surplus-provenance";

export function CowSurplusLines({
  view,
  trade,
  coords,
  symbol,
}: {
  view: CowSwapView;
  trade: CowTradeRaw;
  coords: CowCoords;
  /** The surplus token's name on the card, where it differs from the token's symbol. */
  symbol?: string;
}) {
  const sym = symbol ?? view.token.symbol ?? undefined;
  const exact = view.token.decimals == null ? view.surplus : shiftRaw(view.surplus, view.token.decimals);
  const text = view.token.decimals == null ? `${view.surplus} (raw)` : fmtPositionAmount(Number(exact));
  return (
    <div className="space-y-1 px-5 pb-2 text-sm" data-event-row-lines="" data-cow-surplus={view.kind}>
      <div className="text-rb-500" data-event-row-line="">
        {COW_SURPLUS_LABEL[view.kind]}{" "}
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
      <div className="text-rb-500" data-event-row-line="" data-cow-fee="">
        {COW_FEE_LABEL}{" "}
        <Prov info={cowFeeProv(view, trade, coords)} value={String(view.feeBp)}>
          <span className="font-semibold tabular-nums text-foreground">{feeBpText(view.feeBp)}</span>
        </Prov>
      </div>
    </div>
  );
}
