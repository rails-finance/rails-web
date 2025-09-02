import { Users, UserPlus } from "lucide-react";

export function InterestRateBadge({ rate, isDelegate, isNewDelegate }: { rate: number; isDelegate?: boolean; isNewDelegate?: boolean }) {
  return (
    <div className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded text-slate-300 bg-slate-800 border border-slate-600">
      {isNewDelegate && <UserPlus className="w-3 h-3 mr-1 text-green-400" />}
      {isDelegate && !isNewDelegate && <Users className="w-3 h-3 mr-1 text-slate-400" />}
      {rate}<span className="ml-0.5">%</span>
    </div>
  );
}
