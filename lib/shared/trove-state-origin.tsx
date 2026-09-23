// Shared phrasing for the trove view's current-state origin, so every surface
// names it the same way. `live` marks the second-wave on-chain trove-state read
// (getLatestTroveData); without it the value is the trove's most recent logged
// state. (The api↔chain DataSource context this file once held was retired
// with the chain lane — decision 0006.)

export function stateOriginVia(live: boolean, field: string): string {
  if (!live) return "the trove's most recent TroveUpdated or BatchedTroveUpdated log";
  // One segment: the receipt drops a via line's first " · " segment as custody.
  return field ? `TroveManager.getLatestTroveData(): ${field}` : "TroveManager.getLatestTroveData()";
}

/** The sentence after a state receipt's name clause: where the figure stands. */
export function stateOriginSummary(live: boolean, what: string): string {
  if (live) return `${what} — the figure the TroveManager contract reports for the trove now.`;
  return `${what} — the figure the contract logged at the trove's most recent change.`;
}
