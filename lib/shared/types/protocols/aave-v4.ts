// Barrel re-export of the Aave V4 sub-types from event-shape.
// See aave-v3.ts in this directory for why these are re-exports and not
// declarations: there is ONE declaration, in event-shape.ts.

export type { AaveV4EventType, AaveV4Context, AaveV4PriceSource } from "../event-shape";
