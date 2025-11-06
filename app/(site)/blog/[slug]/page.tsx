import { notFound } from "next/navigation";
import { ArticleLayout } from "@/components/blog/ArticleLayout";
import { articles } from "../data/articles";
import type { Metadata } from "next";

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return articles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((a) => a.slug === slug);

  if (!article) {
    return {};
  }

  const canonicalUrl = `https://rails.finance/blog/${article.slug}`;

  return {
    title: `${article.title} - Rails Blog`,
    description: article.subtitle,
    openGraph: {
      title: article.title,
      description: article.subtitle,
      url: canonicalUrl,
      type: "article",
      publishedTime: article.publishedAt,
      authors: [article.author.name],
      images: [
        {
          url: `https://rails.finance${article.thumbnail}`,
          width: 1200,
          height: 630,
          alt: article.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.subtitle,
      images: [`https://rails.finance${article.thumbnail}`],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const currentIndex = articles.findIndex((a) => a.slug === slug);

  if (currentIndex === -1) {
    notFound();
  }

  const article = articles[currentIndex];
  const nextArticle = currentIndex > 0 ? articles[currentIndex - 1] : undefined;
  const prevArticle = currentIndex < articles.length - 1 ? articles[currentIndex + 1] : undefined;

  const ArticleContent = article.content;

  return (
    <ArticleLayout article={article} nextArticle={nextArticle} prevArticle={prevArticle}>
      <ArticleContent />
    </ArticleLayout>
  );
}
