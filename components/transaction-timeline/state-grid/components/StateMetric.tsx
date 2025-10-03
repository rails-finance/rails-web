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
        <span className="text-xs font-bold text-slate-400 milodon dark:text-slate-600">{label}</span>
      </div>
      {children}
    </div>
  );
}
