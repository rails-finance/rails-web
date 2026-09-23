// Barrel re-export of the Liquity V2 sub-types from event-shape.
//
// The event-card components import LiquityContext from this path. Nothing to
// keep in sync — event-shape.ts is the one declaration, and this barrel now
// lists exactly what travels through it.

export type { LiquityContext } from "../event-shape";
