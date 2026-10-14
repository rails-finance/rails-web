// The Lifetime flows panel's view, per viewer: compact (the default: the
// bars, the value chart and the price chart side by side, drawn at today) or
// full (the panel with its scrubber). One stored value for every position;
// absence means compact. Reads and writes tolerate a missing or blocked
// storage by answering compact and dropping the write.

const STORAGE_KEY = "rails-flows-view-v1";

export type FlowsView = "compact" | "full";

export function readFlowsView(): FlowsView {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "full" ? "full" : "compact";
  } catch {
    return "compact";
  }
}

export function writeFlowsView(view: FlowsView): void {
  try {
    if (view === "full") window.localStorage.setItem(STORAGE_KEY, "full");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the choice lasts the visit.
  }
}
