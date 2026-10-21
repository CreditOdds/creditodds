export type ArticleTag =
  | 'strategy'
  | 'guide'
  | 'analysis'
  | 'news-analysis'
  | 'beginner';

export const tagLabels: Record<ArticleTag, string> = {
  'strategy': 'Strategy',
  'guide': 'Guide',
  'analysis': 'Analysis',
  'news-analysis': 'News Analysis',
  'beginner': 'Beginner',
};

export const tagColors: Record<ArticleTag, string> = {
  'strategy': 'bg-purple-100 text-purple-800',
  'guide': 'bg-blue-100 text-blue-800',
  'analysis': 'bg-green-100 text-green-800',
  'news-analysis': 'bg-orange-100 text-orange-800',
  'beginner': 'bg-teal-100 text-teal-800',
};

export const tagDescriptions: Record<ArticleTag, string> = {
  'strategy': 'Strategic advice for maximizing credit card rewards',
  'guide': 'Step-by-step how-to guides',
  'analysis': 'In-depth card and product analysis',
  'news-analysis': 'Analysis of credit card industry news',
  'beginner': 'Beginner-friendly content for those new to credit cards',
};

