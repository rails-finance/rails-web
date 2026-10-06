"use client";

import { useState } from "react";

export function TxHashBadge({
  txHash,
  label,
}: {
  txHash: string;
  /** A word before the hash ("Transaction"), for a page that names it.
   *  Unset changes nothing. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const short = `${txHash.slice(0, 8)}\u2026`;

  // Plain muted text with its copy control (ui-jobs 281): no box, no fill,
  // no "#" mark.
  return (
    <span className="inline-flex items-center gap-1 text-xs text-rb-500" data-tx-hash="">
      <span className="tabular-nums">{label ? `${label} ${short}` : short}</span>
      <button
        type="button"
        className="cursor-pointer rounded-sm p-0.5 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-rb-400"
        aria-label="Copy tx hash"
        data-tx-hash-copy=""
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
          aria-hidden="true"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      </button>
      {copied && <span className="text-xs text-green-400">Copied!</span>}
    </span>
  );
}
