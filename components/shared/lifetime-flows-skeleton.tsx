// The Lifetime flows panel's loading shape (rails-ops TO-DO-ui-jobs §266):
// the scrubber's parts at the heights the settled panel takes (a position with
// a line, both sides), so nothing moves when the history lands. Phone (below
// sm) and desktop each take their own heights: the headlines, the two bars and
// their axis, the line with its marks and ends, the playback controls and, on
// a phone, the "Show to" button's own row. The panel's header and its (i) row
// are real while it loads. Heights measured 5 Oct 2026 on the Liquity V2 trove
// at 390, 430 and 1280: 415px phone, 332px desktop between the header and the
// (i) row.

const BLOCK = "rounded-md bg-rb-300/70 dark:bg-rb-700/60";

export function LifetimeFlowsSkeleton() {
  return (
    <div className="mt-2 animate-pulse" aria-hidden data-flows-skeleton="">
      {/* Headlines, and the date at the row's right end (it wraps under them
          on a phone). */}
      <div className="mb-2 flex h-[53px] flex-wrap items-start gap-x-6 sm:h-7 sm:items-center">
        <div className={`${BLOCK} h-7 w-32`} />
        <div className={`${BLOCK} h-7 w-28`} />
        <div className={`${BLOCK} ml-auto h-4 w-12 max-sm:mt-2`} />
      </div>
      {/* The held and owed bars on their axis. */}
      <div className={`${BLOCK} h-10 sm:h-11`} />
      <div className={`${BLOCK} mt-3 h-10 sm:h-11`} />
      <div className="mt-1 h-4" />
      {/* The line, its marks and its two ends. */}
      <div className={`${BLOCK} mt-4 h-20 opacity-60`} />
      <div className="h-[26px] sm:h-5" />
      <div className="flex h-4 justify-between px-2">
        <div className={`${BLOCK} h-3 w-14`} />
        <div className={`${BLOCK} h-3 w-10`} />
      </div>
      {/* The playback controls, and the "Show to" button: its own row on a
          phone, the controls' right end from sm. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className={`${BLOCK} h-11 w-[220px] sm:h-9 sm:w-[184px]`} />
        <div className={`${BLOCK} h-11 w-full sm:h-9 sm:w-40`} />
      </div>
    </div>
  );
}
