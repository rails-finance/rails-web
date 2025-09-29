import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { TimelineBackground } from "../TimelineBackground";
import { loadTransactionSvg } from "@/lib/utils/svgMapping";
import { useEffect, useState } from "react";

interface CloseTroveIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function CloseTroveIcon({ tx, isFirst = false, isLast = false, isExpanded = false }: CloseTroveIconProps) {
  const [svgContent, setSvgContent] = useState<string>("");

  if (!isTroveTransaction(tx)) {
    return null;
  }

  // Extract asset types from transaction data
  const collateralAsset = tx.collateralType; // e.g., "WETH", "rETH", "wstETH"
  const debtAsset = tx.assetType; // e.g., "BOLD"

  useEffect(() => {
    async function loadAndProcessSVG() {
      // Determine template based on transaction data
      let templateName = "closeTrove_repayAndWithdraw"; // Default: normal close

      if (isTroveTransaction(tx) && tx.operation === "closeTrove") {
        const { debtChangeFromOperation, collChangeFromOperation } = tx.troveOperation;

        // Check if this is a zombie trove close (only withdrawing collateral)
        if (debtChangeFromOperation === 0 && collChangeFromOperation < 0) {
          templateName = "closeTrove_withdrawOnly";
        }
      }

      const svgText = await loadTransactionSvg("closeTrove", debtAsset, collateralAsset, templateName);
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
