// focus: Rails' own writing; no asset or chain to filter
import { notFound } from "next/navigation";
import { ArticleLayout } from "@/components/blog/ArticleLayout";
import { articles } from "../data/articles";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/shared/page-metadata";

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

  const canonicalUrl = `${SITE_URL}/blog/${article.slug}`;

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
          url: `${SITE_URL}${article.thumbnail}`,
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
      images: [`${SITE_URL}${article.thumbnail}`],
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

  // The post's date and author for search (ui-jobs 513), as the page states them.
  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.subtitle,
    datePublished: article.publishedAt,
    // "Rails Team" is the organisation; a named author is a person.
    author:
      article.author.name === "Rails Team"
        ? { "@type": "Organization", name: "Rails", url: SITE_URL }
        : { "@type": "Person", name: article.author.name },
    publisher: { "@type": "Organization", name: "Rails", url: SITE_URL },
    image: `${SITE_URL}${article.thumbnail}`,
    url: `${SITE_URL}/blog/${article.slug}`,
    mainEntityOfPage: `${SITE_URL}/blog/${article.slug}`,
  };

  return (
    <ArticleLayout article={article} nextArticle={nextArticle} prevArticle={prevArticle}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPosting) }} />
      <ArticleContent />
    </ArticleLayout>
  );
}
