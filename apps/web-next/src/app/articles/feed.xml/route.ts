import { getArticles } from "@/lib/articles";

export const revalidate = 300; // Revalidate every 5 minutes

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const articles = await getArticles();
  const siteUrl = "https://creditodds.com";

  const rssItems = articles
    .slice(0, 20) // Limit to 20 most recent articles
    .map((article) => {
      const pubDate = new Date(article.date).toUTCString();
      const articleUrl = `${siteUrl}/articles/${article.slug}`;
      const imageUrl = article.image
        ? `https://d2hxvzw7msbtvt.cloudfront.net/article_images/${article.image}`
        : null;

      return `
    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${articleUrl}</link>
      <guid isPermaLink="true">${articleUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(article.summary)}</description>
      <author>noreply@creditodds.com (${escapeXml(article.author)})</author>
      ${article.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join('\n      ')}
      ${imageUrl ? `<enclosure url="${imageUrl}" type="image/jpeg" />` : ''}
    </item>`;
    })
    .join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>CreditOdds Articles</title>
    <link>${siteUrl}/articles</link>
    <description>In-depth guides, strategies, and analysis to help you maximize your credit card rewards and make smarter financial decisions.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/articles/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/logo.png</url>
      <title>CreditOdds Articles</title>
      <link>${siteUrl}/articles</link>
    </image>
    ${rssItems}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
