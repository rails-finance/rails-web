"use client";

import { type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { TimelineActor, TimelineEvent, TimelineMetrics } from "@/types/pulse";
import { Avatar } from "../shared/Avatar";
import { MetricsRow } from "../shared/MetricsRow";
import { formatFullDateTime } from "../types";
import { Handle } from "./Handle";

const CONNECTOR_COLOR_CLASS = "bg-slate-300 dark:bg-[#30343F]";

export function NestedTimeline({
  entries,
  platform,
  parentEvent,
}: {
  entries: Array<{
    id: string;
    date: string;
    status: string;
    icon?: ReactNode;
    metrics?: TimelineMetrics;
    actor?: string;
    actors?: TimelineActor[];
    link?: string;
    content?: string;
    typeLabel?: string;
  }>;
  platform: TimelineEvent["platform"];
  parentEvent: TimelineEvent;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="relative">
      <ul className="space-y-0">
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;
          const iconNode = entry.icon ? <span className="text-slate-400 dark:text-slate-500">{entry.icon}</span> : null;
          return (
            <li key={entry.id} className="relative flex">
              {/* Connector column */}
              <div className="relative w-8 shrink-0">
                {/* Vertical line - top segment (all entries including first) */}
                <div
                  className={`absolute left-2 top-0 w-px h-4 ${CONNECTOR_COLOR_CLASS}`}
                />
                {/* Vertical line - bottom segment (all except last) */}
                {!isLast && (
                  <div
                    className={`absolute left-2 top-4 bottom-0 w-px ${CONNECTOR_COLOR_CLASS}`}
                  />
                )}
                {/* Horizontal line */}
                <div
                  className={`absolute left-2 top-4 h-px w-6 ${CONNECTOR_COLOR_CLASS}`}
                />
                {/* Icon at junction point - centered over vertical line */}
                {iconNode && (
                  <div
                    className="absolute flex items-center justify-center size-4 rounded-full bg-slate-100 dark:bg-slate-800"
                    style={{ top: 'calc(1rem - 8px)', left: 'calc(0.5rem - 8px)' }}
                    title={formatFullDateTime(entry.date)}
                  >
                    {iconNode}
                  </div>
                )}
              </div>

              {/* Content column */}
              <div className="flex-1 pb-3 last:pb-0">
                {entry.link ? (
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noreferrer"
                    className="group/nested block relative pl-4 py-2 space-y-2 dark:border-slate-800 rounded-md hover:bg-white dark:hover:bg-slate-800/50 transition-all duration-200 ease-out cursor-pointer -ml-2 px-2"
                  >
                    {/* Row 1: Content + Metrics */}
                    <div className="flex flex-row justify-between items-start gap-x-4">
                      <div className="flex-1 max-w-[45ch] text-xs/4 sm:text-xs tracking-wide text-slate-600 dark:text-slate-400 font-medium">
                        {entry.content && (
                          <p>
                            <span className="">{entry.content}</span>
                          </p>
                        )}
                      </div>
                      {/* Metrics - top right */}
                      {entry.typeLabel !== "repost" && entry.metrics && (
                        <div className="flex items-center shrink-0">
                          <MetricsRow metrics={entry.metrics} className="text-sm flex-nowrap" compact />
                        </div>
                      )}
                    </div>
                    {/* Row 2: Handle/Actors + Arrow */}
                    <div className="flex flex-row justify-between items-center">
                      {entry.actors && entry.actors.length > 0 ? (
                        <div className="flex items-center gap-0.5">
                          {entry.actors.map((actor) => (
                            <span
                              key={actor.handle}
                              title={actor.handle}
                              className="relative"
                            >
                              <Avatar handle={actor.handle} platform={platform} size={22} className="ring-2 ring-white dark:ring-slate-900" />
                            </span>
                          ))}
                        </div>
                      ) : entry.actor ? (
                        <Handle
                          handle={entry.actor}
                          className="group-hover/nested:!text-blue-400"
                          platform={platform}
                          avatarSize={22}
                        />
                      ) : (
                        <div />
                      )}
                      <span className="flex items-center bg-slate-200 dark:bg-slate-800 group-hover/nested:bg-blue-500 dark:group-hover/nested:bg-blue-500 transition-all duration-200 ease-out rounded-full pl-2 pr-1.5 py-0.5 text-xs text-slate-500 dark:text-slate-400 group-hover/nested:text-white opacity-0 group-hover/nested:opacity-100">
                        <ArrowUpRight className="size-3" aria-hidden="true" />
                      </span>
                    </div>
                  </a>
                ) : (
                  <div className="relative pl-4 py-2 space-y-2 dark:border-slate-800">
                    {/* Row 1: Content + Metrics */}
                    <div className="flex flex-row justify-between items-start gap-x-4">
                      <div className="flex-1 max-w-[45ch] text-xs/4 sm:text-xs tracking-wide text-slate-600 dark:text-slate-400 font-medium">
                        {entry.content && (
                          <p>
                            <span className="">{entry.content}</span>
                          </p>
                        )}
                      </div>
                      {/* Metrics - top right */}
                      {entry.typeLabel !== "repost" && entry.metrics && (
                        <div className="flex items-center shrink-0">
                          <MetricsRow metrics={entry.metrics} className="text-sm flex-nowrap" compact />
                        </div>
                      )}
                    </div>
                    {/* Row 2: Handle/Actors */}
                    {(entry.actors && entry.actors.length > 0) || entry.actor ? (
                      <div className="flex items-center">
                        {entry.actors && entry.actors.length > 0 ? (
                          <div className="flex items-center gap-0.5">
                            {entry.actors.map((actor) => (
                              <a
                                key={actor.handle}
                                href={actor.link}
                                target="_blank"
                                rel="noreferrer"
                                title={actor.handle}
                                className="hover:opacity-80 transition-opacity relative hover:z-10"
                              >
                                <Avatar handle={actor.handle} platform={platform} size={22} className="ring-2 ring-white dark:ring-slate-900" />
                              </a>
                            ))}
                          </div>
                        ) : entry.actor && (
                          <Handle
                            handle={entry.actor}
                            platform={platform}
                            avatarSize={22}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
