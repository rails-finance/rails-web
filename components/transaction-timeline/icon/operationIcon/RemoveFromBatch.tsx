import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { TimelineBackground } from "../TimelineBackground";
import { getTransactionImageKey } from "@/lib/utils/transactionImages";
import { loadTransactionSvg } from "@/lib/utils/svgMapping";
import { useEffect, useState } from "react";

interface RemoveFromBatchIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function RemoveFromBatchIcon({
  tx,
  isFirst = false,
  isLast = false,
  isExpanded = false,
}: RemoveFromBatchIconProps) {
  const [svgContent, setSvgContent] = useState<string>("");

  if (!isTroveTransaction(tx)) {
    return null;
  }

  // Use existing logic to determine the transaction image key
  const imageKey = getTransactionImageKey(tx);

  useEffect(() => {
    async function loadAndProcessSVG() {
      // Only handle removeFromBatch operations with this component
      if (imageKey !== "removeFromBatch") {
        return;
      }

      const svgText = await loadTransactionSvg(imageKey);
      setSvgContent(svgText || "");
    }

    loadAndProcessSVG();
  }, [imageKey]);

  return (
    <>
      {/* Timeline Background - extends full height of transaction row */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full z-10 pointer-events-none">
        <TimelineBackground tx={tx} isFirst={isFirst} isLast={isLast} isExpanded={isExpanded} />
      </div>

      {/* Transaction Graphic - loaded from SVG template */}
      <div className="relative z-20 w-30 h-25 flex items-center justify-center sm:w-25">
        {svgContent ? <div dangerouslySetInnerHTML={{ __html: svgContent }} /> : <div>Loading...</div>}
      </div>
    </>
  );
}
