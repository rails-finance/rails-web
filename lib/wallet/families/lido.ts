// Lido on Ethereum, for the wallet view (rails-ops decision 0073; SERVER-ONLY
// by use): no store, read at visit (./visit.ts) behind its presence check. The
// answer is the explorer's wallet read, the one /ethereum/lido/<wallet> draws:
// the wallet's one stake, its stETH and wstETH with its withdrawal requests, at
// one head block. A wallet holding shares or a request not yet claimed holds a
// stake. Every figure is in ETH (decision 0047), so the stake states no dollars.

import { sharesRaw } from "@/lib/lido/stake";
import type { LidoStakeRead } from "@/lib/lido/types";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { protocolForSession } from "@/lib/shared/protocols";
import { LIDO_PRESENCE } from "@/lib/wallet/presence-checks";
import { visitOn, type VisitModule } from "./visit";

export const lido: VisitModule = {
  id: "lido",
  name: "Lido",
  chain: MAINNET_CHAIN_ID,
  chainName: "Ethereum",
  family: "lido",
  get on() {
    return visitOn("lido");
  },
  presence: LIDO_PRESENCE,
  path: (address) => `/api/at-block/lido/stake?${new URLSearchParams({ owner: address.toLowerCase() })}`,
  shape(answer, address) {
    const r = answer as LidoStakeRead;
    if (!r?.head || !r.now || !r.past || !Array.isArray(r.requests?.rows))
      throw new Error("the Lido read answered outside its shape");
    if (sharesRaw(r.now) === BigInt(0) && !r.requests.rows.some((q) => !q.isClaimed)) return [];
    const wallet = address.toLowerCase();
    const home = protocolForSession("lido")?.href ?? "/ethereum/lido";
    return [
      {
        chain: MAINNET_CHAIN_ID,
        family: "lido",
        familyName: "Lido",
        positionId: `lido:${wallet}`,
        href: `${home}/${wallet}`,
        status: "open",
        kind: "stakes",
        card: { kind: "lido", read: r },
        headRead: "read",
        readAtBlock: r.head.block,
        readAt: r.head.time,
      },
    ];
  },
};
