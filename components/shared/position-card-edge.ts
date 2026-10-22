"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { chainMeta, type ChainId } from "@/lib/shared/chains";
import { protocolBrand, protocolForPathname } from "@/lib/shared/protocols";

/** What a page that gathers positions from several chains adds at a listing
 *  card's edge without the family's builder knowing (the wallet view, rails-ops
 *  decision 0050). Absent everywhere else, so every listing draws its card as
 *  it always has.
 *
 *  `surface: "wallet"`: the card belongs to the wallet whose page it is on. The
 *  wallet pill (C7) and the OPEN pill are not drawn. AT RISK, on the pill of an
 *  open position past its family's liquidation line, and any status word the
 *  family sets stay. The protocol and chain name the card's sidebar (C20). */
export interface PositionCardEdge {
  surface?: "wallet";
  /** The roster id (the glyph key) and display name of the card's protocol. */
  protocol?: { id: string; name: string };
  chain?: { id: ChainId; name: string };
  atRisk?: boolean;
  /** The read's recency (H6), at the top right of the card's heading row. */
  stamp?: ReactNode;
}
export const PositionCardEdgeContext = createContext<PositionCardEdge | null>(null);

/** The protocol and chain a card's sidebar names, with the protocol's brand
 *  hue (rails-ops TO-DO-position-card 427). The edge context names them where
 *  a page gathers several protocols; everywhere else the roster entry whose
 *  route holds the page does. `null` off the explorers (the home hero). */
export interface PositionCardIdentity {
  /** `href`: the explorer's entry route, which the detail card's sidebar name
   *  links to; set from the roster entry, absent on the wallet view. */
  protocol: { id: string; name: string; href?: string };
  chain: { id: ChainId; name: string };
  hue: number | null;
}

export function usePositionCardIdentity(): PositionCardIdentity | null {
  const edge = useContext(PositionCardEdgeContext);
  const pathname = usePathname();
  if (edge?.protocol && edge.chain) {
    return { protocol: edge.protocol, chain: edge.chain, hue: protocolBrand(edge.protocol.id)?.hue ?? null };
  }
  const entry = protocolForPathname(pathname);
  if (!entry) return null;
  return {
    protocol: { id: entry.id, name: entry.label, href: entry.href },
    chain: { id: entry.chainId, name: chainMeta(entry.chainId).name },
    hue: protocolBrand(entry.id)?.hue ?? null,
  };
}
