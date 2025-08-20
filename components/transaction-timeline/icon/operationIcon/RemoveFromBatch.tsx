import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { BatchIcon } from "../symbols/BatchIcon";

export function RemoveFromBatchIcon() {
  return (
    <SingleStepIcon arrowDirection="out">
      <BatchIcon />
    </SingleStepIcon>
  );
}
