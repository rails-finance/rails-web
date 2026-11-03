// The guided way in (rails-ops ui-jobs 478): the typed reader of
// `start-tree.json` and the one resolver from a /start path to what it draws.
// The tree is data; the page draws whichever step the URL names.

import raw from "@/lib/start/start-tree.json";
import { assetCategory, symbolsInCategory, type AssetCategory } from "@/lib/shared/asset-categories";

export type GroupKey = "eth" | "btc" | "stablecoins";
export type ResultsKey = "borrow" | "near-liquidation" | "liquidated";
export type RosterKey = "browse" | "find";

export type Destination =
  | { node: string }
  | { results: ResultsKey; group?: GroupKey }
  | { roster: RosterKey }
  | { vaults: GroupKey }
  | { learn: true };

export interface StartOption {
  slug: string;
  label: string;
  /** The breadcrumb's word for this answer; the label when absent. */
  crumb?: string;
  line: string;
  to: Destination;
}

export interface StartNode {
  title: string;
  question: string;
  options: StartOption[];
}

interface Group {
  label: string;
  /** The group's word inside a sentence, where it differs from the label. */
  phrase?: string;
  note: string;
  symbols?: string[];
  categories?: AssetCategory[];
}

interface Tree {
  groups: Record<GroupKey, Group>;
  nodes: Record<string, StartNode>;
  rosters: Record<RosterKey, { question: string; line: string }>;
  results: {
    borrow: { heading: string; line: string };
    "near-liquidation": {
      heading: string;
      line: string;
      sorts: { sortBy: string; sortOrder: "asc" | "desc" }[];
    };
    liquidated: { heading: string; line: string; history: { param: string; value: string }[]; status: string };
  };
  collateral: Record<string, { groups: GroupKey[]; note: string }>;
  notAnswered: Record<string, string>;
}

export const TREE = raw as unknown as Tree;

export const START_HREF = "/start";
export const LEARN_HREF = "/start/learn";

/** Does `symbol` belong to the group? Matched without case. */
export function inGroup(group: GroupKey, symbol: string): boolean {
  const g = TREE.groups[group];
  if (g.symbols) return g.symbols.some((s) => s.toLowerCase() === symbol.toLowerCase());
  return g.categories?.includes(assetCategory(symbol)) ?? false;
}

/** The group's word inside a sentence ("Explorers whose loans can hold stablecoins"). */
export function groupPhrase(group: GroupKey): string {
  return TREE.groups[group].phrase ?? TREE.groups[group].label;
}

/** The comma list `/vaults?asset=` takes for a group. A category group lists
 *  every symbol the category table names. */
export function vaultsHref(group: GroupKey): string {
  const g = TREE.groups[group];
  const symbols = g.symbols ?? (g.categories ?? []).flatMap((c) => symbolsInCategory(c));
  return `/vaults?asset=${symbols.map(encodeURIComponent).join(",")}`;
}

/** One step of the path walked so far: what the reader picked and where it lives. */
export interface Crumb {
  label: string;
  href: string;
}

export type Step =
  | { kind: "node"; node: StartNode }
  | { kind: "roster"; roster: RosterKey }
  | { kind: "results"; results: ResultsKey; group?: GroupKey };

export interface Resolved {
  step: Step;
  /** The answers given, oldest first; the last is the current step. */
  crumbs: Crumb[];
  /** The page's title. */
  title: string;
}

/** Where an option leads when pressed, from the path it is drawn on. */
export function optionHref(basePath: string, option: StartOption): string {
  if ("learn" in option.to) return LEARN_HREF;
  if ("vaults" in option.to) return vaultsHref(option.to.vaults);
  return `${basePath}/${option.slug}`;
}

/** Walk a /start path (the segments after `/start`) through the tree. Null for
 *  a path the tree does not hold, which the page answers with a 404. A step
 *  whose option leaves /start (the learn page, a vault list) is not a path. */
export function resolveStartPath(segments: string[]): Resolved | null {
  let node = TREE.nodes.start;
  let href = START_HREF;
  const crumbs: Crumb[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const option = node.options.find((o) => o.slug === segments[i]);
    if (!option) return null;
    href = `${href}/${option.slug}`;
    const label = option.crumb ?? option.label;
    crumbs.push({ label, href });
    const last = i === segments.length - 1;
    const to = option.to;
    if ("node" in to) {
      const next = TREE.nodes[to.node];
      if (!next) return null;
      node = next;
      continue;
    }
    if (!last) return null;
    if ("roster" in to) return { step: { kind: "roster", roster: to.roster }, crumbs, title: label };
    if ("results" in to)
      return { step: { kind: "results", results: to.results, group: to.group }, crumbs, title: label };
    return null;
  }
  return { step: { kind: "node", node }, crumbs, title: crumbs.at(-1)?.label ?? node.title };
}
