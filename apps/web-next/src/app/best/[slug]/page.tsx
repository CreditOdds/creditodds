import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBestPage, getBestPages } from "@/lib/best";
import { getAllCards } from "@/lib/api";
import { BestRankingViews } from "@/components/best/BestRankingViews";
import { ArticleContent } from "@/components/articles/ArticleContent";
import { BreadcrumbSchema, CollectionPageSchema } from "@/components/seo/JsonLd";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../../landing.css";

interface Props {
  params: Promise<{ slug: string }>;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getBestPage(slug);
  if (!page) return { title: "Not Found" };
  const title = page.seo_title || `${page.title} | CreditOdds`;
  const description = page.seo_description || page.description;
  return {
    title,
    description,
    openGraph: {
      title: page.seo_title || page.title,
      description,
      url: `https://creditodds.com/best/${page.slug}`,
      type: "article",
      publishedTime: page.date,
      modifiedTime: page.updated_at || page.date,
    },
    alternates: {
      canonical: `https://creditodds.com/best/${page.slug}`,
    },
  };
}

export async function generateStaticParams() {
  const pages = await getBestPages();
  return pages.map((page) => ({ slug: page.slug }));
}

export const revalidate = 300;

export default async function BestDetailPage({ params }: Props) {
  const { slug } = await params;
  const [page, allCards] = await Promise.all([getBestPage(slug), getAllCards()]);
  if (!page) notFound();

  const cardsBySlug = new Map(allCards.map(card => [card.slug, card]));
  const enrichedCards = page.cards
    .filter(entry => cardsBySlug.has(entry.slug))
    .map(entry => ({ ...entry, card: cardsBySlug.get(entry.slug)! }));

  const pageUrl = `https://creditodds.com/best/${page.slug}`;

  return (
    <div className="landing-v2 best-detail-v2">
      <CollectionPageSchema
        url={pageUrl}
        name={page.title}
        description={page.description}
        datePublished={page.date}
        dateModified={page.updated_at || page.date}
        items={enrichedCards.map((entry) => ({
          name: entry.card.card_name,
          url: `https://creditodds.com/card/${entry.card.slug}`,
        }))}
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Best Cards', url: 'https://creditodds.com/best' },
          { name: page.title, url: pageUrl },
        ]}
      />

      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <Link href="/best" className="cj-crumb">Best cards</Link>
          <span className="cj-sep">/</span>
          <span className="cj-crumb cj-crumb-current" aria-current="page">{page.title}</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />{enrichedCards.length.toLocaleString()} cards · live</span>
        </div>
      </div>

      <section className="page-hero wrap">
        <h1 className="page-title">{page.title}</h1>
        <p className="page-sub">{page.description}</p>
        {page.intro && (
          <div className="hero-intro">
            <ArticleContent content={page.intro} />
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginTop: 14,
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--muted)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent)',
              }}
            />
            Updated · <b>{formatDate(page.updated_at || page.date)}</b>
          </span>
          <span>·</span>
          <span>
            <b style={{ color: 'var(--ink)' }}>{enrichedCards.length}</b> card
            {enrichedCards.length === 1 ? '' : 's'}
          </span>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <BestRankingViews cards={enrichedCards} panel={page.panel} />

        <Link
          href="/best"
          className="article-back"
          style={{ display: 'inline-flex', marginTop: 32 }}
        >
          ← Back to Best Cards
        </Link>
      </div>
      <V2Footer />
    </div>
  );
}
