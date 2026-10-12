"use client";

// The Liquity V2 listing card's ⋮ (rails-ops TO-DO-position-card 324): the
// Trove's ID with copy, its NFT and its page link, then "What this means",
// which opens the explanation the (i) opens on the Trove page. The card sits
// inside the row's <Link>, so a press on the menu stops there and does not
// navigate.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";
import { TroveMenuRows } from "@/components/protocol/liquity-family/trove-menu-rows";
import { useTroveExplanationItems } from "@/components/trove/use-trove-explanation-items";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { liquityPositionContent } from "@/lib/shared/learn-more-content";
import { getTroveNftUrl } from "@/lib/utils/nft-utils";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";

function TroveExplanationDialog({
  trove,
  prices,
  onClose,
}: {
  trove: TroveSummary;
  prices?: OraclePricesData;
  onClose: () => void;
}) {
  const { lead, items } = useTroveExplanationItems({ trove, prices });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto" onClick={onClose}>
      <div
        className="pointer-events-none fixed inset-0 backdrop-blur-sm"
        style={{ background: "var(--backdrop-bg)" }}
      />
      <div className="relative flex min-h-full items-start justify-center p-4 sm:items-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="What this means"
          data-listing-explanation=""
          className="relative my-8 w-full max-w-lg rounded-2xl p-6 shadow-xl"
          style={{ background: "var(--surface-overlay)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onClose} className="btn-ghost absolute right-4 top-4 cursor-pointer" aria-label="Close">
            <X size={20} />
          </button>
          <h2 className="mb-4 text-lg font-bold">What this means</h2>
          <ProseExplainer paragraph={lead} items={items} />
          <div className="mt-3 flex justify-end">
            <LearnMore
              content={liquityPositionContent({
                collateralType: trove.collateralType,
                status: trove.status,
                isBatched: trove.batch.isMember,
              })}
              inline
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TroveListingMenu({ trove, prices }: { trove: TroveSummary; prices?: OraclePricesData }) {
  const [explaining, setExplaining] = useState(false);
  return (
    <span
      className="inline-flex"
      // Inside the row's <Link>: a press here, or in the dialog (a portal,
      // whose events still bubble through React), never navigates.
      onClick={(e) => {
        e.stopPropagation();
        if (e.currentTarget.contains(e.target as Node)) e.preventDefault();
      }}
    >
      <ToolsMenu
        variant="event"
        label="Position menu"
        heading="Position"
        leading={(close) => (
          <>
            <TroveMenuRows
              troveId={trove.id}
              nftUrl={getTroveNftUrl(trove.collateralType, trove.id)}
              pagePath={`/ethereum/liquity-v2/trove/${trove.collateralType}/${trove.id}`}
            />
            <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />
            <ToolsMenuItem
              icon={<Info size={16} />}
              title="What this means"
              subtitle="This Trove in plain words"
              item="what-this-means"
              onClick={() => {
                close();
                setExplaining(true);
              }}
            />
          </>
        )}
      />
      {explaining && (
        <TroveExplanationDialog trove={trove} prices={prices ?? undefined} onClose={() => setExplaining(false)} />
      )}
    </span>
  );
}
