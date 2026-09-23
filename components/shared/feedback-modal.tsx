"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

// Footer feedback modal — Bug report / Data correction / Feature request.
// Mirrors DonateModal's shell (portal, mounted gate, Esc close, body scroll
// lock) and POSTs to /api/feedback, which relays to the private team chat.
// The hidden "website" field is a honeypot: readers never see it, so a
// non-empty value marks the submission as bot traffic.

type FeedbackType = "bug" | "data" | "feature";

const CATEGORIES: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "Bug report" },
  { value: "data", label: "Data correction" },
  { value: "feature", label: "Feature request" },
];

const DESCRIPTION_PLACEHOLDER: Record<FeedbackType, string> = {
  bug: "What happened, and what was expected instead? Steps to reproduce help.",
  data: "Which number looks wrong, and what was expected? A link or tx hash helps.",
  feature: "What should the explorer surface, and where would it help?",
};

const FIELD_CLASSES = "w-full rounded-xl border border-rb-200 dark:border-rb-700 px-3 py-2 text-sm input-focus";
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
        setError(data?.error ?? "Too many submissions — try again later");
      } else {
        setError("Sending failed — the form is intact, try again in a moment.");
      }
    } catch {
      setError("Sending failed — the form is intact, try again in a moment.");
    } finally {
      setPending(false);
    }
  };

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
          className="relative rounded-2xl w-full max-w-md my-8 p-6 shadow-xl border border-rb-200 dark:border-rb-800 flex flex-col gap-5"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
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
          <div className="pr-8">
            <h2 id="feedback-modal-title" className="text-xl font-semibold text-foreground">
              Send feedback
            </h2>
            <p className="text-sm text-rb-500 mt-0.5">Lands directly with the Rails team.</p>
          </div>

          {sent ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground">Thanks — received.</p>
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

              {/* Title — bug/feature only */}
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
