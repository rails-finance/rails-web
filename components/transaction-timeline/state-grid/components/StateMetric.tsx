import { ReactNode } from "react";

interface StateMetricProps {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function StateMetric({ label, icon, children }: StateMetricProps) {
  return (
    <div>
      <div className="flex items-center mb-1">
        {icon}
        <span className="text-slate-500 font-medium">{label}</span>
      </div>
      {children}
    </div>
  );
}
