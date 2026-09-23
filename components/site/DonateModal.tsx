"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const DONATE_ADDRESS = "0xdf335A6379aD17213619230ae34c46d6eb3a1929";
const ETHERSCAN_URL = explorerUrl(MAINNET_CHAIN_ID, "address", DONATE_ADDRESS);

function DonateModalInner({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(DONATE_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

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
          aria-labelledby="donate-modal-title"
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
            <h2 id="donate-modal-title" className="text-xl font-semibold text-foreground">
              Contribute
            </h2>
            <p className="text-sm text-rb-500 mt-0.5">
              Accepts ETH, stablecoins, or any other ERC-20 on Ethereum mainnet.
            </p>
          </div>

          {/* QR code */}
          <div className="flex justify-center">
            <div className="bg-white rounded-xl p-4">
              <QRCodeSVG value={DONATE_ADDRESS} size={192} level="M" marginSize={0} />
            </div>
          </div>

          {/* Address row */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-widest text-rb-400 uppercase">Contribution address</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-foreground break-all">{DONATE_ADDRESS}</span>
              <a
                href={ETHERSCAN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 link-external"
                aria-label="View on Etherscan"
              >
                <svg
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
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold tracking-widest uppercase py-3.5 rounded-xl transition-colors duration-150 cursor-pointer"
          >
            {copied ? "Copied!" : "Copy address"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DonateModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<DonateModalInner onClose={onClose} />, document.body);
}
