"use client";

// One sentence of a family's event prose (lib/shared/event-prose/engine.ts),
// drawn as the generator marked it: each figure bolded, echoed into the
// card's receipt the family names for its key, or linked. The text is the
// generator's, character for character.

import type { ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { LinkedAddress } from "@/components/shared/linked-address";
import { LinkedTx } from "@/components/shared/linked-tx";
import type { ProseSentence } from "@/lib/shared/event-prose/types";
import type { SessionProtocol } from "@/lib/shared/sessions";

/** The receipt a figure echoes: its provenance, the value key it registers
 *  under and the token beside it. */
export interface ProseEcho {
  info: Provenance;
  value?: string;
  symbol?: string;
  /** The sentence is the figure's only place on the card: its receipt registers here, not as an echo. */
  primary?: boolean;
  /** Data attributes on the figure (a verifier's hook, `data-cow-surplus`). */
  data?: Record<string, string>;
}

const Bold = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

export function ProseSentenceText<E extends string>({
  s,
  echo,
  holderOf,
}: {
  s: ProseSentence<E>;
  echo: (key: E) => ProseEcho | null | undefined;
  /** The family whose holders a "wallet" placeholder names: it links inside
   *  Rails. Without it every address keeps the block explorer. */
  holderOf?: SessionProtocol;
}) {
  return (
    <>
      {s.segs.map((seg, i) => {
        if (seg.address)
          return (
            <LinkedAddress key={i} address={seg.address} holderOf={seg.tone === "wallet" ? holderOf : undefined} />
          );
        if (seg.tx) return <LinkedTx key={i} txHash={seg.tx} />;
        if (!seg.emph) return <span key={i}>{seg.text}</span>;
        if (seg.emph === "bold") return <Bold key={i}>{seg.text}</Bold>;
        const prov = echo(seg.emph);
        if (!prov) return <Bold key={i}>{seg.text}</Bold>;
        const figure = (
          <Prov key={i} echo={!prov.primary} info={prov.info} value={prov.value} symbol={prov.symbol}>
            <Bold>{seg.text}</Bold>
          </Prov>
        );
        return prov.data ? (
          <span key={i} {...prov.data}>
            {figure}
          </span>
        ) : (
          figure
        );
      })}
    </>
  );
}
