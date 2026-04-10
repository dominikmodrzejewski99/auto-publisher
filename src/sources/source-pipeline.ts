import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callGemini } from '../ai/gemini.js';
import { fetchAllFeeds } from './rss-fetcher.js';
import { extractArticleContent } from './content-extractor.js';
import { SOURCE_FEEDS, SOURCE_ARTICLE_COUNT } from './source-config.js';
import type { SourceArticle, Topic, GeneratedArticle, FaqItem } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SourcePipelineOptions {
  apiKey: string;
  publishedSlugs: string[];
  existingBlogTitles: string[];
}

interface SourceTopicResult {
  topic: Topic;
  sourceArticle: SourceArticle;
}

/**
 * Full source-based pipeline:
 * 1. Fetch RSS feeds from foreign travel blogs
 * 2. Select best candidates relevant to our audience
 * 3. Generate Polish topics based on source articles
 * 4. Return topics paired with source content for article generation
 */
export async function fetchSourceTopics(
  options: SourcePipelineOptions,
): Promise<SourceTopicResult[]> {
  const { apiKey, publishedSlugs, existingBlogTitles } = options;

  // 1. Fetch all RSS feeds
  console.log('\n--- Fetching foreign source feeds ---');
  const allArticles = await fetchAllFeeds(SOURCE_FEEDS);
  console.log(`Total source articles fetched: ${allArticles.length}`);

  if (allArticles.length === 0) {
    console.warn('[sources] No articles from any feed. Skipping source pipeline.');
    return [];
  }

  // 2. Select best candidates using AI
  console.log('[sources] Selecting best candidates...');
  const candidates = await selectCandidates(apiKey, allArticles, publishedSlugs, existingBlogTitles);

  if (candidates.length === 0) {
    console.warn('[sources] No suitable candidates found.');
    return [];
  }

  // 3. Enrich short articles with full content from URL
  console.log(`[sources] Enriching ${candidates.length} candidates...`);
  const enriched = await enrichArticles(candidates);

  // 4. Generate Polish topics for each candidate
  console.log('[sources] Generating Polish topics...');
  const results: SourceTopicResult[] = [];

  for (const article of enriched.slice(0, SOURCE_ARTICLE_COUNT + 2)) {
    if (results.length >= SOURCE_ARTICLE_COUNT) break;

    try {
      const topic = await generateTopicFromSource(apiKey, article, publishedSlugs, existingBlogTitles);
      if (topic && !publishedSlugs.includes(topic.slug)) {
        results.push({ topic, sourceArticle: article });
        publishedSlugs.push(topic.slug); // prevent duplicates within batch
        console.log(`  [source] ${article.feedName}: "${article.title}" → "${topic.title}"`);
      }
    } catch (err) {
      console.warn(`  [source] Failed to generate topic from "${article.title}": ${err}`);
    }
  }

  console.log(`[sources] Generated ${results.length} source-based topics`);
  return results;
}

/**
 * Generate a full article from a source article (paraphrase + translate).
 */
export async function generateArticleFromSource(options: {
  apiKey: string;
  topic: Topic;
  sourceArticle: SourceArticle;
}): Promise<GeneratedArticle> {
  const { apiKey, topic, sourceArticle } = options;

  const systemPrompt = await readFile(
    join(__dirname, '../../prompts/rewrite-system.md'),
    'utf-8',
  );

  const sourceContent = sourceArticle.content.slice(0, 3000);

  const userPrompt = [
    `Napisz ORYGINALNY artykuł po polsku inspirowany poniższym źródłem.`,
    '',
    `## Temat artykułu`,
    `Tytuł: "${topic.title}"`,
    `Kategoria: ${topic.category}`,
    `Słowa kluczowe: ${topic.keywords.join(', ')}`,
    `Meta description: ${topic.metaDescription}`,
    '',
    `## Artykuł źródłowy (${sourceArticle.language.toUpperCase()}, ${sourceArticle.feedName})`,
    `Tytuł oryginału: "${sourceArticle.title}"`,
    ``,
    sourceContent,
    '',
    `WAŻNE: Dzisiejsza data to ${new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}. Podawaj aktualne ceny i informacje.`,
    '',
    'NIE TŁUMACZ — napisz oryginalny artykuł po polsku, używając faktów ze źródła jako inspiracji.',
    'Dodaj polską perspektywę: loty z Polski, ceny w PLN, porównania do polskich realiów.',
    '',
    'WYMAGANIE: 800-1200 słów. Zwięźle, konkretnie, zero lania wody.',
  ].join('\n');

  const content = await callGemini({
    apiKey,
    systemPrompt,
    userPrompt,
    model: 'gemini-2.5-flash',
    maxTokens: 16384,
    temperature: 0.7,
  });

  // Ensure H1
  const hasH1 = /<h1[\s>]/i.test(content);
  const finalContent = hasH1 ? content : `<h1>${topic.title}</h1>\n${content}`;

  const headings = extractH2Headings(finalContent);
  const wordCount = countWords(finalContent);
  const faqItems = extractFaqItems(finalContent);

  return { content: finalContent, wordCount, headings, faqItems };
}

// --- Internal helpers ---

async function selectCandidates(
  apiKey: string,
  articles: SourceArticle[],
  publishedSlugs: string[],
  existingBlogTitles: string[],
): Promise<SourceArticle[]> {
  // Build a compact list of articles for AI to rank
  const articleList = articles.slice(0, 50).map((a, i) => ({
    id: i,
    feed: a.feedName,
    title: a.title,
    summary: a.summary.slice(0, 200),
    lang: a.language,
  }));

  const prompt = [
    'Jesteś redaktorem polskiego bloga podróżniczego. Wybierz najlepsze artykuły z zagranicznych źródeł,',
    'które będą interesujące dla polskich czytelników planujących podróże.',
    '',
    '## Kryteria wyboru',
    '- Artykuł dotyczy konkretnego miejsca, praktycznych porad, budżetu, bezpieczeństwa lub ukrytych perełek',
    '- Temat jest interesujący dla Polaków planujących podróże (Azja, Europa, ogólne)',
    '- Artykuł wnosi coś nowego — nie jest ogólnikową listą "top 10 destinations"',
    '- Preferuj artykuły z konkretnymi faktami, cenami, poradami',
    '',
    '## Istniejące artykuły na blogu (UNIKAJ podobnych tematów):',
    existingBlogTitles.slice(-30).join(', '),
    '',
    `## Artykuły do wyboru:`,
    JSON.stringify(articleList, null, 0),
    '',
    `Wybierz ${SOURCE_ARTICLE_COUNT + 3} najlepszych artykułów. Odpowiedz WYŁĄCZNIE JSON — tablica ID:`,
    `[0, 5, 12, ...]`,
  ].join('\n');

  try {
    const response = await callGemini({
      apiKey,
      systemPrompt: 'Jesteś redaktorem treści podróżniczych. Odpowiadasz wyłącznie JSON.',
      userPrompt: prompt,
      maxTokens: 512,
      temperature: 0.3,
      jsonMode: true,
    });

    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const selectedIds: number[] = JSON.parse(cleaned);

    return selectedIds
      .filter((id) => id >= 0 && id < articles.length)
      .map((id) => articles[id]);
  } catch (err) {
    console.warn(`[sources] Selection failed, using first ${SOURCE_ARTICLE_COUNT + 2} articles:`, err);
    return articles.slice(0, SOURCE_ARTICLE_COUNT + 2);
  }
}

async function enrichArticles(articles: SourceArticle[]): Promise<SourceArticle[]> {
  const MIN_CONTENT_LENGTH = 300;

  const enriched = await Promise.all(
    articles.map(async (article) => {
      if (article.content.length >= MIN_CONTENT_LENGTH) return article;

      // Content too short — try fetching full article from URL
      const fullContent = await extractArticleContent(article.link);
      if (fullContent.length > article.content.length) {
        return { ...article, content: fullContent };
      }
      return article;
    }),
  );

  // Filter out articles that are still too short
  return enriched.filter((a) => a.content.length >= 100);
}

async function generateTopicFromSource(
  apiKey: string,
  article: SourceArticle,
  publishedSlugs: string[],
  existingBlogTitles: string[],
): Promise<Topic | null> {
  const prompt = [
    `Na podstawie poniższego artykułu z zagranicznego bloga podróżniczego,`,
    `zaproponuj temat artykułu po polsku dla bloga "Podróże Dominikańskie".`,
    '',
    `## Artykuł źródłowy (${article.language.toUpperCase()}, ${article.feedName})`,
    `Tytuł: "${article.title}"`,
    `Treść: ${article.summary}`,
    '',
    '## Zasady',
    '- Tytuł po polsku, chwytliwy, 50-75 znaków, z aktualnym rokiem jeśli dotyczy cen/przepisów',
    `- AKTUALNY ROK: ${new Date().getFullYear()}`,
    '- Tytuł musi obiecywać rozwiązanie problemu czytelnika',
    '- Temat musi być INNY niż istniejące artykuły:',
    existingBlogTitles.slice(-20).join(', '),
    '',
    '- Slug: kebab-case, bez polskich znaków',
    '- Meta description: 150-160 znaków',
    '- Keywords: 5-8 fraz long-tail po polsku',
    '- Category: nazwa destynacji lub "Ogólne podróże"',
    '',
    'Odpowiedz WYŁĄCZNIE JSON:',
    '{"title": "...", "slug": "...", "metaDescription": "...", "keywords": ["..."], "category": "..."}',
  ].join('\n');

  const response = await callGemini({
    apiKey,
    systemPrompt: 'Jesteś ekspertem od treści podróżniczych. Odpowiadasz wyłącznie JSON.',
    userPrompt: prompt,
    maxTokens: 1024,
    temperature: 0.6,
    jsonMode: true,
  });

  const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    const topic: Topic = JSON.parse(cleaned);
    if (!topic.title || !topic.slug) return null;
    if (publishedSlugs.includes(topic.slug)) return null;
    return topic;
  } catch {
    return null;
  }
}

function extractH2Headings(html: string): string[] {
  const regex = /<h2[^>]*>(.*?)<\/h2>/gi;
  const headings: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    headings.push(match[1].replace(/<[^>]*>/g, '').trim());
  }
  return headings;
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.split(' ').filter((w) => w.length > 0).length;
}

function extractFaqItems(html: string): FaqItem[] {
  const items: FaqItem[] = [];
  const regex = /<div class="faq-item">\s*<h3>(.*?)<\/h3>\s*<p>(.*?)<\/p>\s*<\/div>/gis;
  let match;
  while ((match = regex.exec(html)) !== null) {
    items.push({
      question: match[1].replace(/<[^>]*>/g, '').trim(),
      answer: match[2].replace(/<[^>]*>/g, '').trim(),
    });
  }
  return items;
}
