// A receipt's distance classes (components/shared/provenance.tsx): a leaf's
// class, the weakest link a computed value takes, and the classes the
// inspector's head lists ("Computed from: …"). A leaf marked `definition` is a
// constant the protocol defines (a stablecoin's $1 face, the year a rate
// formula compounds over), not a read, so it carries no class and neither rule
// counts it (ui-jobs 669, 671). Pure, so a unit test runs the
// same rule.

import type { ProvClass, ProvInput, ProvKind } from "@/components/shared/provenance";

const CLASS_RANK: Record<ProvClass, number> = { emitted: 0, state: 1, oracle: 2, indexed: 3, offchain: 4 };

/** Map a 4-kind gate value to a distance class when the vocabulary hasn't named
 *  one precisely. Best-effort — a vocabulary overrides it with `pclass` (e.g. a
 *  slot read is `chain` but `state`, an oracle price is `chain-derived` but the
 *  `oracle` class). The gate itself is unchanged; this only drives the display. */
export function resolveClass(kind: ProvKind, pclass?: ProvClass): ProvClass {
  if (pclass) return pclass;
  switch (kind) {
    case "chain":
      return "emitted";
    case "chain-derived":
      return "oracle";
    case "derived":
      return "indexed";
    case "offchain":
      return "offchain";
  }
}

type ClassedLeaf = Pick<ProvInput, "kind" | "pclass" | "definition">;

/** The leaves that were read: every leaf but a definition. */
export function classedLeaves<T extends ClassedLeaf>(leaves: readonly T[]): T[] {
  return leaves.filter((l) => !l.definition);
}

/** The furthest class among the read leaves (the weakest link); null when
 *  no leaf was read. */
export function weakestClass(leaves: readonly ClassedLeaf[]): ProvClass | null {
  return classedLeaves(leaves).reduce<ProvClass | null>((acc, l) => {
    const c = resolveClass(l.kind, l.pclass);
    return !acc || CLASS_RANK[c] > CLASS_RANK[acc] ? c : acc;
  }, null);
}

/** Each distinct class among the read leaves, nearest the chain first. */
export function involvedClasses(leaves: readonly ClassedLeaf[]): ProvClass[] {
  const cls = [...new Set(classedLeaves(leaves).map((l) => resolveClass(l.kind, l.pclass)))];
  return cls.sort((a, b) => CLASS_RANK[a] - CLASS_RANK[b]);
}
