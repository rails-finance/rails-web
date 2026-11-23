"use client";

// One Euler V2 (sub-account, vault) pair on the wallet view (W3; decision
// 0071), drawn through the shared position card as a listing row: what the
// pair's shares redeem for and what it owes, from the explorer's wallet read
// (J3's figures, with J3's receipts), the vault and the account as the tag.
// A stored pair (a closed one, or one the head read did not reach) states its
// flags alone: the store holds shares and no asset amount (lib/euler/wallet-card.ts).

import { PositionCard, type PositionCardHead, type PositionCardStatus } from "@/components/shared/position-card";
import { ListingTag } from "@/components/shared/listing-tag";
import { Prov } from "@/components/shared/provenance";
import { walletRowProv } from "@/lib/euler/provenance";
import type { EulerWalletRow } from "@/lib/euler/position";
import type { EulerWalletCardRow } from "@/lib/euler/wallet-card";
import { CARD_WORDS, num, short } from "@/lib/euler/words";

const STATUS: Record<EulerWalletCardRow["status"], PositionCardStatus | null> = {
  open: null,
  closed: { word: "Closed", tone: "muted" },
  liquidated: { word: "Liquidated", tone: "danger" },
};

export function EulerWalletCard({ row }: { row: EulerWalletCardRow }) {
  const r = row.read;
  const figure = (x: EulerWalletRow | null) =>
    x && r ? (
      <Prov info={walletRowProv(x, r.wallet)}>
        {num(x.amount)} {x.asset.symbol}
      </Prov>
    ) : null;
  const heads: PositionCardHead[] = [];
  if (row.controller || r?.loan)
    heads.push({ id: "borrowed", label: CARD_WORDS.borrowed, tier: "amount", value: figure(r?.loan ?? null) });
  if (!row.controller || r?.deposit)
    heads.push({
      id: "supplied",
      label: CARD_WORDS.supplied,
      tier: "amount",
      value: figure(r?.deposit ?? null),
      sub: row.collateral ? CARD_WORDS.collateralFor : undefined,
    });
  const vault = (r?.deposit ?? r?.loan)?.vaultSymbol ?? short(row.vault);
  return (
    <div data-euler-wallet-pair={`${row.account}:${row.vault}`} data-euler-read={r ? "head" : "stored"}>
      <PositionCard
        slots={{
          surface: "listing",
          status: STATUS[row.status],
          heads,
          counters: null,
          menu: null,
          tag: <ListingTag market={vault} id={row.account} />,
        }}
      />
    </div>
  );
}
