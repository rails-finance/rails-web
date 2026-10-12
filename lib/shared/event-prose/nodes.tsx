import { Fragment, type ReactNode } from "react";

/** A strings-file string with each {name} replaced by the node given for it:
 *  a bullet's linked and receipted figures stand where the file puts them.
 *  `where` names the string in the error a missing node throws. */
export function fillNodes(text: string, nodes: Record<string, ReactNode>, where: string): ReactNode {
  const parts = text.split(/\{([a-z_0-9]+)\}/);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part === "" ? null : <Fragment key={i}>{part}</Fragment>;
    if (!(part in nodes)) throw new Error(`event prose: no value for {${part}} in ${where}`);
    return <Fragment key={i}>{nodes[part]}</Fragment>;
  });
}

/** The position card's bullets in heading order, under their headings when two
 *  or more headings hold two or more bullets each, otherwise one list
 *  (rails-ops standards/prose-limits-and-zones.md 3.3). `order` is the
 *  headings' ids in order; `heading` gives each id's words. */
export function arrangeByHeading<G extends string>(
  bullets: { group: G; node: ReactNode }[],
  order: readonly G[],
  heading: (g: G) => string,
): (ReactNode | { group: string; node: ReactNode })[] {
  const sorted = order.flatMap((g) => bullets.filter((b) => b.group === g));
  const dense = order.filter((g) => sorted.filter((b) => b.group === g).length >= 2).length;
  if (dense < 2) return sorted.map((b) => b.node);
  return sorted.map((b) => ({ group: heading(b.group), node: b.node }));
}
