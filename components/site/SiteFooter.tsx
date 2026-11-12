"use client";

import { useState } from "react";
import Link from "next/link";
import { LwNotice } from "@/components/shared/lw-attribution";
import { Activity, DraftingCompass, FileText, Home, Info, LayoutGrid, Signpost } from "lucide-react";
import { INPLACE_TEXT } from "@/lib/shared/ui-grammar";
import { DonateModal } from "@/components/site/DonateModal";
import { FeedbackCluster } from "@/components/shared/feedback-cluster";
import { LiquityModal } from "@/components/site/LiquityModal";
import { PhoneBeta } from "@/components/nav/phone-beta";
import { useIsHome } from "@/hooks/useIsHome";

export function SiteFooter() {
  const home = useIsHome();
  const [donateOpen, setDonateOpen] = useState(false);
  const [liquityOpen, setLiquityOpen] = useState(false);
  // Footer rail links are deliberately dumb — they land on the protocol's
  // home page (`/ethereum/aave-v4`, `/ethereum/liquity-v2`) where the search box is the wallet
  // entry point (with recent/pinned in its dropdown). The chrome stays
  // simple: one route to discover, one to drill in.
  return (
    // No ground of its own: the section above carries through, and a hairline
    // at its top, as wide as the text, is the division (Miles, 12 Nov 2026; ui-jobs 602). 64px clear
    // of the content above; on home the lower gradient carries those 64px
    // (app/(site)/page.tsx) and the footer takes the gradient's end tone.
    <footer className={home ? "bg-rb-50 dark:bg-rb-600" : "mt-16"} data-anatomy="H9">
      {/* The hairline spans the text's width, in the muted text tone at half strength. */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="border-t border-rb-500/50 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Rails Info */}
            <div>
              <div className="flex items-center gap-1.5 mb-3 text-foreground">
                <svg width={28} height={28} viewBox="0 0 200 200" fill="none" aria-hidden="true">
                  <path
                    fill="currentColor"
                    style={{ opacity: 0.85 }}
                    d="M 79.763 159.671 L 111.637 159.671 L 52.168 41.625 L 20.295 41.625 L 79.763 159.671 Z"
                  />
                  <path
                    fill="currentColor"
                    style={{ opacity: 0.85 }}
                    d="M 98.578 97.056 L 130.451 97.056 L 105.044 47.853 L 73.171 47.853 L 98.578 97.056 Z"
                  />
                  <path
                    fill="currentColor"
                    d="M 148.892 142.388 L 180.766 142.388 L 155.359 93.185 L 123.486 93.185 L 148.892 142.388 Z"
                  />
                </svg>
                <h3 className="text-xl font-semibold tracking-wide">Rails</h3>
              </div>
              <p className="body-text mb-4">
                Dedicated, read-only explorers for DeFi support. On-chain-verifiable positions, timelines, and event
                detail for the protocols you use.
              </p>
              <div className="flex items-center gap-4">
                <a
                  href="https://x.com/rails_finance"
                  target="_blank"
                  rel="noopener"
                  className="text-rb-500 hover:text-pink-500 dark:hover:text-pink-400 transition-colors duration-150"
                  title="Follow Rails on X"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://www.youtube.com/@rails_finance"
                  target="_blank"
                  rel="noopener"
                  className="text-rb-500 hover:text-pink-500 dark:hover:text-pink-400 transition-colors duration-150"
                  title="Rails Finance on YouTube"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </a>
                <a
                  href="https://github.com/rails-finance/rails-web"
                  target="_blank"
                  rel="noopener"
                  className="text-rb-500 hover:text-pink-500 dark:hover:text-pink-400 transition-colors duration-150"
                  title="Rails on GitHub"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                </a>
                <a
                  href="https://t.me/railsfinance"
                  target="_blank"
                  rel="noopener"
                  className="text-rb-500 hover:text-pink-500 dark:hover:text-pink-400 transition-colors duration-150"
                  title="Rails Finance on Telegram"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Learn about Rails — icon nav moved out of the header hamburger */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Learn about Rails</h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/"
                    className="flex items-center gap-2 text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-sm transition-colors duration-150"
                  >
                    <Home className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Home</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/start"
                    className="flex items-center gap-2 text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-sm transition-colors duration-150"
                    data-footer-start=""
                  >
                    <Signpost className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Start here</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about"
                    className="flex items-center gap-2 text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-sm transition-colors duration-150"
                  >
                    <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>About</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/coverage/ethereum"
                    className="flex items-center gap-2 text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-sm transition-colors duration-150"
                  >
                    <LayoutGrid className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Coverage</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about/architecture"
                    className="flex items-center gap-2 text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-sm transition-colors duration-150"
                  >
                    <DraftingCompass className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Architecture</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pulse"
                    className="flex items-center gap-2 text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-sm transition-colors duration-150"
                  >
                    <Activity className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Pulse</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/blog"
                    className="flex items-center gap-2 text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-sm transition-colors duration-150"
                  >
                    <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Blog</span>
                  </Link>
                </li>
              </ul>
            </div>

            {/* The third column stays empty: room in a busy footer (Miles, 6 Nov 2026). */}
            <div aria-hidden="true" className="max-md:hidden" />

            {/* Feedback, the ask, and under it the donation address, which opens
              the donate modal in place (teal, the in-place hue). */}
            <div>
              <FeedbackCluster />
              <p className="body-text mt-4">
                Support Rails at{" "}
                <button
                  type="button"
                  onClick={() => setDonateOpen(true)}
                  className={`cursor-pointer rounded-sm font-medium focus-ring ${INPLACE_TEXT}`}
                  data-footer-donate=""
                >
                  donate.rails.eth
                </button>
              </p>
            </div>

            {donateOpen && <DonateModal onClose={() => setDonateOpen(false)} />}
            {liquityOpen && <LiquityModal onClose={() => setLiquityOpen(false)} />}
          </div>

          {/* Bottom Section */}
          <div className="mt-8 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="flex flex-col md:flex-row items-center gap-4 mb-4 md:mb-0">
                <div className="flex items-center gap-2">
                  <p className="text-rb-500 text-xs">© {new Date().getUTCFullYear()} Rails</p>
                  <PhoneBeta />
                </div>
                <div className="flex gap-4">
                  <Link
                    href="/privacy"
                    className="text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-xs transition-colors duration-150"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    href="/terms"
                    className="text-rb-500 hover:text-blue-600 dark:hover:text-[var(--text-link)] text-xs transition-colors duration-150"
                  >
                    Terms of Service
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-rb-500 text-xs">
                  Built with support from{" "}
                  {/* Opens the supporters modal (which carries the outbound
                    liquity.org link) rather than navigating directly. */}
                  <button onClick={() => setLiquityOpen(true)} className="link-external hover:underline cursor-pointer">
                    Liquity
                  </button>
                </span>
              </div>
            </div>
            {/* The charts' attribution (Lightweight Charts' licence), on every page. */}
            <p
              className="mt-4 text-center text-[11px] text-rb-500 md:text-left"
              data-lw-attribution=""
              data-anatomy="H9.1"
            >
              <LwNotice />
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
