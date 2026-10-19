// How often a page asks a per-wallet history store again (the Arbitrum lane,
// rails-ops TO-DO-arbitrum-scoping.md items 12 and 13). Client-safe.
//
// FIRST READ: the store reads a wallet it has not seen on its first request,
// and the route answers 202 once its 45 s wait runs out (ChainTimelinePending).
// Each ask waits up to that long, so four answers cover about four minutes;
// after the last the page asks for a reload.
//
// CONFIRMATION: the store's rows wait for a second chain witness. An
// unconfirmed answer is asked again every 20 s for two minutes and replaced
// once it is the whole life.

export const FIRST_READ_ASKS = 4;
export const FIRST_READ_GAP_MS = 10_000;
export const WHOLE_ASKS = 6;
export const WHOLE_GAP_MS = 20_000;
