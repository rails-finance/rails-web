// Barrel re-export of the canonical event-shape types.
//
// The event-card components (LiquityEventCard, EventCard, SpineColumn, etc.)
// import from this path. To avoid touching every import, this file re-exports
// the same names from our canonical wire-format file `event-shape.ts`.
//
// If new protocols or arms get added to event-shape.ts, mirror the export
// here so those consumers keep working.

export type { GasCost, BaseActivityEvent } from "./event-shape";

export { isLiquityEvent } from "./event-shape";
