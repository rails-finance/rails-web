"use client";

// A wallet's Lido stake as the wallet view lists it (W3; rails-ops decision
// 0073): the stake card's Stake, stETH and wstETH figures with their receipts,
// in ETH, from the explorer's wallet read at its head block. Withdrawal
// requests not yet claimed are the tag.

import { PositionCard } from "@/components/shared/position-card";
import { ListingTag } from "@/components/shared/listing-tag";
import { lidoStakeHeads } from "@/components/protocol/lido/lido-stake-card";
import { lidoStake } from "@/lib/lido/stake";
import type { LidoStakeRead } from "@/lib/lido/types";
import { CARD_WORDS, REQUESTS } from "@/lib/lido/words";

export function LidoWalletCard({ read }: { read: LidoStakeRead }) {
  const s = lidoStake(read);
  const requests = REQUESTS.summary(s);
  // An unclaimed withdrawal request holds the position open with no shares left.
  const closed = s.now.shares === 0 && !read.requests.rows.some((q) => !q.isClaimed);
  return (
    <div data-position-card={`lido:${read.wallet.toLowerCase()}`}>
      <PositionCard
        slots={{
          surface: "listing",
          status: closed ? { word: CARD_WORDS.closed, tone: "muted", tip: CARD_WORDS.none } : null,
          heads: lidoStakeHeads({ s, r: read }).filter((h) => h.id !== "rate"),
          tag: requests ? <ListingTag market={requests} /> : undefined,
          counters: null,
          menu: null,
        }}
      />
    </div>
  );
}
