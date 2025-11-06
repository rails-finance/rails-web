import Link from "next/link";
import type { Article } from "@/app/(site)/blog/data/articles";

interface BlogCardProps {
  article: Article;
}

export function BlogCard({ article }: BlogCardProps) {
  const formattedDate = new Date(article.publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Link href={`/blog/${article.slug}`} className="group block">
      <article className="bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300">
        <div className="aspect-[16/9] bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <img
            src={article.thumbnail}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div className="p-6">
          <time className="text-sm text-slate-500 dark:text-slate-400">{formattedDate}</time>
          <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mt-2 mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {article.title}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 line-clamp-2">{article.subtitle}</p>
        </div>
      </article>
    </Link>
  );
}
