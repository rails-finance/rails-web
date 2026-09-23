"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LiquityLogo } from "@/components/LiquityLogo";

/** Liquity supporters credit — the thank-you card from the retired About
 *  page, now a modal opened from the footer's "Built with support from
 *  Liquity" line. Shell cloned from DonateModal: portal to document.body,
 *  Escape-to-close, body-scroll lock, backdrop click-to-close. */
function LiquityModalInner({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto" onClick={onClose}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 backdrop-blur-sm pointer-events-none"
        style={{ background: "var(--backdrop-bg)" }}
      />
      {/* Centering wrapper */}
      <div className="relative min-h-full flex items-start sm:items-center justify-center p-4">
        <div
          className="relative rounded-2xl w-full max-w-sm my-8 p-6 shadow-xl border border-rb-200 dark:border-rb-800 flex flex-col gap-5"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="liquity-modal-title"
        >
          {/* Close */}
          <button onClick={onClose} className="absolute top-4 right-4 btn-ghost cursor-pointer" aria-label="Close">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>

          {/* Header */}
          <div className="pr-8">
            <h2 id="liquity-modal-title" className="text-xl font-semibold text-foreground">
              Our Supporters
            </h2>
          </div>

          {/* Logo — links out to liquity.org for anyone who wants to leave */}
          <a
            href="https://liquity.org"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Liquity"
            className="inline-block"
          >
            <LiquityLogo className="h-9 w-auto" />
          </a>

          <p className="body-text">
            Liquity has been instrumental in getting Rails off the ground, providing a grant to kickstart our
            development. Their support enables us to build critical infrastructure for the Liquity ecosystem and beyond.
            Thank you to Liquity!
          </p>
        </div>
      </div>
    </div>
  );
}

export function LiquityModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<LiquityModalInner onClose={onClose} />, document.body);
}
