import { ReactNode } from "react";

interface IconWrapperProps {
  children: ReactNode;
  width?: number;
  height?: number;
  viewBox?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function IconWrapper({
  children,
  width = 80,
  height = 40,
  viewBox = "0 0 800 400",
  className = "",
  style,
}: IconWrapperProps) {
  return (
    <svg width={width} height={height} viewBox={viewBox} className={className} style={style}>
      {children}
    </svg>
  );
}
