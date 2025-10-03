"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X } from "lucide-react";

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="fixed right-4 bottom-4 z-50">
      {/* Popup */}
      {isOpen && (
        <div
          ref={popupRef}
          className="absolute bottom-14 right-0 w-80 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl p-6 mb-2"
        >
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-3 right-3 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-150"
            aria-label="Close feedback"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Get in Touch</h3>

          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Something not looking correct? Got a suggestion? We'd love to hear how Rails can help{" "}
            <span className="underline">you</span>.
          </p>

          <div className="space-y-3">
            <a
              href="https://x.com/rails_finance"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Reach out on X
            </a>
          </div>
        </div>
      )}

      {/* Feedback Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all hover:scale-110 active:scale-95"
        aria-label="Feedback"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    </div>
  );
}
