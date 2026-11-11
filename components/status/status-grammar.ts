// The status page's dot colours and words, shared by the index table and the
// Prices view (rails-ops ui-jobs 583).

import type { Heartbeat } from "@/lib/shared/index-progress";

export const DOT: Record<Heartbeat, string> = {
  fresh: "bg-green-500",
  late: "bg-amber-500",
  stalled: "bg-red-500",
  paused: "bg-blue-400",
  none: "bg-rb-300 dark:bg-rb-600",
};

export const STATUS_WORDS: Record<Heartbeat, string> = {
  fresh: "Arriving",
  late: "Late",
  stalled: "Stalled",
  paused: "Paused",
  none: "Not measured",
};
