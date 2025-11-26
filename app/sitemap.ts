import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://rails.finance",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://rails.finance/about",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://rails.finance/how-it-works",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://rails.finance/troves",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: "https://rails.finance/blog",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://rails.finance/blog/when-frontends-fail-what-happens-in-a-crisis",
      lastModified: new Date("2025-11-25"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://rails.finance/blog/keeping-defi-open-and-accessible",
      lastModified: new Date("2025-11-17"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://rails.finance/blog/from-kitchen-table-sketches-to-rails-web-app",
      lastModified: new Date("2025-11-10"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://rails.finance/blog/introducing-rails-finance",
      lastModified: new Date("2025-11-06"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://rails.finance/blog/rails-solution-defi-trust-problem",
      lastModified: new Date("2025-11-06"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://rails.finance/blog/bold-survived-stream-finance-chaos",
      lastModified: new Date("2025-11-06"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://rails.finance/pulse",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: "https://rails.finance/privacy",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://rails.finance/terms",
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
