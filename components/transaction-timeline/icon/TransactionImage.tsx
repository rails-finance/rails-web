import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { getTransactionImageKey } from "@/lib/utils/transactionImages";
import { loadTransactionSvg } from "@/lib/utils/svgMapping";
import { TimelineBackground } from "./TimelineBackground";
import { useEffect, useState } from "react";

interface TransactionImageProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
  className?: string;
  width?: number;
  height?: number;
}

export function TransactionImage({ 
  tx,
  isFirst = false,
  isLast = false, 
  isExpanded = false,
  className = "", 
  width = 120, 
  height = 100 
}: TransactionImageProps) {
  const [svgContent, setSvgContent] = useState<string>('');
  const imageKey = getTransactionImageKey(tx);
  
  // Extract asset types for SVG template processing
  const collateralAsset = isTroveTransaction(tx) ? tx.collateralType : undefined;
  const debtAsset = isTroveTransaction(tx) ? tx.assetType : undefined;
  
  useEffect(() => {
    async function loadAndProcessSVG() {
      const svgText = await loadTransactionSvg(imageKey, debtAsset, collateralAsset);
      setSvgContent(svgText || '');
    }

    loadAndProcessSVG();
  }, [imageKey, debtAsset, collateralAsset]);
  
  return (
    <>
      {/* Timeline Background - extends full height of transaction row */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full z-10 pointer-events-none">
        <TimelineBackground 
          tx={tx} 
          isFirst={isFirst} 
          isLast={isLast} 
          isExpanded={isExpanded} 
        />
      </div>
      
      {/* Transaction Graphic - loaded from SVG template or placeholder */}
      <div className="relative z-20 w-20 h-20 flex items-center justify-center ">
        {svgContent ? (
          <div 
            className="max-w-full max-h-full"
            dangerouslySetInnerHTML={{ __html: svgContent }} 
          />
        ) : (
          <div className="text-xs text-slate-500 text-center p-2 border rounded">
            {imageKey}
          </div>
        )}
      </div>
    </>
  );
}

// Simple wrapper that just passes through to TransactionImage
interface WrapperProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
  className?: string;
}

export function SingleStepTransactionImage({ tx, isFirst, isLast, isExpanded, className }: WrapperProps) {
  return (
    <TransactionImage 
      tx={tx} 
      isFirst={isFirst}
      isLast={isLast}
      isExpanded={isExpanded}
      className={className} 
    />
  );
}

// For administrative actions - same simple approach  
export function AdminTransactionImage({ tx, isFirst, isLast, isExpanded, className }: WrapperProps) {
  return (
    <TransactionImage 
      tx={tx} 
      isFirst={isFirst}
      isLast={isLast}
      isExpanded={isExpanded}
      className={className} 
    />
  );
}