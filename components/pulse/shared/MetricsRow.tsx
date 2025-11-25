"use client";

import { Eye, LineChart } from "lucide-react";
import type { TimelineMetrics } from "@/types/pulse";
import type { SVGProps } from "react";

type TwitterIconProps = SVGProps<SVGSVGElement>;

const TwitterRepostIcon = ({ className = "size-4", ...props }: TwitterIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
    <path
      d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.37c0 .97.784 1.75 1.75 1.75H13V20H7.75c-2.347 0-4.25-1.9-4.25-4.25V8.38L1.853 9.91.147 8.09l4.603-4.3zm11.5 2.71H11V4h5.25c2.347 0 4.25 1.9 4.25 4.25v7.37l1.647-1.53 1.706 1.82-4.603 4.3-4.603-4.3 1.706-1.82L18 15.62V8.25c0-.97-.784-1.75-1.75-1.75z"
      fill="currentColor"
    />
  </svg>
);

const TwitterReplyIcon = ({ className = "size-4", ...props }: TwitterIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
    <path
      d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"
      fill="currentColor"
    />
  </svg>
);

const TwitterLikeIcon = ({ className = "size-4", ...props }: TwitterIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
    <path
      d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"
      fill="currentColor"
    />
  </svg>
);

function formatNumberWithCommas(num: number): string {
  return num.toLocaleString();
}

export function MetricsRow({
  metrics,
  className = "text-sm",
  compact = false,
  showLabels = false,
}: {
  metrics?: TimelineMetrics;
  className?: string;
  compact?: boolean;
  showLabels?: boolean;
}) {
  if (!metrics) return null;

  const singularLabels: Record<string, string> = {
    Replies: "Reply",
    Reposts: "Repost",
    Likes: "Like",
  };

  const engagementMetrics = [
    { icon: TwitterReplyIcon, label: "Replies", value: metrics.replies, color: "text-sky-400" },
    { icon: TwitterRepostIcon, label: "Reposts", value: metrics.reposts, color: "text-emerald-500" },
    { icon: TwitterLikeIcon, label: "Likes", value: metrics.likes, color: "text-rose-500" },
  ].filter((item) => typeof item.value === "number" && item.value > 0);

  const hasViews = typeof metrics.views === "number" && metrics.views > 0;

  return (
    <div
      className={`flex flex-col items-end gap-0.5 ${className} ${compact ? "whitespace-nowrap text-sm" : ""}`}
    >
      {hasViews && (
        <span className="inline-flex items-center gap-1">
          <span className="font-bold text-slate-700 dark:text-slate-200 text-[0.625rem]">{formatNumberWithCommas(metrics.views!)}</span>
          <span className="text-slate-500 dark:text-slate-400 text-xs">Views</span>
        </span>
      )}
      {engagementMetrics.length > 0 && (
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-950/50 px-1.5 -mr-0.5 py-0.5">
          {engagementMetrics.map((item) => {
            const value = item.value as number;
            const labelText = (value === 1 ? singularLabels[item.label] ?? item.label : item.label).toLowerCase();
            const accessibleLabel = `${value} ${labelText}`;
            return (
              <span
                key={item.label}
                className={`inline-flex items-center gap-0.5 text-[0.625rem] ${item.color}`}
                aria-label={!showLabels ? accessibleLabel : undefined}
                title={accessibleLabel}
              >
                <item.icon className="size-3" aria-hidden="true" />
                <span>{value}</span>
                {showLabels && <span className="text-slate-600 dark:text-slate-300">{labelText}</span>}
              </span>
            );
          })}
        </span>
      )}
    </div>
  );
}

export const MetricIcons = {
  like: TwitterLikeIcon,
  repost: TwitterRepostIcon,
  reply: TwitterReplyIcon,
};
