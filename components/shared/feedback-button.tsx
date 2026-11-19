"use client";

// The floating feedback button (H26, ui-jobs 769): teal, at the window's
// bottom right on every page, opening the feedback form (H27). Its glyph is a
// speech bubble with the facehash's round eyes, which blink now and then
// (`.feedback-blink`, app/globals.css; still under reduced motion). On hover or
// keyboard focus it widens to the left and shows Miles's face; a touch screen
// has no hover, so there the face is in the form's header. Below 768px it
// rises over the compare bar (E3) while that shows (app/globals.css).

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

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
          <BubbleFace />
        </span>
      </button>
      {open && <FeedbackModal initialType="general" onClose={() => setOpen(false)} />}
    </>
  );
}

/** A speech bubble, its tail at the lower left, with the profile facehash's
 *  round eyes (H20, ui-jobs 727). */
function BubbleFace() {
  // Every 7s the eyes take one 420ms blink, then the layer sits idle until the
  // next: the attribute runs the keyframes once, so no frame restyles between.
  const eyes = useRef<SVGGElement>(null);
  useEffect(() => {
    const g = eyes.current;
    if (!g) return;
    const end = () => g.removeAttribute("data-blinking");
    g.addEventListener("animationend", end);
    const id = window.setInterval(() => g.setAttribute("data-blinking", ""), 7000);
    return () => {
      window.clearInterval(id);
      g.removeEventListener("animationend", end);
    };
  }, []);
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" aria-hidden="true" data-feedback-face="">
      <path
        d="M6.5 4h11A3.5 3.5 0 0 1 21 7.5v6a3.5 3.5 0 0 1-3.5 3.5H9l-5 3.5.4-4.1A3.5 3.5 0 0 1 3 13.5v-6A3.5 3.5 0 0 1 6.5 4Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <g ref={eyes} className="feedback-blink" fill="currentColor">
        <circle cx={9.5} cy={10.5} r={1.5} />
        <circle cx={14.5} cy={10.5} r={1.5} />
      </g>
    </svg>
  );
}
