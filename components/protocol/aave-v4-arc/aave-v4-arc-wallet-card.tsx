"use client";

// One Aave V4 spoke account on Arc as the wallet view lists it: the spoke as
// the tag, and Supplied, Debt and Health factor at the spoke's oracle, each
// with the receipt the Arc wallet page gives it. Drawn from one spoke of the
// at-block wallet read, as rails-server stored it at its block.

import { PositionCard, type PositionCardHead } from "@/components/shared/position-card";
import { ListingTag } from "@/components/shared/listing-tag";
import { Prov } from "@/components/shared/provenance";
import { WalletPill } from "@/components/shared/wallet-pill";
import { arcWalletSpokes } from "@/lib/aave-v4-arc/position";
import { arcWalletHealthProv, arcWalletProv } from "@/lib/aave-v4-arc/provenance";
import { ARC_SESSION, type ArcWalletRead } from "@/lib/aave-v4-arc/types";
import { CARD_WORDS, hfText, usd } from "@/lib/aave-v4-arc/words";

export function AaveV4ArcWalletCard({ read }: { read: ArcWalletRead }) {
  const s = arcWalletSpokes(read)[0];
  if (!s) return null;
  const heads: PositionCardHead[] = [
    {
      id: "supplied",
      label: CARD_WORDS.supplied,
      labelTip: CARD_WORDS.suppliedTip,
      tier: "amount",
      value: s.supplied.length > 0 ? <Prov info={arcWalletProv("supplied", s, read)}>{usd(s.suppliedUsd)}</Prov> : null,
    },
    {
      id: "debt",
      label: CARD_WORDS.debt,
      labelTip: CARD_WORDS.debtTip,
      tier: "amount",
      value: s.borrowed.length > 0 ? <Prov info={arcWalletProv("debt", s, read)}>{usd(s.debtUsd)}</Prov> : null,
    },
    {
      id: "health-factor",
      label: CARD_WORDS.health,
      labelTip: CARD_WORDS.healthTip,
      value:
        s.healthFactor != null ? (
          <Prov info={arcWalletHealthProv(s, read)}>{hfText(s.healthFactor)}</Prov>
        ) : (
          <span className="text-rb-500">{CARD_WORDS.noDebt}</span>
        ),
    },
  ];
  return (
    <div data-position-card={`aave-v4-arc:${s.key}:${read.wallet}`} data-spoke={s.address}>
      <PositionCard
        slots={{
          surface: "listing",
          status: s.healthFactor != null && s.healthFactor < 1 ? { word: "Liquidatable", tone: "caution" } : null,
          heads,
          tag: <ListingTag market={s.name} />,
          identity: <WalletPill wallet={read.wallet} ensName={null} filterProtocol={ARC_SESSION} bookmark />,
          counters: null,
          menu: null,
        }}
      />
    </div>
  );
}
