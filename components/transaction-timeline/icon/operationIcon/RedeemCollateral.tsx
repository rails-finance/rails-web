import { Transaction } from "@/types/api/troveHistory";
import { TimelineBackground } from "../TimelineBackground";
import { getTransactionImageKey } from "@/lib/utils/transactionImages";

import { useEffect, useState } from "react";

interface RedeemCollateralIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function RedeemCollateralIcon({
  tx,
  isFirst = false,
  isLast = false,
  isExpanded = false,
}: RedeemCollateralIconProps) {
  const [svgContent, setSvgContent] = useState<string>("");

  // Use existing logic to determine the transaction image key
  const imageKey = getTransactionImageKey(tx);

  useEffect(() => {
    async function loadSVG() {
      try {
        // Only handle redemption operations
        if (imageKey !== "redeemCollateral") {
          return;
        }

        const templatePath = `/icons/transactions/svg-templates/${imageKey}.svg`;

        const response = await fetch(templatePath);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const svgText = await response.text();
        setSvgContent(svgText);
      } catch (error) {
        console.error(`Failed to load SVG template for ${imageKey}:`, error);
        // Fallback to default orange triangle
        setSvgContent(`
          <svg width="120" height="100" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(60, 50) scale(0.3)">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M59 19.9229L19.0346 90.5H98.9654L59 19.9229ZM102.807 97.2369C102.806 97.2368 102.801 97.2278 102.792 97.2101C102.803 97.2281 102.807 97.2369 102.807 97.2369ZM115.412 89.1025C116.492 90.7912 117.5 93.058 117.5 95.75C117.5 98.8402 116.175 101.431 114.303 103.303L112.107 105.5H5.8934L3.6967 103.303C1.82487 101.431 0.5 98.8402 0.5 95.75C0.5 93.058 1.50823 90.7912 2.588 89.1026L49.3989 6.43655C50.1788 4.94547 51.3531 3.41738 53.0897 2.25962C54.9547 1.01631 57.021 0.5 59 0.5C60.979 0.5 63.0453 1.01631 64.9102 2.25962C66.6469 3.41738 67.8212 4.94547 68.6011 6.43655L115.412 89.1025ZM15.2084 97.21C15.1991 97.2278 15.1936 97.2368 15.1931 97.2369C15.1927 97.2369 15.1973 97.2281 15.2084 97.21Z"
                fill="#FB923C"
                transform="translate(-59, -53)"
              />
            </g>
          </svg>
        `);
      }
    }

    loadSVG();
  }, [imageKey]);

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
