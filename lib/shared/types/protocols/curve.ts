// Stub for the Curve event-type union referenced by `learn-more-content.ts`.
//
// This app is liquity-only, so the Curve learn-more entries are unreachable
// from the trove detail surface — but the file exports them at the module
// level, so we need to satisfy the type to compile. Promote to a real union
// when Curve content lands.

export type CurveEventType = string;
