"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

// ── Content types ────────────────────────────────────────────────────────────

export interface LearnMoreLink {
  label: string;
  url: string;
}

export interface LearnMoreVideo {
  label: string;
  url: string;
  description: string;
}

export interface LearnMoreContent {
  title: string;
  /** Introductory paragraph */
  intro: string;
  /** Optional numbered steps (e.g. "How it works:") */
  stepsHeading?: string;
  steps?: string[];
  /** Optional bullet-point benefits/details */
  detailsHeading?: string;
  details?: { bold: string; text: string }[];
  /** Optional extra paragraphs (context-sensitive) */
  extraParagraphs?: string[];
  /** Optional video resource */
  video?: LearnMoreVideo;
  /** Quick links to docs / FAQs */
  links?: LearnMoreLink[];
}

// ── ? Button (placed bottom-right of explainer panel) ────────────────────────

export function LearnMoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cursor-pointer btn-icon w-7 h-7 rounded-full focus-ring"
      aria-label="Learn more"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    </button>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function LearnMoreModal({ content, onClose }: { content: LearnMoreContent; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while the modal is open so the backdrop stays glued to
  // the card — no decoupled "page scrolls behind a fixed overlay" feel. The
  // overlay itself owns the scroll so tall copy still works on short screens.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Portal to document.body so the modal escapes any transformed / clipped
  // ancestor (e.g. the economics panel) and overlays the whole viewport.
  // SSR guard: render nothing on the server since document is undefined.
  if (typeof document === "undefined") return null;

  return createPortal(
    // z-[9999] so we sit above the header bar (z-[90]). The overlay owns the
    // scroll for tall content; the inner card grows naturally with its copy.
    <div className="fixed inset-0 z-[9999] overflow-y-auto" onClick={onClose}>
      <div
        className="fixed inset-0 backdrop-blur-sm pointer-events-none"
        style={{ background: "var(--backdrop-bg)" }}
      />
      <div className="relative min-h-full flex items-start sm:items-center justify-center p-4">
        <div
          className="relative rounded-2xl max-w-lg w-full my-8 p-6 shadow-xl"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
        >
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

          <h2 className="text-lg font-bold  mb-4">{content.title}</h2>

          <div className="space-y-3 text-sm  leading-relaxed">
            <p>{content.intro}</p>

            {content.stepsHeading && content.steps && (
              <>
                <p className="font-semibold ">{content.stepsHeading}</p>
                <ul className="space-y-2 list-none">
                  {content.steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className=" shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {content.extraParagraphs?.map((p, i) => (
              <p key={i}>{p}</p>
            ))}

            {content.detailsHeading && content.details && (
              <>
                <p className="font-semibold  mt-4">{content.detailsHeading}</p>
                <ul className="space-y-1.5 list-none">
                  {content.details.map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <span className=" shrink-0">&bull;</span>
                      <span>
                        <strong className="">{d.bold}</strong> &mdash; {d.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {content.video && (
              <div className="mt-4">
                <p className="font-semibold  mb-2">Learn More</p>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-red-500/10 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                  </div>
                  <div className="text-xs ">
                    {content.video.description}{" "}
                    <a
                      href={content.video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-external underline"
                    >
                      {content.video.label} ↗
                    </a>
                  </div>
                </div>
              </div>
            )}

            {content.links && content.links.length > 0 && (
              <div className="mt-4">
                <p className="font-semibold  mb-2">Quick Links</p>
                <div className="space-y-1">
                  {content.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs link-external hover:underline"
                    >
                      ↗ {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Convenience wrapper: ? button + modal together ───────────────────────────

// `inline` drops the bottom-right panel placement (justify-end + mt-3) so the
// "?" trigger can sit centered next to a heading instead of anchored to the
// corner of an explainer panel.
export function LearnMore({ content, inline = false }: { content: LearnMoreContent; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <div className={inline ? "flex items-center" : "flex justify-end mt-3"}>
        <LearnMoreButton onClick={() => setOpen(true)} />
      </div>
      {open && <LearnMoreModal content={content} onClose={close} />}
    </>
  );
}
