// Hand-set expected dates for the "still being filled in" well above a timeline
// (components/shared/timeline-fill-well.tsx, rails-ops TO-DO-ui-jobs.md §40).
//
// The well works its date out from the lane's walk: the event blocks left below
// the frontier over the blocks the walk priced in the last 24 hours. A date set
// here wins over that — use it when the computed one is known to be wrong (a
// walk paused for an RPC budget, a rate about to change).
//
// HOW TO EDIT: key by the lane name the filler writes to price_fill_log
// ("aave-v3-base", "moonwell-base", "seamless"), value an ISO date "YYYY-MM-DD"
// read as that UTC day. Commit and push; pushing main deploys the preview.
// Once the date passes with the fill unfinished the well drops the date clause
// and says only that Rails is processing the values, so an entry left behind
// goes quiet on its own — remove it anyway when the walk finishes.
//
//   export const FILL_ETA_OVERRIDES: Record<string, string> = {
//     "aave-v3-base": "2026-10-21",
//   };

export const FILL_ETA_OVERRIDES: Record<string, string> = {};
