import { Fragment, type ReactNode } from "react";
import { troveText } from "@/lib/liquity/event-templates";

/** A trove_words string with each {name} replaced by the node given for it:
 *  the bullet's linked and receipted values stand where the file puts them. */
export function troveNodes(id: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = troveText(id).split(/\{([a-z_0-9]+)\}/);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part === "" ? null : <Fragment key={i}>{part}</Fragment>;
    if (!(part in nodes)) throw new Error(`event prose: no value for {${part}} in trove_words.${id}`);
    return <Fragment key={i}>{nodes[part]}</Fragment>;
  });
}
