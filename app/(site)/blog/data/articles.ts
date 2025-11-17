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
    slug: "keeping-defi-open-and-accessible",
    title: "Keeping DeFi Open and Accessible",
    subtitle: 'A response to Nomatic\'s "DeFi 101 – Back To Basics" on why independent dashboards matter.',
    thumbnail: "/blog/keeping-defi-open-and-accessible.png",
    publishedAt: "2025-11-17",
    author: {
      name: "Rails Team",
      twitter: "rails_finance",
    },
    content: require("./content/keeping-defi-open-and-accessible").default,
  },
  {
    slug: "from-kitchen-table-sketches-to-rails-web-app",
    title: "From Kitchen Table Sketches to Rails Web App",
    subtitle: "The path from DeFi curiosity to a production-ready transparency layer",
    thumbnail: "/blog/from-kitchen-table-sketches-to-rails-web-app.png",
    publishedAt: "2025-11-10",
    author: {
      name: "Rails Team",
      twitter: "rails_finance",
    },
    mediumUrl: "https://medium.com/@railsfinance/from-kitchen-table-sketches-to-rails-web-app-76b8aced9387",
    content: require("./content/from-kitchen-table-sketches-to-rails-web-app").default,
  },
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
    mediumUrl: "https://medium.com/@railsfinance/introducing-rails-defi-self-service-support-ce47cd14ef1d",
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
    mediumUrl: "https://medium.com/@railsfinance/rails-the-solution-to-defis-trust-problem-2cd1a7e65ed7",
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
