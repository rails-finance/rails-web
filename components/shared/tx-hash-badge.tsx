"use client";

import { useState } from "react";

export function TxHashBadge({ txHash }: { txHash: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${txHash.slice(0, 8)}\u2026`;

  return (
    <span className="rounded-sm px-1.5 py-1 inline-flex items-center surface-inset">
      <span className=" text-xs flex items-center gap-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" x2="20" y1="9" y2="9" />
          <line x1="4" x2="20" y1="15" y2="15" />
          <line x1="10" x2="8" y1="3" y2="21" />
          <line x1="16" x2="14" y1="3" y2="21" />
        </svg>
        {short}
        <button
          className="btn-ghost focus:outline-none cursor-pointer"
          aria-label="Copy tx hash"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(txHash);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
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
        {copied && <span className="text-xs text-green-400">Copied!</span>}
      </span>
    </span>
  );
}
