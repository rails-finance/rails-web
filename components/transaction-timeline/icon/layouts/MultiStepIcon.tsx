import { TimelineIconStep } from "@/types";
import { IconWrapper } from "../base/IconWrapper";
import { Arc } from "../base/Arc";
import { Connector } from "../base/Connector";
import { Arrow } from "../base/Arrow";

interface MultiStepIconProps {
  firstStep: TimelineIconStep;
  secondStep: TimelineIconStep;
}

export function MultiStepIcon({ firstStep, secondStep }: MultiStepIconProps) {
  return (
    <div className={`transaction-multi-step`} style={{ height: "80px", position: "relative", zIndex: 1 }}>
      {/* First step */}
      <div className="transaction-step step-first">
        <IconWrapper>
          <Arc type="top" />
          <Connector x={220} y1={200} y2={400} className="left-line-bottom" />
          <Connector x={580} y1={200} y2={400} className="right-line-bottom" />

          {firstStep.children}

          {firstStep.arrowDirection && <Arrow direction={firstStep.arrowDirection} />}
        </IconWrapper>
      </div>

      {/* Second step */}
      <div className="transaction-step step-last">
        <IconWrapper>
          <Connector x={220} y1={0} y2={200} className="left-line-top" />
          <Connector x={580} y1={0} y2={200} className="right-line-top" />
          <Arc type="bottom" />

          {secondStep.children}

          {secondStep.arrowDirection && <Arrow direction={secondStep.arrowDirection} />}
        </IconWrapper>
      </div>
    </div>
  );
}
