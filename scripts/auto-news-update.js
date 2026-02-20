#!/usr/bin/env node

/**
 * Auto News Update Script
 *
 * Searches for credit card news using Brave Search API,
 * generates YAML news items using Claude API (Haiku),
 * and writes them to data/news/ for human review.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Configuration
const NEWS_DIR = path.join(__dirname, '..', 'data', 'news');
const NEWS_JSON = path.join(__dirname, '..', 'data', 'news.json');
const CARDS_JSON = path.join(__dirname, '..', 'data', 'cards.json');
const MAX_NEWS_ITEMS = 3;

// Valid tags from schema
const VALID_TAGS = [
  'new-card',
  'discontinued',
  'bonus-change',
  'fee-change',
  'benefit-change',
  'limited-time',
  'policy-change',
  'general'
];

// Major banks for targeted searches
const MAJOR_BANKS = [
  'Chase',
  'American Express',
  'Capital One',
  'Citi',
  'Bank of America',
  'Wells Fargo',
  'Discover',
  'Barclays',
  'U.S. Bank'
];

/**
 * Load existing news from YAML files to avoid duplicates.
 * Reads directly from data/news/ since news.json is gitignored and not available in CI.
 */
function loadExistingNews() {
  try {
    const files = fs.readdirSync(NEWS_DIR).filter(f => f.endsWith('.yaml'));
    const items = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(NEWS_DIR, file), 'utf8');
        const parsed = yaml.load(content);
        if (parsed && parsed.id) {
          items.push(parsed);
        }
      } catch (err) {
        console.warn(`Warning: Could not parse ${file}: ${err.message}`);
      }
    }
    return items;
  } catch (err) {
    console.warn('Warning: Could not load existing news:', err.message);
    return [];
  }
}

/**
 * Load cards for card name/slug lookup
 */
function loadCards() {
  try {
    const content = fs.readFileSync(CARDS_JSON, 'utf8');
    const data = JSON.parse(content);
    return data.cards || [];
  } catch (err) {
    console.warn('Warning: Could not load cards:', err.message);
    return [];
  }
}

/**
 * Build search queries based on current date and banks
 */
function buildSearchQueries() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString('default', { month: 'long' });

  // Generic credit card news queries
  const queries = [
    `credit card news ${month} ${year}`,
    `credit card bonus change ${year}`,
    `credit card annual fee change ${year}`,
    `new credit card launch ${year}`,
  ];

  // Pick 2-3 random banks for targeted search (rotate through)
  const dayOfYear = Math.floor((now - new Date(year, 0, 0)) / (1000 * 60 * 60 * 24));
  const bankIndices = [
    dayOfYear % MAJOR_BANKS.length,
    (dayOfYear + 3) % MAJOR_BANKS.length,
    (dayOfYear + 6) % MAJOR_BANKS.length,
  ];

  for (const idx of bankIndices) {
    const bank = MAJOR_BANKS[idx];
    queries.push(`${bank} credit card news ${year}`);
  }

  return queries;
}

/**
 * Search using Brave Search API
 */
async function braveSearch(query) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY environment variable is required');
  }

  const params = new URLSearchParams({
    q: query,
    count: '10',
    freshness: 'pw', // Past week
    text_decorations: 'false',
  });

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.web?.results || [];
}

/**
 * Call Claude API to analyze search results and generate news items
 */
async function generateNewsWithClaude(searchResults, existingNews, cards) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  // Build card reference for Claude
  const cardsList = cards
    .filter(c => c.accepting_applications !== false)
    .map(c => `- ${c.name} (slug: ${c.slug}, bank: ${c.bank})`)
    .join('\n');

  // Format search results for Claude
  const searchContext = searchResults.map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\nDescription: ${r.description || 'N/A'}\n`
  ).join('\n');

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7); // YYYY-MM format

  // Build detailed existing news context - especially for current month
  // This helps Claude detect semantic duplicates (same story, different wording)
  const existingNewsContext = existingNews
    .filter(n => n.date >= currentMonth + '-01') // Only show news from current month onward
    .map(n => `- [${n.date}] "${n.title}" (ID: ${n.id})\n  Summary: ${n.summary}`)
    .join('\n');

  const existingNewsIds = existingNews.map(n => n.id);

  const prompt = `You are a highly selective credit card news analyst. Your job is to identify ONLY the most important, high-impact credit card news. Most days there will be NO news worth reporting - that is expected and acceptable.

## Search Results
${searchContext}

## Card Database (for matching card_slug)
${cardsList}

## CRITICAL: Existing News This Month (DO NOT DUPLICATE)
The following news items have ALREADY been posted. Do NOT create news about the same topics, even if the search results phrase it differently or provide updates on the same story.

${existingNewsContext || 'No news posted yet this month.'}

## All Existing News IDs (for reference)
${existingNewsIds.join(', ') || 'None'}

## STRICT Selection Criteria - Only include news that meets ALL of these:
1. **High Impact**: Must significantly affect cardholders (major fee changes, significant benefit additions/removals, new card launches from major issuers)
2. **Confirmed & Official**: Must be officially announced or confirmed, not rumors or speculation
3. **Recent**: Article must be published within the last 7 days
4. **Unique**: NOT about the same topic as any existing news listed above - check the TITLES and SUMMARIES, not just IDs

## DO NOT Include:
- Minor policy tweaks or small adjustments
- "Best cards" listicles or roundups
- Promotional content or affiliate marketing
- Earnings reports or financial news (unless directly affecting card benefits)
- Speculation about future changes
- News about cards not in the database
- Generic credit card advice articles
- **CRITICAL**: News about the same topic as existing items above, even if worded differently. If we already posted about a card's fee change, benefit update, or policy change this month, do NOT post about it again even if there's a new article about the same thing.

## Schema Requirements
Each news item MUST have:
- id: lowercase-with-hyphens, unique identifier
- date: YYYY-MM-DD format - THIS MUST BE THE DATE THE ARTICLE WAS PUBLISHED, not a future effective date. Today is ${today}.
- title: Concise headline, max 200 chars
- summary: Factual summary with specific details (numbers, dates, requirements), max 500 chars
- tags: Array of 1+ tags from: ${VALID_TAGS.join(', ')}

Optional fields:
- bank: Bank name if card-specific
- card_slug: Must match a slug from the card database above
- card_name: Full card name
- source: Source name (e.g., "The Points Guy", "Doctor of Credit")
- source_url: Full URL to the source article

## Output Format
If you find important news (expect 0-2 items on most days), output each as a YAML code block.
If no news meets the strict criteria above, output "NO_NEWS_FOUND" - this is the expected outcome most days.

Example:
\`\`\`yaml
id: "example-news-id"
date: "2024-03-15"
title: "Example News Title"
summary: "Example summary with specific details..."
tags:
  - benefit-change
bank: "Chase"
card_slug: "chase-sapphire-preferred"
card_name: "Chase Sapphire Preferred Card"
source: "The Points Guy"
source_url: "https://example.com/article"
\`\`\``;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.content[0]?.text || '';
}

/**
 * Parse YAML blocks from Claude's response
 */
function parseYamlBlocks(responseText) {
  if (responseText.includes('NO_NEWS_FOUND')) {
    return [];
  }

  const yamlRegex = /```yaml\n([\s\S]*?)```/g;
  const blocks = [];
  let match;

  while ((match = yamlRegex.exec(responseText)) !== null) {
    try {
      const parsed = yaml.load(match[1]);
      if (parsed && parsed.id && parsed.date && parsed.title && parsed.summary && parsed.tags) {
        blocks.push(parsed);
      }
    } catch (err) {
      console.warn('Warning: Failed to parse YAML block:', err.message);
    }
  }

  return blocks;
}

/**
 * Validate a news item against the schema
 */
function validateNewsItem(item) {
  const errors = [];

  // Required fields
  if (!item.id || !/^[a-z0-9-]+$/.test(item.id)) {
    errors.push('Invalid or missing id');
  }
  if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    errors.push('Invalid or missing date');
  } else {
    const itemDate = new Date(item.date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    // Reject future dates
    if (itemDate > today) {
      errors.push('Date cannot be in the future (use publication date, not effective date)');
    }
    // Reject articles older than 14 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    cutoff.setHours(0, 0, 0, 0);
    if (itemDate < cutoff) {
      errors.push(`Date ${item.date} is older than 14 days`);
    }
  }
  if (!item.title || item.title.length > 200) {
    errors.push('Invalid or missing title');
  }
  if (!item.summary || item.summary.length > 500) {
    errors.push('Invalid or missing summary');
  }
  if (!item.tags || !Array.isArray(item.tags) || item.tags.length === 0) {
    errors.push('Invalid or missing tags');
  } else {
    for (const tag of item.tags) {
      if (!VALID_TAGS.includes(tag)) {
        errors.push(`Invalid tag: ${tag}`);
      }
    }
  }

  // Optional field validation
  if (item.card_slug && !/^[a-z0-9-]+$/.test(item.card_slug)) {
    errors.push('Invalid card_slug format');
  }

  return errors;
}

/**
 * Write news item to YAML file
 */
function writeNewsFile(item) {
  const filename = `${item.date}-${item.id.replace(`${item.date}-`, '')}.yaml`;
  const filepath = path.join(NEWS_DIR, filename);

  // Don't overwrite existing files
  if (fs.existsSync(filepath)) {
    console.log(`  Skipping ${filename} (already exists)`);
    return null;
  }

  const yamlContent = yaml.dump(item, {
    quotingType: '"',
    forceQuotes: true,
    lineWidth: -1,
  });

  fs.writeFileSync(filepath, yamlContent);
  console.log(`  Created ${filename}`);
  return filename;
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Auto News Update ===\n');

  // Check for required API keys
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    console.error('Error: BRAVE_SEARCH_API_KEY environment variable is required');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  // Load existing data
  console.log('Loading existing data...');
  const existingNews = loadExistingNews();
  const cards = loadCards();
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);
  const newsThisMonth = existingNews.filter(n => n.date.startsWith(currentMonth));
  console.log(`  Found ${existingNews.length} existing news items (${newsThisMonth.length} this month)`);
  console.log(`  Found ${cards.length} cards\n`);

  // Build search queries
  const queries = buildSearchQueries();
  console.log('Search queries:');
  queries.forEach(q => console.log(`  - ${q}`));
  console.log('');

  // Execute searches
  console.log('Searching for news...');
  const allResults = [];
  const seenUrls = new Set();

  for (const query of queries) {
    try {
      const results = await braveSearch(query);
      console.log(`  "${query}" -> ${results.length} results`);

      // Dedupe by URL
      for (const result of results) {
        if (!seenUrls.has(result.url)) {
          seenUrls.add(result.url);
          allResults.push(result);
        }
      }

      // Rate limit between requests (Brave free tier allows ~1 req/sec)
      await new Promise(resolve => setTimeout(resolve, 1200));
    } catch (err) {
      console.warn(`  Warning: Search failed for "${query}": ${err.message}`);
    }
  }

  console.log(`\nTotal unique search results: ${allResults.length}\n`);

  if (allResults.length === 0) {
    console.log('No search results found. Exiting.');
    return;
  }

  // Generate news with Claude
  console.log('Analyzing results with Claude API...');
  const claudeResponse = await generateNewsWithClaude(allResults, existingNews, cards);

  // Parse YAML blocks
  const newsItems = parseYamlBlocks(claudeResponse);
  console.log(`Claude generated ${newsItems.length} potential news item(s)\n`);

  if (newsItems.length === 0) {
    console.log('No valid news items generated. Exiting.');
    return;
  }

  // Validate and write news files
  console.log('Validating and writing news files...');
  let createdCount = 0;

  for (const item of newsItems.slice(0, MAX_NEWS_ITEMS)) {
    const errors = validateNewsItem(item);

    if (errors.length > 0) {
      console.log(`  Skipping "${item.id || 'unknown'}": ${errors.join(', ')}`);
      continue;
    }

    // Skip duplicates by ID
    const existingNewsIds = existingNews.map(n => n.id);
    if (existingNewsIds.includes(item.id)) {
      console.log(`  Skipping "${item.id}": Already exists`);
      continue;
    }

    // Skip semantic duplicates - check if title is too similar to existing news this month
    const isDuplicateTitle = newsThisMonth.some(existing => {
      const existingTitleLower = existing.title.toLowerCase();
      const newTitleLower = item.title.toLowerCase();
      // Check for significant word overlap (simple heuristic)
      const existingWords = new Set(existingTitleLower.split(/\s+/).filter(w => w.length > 3));
      const newWords = newTitleLower.split(/\s+/).filter(w => w.length > 3);
      const matchingWords = newWords.filter(w => existingWords.has(w));
      const overlapRatio = matchingWords.length / Math.max(newWords.length, 1);
      return overlapRatio > 0.5; // More than 50% word overlap
    });

    if (isDuplicateTitle) {
      console.log(`  Skipping "${item.id}": Similar news already posted this month`);
      continue;
    }

    const filename = writeNewsFile(item);
    if (filename) {
      createdCount++;
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Created ${createdCount} new news file(s)`);

  if (createdCount > 0) {
    console.log('\nRun "npm run build:news" to validate and rebuild news.json');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
