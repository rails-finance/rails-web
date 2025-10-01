"use client";

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';

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
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
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
            className="absolute top-3 right-3 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            aria-label="Close feedback"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Get in Touch
          </h3>

          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Something not looking correct? Got a suggestion? We'd love to hear how Rails can help <span className="underline">you</span>.
          </p>

          <div className="space-y-3">
            <a
              href="https://t.me/milescumming"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18.717-2.558 11.42-3.005 13.831-.189 1.02-.562 1.36-.922 1.394-.784.072-1.378-.518-2.136-1.015-1.184-.777-1.852-1.261-3.002-2.018-1.329-.876-.467-1.357.29-2.146.198-.206 3.643-3.338 3.71-3.625.008-.036.016-.17-.063-.241-.079-.071-.196-.047-.28-.027-.119.028-2.011 1.278-5.673 3.75-.537.371-.023.567.535.793 1.913.847 4.23 1.474 4.23 1.474s.703.234 1.076.119c.373-.115 1.175-.581 1.175-.581s1.724-1.104 3.078-2.084c.454-.328.151-.522-.217-.742z"/>
              </svg>
              Contact Miles on Telegram
            </a>

            <a
              href="https://x.com/LiquityProtocol"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
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
