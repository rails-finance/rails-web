import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { TimelineBackground } from "../TimelineBackground";
import { loadTransactionSvg } from "@/lib/utils/svgMapping";
import { useEffect, useState } from "react";

interface OpenTroveIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function OpenTroveIcon({ tx, isFirst = false, isLast = false, isExpanded = false }: OpenTroveIconProps) {
  const [svgContent, setSvgContent] = useState<string>("");

  if (!isTroveTransaction(tx)) {
    return null;
  }

  // Extract asset types from transaction data
  const collateralAsset = tx.collateralType; // e.g., "WETH", "rETH", "wstETH"
  const debtAsset = tx.assetType; // e.g., "BOLD"

  useEffect(() => {
    async function loadAndProcessSVG() {
      const svgText = await loadTransactionSvg("openTrove", debtAsset, collateralAsset);
      setSvgContent(svgText || "");
    }

    loadAndProcessSVG();
  }, [debtAsset, collateralAsset]);

  return (
    <>
      {/* Timeline Background - extends full height of transaction row */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full z-10 pointer-events-none">
        <TimelineBackground tx={tx} isFirst={isFirst} isLast={isLast} isExpanded={isExpanded} />
      </div>

      {/* Transaction Graphic - loaded from SVG template */}
      <div
        className="relative z-20 w-30 h-25 flex items-center justify-center sm:w-25"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    </>
  );
}
