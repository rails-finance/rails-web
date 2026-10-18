// Protocol-agnostic prose composer for the plain-English explainer panes.
// ----------------------------------------------------------------------------
// Form + emphasis are governed by the explanation-copy charter
// (rails-ops/standards/explanation-copy-charter.md): §4 fixes the position-pane
// shape ProseExplainer renders — no heading inside the pane, a single
// subject-first lead sentence with no colon (≤2 figures) over one bullet per
// independent fact — and §3's highlight rule governs when a figure wears <H>
// (only with an exact twin on the card's chrome, and every chrome figure must
// appear bold somewhere in the pane — reverse-completeness).
//
// Where the old explainer pushed ReactNode BULLETS into a <ul>, this composes a
// single layman PARAGRAPH from a list of clauses, each keyed on the event's (or
// position's) RESULTING state rather than on the event type alone. The grammar:
//
//   • A clause is a ReactNode plus a `join` role. A "sentence" clause is
//     capitalised and carries its own terminal punctuation. A "continuation"
//     begins with its own connective + punctuation (", leaving …", " — so …")
//     and attaches to the clause before it.
//   • Punctuation and capitalisation are AUTHORED inside the variant strings,
//     never computed here — the joiner only interleaves a single space before
//     each sentence clause and nothing before a continuation.
//   • Never-empty floor: a builder that lacks a fact returns a falsy clause and
//     the clause simply does not exist — no hole, no placeholder. If nothing
//     survives, the paragraph is null and its surface renders nothing.
//   • Orphan rule: a continuation whose immediately preceding surviving clause
//     does not exist (it would open the paragraph) is dropped — a continuation
//     attaches to the previous clause or dies with it.

import {
  Fragment,
  cloneElement,
  createContext,
  createElement,
  isValidElement,
  useContext,
  type ReactNode,
} from "react";
import { EXPLAIN_GROUP_RULE, ExplainHeading } from "@/components/shared/explain-groups";

/** The one emphasis helper for explainer copy — the charter §3 highlight rule's
 *  render form (semibold + foreground tone against the muted body). Wrap a
 *  figure in <H> ONLY when the same value also appears on the card's structured
 *  chrome; keep it composable with <Prov> (`<H><Prov …>{value}</Prov></H>`) so
 *  the inspector's byte-matched targets survive. */
export function H({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

export interface ProseClause {
  /** The rendered fragment. Connectives + punctuation live INSIDE the node. */
  node: ReactNode;
  /** "sentence" (default): capitalised, own terminal punctuation, a space
   *  before it. "continuation": own leading connective + punctuation, no space
   *  before it, attaches to the preceding clause. */
  join?: "sentence" | "continuation";
}

export type ClauseInput = ProseClause | null | undefined | false;

export const clause = (node: ReactNode): ProseClause => ({ node, join: "sentence" });
export const cont = (node: ReactNode): ProseClause => ({ node, join: "continuation" });

const isCont = (c: ProseClause): boolean => (c.join ?? "sentence") === "continuation";

/** Filter falsy, then apply the orphan rule: a continuation with no surviving
 *  clause before it is dropped. */
function surviving(clauses: ClauseInput[]): ProseClause[] {
  const out: ProseClause[] = [];
  for (const c of clauses) {
    if (!c) continue;
    if (isCont(c) && out.length === 0) continue; // orphan continuation
    out.push(c);
  }
  return out;
}

/** Compose a paragraph node from clauses, or null if nothing survives. */
export function composeParagraph(clauses: ClauseInput[]): ReactNode | null {
  const live = surviving(clauses);
  if (live.length === 0) return null;
  return (
    <>
      {live.map((c, i) => {
        // A single space before each sentence clause except the first; nothing
        // before a continuation (it carries its own leading connective).
        const sep = i > 0 && !isCont(c) ? " " : "";
        return (
          <Fragment key={i}>
            {sep}
            {c.node}
          </Fragment>
        );
      })}
    </>
  );
}

// ── Slot arcs ────────────────────────────────────────────────────────────────
// A named three-slot arc keeps the authoring readable: what HAPPENED, what it
// CHANGED, what it MEANS NOW. The slots are flattened in order into one clause
// list — the composer does the surviving/orphan work.

export interface EventProseSlots {
  happened: ClauseInput[];
  changed?: ClauseInput[];
  meansNow?: ClauseInput[];
}

export const eventClauses = (s: EventProseSlots): ClauseInput[] => [
  ...s.happened,
  ...(s.changed ?? []),
  ...(s.meansNow ?? []),
];

export interface PositionProseSlots {
  status: ClauseInput[];
  lifecycle?: ClauseInput[];
  context?: ClauseInput[];
}

export const positionClauses = (s: PositionProseSlots): ClauseInput[] => [
  ...s.status,
  ...(s.lifecycle ?? []),
  ...(s.context ?? []),
];

/** Split the lead (the first surviving sentence clause PLUS its trailing
 *  continuations — grammatically one sentence) from the rest. The card's teaser
 *  is exactly `lead`; the explainer body renders `rest`. */
export function splitLead(clauses: ClauseInput[]): { lead: ReactNode | null; rest: ClauseInput[] } {
  const live = surviving(clauses);
  if (live.length === 0) return { lead: null, rest: [] };
  let end = 1;
  while (end < live.length && isCont(live[end])) end++;
  return { lead: composeParagraph(live.slice(0, end)), rest: live.slice(end) };
}

/** A sentence's end: its stop, followed by a space and the next sentence's
 *  capital (a figure's decimal point is followed by a digit). */
const SENTENCE_END = /[.!?](?=\s+[A-Z“‘"(])/;

/** The node split after its first sentence: `head` the first sentence,
 *  `tail` the rest, or null where the node is one sentence. It reads the text
 *  the node carries (strings, fragments, elements' children); a component's
 *  own render is opaque to it, so a teaser drawn by a component stays whole. */
export function splitFirstSentence(node: ReactNode): { head: ReactNode; tail: ReactNode | null } {
  return cutSentence(node) ?? { head: node, tail: null };
}

function cutSentence(node: ReactNode): { head: ReactNode; tail: ReactNode } | null {
  if (typeof node === "string") {
    const m = SENTENCE_END.exec(node);
    if (!m) return null;
    return { head: node.slice(0, m.index + 1), tail: node.slice(m.index + 1).trimStart() };
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const cut = cutSentence(node[i] as ReactNode);
      if (cut)
        return {
          // Spread as arguments, so the pieces need no keys.
          head: createElement(Fragment, null, ...node.slice(0, i), cut.head),
          tail: createElement(Fragment, null, cut.tail, ...node.slice(i + 1)),
        };
    }
    return null;
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children != null) {
    const cut = cutSentence(node.props.children);
    if (!cut) return null;
    return { head: cloneElement(node, undefined, cut.head), tail: cloneElement(node, undefined, cut.tail) };
  }
  return null;
}

/** Compose the clauses as BULLET items: each surviving sentence clause plus its
 *  trailing continuations — grammatically one sentence — becomes one bullet.
 *  This is the event pane's render form (charter §4, per Miles's direction
 *  2026-07-23): each bullet references a datapoint of the card, and a verb-first
 *  sentence is acceptable AS a bullet. The clause CONTENT (state keying,
 *  register, <Prov> wrappers) is untouched — only the join changes. */
export function composeBullets(clauses: ClauseInput[]): ReactNode[] {
  const live = surviving(clauses);
  const out: ReactNode[] = [];
  let i = 0;
  while (i < live.length) {
    let j = i + 1;
    while (j < live.length && isCont(live[j])) j++;
    const item = composeParagraph(live.slice(i, j));
    if (item != null) out.push(item);
    i = j;
  }
  return out;
}

// ── The shared pane shell ────────────────────────────────────────────────────
// Carries NO vertical padding of its own: the disclosure pane already pads
// (pt-3/pb-3), and the card's teaser bullet above spaces itself with mb-2 —
// matching the bullets' own space-y-2, so the lead reads as the first bullet
// of one evenly spaced list.

/** A bullet with the heading of the group it sits under (rails-ops
 *  explanation-copy-charter §4). An explainer whose items carry one draws a
 *  heading over each run of the same group; plain items stay one list. */
export interface GroupedItem {
  node: ReactNode;
  group: string;
}
export type ExplainerItem = ReactNode | GroupedItem;

const isGrouped = (item: ExplainerItem): item is GroupedItem =>
  item != null && typeof item === "object" && !isValidElement(item) && "group" in item && "node" in item;

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <div className="space-y-2 text-sm text-rb-500">
      {items.map((item, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="shrink-0">•</span>
          <div className="min-w-0 flex-1 leading-relaxed">{item}</div>
        </div>
      ))}
    </div>
  );
}

/** True where the event page's title states the explanation's first
 *  sentence (rails-ops decision 0045, "Ruled since"): a grouped pane leaves
 *  its first bullet out. Provided by the event card in page mode. */
export const ExplainerLeadOnTitleContext = createContext(false);

export function ProseExplainer({
  paragraph,
  items: given,
  list,
  listLead,
}: {
  /** Legacy paragraph form — kept for non-event surfaces; event panes pass
   *  `items` (the bullet form) instead. */
  paragraph?: ReactNode | null;
  /** Bullet items (one composed sentence each — composeBullets). The event
   *  pane's render form: each bullet references a datapoint of the card. */
  items?: ExplainerItem[];
  /** An optional short enumeration list appended after the items — genuinely
   *  list-shaped facts (a liquidation's payout legs, a vault population). */
  list?: ReactNode[];
  /** A one-line lead-in above the list. */
  listLead?: ReactNode;
}) {
  const leadOnTitle = useContext(ExplainerLeadOnTitleContext);
  const items = leadOnTitle && given?.some(isGrouped) ? given.slice(1) : given;
  const hasItems = items != null && items.length > 0;
  const hasList = list != null && list.length > 0;
  if (paragraph == null && !hasItems && !hasList) return null;
  // The lead ends in no colon. Over headed groups it is the first group's
  // first bullet, so nothing sits above the first heading.
  const lead = paragraph != null ? dropTrailingColon(paragraph) : null;
  const runs = hasItems && items.some(isGrouped) ? runsOf(items) : null;
  const leadInGroup = lead != null && runs != null && runs[0].group !== "";
  if (leadInGroup) runs[0].nodes.unshift(lead);
  return (
    <div>
      {/* The lead spaces itself off the bullets (mb-2, matching their space-y-2)
          only when items follow — an items-only event pane keeps the flush top
          described above. */}
      {lead != null && !leadInGroup && (
        <p className={`text-sm leading-relaxed text-rb-500${hasItems ? " mb-2" : ""}`}>{lead}</p>
      )}
      {hasItems &&
        (runs ? (
          runs.map((run, i) => (
            <section
              key={i}
              className={`mt-3 first:mt-0 ${run.group ? EXPLAIN_GROUP_RULE : ""}`}
              data-explain-group={run.group}
            >
              {run.group && <ExplainHeading>{run.group}</ExplainHeading>}
              <div className={run.group ? "mt-1" : undefined}>
                <Bullets items={run.nodes} />
              </div>
            </section>
          ))
        ) : (
          <Bullets items={items as ReactNode[]} />
        ))}
      {hasList && (
        <>
          {listLead != null && <div className="mt-2 text-sm text-rb-500">{listLead}</div>}
          <div className="mt-2 space-y-2 text-sm text-rb-500">
            {list.map((item, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span className="shrink-0">•</span>
                <div className="min-w-0 flex-1 leading-relaxed">{item}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The node with a colon at the end of its last text removed. */
function dropTrailingColon(node: ReactNode): ReactNode {
  if (typeof node === "string") return node.replace(/:\s*$/, "");
  if (Array.isArray(node)) {
    if (node.length === 0) return node;
    return [...node.slice(0, -1), dropTrailingColon(node[node.length - 1])];
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children != null) {
    return cloneElement(node, undefined, dropTrailingColon(node.props.children));
  }
  return node;
}

/** Consecutive items of the same group, each run under its heading. */
function runsOf(items: ExplainerItem[]): { group: string; nodes: ReactNode[] }[] {
  const runs: { group: string; nodes: ReactNode[] }[] = [];
  for (const item of items) {
    const group = isGrouped(item) ? item.group : "";
    const node = isGrouped(item) ? item.node : item;
    const last = runs[runs.length - 1];
    if (last && last.group === group) last.nodes.push(node);
    else runs.push({ group, nodes: [node] });
  }
  return runs;
}

/** Group events by their transaction hash, preserving order within each tx —
 *  the seam a card uses to reach its same-tx siblings. */
export function groupEventsByTx<E extends { txHash?: string }>(events: E[]): Map<string, E[]> {
  const map = new Map<string, E[]>();
  for (const e of events) {
    const key = e.txHash ?? "";
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return map;
}
