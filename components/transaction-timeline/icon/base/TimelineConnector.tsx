interface TimelineConnectorProps {
  type: "top" | "bottom";
  show: boolean;
  operation?: string;
  isMultiStep?: boolean;
}

export function TimelineConnector({ type, show, operation = "", isMultiStep = false }: TimelineConnectorProps) {
  if (!show) return null;

  // Determine connector style based on operation
  const isDashed = operation === "liquidate" || operation === "redeemCollateral";
  const connectorColor = isDashed
    ? operation === "redeemCollateral"
      ? "#FB923C"
      : operation === "liquidate"
      ? "#EF4444"
      : "#45556C"
    : "#45556C";

  const strokeDasharray = isDashed ? "1,8" : "none";
  const strokeWidth = 3;
  const strokeLinecap = isDashed ? "round" : "butt";

  if (type === "top") {
    return (
      <svg className="timeline-connector" width="4" height="16" viewBox="0 0 4 16" style={{ top: 0 }}>
        <line
          x1="2"
          y1="0"
          x2="2"
          y2="16"
          stroke={connectorColor}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          strokeDasharray={strokeDasharray}
        />
      </svg>
    );
  }

  // Bottom connector
  return (
    <svg
      className="timeline-connector"
      width="4"
      height="100%"
      style={{
        transform: "translateX(-50%)",
        top: isDashed ? "56px" : isMultiStep ? "94px" : "56px", // Adjusted for new top connector height
        bottom: 0,
      }}
    >
      <line
        x1="2"
        y1="0"
        x2="2"
        y2="100%"
        stroke={connectorColor}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeDasharray={strokeDasharray}
      />
    </svg>
  );
}
