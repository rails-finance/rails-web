import Link from "next/link";
import type { Article } from "@/app/(site)/blog/data/articles";

interface ArticleLayoutProps {
  article: Article;
  nextArticle?: Article;
  prevArticle?: Article;
  children: React.ReactNode;
}

export function ArticleLayout({ article, nextArticle, prevArticle, children }: ArticleLayoutProps) {
  const formattedDate = new Date(article.publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="container mx-auto px-4 md:px-6 pt-32 pb-12 max-w-4xl">
      {/* Back to Blog Button */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors mb-8"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Blog
      </Link>

      {/* Article Header */}
      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 mb-4 leading-tight">
          {article.title}
        </h1>
        <h2 className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
          {article.subtitle}
        </h2>

        {/* Article Hero Image */}
        <div className="mb-8 -mx-4 md:mx-0">
          <img
            src={article.thumbnail}
            alt={article.title}
            className="w-full rounded-none md:rounded-lg shadow-sm"
          />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-b border-slate-200 dark:border-slate-700 py-4">
          <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
            <div>
              <div className="font-medium text-slate-800 dark:text-slate-200">{article.author.name}</div>
              {article.author.twitter && (
                <a
                  href={`https://x.com/${article.author.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  @{article.author.twitter}
                </a>
              )}
            </div>
            <span className="text-slate-400 dark:text-slate-500">•</span>
            <time dateTime={article.publishedAt} className="text-sm">
              {formattedDate}
            </time>
          </div>
          {article.mediumUrl && (
            <a
              href={article.mediumUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
              </svg>
              Also on Medium
            </a>
          )}
        </div>
      </header>

      {/* Article Content - Medium-compatible semantic HTML structure */}
      <div className="article-content">
        {children}
      </div>

      {/* Article Footer */}
      <footer className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-400 italic">
          Originally published on{" "}
          <a
            href={`https://rails.finance/blog/${article.slug}`}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            rails.finance
          </a>
        </p>
      </footer>

      {/* Next/Previous Navigation */}
      {(nextArticle || prevArticle) && (
        <nav className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Previous Article */}
            {prevArticle && (
              <Link
                href={`/blog/${prevArticle.slug}`}
                className="group p-6 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">← Previous</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {prevArticle.title}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {prevArticle.subtitle}
                </div>
              </Link>
            )}

            {/* Next Article */}
            {nextArticle && (
              <Link
                href={`/blog/${nextArticle.slug}`}
                className={`group p-6 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all ${!prevArticle ? "md:col-start-2" : ""}`}
              >
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-2 text-right">Next →</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-right">
                  {nextArticle.title}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 text-right">
                  {nextArticle.subtitle}
                </div>
              </Link>
            )}
          </div>
        </nav>
      )}
    </article>
  );
}
