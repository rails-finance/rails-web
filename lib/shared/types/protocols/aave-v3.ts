// Barrel re-export of the Aave V3 sub-types from event-shape.
//
// This file used to RE-DECLARE them, and called itself "the canonical
// declaration" while event-shape.ts called itself the mirror. Both copies were
// hand-maintained, and the seam had already rotted: MakerDAO's mirror was three
// union members stale, four of the nine modules here had no importer at all,
// and one "Mirror of …/pwn.ts" comment named a file that never existed. There
// is now ONE declaration — event-shape.ts, which is what the rest of the tree
// imports and the copy that stayed current — and this path stays live so the
// components that import from it are untouched.

export type { AaveV3EventType, AaveV3PriceSource, AaveV3Context } from "../event-shape";
