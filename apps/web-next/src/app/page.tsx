import { Metadata } from "next";
import { getAllCards, Card } from "@/lib/api";
import { getNews, NewsItem } from "@/lib/news";
import { getArticles, Article } from "@/lib/articles";
import { getBestPages } from "@/lib/best";
import LandingClient, {
  LandingCard,
  LandingArticle,
  LandingNewsItem,
  LandingBestPage,
} from "./LandingClient";

export const metadata: Metadata = {
  title: "CreditOdds - See Your Credit Card Approval Odds",
  description: "Real approval data from thousands of applications. Find the best card for every store, compare rewards, and follow card news from major issuers. Apply and spend smarter.",
  openGraph: {
    title: "CreditOdds - See Your Credit Card Approval Odds",
    description: "Real approval data from thousands of applications. Find the best card for every store, compare rewards, and follow card news from major issuers. Apply and spend smarter.",
    url: "https://creditodds.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CreditOdds - See Your Credit Card Approval Odds",
    description: "Real approval data from thousands of applications. Find the best card for every store, compare rewards, and follow card news from major issuers. Apply and spend smarter.",
  },
  alternates: {
    canonical: "https://creditodds.com",
  },
  verification: {
    other: {
      "fo-verify": "5b12ca5b-a770-4878-b243-1ab993769bde",
    },
  },
};

// Project a Card down to only the fields the landing page reads.
// This trims ~66% off the per-card payload (drops benefits, apr, referrals, tags, etc.).
function slimCard(c: Card): LandingCard {
  return {
    slug: c.slug,
    card_name: c.card_name,
    bank: c.bank,
    card_image_link: c.card_image_link,
    accepting_applications: c.accepting_applications,
    approved_count: c.approved_count,
    rejected_count: c.rejected_count,
    annual_fee: c.annual_fee,
    signup_bonus: c.signup_bonus
      ? {
          value: c.signup_bonus.value,
          type: c.signup_bonus.type,
          spend_requirement: c.signup_bonus.spend_requirement,
          timeframe_months: c.signup_bonus.timeframe_months,
        }
      : undefined,
    rewards: c.rewards?.map((r) => ({
      category: r.category,
      value: r.value,
      unit: r.unit,
    })),
  };
}

function slimArticles(articles: Article[], cardImageBySlug: Map<string, string | undefined>, cardNameBySlug: Map<string, string>): LandingArticle[] {
  return [...articles]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 3)
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      date: a.date,
      tag: a.tags?.[0]?.replace(/-/g, ' '),
      cardImages: (a.related_cards_info || a.related_cards || [])
        .slice(0, 3)
        .map((rc) => {
          if (typeof rc === 'string') {
            return { src: cardImageBySlug.get(rc), alt: cardNameBySlug.get(rc) || '' };
          }
          return { src: rc.image, alt: rc.name };
        }),
    }));
}

function slimNews(news: NewsItem[], cardImageBySlug: Map<string, string | undefined>, cardNameBySlug: Map<string, string>): LandingNewsItem[] {
  return [...news]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 4)
    .map((n) => {
      const slugs = n.card_slugs?.length ? n.card_slugs : n.card_slug ? [n.card_slug] : [];
      const links = n.card_image_links?.length
        ? n.card_image_links
        : n.card_image_link
          ? [n.card_image_link]
          : [];
      const names = n.card_names?.length ? n.card_names : n.card_name ? [n.card_name] : [];
      const cardImages = slugs.length
        ? slugs.slice(0, 3).map((slug, i) => ({
            src: cardImageBySlug.get(slug) || links[i],
            alt: cardNameBySlug.get(slug) || names[i] || '',
          }))
        : links.slice(0, 3).map((src, i) => ({ src, alt: names[i] || '' }));
      return { id: n.id, title: n.title, date: n.date, cardImages };
    });
}

export default async function LandingPage() {
  const [cards, news, articles, bestPages] = await Promise.all([
    getAllCards(),
    getNews(),
    getArticles(),
    getBestPages(),
  ]);

  const slimmedCards: LandingCard[] = cards.map(slimCard);

  const cardImageBySlug = new Map<string, string | undefined>();
  const cardNameBySlug = new Map<string, string>();
  for (const c of cards) {
    cardImageBySlug.set(c.slug, c.card_image_link);
    cardNameBySlug.set(c.slug, c.card_name);
  }

  const slimmedArticles = slimArticles(articles, cardImageBySlug, cardNameBySlug);
  const slimmedNews = slimNews(news, cardImageBySlug, cardNameBySlug);
  const slimmedBest: LandingBestPage[] = bestPages.slice(0, 8).map((p) => ({
    slug: p.slug,
    title: p.title,
    cardSlugs: p.cards.slice(0, 3).map((c) => c.slug),
  }));

  return (
    <LandingClient
      initialCards={slimmedCards}
      news={slimmedNews}
      articles={slimmedArticles}
      bestPages={slimmedBest}
    />
  );
}
