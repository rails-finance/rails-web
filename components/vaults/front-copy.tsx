"use client";

// The vault fronts page's copy button (ui-jobs 774, E5.1): copies a vault's
// full address, a tick for a moment after, and says so in a live region.

import { useState } from "react";
import { Icon } from "@/components/icons/icon";
import { FRONT_VAULT } from "@/lib/vaults/fronts-words";

export function FrontCopy({ value }: { value: string }) {
  const [said, setSaid] = useState<"copied" | "failed" | null>(null);
  const settle = (s: "copied" | "failed") => {
    setSaid(s);
    setTimeout(() => setSaid(null), 1500);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          Promise.resolve()
            .then(() => navigator.clipboard.writeText(value))
            .then(
              () => settle("copied"),
              () => settle("failed"),
            );
        }}
        aria-label={FRONT_VAULT.copy}
        title={FRONT_VAULT.copy}
        className="inline-flex shrink-0 cursor-pointer align-middle text-rb-500 focus-ring hover:text-foreground"
        data-front-copy={value.toLowerCase()}
      >
        <Icon name={said === "copied" ? "check" : "copy"} size={12} />
      </button>
      <span className="sr-only" aria-live="polite">
        {said === "copied" ? FRONT_VAULT.copied : said === "failed" ? FRONT_VAULT.copyFailed : ""}
      </span>
    </>
  );
}
