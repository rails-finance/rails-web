'use client';

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertCircle, Loader2, Pin } from "lucide-react";
import type { TimelineEvent, TimelinePlatform } from "@/types/pulse";
import { PulseTimelineItem } from "./item";

const XIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const GitHubIcon = ({ className = "size-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const PLATFORM_OPTIONS: { platform: TimelinePlatform; label?: string; icon?: ReactNode }[] = [
  { platform: "x", icon: <XIcon className="size-3.5" /> },
  { platform: "github", icon: <GitHubIcon className="size-3.5" /> },
  { platform: "blog", label: "Blog" },
];

const DEFAULT_DATA_SOURCES = [
  "/data/timeline/x.json",
  "/data/timeline/blog.json",
  "/data/timeline/github.json",
];

interface TimelinePageProps {
  title: string;
  description: string;
  dataSources?: string[];
}

export function TimelinePage({
  title,
  description,
  dataSources = DEFAULT_DATA_SOURCES
}: TimelinePageProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<TimelinePlatform | "all">("all");

  useEffect(() => {
    let isMounted = true;

    const loadEvents = async () => {
      try {
        const results = await Promise.all(
          dataSources.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
              console.warn(`Failed to load ${url}`);
              return [];
            }
            return (await response.json()) as TimelineEvent[];
          })
        );

        const allEvents = results.flat();

        if (isMounted) {
          setEvents(allEvents);
          setError(null);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setError("Unable to load timeline data right now.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadEvents();
    return () => {
      isMounted = false;
    };
  }, [dataSources]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events],
  );
  const filteredEvents = useMemo(() => {
    if (platformFilter === "all") return sortedEvents;
    return sortedEvents.filter((event) => event.platform === platformFilter);
  }, [sortedEvents, platformFilter]);

  // Group events by month/year
  const groupedEvents = useMemo(() => {
    const groups: { key: string; label: string; events: TimelineEvent[] }[] = [];
    let currentKey = "";

    filteredEvents.forEach((event) => {
      const date = new Date(event.date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);

      if (key !== currentKey) {
        groups.push({ key, label, events: [event] });
        currentKey = key;
      } else {
        groups[groups.length - 1].events.push(event);
      }
    });

    return groups;
  }, [filteredEvents]);

  return (
    <section className="space-y-8 py-8">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
          <Activity className="size-8 text-emerald-600" />
          {title}
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl">{description}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterChip label="All" active={platformFilter === "all"} onClick={() => setPlatformFilter("all")} />
        {PLATFORM_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.platform}
            label={opt.label}
            icon={opt.icon}
            active={platformFilter === opt.platform}
            onClick={() => setPlatformFilter(opt.platform)}
          />
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          Loading timeline...
        </div>
      )}

      {error && (
        <div className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle className="size-4" />
          {error}
        </div>
      )}

      {!loading && filteredEvents.length === 0 && (
        <p className="text-sm text-slate-500">No events match this filter yet.</p>
      )}

      <ul className="space-y-4">
        {groupedEvents.flatMap((group, groupIndex) => {
          const isFirstGroup = groupIndex === 0;
          const items: React.ReactNode[] = [];

          // Add month separator as a list item
          items.push(
            <li key={`separator-${group.key}`} className="flex w-full gap-3 flex-row items-stretch">
              {/* Timeline rail column - matches PulseIcon structure */}
              <div className="relative flex mr-2 sm:mr-4 md:mr-6 shrink-0 flex-col items-center justify-center" style={{ width: '40px' }}>
                {isFirstGroup ? (
                  <>
                    {/* Pulsing dot for first group */}
                    <span className="flex size-2 relative z-10 items-center justify-center">
                      <span className="absolute inline-flex size-3 animate-ping rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex size-2 rounded-full bg-blue-500"></span>
                    </span>
                    {/* Vertical line connecting to first event */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-1 bg-slate-300 dark:bg-[#30343F]"
                      style={{ top: '50%', bottom: '-1rem' }}
                    />
                  </>
                ) : (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-1 bg-slate-300 dark:bg-[#30343F]"
                    style={{ top: '-1rem', bottom: '-1rem' }}
                  />
                )}
              </div>
              {/* Month label */}
              <div className="flex-1 flex items-center gap-4 py-2">
                <div className="flex-1 border-t border-dashed border-slate-300 dark:border-slate-700" />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-500">{group.label}</span>
                <div className="flex-1 border-t border-dashed border-slate-300 dark:border-slate-700" />
              </div>
            </li>
          );

          // Add pinned message after first month separator
          if (isFirstGroup) {
            items.push(
              <li key="pinned-message" className="flex w-full gap-3 flex-row items-stretch">
                {/* Timeline rail column */}
                <div className="relative flex mr-2 sm:mr-4 md:mr-6 shrink-0 flex-col items-center" style={{ width: '40px' }}>
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-1 bg-slate-300 dark:bg-[#30343F]"
                    style={{ top: '-1rem', bottom: '-1rem' }}
                  />
                </div>
                {/* Pinned message content */}
                <div className="flex-1 py-2">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                    <div className="flex items-start gap-3">
                      <Pin className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          We're actively seeking funding to expand Rails.
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                          We welcome your support and collaboration. Be the first to <a href="https://etherscan.io/name-lookup-search?id=donate.rails.eth" target="_blank" rel="noreferrer" className="text-fuchsia-500 hover:text-fuchsia-600 dark:hover:text-fuchsia-400 transition-colors">donate.rails.eth</a>. Reach us at <a href="https://x.com/rails_finance" target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">@rails_finance</a>, we'd love to hear from you.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          }

          // Add events
          group.events.forEach((event, index) => {
            const globalIndex = groupedEvents.slice(0, groupIndex).reduce((acc, g) => acc + g.events.length, 0) + index;
            items.push(
              <PulseTimelineItem
                key={event.id}
                event={event}
                isFirst={globalIndex === 0}
                isLast={globalIndex === filteredEvents.length - 1}
              />
            );
          });

          return items;
        })}
      </ul>
    </section>
  );
}

function FilterChip({ label, icon, active, onClick }: { label?: string; icon?: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border py-1.5 text-sm transition-colors flex items-center justify-center cursor-pointer ${
        label ? "px-3 gap-1.5" : "px-2"
      } ${
        active
          ? "border-slate-400 bg-slate-100 text-slate-700 dark:border-white dark:bg-white dark:text-slate-900"
          : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-500 dark:border-slate-700 dark:bg-transparent dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
