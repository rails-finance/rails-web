import { ReactNode } from "react";

export interface TimelineIconStep {
  children: ReactNode;
  /** Direction of asset flow: "in" = receiving/borrowing, "out" = sending/repaying */
  arrowDirection?: "in" | "out";
}
