export function InterestRateBadge({ rate }: { rate: number }) {
  return (
    <div className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded text-slate-300 bg-slate-800 border border-slate-600">
      {rate}
    </div>
  );
}
