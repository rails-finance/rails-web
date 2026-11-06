import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/shared/page-metadata";

// Who may read the site (rails-ops ui-jobs 513; Miles, 6 Nov 2026): everyone,
// named. The search and user-fetch agents put pages in AI answers; the
// training crawlers are allowed too. Each group keeps /api/ out, because a
// crawler that matches a named group ignores the `*` group.
const SEARCH_AND_USER_AGENTS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
];
const TRAINING_CRAWLERS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: SEARCH_AND_USER_AGENTS, allow: "/", disallow: ["/api/"] },
      { userAgent: TRAINING_CRAWLERS, allow: "/", disallow: ["/api/"] },
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
