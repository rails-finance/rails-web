import { BlogCard } from "@/components/blog/BlogCard";
import { articles } from "./data/articles";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog - Rails",
  description:
    "Insights and updates from the Rails team about DeFi analytics, transaction explanations, and building better support infrastructure for decentralized finance.",
  openGraph: {
    title: "Blog - Rails",
    description:
      "Insights and updates from the Rails team about DeFi analytics, transaction explanations, and building better support infrastructure.",
    url: "https://rails.finance/blog",
  },
};

export default function BlogPage() {
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-7xl">
      <div className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-800 dark:text-slate-100 mb-4">
          Blog
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl">
          Insights, updates, and stories from the Rails team about making DeFi more accessible.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {articles.map((article) => (
          <BlogCard key={article.slug} article={article} />
        ))}
      </div>
    </div>
  );
}
