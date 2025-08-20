import { IconWrapper } from "../base/IconWrapper";
import { Arc } from "../base/Arc";
import { Arrow } from "../base/Arrow";
import { TimelineIconStep } from "@/types";

export function SingleStepIcon({ children, arrowDirection }: TimelineIconStep) {
  return (
    <div className={`transaction-single`} style={{ position: "relative", zIndex: 1 }}>
      <div className="transaction-step step-single">
        <IconWrapper>
          <Arc type="top" />
          <Arc type="bottom" />

          {children}
          {arrowDirection && <Arrow direction={arrowDirection} />}
        </IconWrapper>
      </div>
    </div>
  );
}
