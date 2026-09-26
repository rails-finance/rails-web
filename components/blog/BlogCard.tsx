import Link from "next/link";
import type { Article } from "@/app/(site)/blog/data/articles";
import { formatMonthDayYear } from "@/lib/date";

interface BlogCardProps {
  article: Article;
}

export function BlogCard({ article }: BlogCardProps) {
  const formattedDate = formatMonthDayYear(article.publishedAt);

  return (
    <Link href={`/blog/${article.slug}`} className="group block h-full">
      <article className="bg-rb-50 dark:bg-rb-800 rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
        <div className="aspect-[16/9] bg-rb-200 dark:bg-rb-700 overflow-hidden">
          <img
            src={article.thumbnail}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div className="p-6 flex-1 flex flex-col">
          <time className="text-sm text-rb-500">{formattedDate}</time>
          <h2 className="text-2xl font-semibold text-foreground mt-2 mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {article.title}
          </h2>
          <p className="text-rb-500 line-clamp-2">{article.subtitle}</p>
        </div>
      </article>
    </Link>
  );
}
