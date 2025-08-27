import { Transaction, isTroveTransaction } from "@/types/api/troveHistory";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { Fuel } from "lucide-react";

interface TransactionLinksProps {
  transaction: Transaction;
}

export function TransactionLinks({ transaction }: TransactionLinksProps) {
  const tx = transaction as any;

  if (!tx.transactionHash) {
    return null;
  }
  
  // Determine if gas fee should be shown
  const shouldShowGasFee = () => {
    // Don't show gas fees for operations not initiated by the user
    const noGasOps = ['liquidate', 'redeemCollateral'];
    if (noGasOps.includes(tx.operation)) {
      return false;
    }
    
    // Don't show gas fee for delegate IR adjustments (batch manager operations)
    if (tx.operation === 'adjustTroveInterestRate' && tx.batchUpdate) {
      return false;
    }
    
    return true;
  };
  
  // Get collateral price per unit in USD
  const getCollateralPricePerUnit = () => {
    // Use collateralPrice if available
    if (tx.collateralPrice) {
      return tx.collateralPrice;
    }
    
    // Otherwise calculate from total value and amount
    const state = tx.operation === 'liquidate' && tx.stateBefore ? tx.stateBefore : tx.stateAfter;
    if (state?.collateralInUsd && state?.coll && state.coll > 0) {
      return state.collateralInUsd / state.coll;
    }
    
    return null;
  };

  return (
    <div className="flex justify-between items-center gap-1 text-xs text-slate-600 py-2 border-y border-slate-700/30">
      <div className="flex items-center gap-1">
        <span>View on</span>
        <a
          href={`https://etherscan.io/tx/${tx.transactionHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-1 py-1 hover:text-slate-300 transition-colors"
          aria-label="View on Etherscan"
          onClick={(e) => e.stopPropagation()}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 122 122"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <path
              d="M25.29 57.9139C25.2901 57.2347 25.4244 56.5623 25.6851 55.9352C25.9458 55.308 26.3278 54.7386 26.8092 54.2595C27.2907 53.7804 27.8619 53.4011 28.4903 53.1434C29.1187 52.8858 29.7918 52.7548 30.471 52.7579L39.061 52.7859C40.4305 52.7859 41.744 53.33 42.7124 54.2984C43.6809 55.2669 44.225 56.5803 44.225 57.9499V90.4299C45.192 90.1429 46.434 89.8369 47.793 89.5169C48.737 89.2952 49.5783 88.761 50.1805 88.0009C50.7826 87.2409 51.1102 86.2996 51.11 85.3299V45.0399C51.11 43.6702 51.654 42.3567 52.6224 41.3881C53.5908 40.4195 54.9043 39.8752 56.274 39.8749H64.881C66.2506 39.8752 67.5641 40.4195 68.5325 41.3881C69.5009 42.3567 70.045 43.6702 70.045 45.0399V82.4329C70.045 82.4329 72.2 81.5609 74.299 80.6749C75.0787 80.3452 75.7441 79.7931 76.2122 79.0877C76.6803 78.3822 76.9302 77.5545 76.931 76.7079V32.1299C76.931 30.7605 77.4749 29.4472 78.4431 28.4788C79.4113 27.5103 80.7245 26.9662 82.0939 26.9659H90.701C92.0706 26.9659 93.384 27.51 94.3525 28.4784C95.3209 29.4468 95.865 30.7603 95.865 32.1299V68.8389C103.327 63.4309 110.889 56.9269 116.89 49.1059C117.761 47.9707 118.337 46.6377 118.567 45.2257C118.797 43.8138 118.674 42.3668 118.209 41.0139C115.431 33.0217 111.016 25.6973 105.245 19.5096C99.474 13.3218 92.4749 8.40687 84.6955 5.07934C76.9161 1.75182 68.5277 0.0849617 60.0671 0.185439C51.6065 0.285917 43.2601 2.15152 35.562 5.66286C27.8638 9.17419 20.9834 14.2539 15.3611 20.577C9.73881 26.9001 5.49842 34.3272 2.91131 42.3832C0.324207 50.4391 -0.552649 58.9464 0.336851 67.3607C1.22635 75.775 3.86263 83.911 8.07696 91.2479C8.81111 92.5135 9.89118 93.5434 11.1903 94.2165C12.4894 94.8896 13.9536 95.178 15.411 95.0479C17.039 94.9049 19.066 94.7019 21.476 94.4189C22.5251 94.2998 23.4937 93.7989 24.1972 93.0116C24.9008 92.2244 25.2901 91.2058 25.291 90.1499L25.29 57.9139Z"
              fill="silver"
            ></path>
            <path
              d="M25.1021 110.009C34.1744 116.609 44.8959 120.571 56.0802 121.456C67.2646 122.34 78.4757 120.114 88.4731 115.022C98.4705 109.93 106.864 102.172 112.726 92.6059C118.587 83.0395 121.688 72.0381 121.685 60.8188C121.685 59.4188 121.62 58.0337 121.527 56.6567C99.308 89.7947 58.2831 105.287 25.104 110.004"
              fill="silver"
            ></path>
          </svg>
        </a>
        <a
          href={`https://liquityv2.defiexplore.com/tx/${tx.transactionHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-1 py-1 hover:text-slate-300 transition-colors"
          aria-label="View on DeFiExplore"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="16" height="16" viewBox="0 0 1066.6667 917.33331" preserveAspectRatio="xMidYMid meet">
            <path
              d="M 399.6214,688 C 311.5866,687.9999 223.8945,654.4271 156.7268,587.2585 60.77705,491.3088 33.89066,352.9201 75.01861,232.6323 L 0,166.6924 8.999047,153.7114 104.8031,168.2851 c 14.2548,-24.018 31.2713,-46.8803 51.9237,-67.5327 134.3366,-134.33664 352.1691,-134.33645 486.506,0 95.5608,95.5609 122.5913,233.2443 82.186,353.1927 l 74.3815,64.7454 -7.4063,15.609 -96.9986,-14.1755 c -14.2792,23.9208 -31.558,46.5301 -52.1626,67.1345 C 576.0644,654.4268 487.6567,688 399.6214,688 Z m 0,-118.5804 c 52.8037,1e-4 105.5001,-19.0284 147.8074,-55.9852 l 73.5851,-4.2208 -277.6166,-40.6152 -242.1779,-212.9509 73.5055,95.9633 c 1.9356,54.9705 23.6565,109.4266 65.6213,151.3911 43.9945,43.994 101.6147,66.4176 159.2752,66.4177 z M 705.6687,436.7434 624.5976,337.2761 C 623.0341,281.7638 601.2671,226.7422 558.8966,184.3719 481.4929,106.9689 361.8502,97.71934 274.2718,156.4987 l -147.4091,15.1312 332.248,50.4902 z M 399.94,425.5145 c 20.8635,0 41.7395,-7.9731 57.6576,-23.8913 31.8364,-31.8364 31.8357,-83.3991 0,-115.2356 -31.8364,-31.8364 -83.4785,-31.8364 -115.3153,0 -31.8364,31.8365 -31.8368,83.3993 0,115.2356 15.9183,15.9182 36.7936,23.8914 57.6577,23.8913 z"
              fill="silver"
              transform="matrix(1.3333333,0,0,-1.3333333,0,917.33333)"
            ></path>
          </svg>
        </a>
      </div>
      <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 items-end sm:items-center text-xs">
        {shouldShowGasFee() && tx.gasFee && tx.gasFeeUsd && (
          <div className="flex items-center gap-1">
            <Fuel className="w-3 h-3 text-slate-500" />
            <span className="font-medium">
              {tx.gasFee.toFixed(6)} ETH
            </span>
            <span className="text-slate-400 ml-1">
              ≈ ${tx.gasFeeUsd.toFixed(2)}
            </span>
          </div>
        )}
        {getCollateralPricePerUnit() && (
          <div className="flex items-center gap-1">
            {/* Overlapping icons container */}
            <div className="relative flex items-center mr-0.5">
              <TokenIcon assetSymbol={tx.collateralType} className="w-4 h-4" />
            </div>
            <span className="font-medium">
              ${getCollateralPricePerUnit()?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
