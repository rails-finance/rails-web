"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Image from "next/image";

import { RailsMark } from "@/components/nav/rails-mark";
import { FEEDBACK_FACE, FEEDBACK_FACE_NAME } from "@/lib/shared/feedback-face";

// The feedback form (H27) — Bug / Correctness / Request / General.
// Mirrors DonateModal's shell (portal, mounted gate, Esc close, body scroll
// lock), holds keyboard focus inside itself while open and hands it back on
// close, and POSTs to /api/feedback, which relays to the private team chat.
// Its header (H27.1) pairs the Rails mark with Miles's face (ui-jobs 769).
// The hidden "website" field is a honeypot: readers never see it, so a
// non-empty value marks the submission as bot traffic.

// The stored values (bug, data, feature) predate the labels and stay; only
// the visible words changed. "general" is the open-ended feedback type.
export type FeedbackType = "bug" | "data" | "feature" | "general";

const CATEGORIES: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "data", label: "Correctness" },
  { value: "feature", label: "Request" },
  { value: "general", label: "General" },
];

const DESCRIPTION_PLACEHOLDER: Record<FeedbackType, string> = {
  bug: "What happened, and what was expected instead? Steps to reproduce help.",
  data: "Which number looks wrong, and what was expected? A link or tx hash helps.",
  feature: "What should the explorer surface, and where would it help?",
  general: "What's working, what isn't, what you'd like to see?",
};

const FIELD_CLASSES =
  "w-full rounded-xl border border-rb-200 dark:border-rb-700 px-3 py-2 text-base sm:text-sm input-focus";
const FIELD_BG = { background: "var(--surface-field)" } as const;

export interface FeedbackModalProps {
  onClose: () => void;
  /** Open on a category other than the default "bug" — the boundary card's
   *  full-history request opens as a feature request. */
  initialType?: FeedbackType;
  /** Pre-fill the title. The page path is always sent (`page` below), so a
   *  caller need only say what is being asked for. */
  initialTitle?: string;
}

function FeedbackModalInner({ onClose, initialType = "bug", initialTitle = "" }: FeedbackModalProps) {
  const pathname = usePathname();
  const [type, setType] = useState<FeedbackType>(initialType);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — stays empty for real readers
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus moves into the form on open and returns to the control that opened
  // it on close; Tab and Shift+Tab cycle inside it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([tabindex="-1"]), textarea, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
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

  const needsTitle = type !== "data";
  const titleValid = !needsTitle || (title.trim().length >= 3 && title.trim().length <= 100);
  const descriptionValid = description.trim().length >= 10 && description.trim().length <= 2000;
  const canSubmit = titleValid && descriptionValid && !pending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          ...(needsTitle ? { title: title.trim() } : {}),
          description: description.trim(),
          ...(contact.trim() ? { contact: contact.trim() } : {}),
          page: pathname,
          website,
        }),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      if (res.status === 429) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Too many submissions: try again later");
      } else {
        setError("Sending failed: the form is intact, try again in a moment.");
      }
    } catch {
      setError("Sending failed: the form is intact, try again in a moment.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] overflow-y-auto" onClick={onClose}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 backdrop-blur-sm pointer-events-none"
        style={{ background: "var(--backdrop-bg)" }}
      />
      {/* Centering wrapper */}
      <div className="relative min-h-full flex items-start sm:items-center justify-center p-4">
        <div
          className="relative rounded-2xl w-full max-w-md my-8 p-6 shadow-xl border border-rb-200 dark:border-rb-800 flex flex-col gap-5"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
          ref={dialogRef}
          data-anatomy="H27"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
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
          <div className="pr-8" data-anatomy="H27.1">
            <div className="flex items-center gap-3">
              <h2 id="feedback-modal-title" className="text-xl font-semibold text-foreground">
                Send feedback
              </h2>
              {/* Miles's face is read out by name (Miles, 19 Nov 2026); the
                  mark beside it is decoration. */}
              <span className="flex items-center" data-feedback-faces="">
                <span
                  aria-hidden="true"
                  className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-rb-300 text-foreground dark:border-rb-500"
                  style={{ background: "var(--surface-overlay)" }}
                >
                  <RailsMark size={18} />
                </span>
                <Image
                  src={FEEDBACK_FACE}
                  alt={FEEDBACK_FACE_NAME}
                  width={32}
                  height={32}
                  className="-ml-1 h-8 w-8 rounded-full"
                />
              </span>
            </div>
            <p className="text-sm text-rb-500 mt-0.5">Goes to the Rails team.</p>
          </div>

          {sent ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground">Thanks, received.</p>
              <button
                onClick={onClose}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold tracking-widest uppercase py-3 rounded-xl transition-colors duration-150 cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
            >
              {/* Category pills */}
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Feedback category">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="tab"
                    aria-selected={type === c.value}
                    onClick={() => setType(c.value)}
                    className={`${type === c.value ? "pill-active" : "pill-idle"} cursor-pointer`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Page line — auto-captured, read-only */}
              <p className="text-xs text-rb-500" data-testid="feedback-page-line">
                Page: <span className="font-mono break-all">{pathname}</span>
              </p>

              {/* Title — every type but Correctness */}
              {needsTitle && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold tracking-widest text-rb-400 uppercase">Title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                    placeholder="Short summary"
                    className={FIELD_CLASSES}
                    style={FIELD_BG}
                  />
                </label>
              )}

              {/* Description */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold tracking-widest text-rb-400 uppercase">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder={DESCRIPTION_PLACEHOLDER[type]}
                  className={`${FIELD_CLASSES} resize-y`}
                  style={FIELD_BG}
                />
                <span className="text-xs text-rb-400 self-end" data-testid="feedback-counter">
                  {description.length}/2000
                </span>
              </label>

              {/* Contact — optional */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold tracking-widest text-rb-400 uppercase">Contact (optional)</span>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  maxLength={100}
                  placeholder="Telegram, X, or email handle"
                  className={FIELD_CLASSES}
                  style={FIELD_BG}
                />
                <span className="text-xs text-rb-400">Only visible to the Rails team.</span>
              </label>

              {/* Honeypot — hidden from readers and assistive tech */}
              <div style={{ display: "none" }} aria-hidden="true">
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-rb-500">{error}</p>}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-bold tracking-widest uppercase py-3 rounded-xl transition-colors duration-150 cursor-pointer"
              >
                {pending ? "Sending…" : "Send feedback"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedbackModal(props: FeedbackModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<FeedbackModalInner {...props} />, document.body);
}
