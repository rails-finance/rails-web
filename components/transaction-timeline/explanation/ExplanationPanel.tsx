'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ExplanationPanelProps {
  items: React.ReactNode[];
  onToggle?: (isOpen: boolean) => void;
}

export function ExplanationPanel({ items, onToggle }: ExplanationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onToggle?.(newState);
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/40 rounded-lg">
      {!isOpen ? (
        <button
          onClick={handleToggle}
          className="cursor-pointer w-full p-4 flex items-center justify-center gap-2 text-slate-400 hover:text-slate-300 transition-colors"
          aria-expanded={false}
          aria-label="Show transaction details"
        >
          <ChevronDown className="w-4 h-4" />
          <span className="text-sm">Show details</span>
        </button>
      ) : (
        <div className="p-4">
          <div className="text-white space-y-2 text-sm mb-3">
            {items.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-slate-400 mt-0.5">•</span>
                {item}
              </div>
            ))}
          </div>
          
          <button
            onClick={handleToggle}
            className="cursor-pointer w-full pt-3 border-t border-slate-700/30 flex items-center justify-center gap-2 text-slate-400 hover:text-slate-300 transition-colors"
            aria-expanded={true}
            aria-label="Hide transaction details"
          >
            <ChevronUp className="w-4 h-4" />
            <span className="text-sm">Hide details</span>
          </button>
        </div>
      )}
    </div>
  );
}