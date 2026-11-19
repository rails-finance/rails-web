"use client";

// The floating feedback button (H26, ui-jobs 769): teal, at the window's
// bottom right on every page, opening the feedback form (H27). On hover or
// keyboard focus it widens to the left and shows Miles's face; a touch screen
// has no hover, so there the face is in the form's header. Below 768px it
// rises over the compare bar (E3) while that shows (app/globals.css).

import { useState } from "react";
import Image from "next/image";
import { MessageSquarePlus } from "lucide-react";

import { FeedbackModal } from "@/components/shared/feedback-modal";
import { FEEDBACK_FACE } from "@/lib/shared/feedback-face";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        title="Send feedback"
        className="group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex cursor-pointer items-center rounded-full bg-teal-600 p-1 text-white shadow-lg transition-colors hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:bg-teal-500 dark:hover:bg-teal-600 dark:focus-visible:outline-teal-400 print:hidden"
        data-feedback-button=""
        data-anatomy="H26"
      >
        <span
          aria-hidden="true"
          className="block w-0 overflow-hidden rounded-full opacity-0 transition-[width,margin,opacity] duration-200 group-hover:mr-0.5 group-hover:w-10 group-hover:opacity-100 group-focus-visible:mr-0.5 group-focus-visible:w-10 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          <Image
            src={FEEDBACK_FACE}
            alt=""
            width={40}
            height={40}
            className="block h-10 w-10 max-w-none rounded-full"
          />
        </span>
        <span className="flex h-10 w-10 items-center justify-center" aria-hidden="true">
          <MessageSquarePlus className="h-5 w-5" strokeWidth={2.25} />
        </span>
      </button>
      {open && <FeedbackModal initialType="general" onClose={() => setOpen(false)} />}
    </>
  );
}
