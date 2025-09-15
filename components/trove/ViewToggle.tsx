"use client";

import { Rows2, Rows3, Rows4 } from "lucide-react";

type ViewMode = "standard" | "simplified" | "table";

interface ViewToggleProps {
  viewMode: ViewMode;
  onChange: (viewMode: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ viewMode, onChange, className = "" }: ViewToggleProps) {
  return (
    <div className={`flex items-center bg-slate-800 rounded-lg p-1 ${className}`}>
      <button
        onClick={() => onChange("standard")}
        className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
          viewMode === "standard"
            ? "bg-slate-600 text-white" 
            : "text-slate-400 hover:text-slate-300 hover:bg-slate-700"
        }`}
        aria-label="Standard view"
        title="Standard view"
      >
        <Rows2 className="w-4 h-4" />
      </button>
      
      <button
        onClick={() => onChange("simplified")}
        className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
          viewMode === "simplified"
            ? "bg-slate-600 text-white" 
            : "text-slate-400 hover:text-slate-300 hover:bg-slate-700"
        }`}
        aria-label="Simplified view"
        title="Simplified view"
      >
        <Rows3 className="w-4 h-4" />
      </button>
      
      <button
        onClick={() => onChange("table")}
        className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
          viewMode === "table"
            ? "bg-slate-600 text-white" 
            : "text-slate-400 hover:text-slate-300 hover:bg-slate-700"
        }`}
        aria-label="Table view"
        title="Table view"
      >
        <Rows4 className="w-4 h-4" />
      </button>
    </div>
  );
}