"use client";

// One sentence of a family's event prose (lib/shared/event-prose/engine.ts),
// drawn as the generator marked it: each figure bolded, echoed into the
// card's receipt the family names for its key, or linked. The text is the
// generator's, character for character.

import type { ReactNode } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { LinkedAddress } from "@/components/shared/linked-address";
import type { ProseSentence } from "@/lib/shared/event-prose/types";

/** The receipt a figure echoes: its provenance, the value key it registers
 *  under and the token beside it. */
export interface ProseEcho {
  info: Provenance;
  value?: string;
  symbol?: string;
}

const Bold = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

export function ProseSentenceText<E extends string>({
  s,
  echo,
}: {
  s: ProseSentence<E>;
  echo: (key: E) => ProseEcho | null | undefined;
}) {
  return (
    <>
      {s.segs.map((seg, i) => {
        if (seg.address) return <LinkedAddress key={i} address={seg.address} />;
        if (!seg.emph) return <span key={i}>{seg.text}</span>;
        if (seg.emph === "bold") return <Bold key={i}>{seg.text}</Bold>;
        const prov = echo(seg.emph);
        if (!prov) return <Bold key={i}>{seg.text}</Bold>;
        return (
          <Prov key={i} echo info={prov.info} value={prov.value} symbol={prov.symbol}>
            <Bold>{seg.text}</Bold>
          </Prov>
        );
      })}
    </>
  );
}
