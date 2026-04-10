import type { SourceFeed, SourceArticle } from '../types.js';
import { MAX_ITEMS_PER_FEED, MAX_ARTICLE_AGE_HOURS } from './source-config.js';

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface RssItem {
  title: string;
  link: string;
  description: string;
  contentEncoded: string;
  pubDate: string;
}

/**
 * Fetch and parse multiple RSS feeds in parallel.
 * Silently skips feeds that fail (network error, bad XML, etc.).
 */
export async function fetchAllFeeds(feeds: SourceFeed[]): Promise<SourceArticle[]> {
  const results = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed)));

  const articles: SourceArticle[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    }
  }

  // Sort newest first
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return articles;
}

async function fetchFeed(feed: SourceFeed): Promise<SourceArticle[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[rss] ${feed.name}: HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const items = parseRss(xml);

    const cutoff = Date.now() - MAX_ARTICLE_AGE_HOURS * 60 * 60 * 1000;

    const articles: SourceArticle[] = [];
    for (const item of items.slice(0, MAX_ITEMS_PER_FEED)) {
      const pubTime = new Date(item.pubDate).getTime();
      if (pubTime && pubTime < cutoff) continue;

      const content = item.contentEncoded || item.description || '';
      const summary = stripHtml(item.description || item.contentEncoded || '').slice(0, 500);

      if (!item.title || !item.link || summary.length < 50) continue;

      articles.push({
        feedName: feed.name,
        title: item.title,
        link: item.link,
        summary,
        content: stripHtml(content),
        publishedAt: item.pubDate || new Date().toISOString(),
        language: feed.language,
      });
    }

    console.log(`[rss] ${feed.name}: ${articles.length} articles`);
    return articles;
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[rss] ${feed.name}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

/**
 * Lightweight RSS/Atom XML parser using regex.
 * Handles both RSS 2.0 (<item>) and Atom (<entry>) feeds.
 */
function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // Try RSS 2.0 format first
  const rssItemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = rssItemRegex.exec(xml)) !== null) {
    items.push(parseRssItem(match[1]));
  }

  // If no RSS items found, try Atom format
  if (items.length === 0) {
    const atomEntryRegex = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    while ((match = atomEntryRegex.exec(xml)) !== null) {
      items.push(parseAtomEntry(match[1]));
    }
  }

  return items;
}

function parseRssItem(itemXml: string): RssItem {
  return {
    title: extractTag(itemXml, 'title'),
    link: extractTag(itemXml, 'link'),
    description: extractTag(itemXml, 'description'),
    contentEncoded: extractTag(itemXml, 'content:encoded'),
    pubDate: extractTag(itemXml, 'pubDate'),
  };
}

function parseAtomEntry(entryXml: string): RssItem {
  // Atom <link> uses href attribute
  const linkMatch = /<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?>/i.exec(entryXml);

  return {
    title: extractTag(entryXml, 'title'),
    link: linkMatch?.[1] ?? '',
    description: extractTag(entryXml, 'summary') || extractTag(entryXml, 'content'),
    contentEncoded: extractTag(entryXml, 'content'),
    pubDate: extractTag(entryXml, 'published') || extractTag(entryXml, 'updated'),
  };
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA sections
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle regular text content
  const textRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const textMatch = textRegex.exec(xml);
  if (textMatch) return decodeXmlEntities(textMatch[1].trim());

  return '';
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
