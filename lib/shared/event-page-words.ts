// The event page's shared words (rails-ops TO-DO-ui-jobs 236): the side
// column's actions row, its shared facts rows and the previous and next
// links, the same on every family. A family's words (its paragraph, its
// facts rows, its timeline hint) come with its contract
// (`lib/shared/explorer-adapter.ts`).

export const EVENT_PAGE_WORDS = {
  actions: "Event actions",
  in_timeline: "View in timeline",
  explorer_hint: (explorer: string) => `Open the transaction's logs on ${explorer}`,
  view_markdown: "View as Markdown",
  view_markdown_hint: "Open this event as Markdown",
  copy_link: "Copy link",
  copy_link_hint: "Copy this page's address",
  copy_hash: "Copy transaction hash",
  copy_hash_hint: "Copy the transaction's hash",
  copy_llm: "Copy for LLM",
  copy_llm_hint: "Copy this event as Markdown for an AI assistant",
  copied: "Copied",
  show_provenance: "Show provenance",
  hide_provenance: "Hide provenance",
  provenance_hint: "Click a value on this event to trace it",
  event: "Event",
  event_of: (n: number, total: number) => `${n.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
  block: "Block",
  transaction: "Transaction",
  previous: "Previous event",
  next: "Next event",
} as const;
