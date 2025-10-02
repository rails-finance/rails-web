"use client";

import React from "react";

interface ExplanationItemProps {
  label?: string;
  children: React.ReactNode;
  type?: "default" | "warning" | "error" | "success";
}

export function ExplanationItem({ label, children, type = "default" }: ExplanationItemProps) {
  const typeStyles = {
    default: "",
    warning: "text-yellow-400",
    error: "text-red-400",
    success: "text-green-400",
  };

  return (
    <li className="flex items-start">
      <span className="text-slate-500 mr-2">•</span>
      <span className="flex-1">
        {label && <span className="text-slate-400 mr-1">{label}:</span>}
        <span className={typeStyles[type]}>{children}</span>
      </span>
    </li>
  );
}
