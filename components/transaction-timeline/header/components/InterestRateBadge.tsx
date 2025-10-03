import { Users, UserPlus } from "lucide-react";

export function InterestRateBadge({
  rate,
  isDelegate,
  isNewDelegate,
}: {
  rate: number;
  isDelegate?: boolean;
  isNewDelegate?: boolean;
}) {
  const isDelegated = isDelegate || isNewDelegate;

  return (
    <div
      className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded ${
        isDelegated
          ? "bg-pink-300 text-white dark:bg-pink-900/50 dark:text-pink-400"
          : "dark:text-white text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-900"
      }`}
    >
      {isNewDelegate && <UserPlus className="w-3 h-3 mr-1" />}
      {isDelegate && !isNewDelegate && <Users className="w-3 h-3 mr-1" />}
      {rate}
      <span className="ml-0.5">%</span>
    </div>
  );
}
