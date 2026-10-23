"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export type ValueType =
  | "debt"
  | "principal"
  | "interest"
  | "managementFee"
  | "collateral"
  | "collateralUsd"
  | "collateralPrice"
  | "redemptionPrice"
  | "currentPrice"
  | "interestRate"
  | "dailyInterest"
  | "annualInterest"
  | "managementFeeRate"
  | "dailyManagementFee"
  | "annualManagementFee"
  | "delegateName"
  | "collRatio"
  | "liquidationPrice"
  | "trovesAhead"
  | "queueShare"
  | "redemptionCount"
  | "transactionCount"
  | "upfrontFee"
  | "peakDebt"
  | "peakCollateral"
  | "duration"
  | "dateRange"
  | "owner"
  | "ownerAddress"
  | "troveId"
  | "nftToken"
  | "collSurplus"
  | "debtOffsetBySP"
  | "collToSP"
  | "collGasCompensation"
  | "netOutcome";
export type ValueState = "before" | "after" | "change" | "fee";

export interface HoveredValue {
  type: ValueType;
  state: ValueState;
  value?: number | string;
}

interface HoverContextType {
  hoveredValue: HoveredValue | null;
  setHoveredValue: (value: HoveredValue | null) => void;
  hoverEnabled: boolean;
  setHoverEnabled: (enabled: boolean) => void;
}

const HoverContext = createContext<HoverContextType | undefined>(undefined);

// No-op fallback so HighlightableValue can render in surfaces that don't
// mount a HoverProvider (chooser rows, listing cards) — those have no
// counterpart explanation to highlight, so silent degradation is correct.
const HOVER_NOOP: HoverContextType = {
  hoveredValue: null,
  setHoveredValue: () => {},
  hoverEnabled: false,
  setHoverEnabled: () => {},
};

export function useHover() {
  return useContext(HoverContext) ?? HOVER_NOOP;
}
