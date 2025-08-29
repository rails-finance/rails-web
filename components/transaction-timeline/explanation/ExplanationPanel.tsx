'use client';

import React, { useState, useEffect } from 'react';
import { Info, CircleQuestionMark, ChevronDown, ChevronUp } from 'lucide-react';

interface ExplanationPanelProps {
  items: React.ReactNode[];
  onToggle?: (isOpen: boolean) => void;
  defaultOpen?: boolean;
}

export function ExplanationPanel({ items, onToggle, defaultOpen = true }: ExplanationPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen); // Use defaultOpen directly
  const [isHydrated, setIsHydrated] = useState(false);
  
  useEffect(() => {
    setIsHydrated(true);
    onToggle?.(isOpen); // Enable hover context based on current state
  }, [onToggle, isOpen]);
  
  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onToggle?.(newState);
  };

  if (items.length === 0) {
    return null;
  }

  // Show the appropriate state based on isOpen
  const shouldShowOpen = isOpen;


  return (
    <div className={`rounded-b-lg shadow-inner ${shouldShowOpen ? 'bg-slate-950' : 'bg-slate-950 shadow-inner w-22'}`}>
      {!shouldShowOpen ? (
        <button
          onClick={handleToggle}
          className="cursor-pointer w-full py-1 flex items-center justify-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
          aria-expanded={shouldShowOpen}
          aria-label="Show transaction details"
        >
          <Info className="w-4 h-5" />
          <span className="text-xs"> Show</span>
        </button>
      ) : (
        <div className="">
          <button
            onClick={handleToggle}
          className="cursor-pointer w-full py-1 px-4.5 flex items-center justify-right gap-1 text-slate-400 hover:text-slate-200 transition-colors"
          aria-expanded={shouldShowOpen}
          aria-label="Show transaction details"
        >
          <Info className="w-4 h-5" />
          <span className="text-xs">Hide</span>
          </button>
        <div className="p-4 pb-2">
          
          <div className="text-white space-y-2 text-sm">
            {items.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-slate-400 mt-0.5">•</span>
                {item}
              </div>
            ))}
          </div>
        </div>
          <button
            onClick={handleToggle}
            className="cursor-pointer w-full py-1 flex items-center justify-center gap-1 text-slate-600 hover:text-slate-300 transition-colors"
            aria-expanded={shouldShowOpen}
            aria-label="Hide transaction details"
          >
            <span className="text-xs h-4"></span>
          </button>
        </div>
      )}
    </div>
  );
}