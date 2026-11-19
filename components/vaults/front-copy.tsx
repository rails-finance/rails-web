"use client";

// The vault fronts page's copy button (ui-jobs 774, E5.1): copies a vault's
// full address, a tick for a moment after.

import { useState } from "react";
import { Icon } from "@/components/icons/icon";

export function FrontCopy({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 cursor-pointer align-middle text-rb-500 focus-ring hover:text-foreground"
      data-front-copy={value.toLowerCase()}
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
    </button>
  );
}
