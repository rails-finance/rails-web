"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowUpRight, Circle, GitBranch } from "lucide-react";
import type { TimelineActor, TimelineEvent, TimelineMetrics, TimelineEngagementType } from "@/types/pulse";
import { MetricsRow, MetricIcons } from "../shared/MetricsRow";
import { formatDisplayDate, formatFullDateTime } from "../types";
import { Handle } from "./Handle";
import { NestedTimeline } from "./NestedTimeline";

const QuoteIcon = ({ className = "size-3" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
    <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
  </svg>
);

function getShortCommitHash(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/\/commit\/([a-f0-9]+)/i);
  return match ? match[1].slice(0, 7) : null;
}

function getBlogThumbnail(postUrl?: string): string | null {
  if (!postUrl) return null;
  const match = postUrl.match(/\/blog\/([^/]+)$/);
  return match ? `/blog/${match[1]}.png` : null;
}

export function PulseContent({
  event,
}: {
  event: TimelineEvent;
}) {
  const isGitHub = event.platform === "github";
  const isBlog = event.platform === "blog";
  const blogThumbnail = isBlog ? getBlogThumbnail(event.postUrl) : null;

  // Blog layout - thumbnail left, content right
  if (isBlog) {
    const blogContent = (
      <div className="flex">
        {/* Thumbnail */}
        {blogThumbnail && (
          <div className="hidden sm:block shrink-0 sm:w-40">
            <img
              src={blogThumbnail}
              alt=""
              className="w-full h-full object-contain"
            />
          </div>
        )}
        {/* Content */}
        <div className="flex-1 p-4 flex flex-col justify-between">
          <div>
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200 leading-snug">
              {event.content}
            </p>
            {event.subtitle && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {event.subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-slate-500 dark:text-slate-500" title={formatFullDateTime(event.date)}>
              {formatDisplayDate(event.date)}
            </div>
            {event.postUrl && (
              <span className="flex items-center bg-slate-200 dark:bg-slate-800 group-hover:bg-blue-500 dark:group-hover:bg-blue-500 transition-colors rounded-full pl-3 pr-2 py-1 text-xs text-slate-600 dark:text-slate-300 group-hover:text-white">
                <span>Read</span>
                <ArrowUpRight className="size-4 ml-1" aria-hidden="true" />
              </span>
            )}
          </div>
        </div>
      </div>
    );

    if (event.postUrl) {
      return (
        <a
          href={event.postUrl}
          target="_blank"
          rel="noreferrer"
          className="group block relative rounded-lg bg-slate-50/50 dark:bg-slate-900/50 hover:bg-silver dark:hover:bg-slate-950/50 overflow-hidden transition-all cursor-pointer"
        >
          {blogContent}
        </a>
      );
    }

    return (
      <div className="relative rounded-lg bg-silver dark:bg-slate-900 overflow-hidden">
        {blogContent}
      </div>
    );
  }

  const mainContent = (
    <div className={`relative rounded-lg space-y-3 px-6 py-4 transition-all ${
      isGitHub
        ? "border-slate-800 bg-slate-950 group-hover:bg-slate-900"
        : "bg-slate-50/50 dark:bg-slate-900/50 group-hover:bg-silver dark:group-hover:bg-slate-950/50"
    }`}>
      {/* Row 1: Content, Handle, Metrics */}
      <div className="flex flex-row justify-between items-start gap-x-4">
        {/* Content, Handle */}
        <div className="flex-1 max-w-[50ch] text-sm space-y-4 tracking-wide text-slate-600 dark:text-slate-400">
          <p>
            {isGitHub ? (
              <span className="inline-block text-slate-200 font-mono text-sm">
                {event.content}
              </span>
            ) : (
              <span className="text-slate-600 dark:text-slate-400 font-medium">{event.content}</span>
            )}
          </p>
          {!isGitHub && (
            <div className="mt-1 flex items-center">
              <Handle
                handle={event.author ?? "@rails_account"}
                className="[.group:hover:not(:has(.group\/nested:hover))_&]:!text-blue-400"
                platform={event.platform}
                avatarSize={22}
              />
            </div>
          )}
        </div>
        {/* Metrics - always top right */}
        {event.metrics && (
          <div className="flex items-start shrink-0">
            <MetricsRow metrics={event.metrics} className="text-sm flex-nowrap" compact />
          </div>
        )}
      </div>

      <div className="">
        <ExpandedDetail event={event} />
      </div>

      {/* Date and View button row */}
      {isGitHub ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-3 text-blue-400" />
              <span className="font-mono text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-md">main</span>
            </span>
            <span className="text-slate-500">
              committed on {formatDisplayDate(event.date)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 flex-wrap">
            <span>0 parents</span>
            <span>commit</span>
            {event.postUrl && (
              <span className="inline-flex items-center font-mono text-slate-300 group-hover:text-blue-400 transition-colors">
                <span className="font-semibold">{getShortCommitHash(event.postUrl)}</span>
                <ArrowUpRight className="size-3 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-500" title={formatFullDateTime(event.date)}>
            {formatDisplayDate(event.date)}
          </div>
          {event.postUrl && (
            <span className="flex items-center bg-white dark:bg-slate-800 [.group:hover:not(:has(.group\/nested:hover))_&]:bg-blue-500 transition-all duration-200 ease-out rounded-full pl-3 pr-2 py-1 text-xs text-slate-600 dark:text-slate-300 [.group:hover:not(:has(.group\/nested:hover))_&]:text-white">
              <span>View</span>
              <ArrowUpRight className="size-4 ml-1" aria-hidden="true" />
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (event.postUrl) {
    return (
      <a
        href={event.postUrl}
        target="_blank"
        rel="noreferrer"
        className="group block cursor-pointer"
      >
        {mainContent}
      </a>
    );
  }

  return mainContent;
}

function ExpandedDetail({
  event,
}: {
  event: TimelineEvent;
}) {
  const engagementEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      date: string;
      note?: string;
      status: string;
      icon?: ReactNode;
      metrics?: TimelineMetrics;
      actor?: string;
      actors?: TimelineActor[];
      link?: string;
      content?: string;
      typeLabel?: string;
    }> = [];

    (event.engagements ?? []).forEach((engagement, index) => {
      entries.push({
        id: engagement.id ?? `${event.id}-engagement-${index}`,
        date: engagement.date,
        status: "engagement",
        icon: getHighlightIcon(engagement.type),
        actor: engagement.actor,
        actors: engagement.actors,
        link: engagement.link,
        metrics: engagement.metrics,
        content: engagement.description,
        typeLabel: engagement.type,
      });
    });

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [event.engagements, event.id]);

  return (
    <div className="space-y-6 mt-2">
      {engagementEntries.length > 0 && (
        <NestedTimeline
          entries={engagementEntries}
          platform={event.platform}
          parentEvent={event}
        />
      )}
    </div>
  );
}

function getHighlightIcon(type?: TimelineEngagementType) {
  switch (type) {
    case "like":
      return <MetricIcons.like className="size-3 text-rose-500" />;
    case "repost":
      return <MetricIcons.repost className="size-3 text-emerald-500" />;
    case "reply":
      return <MetricIcons.reply className="size-3 text-blue-500" />;
    case "quote":
      return <QuoteIcon className="size-3 text-emerald-500" />;
    default:
      return <Circle className="size-2 text-slate-500" />;
  }
}
