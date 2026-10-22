"use client";

import { createContext } from "react";
import type { ChainId } from "@/lib/shared/chains";

/** What a page that gathers positions from several chains adds at a listing
 *  card's edge without the family's builder knowing (the wallet view, rails-ops
 *  decision 0050). Absent everywhere else, so every listing draws its card as
 *  it always has.
 *
 *  `surface: "wallet"`: the card belongs to the wallet whose page it is on. The
 *  heading row leads with the protocol's mark and name, drops the wallet pill
 *  (C7) and the OPEN pill, and ends with the chain's glyph. AT RISK, on the pill
 *  of an open position past its family's liquidation line, and any status word
 *  the family sets stay. */
export interface PositionCardEdge {
  surface?: "wallet";
  /** The roster id (the glyph key) and display name of the card's protocol. */
  protocol?: { id: string; name: string };
  chain?: { id: ChainId; name: string };
  atRisk?: boolean;
}
export const PositionCardEdgeContext = createContext<PositionCardEdge | null>(null);
