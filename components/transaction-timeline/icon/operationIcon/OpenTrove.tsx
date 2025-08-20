import { Transaction } from "@/types/api/troveHistory";
import { MultiStepIcon } from "../layouts/MultiStepIcon";
import { TokenIcon } from "@/components/icons/tokenIcon";

export function OpenTroveIcon({ tx }: { tx: Transaction }) {
  return (
    <MultiStepIcon
      firstStep={{
        children: <TokenIcon assetSymbol={tx.assetType} isTimeline />,
        arrowDirection: "in",
      }}
      secondStep={{
        children: <TokenIcon assetSymbol={tx.collateralType} isTimeline />,
        arrowDirection: "out",
      }}
    />
  );
}
