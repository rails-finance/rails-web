"use client";

// The release-stage pill (H25, ui-jobs 769): an outlined "Beta" beside the
// Rails mark, under it on the rail from 768px (H1) and to its right in the
// phone header bar below it (H2). A press opens the feedback form (H27) on
// General.

import { useState } from "react";

import { FeedbackModal } from "@/components/shared/feedback-modal";

export function BetaPill({ placement }: { placement: "rail" | "header" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Beta: send feedback"
        title="Rails is in beta. Send feedback"
        className="cursor-pointer rounded-full border border-rb-300 px-1.5 text-[9px] font-semibold uppercase leading-[14px] tracking-wider text-rb-500 transition-colors hover:border-rb-500 hover:text-foreground focus-ring dark:border-rb-500 dark:hover:border-rb-300"
        data-beta-pill={placement}
        data-anatomy="H25"
      >
        Beta
      </button>
      {open && <FeedbackModal initialType="general" onClose={() => setOpen(false)} />}
    </>
  );
}
