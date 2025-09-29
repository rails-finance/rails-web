import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { TimelineBackground } from "../TimelineBackground";
import { getTransactionImageKey } from "@/lib/utils/transactionImages";
import { loadTransactionSvg } from "@/lib/utils/svgMapping";
import { useEffect, useState } from "react";

interface AdjustTroveIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function AdjustTroveIcon({ tx, isFirst = false, isLast = false, isExpanded = false }: AdjustTroveIconProps) {
  const [svgContent, setSvgContent] = useState<string>("");

  if (!isTroveTransaction(tx)) {
    return null;
  }

  // Use existing logic to determine the transaction image key
  const imageKey = getTransactionImageKey(tx);

  // Extract asset types from transaction data
  const collateralAsset = tx.collateralType; // e.g., "WETH", "rETH", "wstETH"
  const debtAsset = tx.assetType; // e.g., "BOLD"

  useEffect(() => {
    async function loadAndProcessSVG() {
      // Only handle adjustTrove operations with this component
      if (!imageKey.startsWith("adjustTrove_")) {
        setSvgContent("");
        return;
      }

      const svgText = await loadTransactionSvg(imageKey, debtAsset, collateralAsset);
      setSvgContent(svgText || "");
    }

    loadAndProcessSVG();
  }, [imageKey, debtAsset, collateralAsset]);

  return (
    <>
      {/* Timeline Background - extends full height of transaction row */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full z-10 pointer-events-none">
        <TimelineBackground tx={tx} isFirst={isFirst} isLast={isLast} isExpanded={isExpanded} />
      </div>

      {/* Transaction Graphic - loaded from SVG template */}
      <div className="relative z-20 w-20 h-20 flex items-center justify-center ">
        {svgContent ? <div dangerouslySetInnerHTML={{ __html: svgContent }} /> : <div>Loading...</div>}
      </div>
    </>
  );
}
