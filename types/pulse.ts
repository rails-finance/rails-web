export type TimelineEventType = "post" | "engagement" | "app_update" | "milestone" | "opportunity" | "task";
export type TimelinePlatform = "x" | "farcaster" | "medium" | "app" | "internal" | "blog" | "github" | "other";

export type TimelineEngagementType = "like" | "repost" | "reply" | "quote" | "mention" | "other";

export interface TimelineMetrics {
  likes: number;
  reposts: number;
  replies: number;
  views?: number;
}

export interface TimelineActor {
  handle: string;
  link?: string;
}

export interface TimelineEngagement {
  id: string;
  date: string;
  type: TimelineEngagementType;
  actor?: string;              // Single actor (Twitter handle)
  actors?: TimelineActor[];    // Multiple actors
  link?: string;
  description?: string;
  metrics?: TimelineMetrics;
}

export interface TimelineEvent {
  id: string;
  date: string;
  type: TimelineEventType;
  platform: TimelinePlatform;
  author?: string;
  authorUrl?: string;
  postUrl?: string;
  content: string;
  subtitle?: string;
  metrics?: TimelineMetrics;
  engagements?: TimelineEngagement[];
}
