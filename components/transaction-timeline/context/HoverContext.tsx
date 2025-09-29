"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export type ValueType =
  | "debt"
  | "collateral"
  | "collateralUsd"
  | "interestRate"
  | "collRatio"
  | "upfrontFee"
  | "collateralPrice"
  | "peakDebt"
  | "peakCollateral"
  | "owner"
  | "principal"
  | "interest"
  | "managementFee"
  | "currentPrice"
  | "delegateName"
  | "managementFeeRate"
  | "dailyManagementFee"
  | "annualManagementFee"
  | "dailyInterest"
  | "annualInterest"
  | "nftToken"
  | "troveId"
  | "ownerAddress";
export type ValueState = "before" | "after" | "change" | "fee";

export interface HoveredValue {
  type: ValueType;
  state: ValueState;
  value?: number;
}

interface HoverContextType {
  hoveredValue: HoveredValue | null;
  setHoveredValue: (value: HoveredValue | null) => void;
  hoverEnabled: boolean;
  setHoverEnabled: (enabled: boolean) => void;
}

const HoverContext = createContext<HoverContextType | undefined>(undefined);

export function HoverProvider({ children }: { children: ReactNode }) {
  const [hoveredValue, setHoveredValue] = useState<HoveredValue | null>(null);
  const [hoverEnabled, setHoverEnabled] = useState<boolean>(false);

  return (
    <HoverContext.Provider value={{ hoveredValue, setHoveredValue, hoverEnabled, setHoverEnabled }}>
      {children}
    </HoverContext.Provider>
  );
}

export function useHover() {
  const context = useContext(HoverContext);
  if (!context) {
    throw new Error("useHover must be used within a HoverProvider");
  }
  return context;
}

// Helper function to check if a value should be highlighted
export function shouldHighlight(hoveredValue: HoveredValue | null, type: ValueType, state?: ValueState): boolean {
  if (!hoveredValue) return false;

  // Match type
  if (hoveredValue.type !== type) return false;

  // If state is provided, match it too
  if (state && hoveredValue.state !== state) return false;

  return true;
}
