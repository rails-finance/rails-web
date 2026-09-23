// Protocol-agnostic prose composer for the plain-English explainer panes.
// ----------------------------------------------------------------------------
// Form + emphasis are governed by the explanation-copy charter
// (rails-ops/standards/explanation-copy-charter.md): §4 fixes the position-pane
// shape ProseExplainer renders — no heading inside the pane, a single
// subject-first colon-terminated lead sentence (≤2 figures) over one bullet per
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

import { Fragment, type ReactNode } from "react";

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

export function ProseExplainer({
  paragraph,
  items,
  list,
  listLead,
}: {
  /** Legacy paragraph form — kept for non-event surfaces; event panes pass
   *  `items` (the bullet form) instead. */
  paragraph?: ReactNode | null;
  /** Bullet items (one composed sentence each — composeBullets). The event
   *  pane's render form: each bullet references a datapoint of the card. */
  items?: ReactNode[];
  /** An optional short enumeration list appended after the items — genuinely
   *  list-shaped facts (a liquidation's payout legs, a vault population). */
  list?: ReactNode[];
  /** A one-line lead-in above the list. */
  listLead?: ReactNode;
}) {
  const hasItems = items != null && items.length > 0;
  const hasList = list != null && list.length > 0;
  if (paragraph == null && !hasItems && !hasList) return null;
  return (
    <div>
      {/* The lead spaces itself off the bullets (mb-2, matching their space-y-2)
          only when items follow — an items-only event pane keeps the flush top
          described above. */}
      {paragraph != null && (
        <p className={`text-sm leading-relaxed text-rb-500${hasItems ? " mb-2" : ""}`}>{paragraph}</p>
      )}
      {hasItems && (
        <div className="space-y-2 text-sm text-rb-500">
          {items.map((item, i) => (
            <div key={i} className="flex items-baseline gap-2">
              <span className="shrink-0">•</span>
              <div className="min-w-0 flex-1 leading-relaxed">{item}</div>
            </div>
          ))}
        </div>
      )}
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
