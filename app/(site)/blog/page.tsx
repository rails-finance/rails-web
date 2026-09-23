import { BlogCard } from "@/components/blog/BlogCard";
import { articles } from "./data/articles";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/shared/page-metadata";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Insights and updates from the Rails team about DeFi analytics, transaction explanations, and building better support infrastructure for decentralized finance.",
  openGraph: {
    title: "Blog - Rails",
    description:
      "Insights and updates from the Rails team about DeFi analytics, transaction explanations, and building better support infrastructure.",
    url: `${SITE_URL}/blog`,
    images: ["/og/home.png"],
  },
};

export default function BlogPage() {
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-3xl">
      <div className="mb-12">
        <h1 className="font-sans font-semibold tracking-tight leading-tight text-foreground text-[clamp(28px,4.5vw,48px)] mb-4">
          Blog
        </h1>
        <p className="text-xl text-rb-500">Insights, updates, and stories from the Rails team.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-8">
        {articles.map((article) => (
          <BlogCard key={article.slug} article={article} />
        ))}
      </div>
    </div>
  );
}
