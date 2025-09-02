'use client';

import React, { useState, useEffect } from 'react';
import { X, Info, CircleQuestionMark, ChevronDown, ChevronUp, Hash } from 'lucide-react';
import { Icon } from '@/components/icons/icon';

interface ExplanationPanelProps {
  items: React.ReactNode[];
  onToggle?: (isOpen: boolean) => void;
  defaultOpen?: boolean;
  transactionHash?: string;
}

export function ExplanationPanel({ items, onToggle, defaultOpen = true, transactionHash }: ExplanationPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen); // Use defaultOpen directly
  const [isHydrated, setIsHydrated] = useState(false);
  const [copiedTxHash, setCopiedTxHash] = useState(false);
  
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
    <div className={`rounded-b-lg shadow-inner py-1 ${shouldShowOpen ? 'bg-slate-950 w-full' : 'bg-slate-950 shadow-inner w-fit'}`}>
      {!shouldShowOpen ? (
        <button
          onClick={handleToggle}
          className="cursor-pointer px-4.5 flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
          aria-expanded={shouldShowOpen}
          aria-label="Show transaction details"
        >
          <Info className="w-4 h-5" />
          <ChevronDown className="w-3 h-3" />
          <span className="text-xs"></span>
        </button>
      ) : (
        <div className="">
          <button
            onClick={handleToggle}
          className="cursor-pointer w-full px-4.5 flex items-center justify-between gap-1 text-slate-400 hover:text-slate-200 transition-colors"
          aria-expanded={shouldShowOpen}
          aria-label="Show transaction details"
        >
          <div className="flex items-center gap-1"><Info className="w-4 h-5" />
          <ChevronUp className="w-3 h-3" /></div>
          
          <div><X className="w-3 h-3" /></div>
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
          {transactionHash && (
            <div className="px-4 pb-2">
              <div className="pt-2 flex justify-end">
                <span className="bg-slate-800 rounded-sm px-1.5 py-1 inline-flex items-center">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Hash size={12} />
                    {transactionHash.substring(0, 8)}...
                    <div className="relative inline-block group">
                      <button
                        className="mx-1.5 text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer flex items-center"
                        aria-label={copiedTxHash ? "Copied to clipboard" : "Copy to clipboard"}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigator.clipboard.writeText(transactionHash);
                          setCopiedTxHash(true);
                          setTimeout(() => setCopiedTxHash(false), 2000);
                        }}
                      >
                        <Icon name={copiedTxHash ? "check" : "copy"} size={14} />
                      </button>
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 pointer-events-none">
                        <div
                          className={`bg-slate-700 text-slate-200 px-2 py-1 rounded text-xs whitespace-nowrap transition-opacity duration-200 ${
                            copiedTxHash ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {copiedTxHash ? "Copied!" : "Copy"}
                        </div>
                      </div>
                    </div>
                  </span>
                </span>
              </div>
            </div>
          )}
          <button
            onClick={handleToggle}
            className="cursor-pointer w-full py-1 flex items-center justify-center gap-1 text-slate-600 hover:text-slate-300 transition-colors"
            aria-expanded={shouldShowOpen}
            aria-label="Hide transaction details"
          >
          	<ChevronUp className="w-3 h-3" />
						<span className="text-xs h-4"></span>
          </button>
        </div>
      )}
    </div>
  );
}