// The event page's shared words (rails-ops TO-DO-ui-jobs 236): the event
// menu's rows beside the h1, the card's section headings, the side column's
// shared facts rows and the previous and next arrows, the same on every
// family. A family's words (its paragraph, its
// facts rows, its timeline hint) come with its contract
// (`lib/shared/explorer-adapter.ts`).

export const EVENT_PAGE_WORDS = {
  view_explorer: (explorer: string) => `View on ${explorer}`,
  view_explorer_hint: "The transaction's logs, in a new tab",
  view_markdown: "View as Markdown",
  view_markdown_hint: "This event as plain text, in a new tab",
  copy_link: "Copy link",
  copy_link_hint: "This page's address",
  in_timeline: "View this event in the position's activity timeline",
  copy_hash: "Copy transaction hash",
  copy_llm: "Copy for LLM",
  copy_llm_hint: "This event as Markdown for an AI assistant",
  copied: "Copied",
  provenance_hint: "Click a value on this event to trace it",
  explanation: "Explanation",
  figures: "Figures",
  event: "Event",
  event_of: (n: number, total: number) => `${n.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
  time: "Time",
  block: "Block",
  transaction: "Transaction",
  title_and: "and",
  steps: "Previous and next events",
  previous: "Previous event",
  next: "Next event",
} as const;
