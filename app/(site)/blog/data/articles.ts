export interface Article {
  slug: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  publishedAt: string;
  author: {
    name: string;
    twitter?: string;
  };
  mediumUrl?: string; // Optional: Add after publishing to Medium
  content: React.ComponentType;
}

export const articles: Article[] = [
  {
    slug: "introducing-rails-finance",
    title: "Introducing Rails: DeFi Self-Service Support",
    subtitle: "Rails tracks interactions with DeFi protocols, helping you understand activity from real events",
    thumbnail: "/blog/introducing-rails-finance.png",
    publishedAt: "2025-11-06",
    author: {
      name: "Rails Team",
      twitter: "rails_finance",
    },
    content: require("./content/introducing-rails-finance").default,
  },
  {
    slug: "rails-solution-defi-trust-problem",
    title: "Rails: The Solution to DeFi's Trust Problem?",
    subtitle: "Complexity is increasing faster than our ability to evaluate it",
    thumbnail: "/blog/rails-solution-defi-trust-problem.png",
    publishedAt: "2025-11-06",
    author: {
      name: "Rails Team",
      twitter: "rails_finance",
    },
    content: require("./content/rails-solution-defi-trust-problem").default,
  },
  {
    slug: "bold-survived-stream-finance-chaos",
    title: "Why Liquity V2's BOLD Brushed Off the Chaos that Paralyzed Stream Finance",
    subtitle: "How the November 2025 crisis separated resilient stablecoin design from engineered fragility",
    thumbnail: "/blog/bold-survived-stream-finance-chaos.png",
    publishedAt: "2025-11-06",
    author: {
      name: "Miles Essex",
      twitter: "milesessex",
    },
    mediumUrl: "https://medium.com/@railsfinance/why-liquity-v2s-bold-survived-the-chaos-that-paralyzed-stream-finance-79ee267f1aa2",
    content: require("./content/bold-survived-stream-finance-chaos").default,
  },
  // Add your other articles here following the same pattern
];
