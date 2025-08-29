'use client';

import React from 'react';
import { Info } from 'lucide-react';

interface InfoButtonProps {
  href: string;
  className?: string;
}

export function InfoButton({ href, className = '' }: InfoButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center ml-0.5 transition-colors ${className}`}
      aria-label="More information"
    >
      <Info className="ml-0.75 w-3.5 h-3.5 top-0.5 relative text-slate-300" />
    </a>
  );
}