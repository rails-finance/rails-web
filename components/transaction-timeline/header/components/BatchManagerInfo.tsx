interface BatchManagerInfoProps {
  batchManager?: string | null;
  batchManagerLabel?: string;
  color?: "blue" | "purple";
  showIcon?: boolean;
}

export function BatchManagerInfo({ batchManager, color = "blue" }: BatchManagerInfoProps) {
  if (!batchManager) return null;

  const textColor = color === "purple" ? "text-purple-400" : "text-blue-400";

  return (
    <div className="flex items-center text-xs text-slate-400 mt-1">
      <svg className={`w-4 h-4 mr-1 ${textColor}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      </svg>
      <span className="group inline-flex items-center">
        <span className={`cursor-pointer hover:text-slate-300 inline-flex items-center gap-1 ${textColor}`}>
          <span className="font-medium">{"Unknown Batch"}</span>
          <span className="text-slate-500">({batchManager})</span>
        </span>
        <div className="relative inline-block group">
          <button
            className="mx-1.5 text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer flex items-center"
            aria-label="Copy to clipboard"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(batchManager);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
          </button>
        </div>
      </span>
    </div>
  );
}
