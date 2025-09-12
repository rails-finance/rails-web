"use client";

import { ReactNode, useEffect, useState } from "react";
import { Icon } from "@/components/icons/icon";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  loading?: boolean;
  className?: string;
  valueClassName?: string;
  children?: ReactNode;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  loading,
  className = "",
  valueClassName = "",
  children
}: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (value !== displayValue) {
      setIsAnimating(true);
      const timeout = setTimeout(() => {
        setDisplayValue(value);
        setIsAnimating(false);
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [value]);

  if (loading) {
    return (
      <div className={`bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50 ${className}`}>
        <div className="space-y-3">
          <div className="h-4 bg-slate-700 rounded animate-pulse w-24" />
          <div className="h-8 bg-slate-700 rounded animate-pulse w-32" />
          {subtitle && <div className="h-3 bg-slate-700 rounded animate-pulse w-20" />}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-800/50 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-200 ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center">
              <Icon name={icon as any} size={16} className="text-slate-400" />
            </div>
          )}
          <h3 className="text-sm font-medium text-slate-400">{title}</h3>
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend.isPositive ? 'text-green-400' : 'text-red-400'}`}>
            <Icon name={trend.isPositive ? 'trending-up' : 'trending-down'} size={14} />
            <span>{Math.abs(trend.value).toFixed(1)}%</span>
          </div>
        )}
      </div>
      
      <div className={`text-2xl font-bold text-white transition-all duration-200 ${isAnimating ? 'opacity-50' : 'opacity-100'} ${valueClassName}`}>
        {displayValue}
      </div>
      
      {subtitle && (
        <div className="text-xs text-slate-500 mt-2">
          {subtitle}
        </div>
      )}

      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
}