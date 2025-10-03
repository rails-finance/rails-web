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
    red: "bg-red-700",
    blue: "bg-blue-600",
    purple: "bg-purple-600",
    orange: "bg-orange-500",
    none: "",
  };

  const baseClasses =
    color === "none"
      ? "inline-flex tracking-wider items-center text-xs font-bold text-white"
      : "inline-flex tracking-wider items-center px-2 py-0.5 text-xs font-bold rounded-full text-white";

  return (
    <span className={`${baseClasses} ${colorClasses[color]} ${className}`}>
      {icon}
      {label}
    </span>
  );
}
