import { ReactNode } from "react";

interface OperationBadgeProps {
  label: string;
  color?: "green" | "red" | "blue" | "purple" | "orange" | "gradient-green-blue" | "gradient-purple-blue" | "none";
  icon?: ReactNode;
  className?: string;
}

export function OperationBadge({ label, color = "blue", icon, className = "" }: OperationBadgeProps) {
  const colorClasses = {
    green: "bg-green-600",
    red: "bg-red-600",
    blue: "bg-blue-600",
    purple: "bg-purple-600",
    orange: "bg-orange-600",
    "gradient-green-blue": "bg-gradient-to-r from-green-600 to-blue-600",
    "gradient-purple-blue": "bg-gradient-to-r from-purple-600 to-blue-600",
    none: "",
  };

  const baseClasses =
    color === "none"
      ? "inline-flex items-center text-xs font-bold text-white"
      : "inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-full text-white";

  return (
    <span className={`${baseClasses} ${colorClasses[color]} ${className}`}>
      {icon}
      {label}
    </span>
  );
}
