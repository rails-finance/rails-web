'use client';

import React from 'react';
import { Link2 } from 'lucide-react';

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
      className={`-rotate-45 inline-flex items-center justify-center ml-0.5 bg-blue-500 w-4 h-4 rounded-full transition-colors ${className}`}
      aria-label="More information"
    >
      <Link2 className="w-3 h-3 text-slate-100" />
    </a>
  );
}