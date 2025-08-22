import { SingleStepIcon } from "../layouts/SingleStepIcon";
import { ExitBatchIcon } from "../symbols/ExitBatchIcon";

export function RemoveFromBatchIcon() {
  return (
    <SingleStepIcon arrowDirection="out">
      <ExitBatchIcon />
    </SingleStepIcon>
  );
}
