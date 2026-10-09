import type { ReactNode } from "react";
import { positionText } from "@/lib/aave-v3/event-templates";
import { fillNodes } from "@/lib/shared/event-prose/nodes";

/** A position_words string with each {name} replaced by the node given for
 *  it: the bullet's receipted and highlighted figures stand where the file
 *  puts them. */
export function positionNodes(id: string, nodes: Record<string, ReactNode> = {}): ReactNode {
  return fillNodes(positionText(id), nodes, `position_words.${id}`);
}
