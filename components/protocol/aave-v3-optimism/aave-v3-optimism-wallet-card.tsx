"use client";

// An Aave V3 account on Optimism as the wallet view lists it (W3; rails-ops
// decision 0071): Supplied, Debt and Health factor at Aave's oracle, each with
// the receipt the explorer's account card gives it, from the explorer's wallet
// read at its head block. Supplied's receipt also states the collateral the
// wallet total sums. The E-Mode category, where set, is the tag.

import { PositionCard, type PositionCardHead } from "@/components/shared/position-card";
import { ListingTag } from "@/components/shared/listing-tag";
import { Prov } from "@/components/shared/provenance";
import { opPosition } from "@/lib/aave-v3-optimism/position";
import { opCardProv, opWalletSuppliedProv, type OpReceiptContext } from "@/lib/aave-v3-optimism/provenance";
import type { OpPositionRead } from "@/lib/aave-v3-optimism/types";
import { CARD_WORDS, hfText, usd } from "@/lib/aave-v3-optimism/words";

export function AaveV3OptimismWalletCard({ read }: { read: OpPositionRead }) {
  const p = opPosition(read);
  const c: OpReceiptContext = { p, r: read };
  const heads: PositionCardHead[] = [
    {
      id: "supplied",
      label: CARD_WORDS.supplied,
      labelTip: CARD_WORDS.suppliedTip,
      tier: "amount",
      value: p.supplied.length > 0 ? <Prov info={opWalletSuppliedProv(c)}>{usd(p.suppliedUsd)}</Prov> : null,
    },
    {
      id: "debt",
      label: CARD_WORDS.debt,
      labelTip: CARD_WORDS.debtTip,
      tier: "amount",
      value: p.borrowed.length > 0 ? <Prov info={opCardProv("debt-total", c)}>{usd(p.debtUsd)}</Prov> : null,
    },
    {
      id: "health-factor",
      label: CARD_WORDS.health,
      labelTip: CARD_WORDS.healthTip,
      value:
        p.healthFactor != null ? (
          <Prov info={opCardProv("health", c)}>{hfText(p.healthFactor)}</Prov>
        ) : (
          <span className="text-rb-500">{CARD_WORDS.noDebt}</span>
        ),
    },
  ];
  return (
    <div data-position-card={`aave-v3-optimism:${read.wallet}`}>
      <PositionCard
        slots={{
          surface: "listing",
          status: p.healthFactor != null && p.healthFactor < 1 ? { word: "Liquidatable", tone: "caution" } : null,
          heads,
          tag: p.emode ? <ListingTag market={CARD_WORDS.emode(p.emode.label)} /> : undefined,
          counters: null,
          menu: null,
        }}
      />
    </div>
  );
}
