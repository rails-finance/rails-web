"use client";

import Link from "next/link";
import { usePriceStripActive } from "@/components/shared/price-strip";
import { FeedbackCluster } from "@/components/shared/feedback-cluster";

/** Slim app footer used on protocol pages (/liquity-v2, /trove/*).
 *  Single row: copyright + legal on the left, the shared feedback cluster
 *  (heading + ask + teal Send-feedback pill) on the right. No rule above it —
 *  the page's last section ends where it ends (Miles, 2026-09-02). The "Built
 *  with support from Liquity" credit has been retired from this surface — it
 *  lives on the marketing site footer (see SiteFooter) where the messaging
 *  context fits — and so has the Coverage link: the depth matrix is reached
 *  from the explorer's own info page, not the legal row.
 *
 *  When a detail page mounts the fixed bottom PriceStrip, the footer pads its
 *  bottom so its content clears the strip instead of sitting behind it. */
export function AppFooter() {
  const priceStripActive = usePriceStripActive();
  return (
    <footer className="mt-16">
      <div className={`max-w-7xl mx-auto px-4 pt-6 ${priceStripActive ? "pb-20" : "pb-6"}`}>
        <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-6 md:gap-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <p className="text-xs text-rb-500">© {new Date().getUTCFullYear()} Rails</p>
            <div className="flex gap-4">
              <Link href="/privacy" className="text-rb-500 hover:text-foreground text-xs transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-rb-500 hover:text-foreground text-xs transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
          {/* The shared feedback cluster (its own modal state) — the slim
              inline variant: no heading, ask + pill on one row in small text. */}
          <FeedbackCluster variant="inline" />
        </div>
      </div>
    </footer>
  );
}
