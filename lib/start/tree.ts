// The guided way in (rails-ops ui-jobs 478): the typed reader of
// `start-tree.json` and the one resolver from a /start path to what it draws.
// The tree is data; the page draws whichever step the URL names.

import raw from "@/lib/start/start-tree.json";
import { assetCategory, type AssetCategory } from "@/lib/shared/asset-categories";

export type GroupKey = "eth" | "btc" | "stablecoins";
export type ResultsKey = "borrow" | "near-liquidation" | "liquidated";
export type RosterKey = "browse" | "find";

/** Content drawn above a node while it is the current question. */
export type Intro = "learn";

export type Destination =
  | { node: string; intro?: Intro }
  | { results: ResultsKey; group?: GroupKey }
  | { roster: RosterKey }
  | { vaults: GroupKey }
  /** A group's coins, each opening the vaults that hold it (ui-jobs 525). */
  | { coins: GroupKey };

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
  /** The `/vaults?asset=` keyword for a category group. */
  keyword?: string;
  note: string;
  symbols?: string[];
  categories?: AssetCategory[];
  /** The tokens drawn on the group's card, by symbol. */
  icons?: string[];
  /** The group's coins, one level past its card, drawn by how many vaults
   *  hold each, most first. */
  coins?: { question: string; symbols: string[] };
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

/** The comma list `/vaults?asset=` takes for a group. A category group is one
 *  keyword, which the vault roster expands (lib/shared/asset-categories.ts). */
export function vaultsHref(group: GroupKey): string {
  const g = TREE.groups[group];
  if (g.keyword) return `/vaults?asset=${g.keyword}`;
  return `/vaults?asset=${(g.symbols ?? []).map(encodeURIComponent).join(",")}`;
}

/** One question in the stack: the node, the path it is drawn at, and the
 *  answer given there (absent on the current question). */
export interface Level {
  node: StartNode;
  base: string;
  chosen?: string;
  /** Drawn above the question while it is current (the learn sections under
   *  "New to DeFi?"); left out once the level is answered. */
  intro?: Intro;
}

/** What sits under the last answered level when the path ends on a leaf. */
export type Leaf =
  | { kind: "roster"; roster: RosterKey }
  | { kind: "results"; results: ResultsKey; group?: GroupKey }
  | { kind: "coins"; group: GroupKey };

export interface Resolved {
  /** Every level from the top of the tree down; with no leaf, the last one is
   *  the current question. */
  levels: Level[];
  leaf: Leaf | null;
  /** The answers given, oldest first: the page title. */
  answers: string[];
}

/** The tokens an option's card draws: its group's, where it opens one. */
export function optionIcons(option: StartOption): string[] {
  const to = option.to;
  const group = "coins" in to ? to.coins : "vaults" in to ? to.vaults : "results" in to ? to.group : undefined;
  return group ? (TREE.groups[group].icons ?? []) : [];
}

/** Does pressing this option leave /start? */
export function leavesStart(option: StartOption): boolean {
  return "vaults" in option.to;
}

/** Where an option leads when pressed, from the level it is drawn on. */
export function optionHref(basePath: string, option: StartOption): string {
  if ("vaults" in option.to) return vaultsHref(option.to.vaults);
  return `${basePath}/${option.slug}`;
}

/** Walk a /start path (the segments after `/start`) through the tree. Null for
 *  a path the tree does not hold, which the page answers with a 404. */
export function resolveStartPath(segments: string[]): Resolved | null {
  const levels: Level[] = [{ node: TREE.nodes.start, base: START_HREF }];
  const answers: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const level = levels[levels.length - 1];
    const option = level.node.options.find((o) => o.slug === segments[i]);
    if (!option || leavesStart(option)) return null;
    level.chosen = option.slug;
    answers.push(option.crumb ?? option.label);
    const href = `${level.base}/${option.slug}`;
    const last = i === segments.length - 1;
    const to = option.to;
    if ("node" in to) {
      const next = TREE.nodes[to.node];
      if (!next) return null;
      levels.push({ node: next, base: href, intro: to.intro });
      continue;
    }
    if (!last) return null;
    if ("roster" in to) return { levels, leaf: { kind: "roster", roster: to.roster }, answers };
    if ("results" in to) return { levels, leaf: { kind: "results", results: to.results, group: to.group }, answers };
    if ("coins" in to) return { levels, leaf: { kind: "coins", group: to.coins }, answers };
    return null;
  }
  return { levels, leaf: null, answers };
}
