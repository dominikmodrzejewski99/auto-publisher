import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callGemini } from '../ai/gemini.js';
import { researchTopic } from '../research/web-research.js';
import type { Topic, GeneratedArticle, FaqItem } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GenerateArticleOptions {
  apiKey: string;
  topic: Topic;
  useGoogleSearch?: boolean;
  systemPromptPath?: string;
}

interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

export async function generateArticle(options: GenerateArticleOptions): Promise<GeneratedArticle> {
  const { apiKey, topic, useGoogleSearch = false, systemPromptPath } = options;

  const promptFile = systemPromptPath ?? join(__dirname, '../../prompts/article-system.md');
  const systemPrompt = await readFile(promptFile, 'utf-8');

  // Research current information before writing
  const research = await researchTopic(topic.title, topic.keywords);

  const userPrompt = [
    `Napisz artykuł na temat: "${topic.title}"`,
    `Kategoria: ${topic.category}`,
    `Słowa kluczowe: ${topic.keywords.join(', ')}`,
    `Meta description: ${topic.metaDescription}`,
    '',
    research,
    '',
    `WAŻNE: Dzisiejsza data to ${new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}. Podawaj aktualne ceny i informacje. Nie odwołuj się do starych danych.`,
    '',
    'WYMAGANIE: Artykuł 800-1200 słów. Zwięźle, konkretnie, zero lania wody. Każde zdanie musi przykuwać uwagę.',
  ].join('\n');

  const content = await callGemini({
    apiKey,
    systemPrompt,
    userPrompt,
    model: 'gemini-2.5-flash',
    maxTokens: 16384,
    temperature: 0.7,
    useGoogleSearch,
  });

  // Validate external links — fix broken ones via Google Search, remove unfixable
  const contentValidatedLinks = await validateAndFixLinks(content, apiKey);

  // Ensure H1 is present — Gemini sometimes omits it with Google Search grounding
  const hasH1 = /<h1[\s>]/i.test(contentValidatedLinks);
  const finalContent = hasH1 ? contentValidatedLinks : `<h1>${topic.title}</h1>\n${contentValidatedLinks}`;

  const headings = extractH2Headings(finalContent);
  const wordCount = countWords(finalContent);
  const faqItems = extractFaqItems(finalContent);

  return { content: finalContent, wordCount, headings, faqItems };
}

export function validateArticle(article: GeneratedArticle): ValidationResult {
  const reasons: string[] = [];

  if (article.wordCount < 600) {
    reasons.push(`Article too short: ${article.wordCount} words (minimum 600)`);
  }

  if (article.headings.length < 3) {
    reasons.push(`Too few H2 headings: ${article.headings.length} (minimum 3)`);
  }

  if (!article.content.includes('<h1>') && !article.content.includes('<h1 ')) {
    reasons.push('Missing H1 heading');
  }

  return { valid: reasons.length === 0, reasons };
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

const LINK_CHECK_TIMEOUT_MS = 8000;
const LINK_CHECK_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface LinkMatch {
  full: string;
  url: string;
  text: string;
}

/**
 * Validate all external links in the HTML.
 * 1. Check each URL with HEAD/GET request
 * 2. For dead links — ask Gemini with Google Search to find the correct URL
 * 3. Verify the suggested URL actually works
 * 4. Replace with working URL, or strip the <a> tag if unfixable
 */
async function validateAndFixLinks(html: string, apiKey: string): Promise<string> {
  const linkRegex = /<a\s+[^>]*href\s*=\s*["'](https?:\/\/[^"']*)["'][^>]*>(.*?)<\/a>/gi;
  const matches: LinkMatch[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    matches.push({ full: match[0], url: match[1], text: match[2] });
  }

  if (matches.length === 0) return html;

  // Step 1: Check all URLs in parallel
  const uniqueUrls = [...new Set(matches.map((m) => m.url))];
  const checkResults = await Promise.all(uniqueUrls.map((url) => checkUrl(url)));
  const urlStatus = new Map<string, boolean>();
  uniqueUrls.forEach((url, i) => urlStatus.set(url, checkResults[i]));

  const deadLinks = matches.filter((m) => !urlStatus.get(m.url));
  if (deadLinks.length === 0) {
    console.log(`[links] All ${matches.length} link(s) OK`);
    return html;
  }

  console.log(`[links] Found ${deadLinks.length} dead link(s), searching for correct URLs...`);

  // Step 2: Ask Gemini with Google Search to find correct URLs
  const deadUnique = [...new Map(deadLinks.map((m) => [m.url, m])).values()];
  const fixedUrls = await findCorrectUrls(deadUnique, apiKey);

  // Step 3: Verify the suggested URLs actually work
  const suggestedUrls = [...new Set(Object.values(fixedUrls).filter(Boolean))] as string[];
  const verifyResults = await Promise.all(suggestedUrls.map((url) => checkUrl(url)));
  const verifiedUrls = new Set<string>();
  suggestedUrls.forEach((url, i) => {
    if (verifyResults[i]) verifiedUrls.add(url);
  });

  // Step 4: Replace in HTML
  let result = html;
  let fixed = 0;
  let removed = 0;

  for (const m of deadLinks) {
    const suggestion = fixedUrls[m.url];
    if (suggestion && verifiedUrls.has(suggestion)) {
      // Replace with working URL
      const newTag = m.full.replace(m.url, suggestion);
      result = result.replace(m.full, newTag);
      console.log(`[links] Fixed: ${m.url} → ${suggestion}`);
      fixed++;
    } else {
      // No working replacement found — strip <a> tag, keep text
      result = result.replace(m.full, m.text);
      console.log(`[links] Removed (unfixable): ${m.url}`);
      removed++;
    }
  }

  console.log(`[links] Summary: ${matches.length - deadLinks.length} OK, ${fixed} fixed, ${removed} removed`);
  return result;
}

/**
 * Use Gemini with Google Search grounding to find correct URLs for dead links.
 * Returns a map of original URL → suggested correct URL (or null if not found).
 */
async function findCorrectUrls(
  deadLinks: LinkMatch[],
  apiKey: string,
): Promise<Record<string, string | null>> {
  const linkList = deadLinks
    .map((m, i) => `${i + 1}. Anchor text: "${m.text.replace(/<[^>]*>/g, '')}" | Broken URL: ${m.url}`)
    .join('\n');

  const prompt = [
    'Poniżej lista linków z artykułu blogowego, które nie działają.',
    'Dla każdego znajdź PRAWIDŁOWY, AKTUALNY URL do tej samej firmy/platformy/strony.',
    'Szukaj oficjalnych stron tych firm/platform.',
    '',
    linkList,
    '',
    'Odpowiedz WYŁĄCZNIE w formacie JSON — obiekt gdzie klucz to broken URL, wartość to prawidłowy URL (lub null jeśli nie znaleziono):',
    '{"https://broken-url.com/...": "https://correct-url.com/...", ...}',
    'Podawaj TYLKO URLe do stron głównych lub konkretnych podstron które NA PEWNO istnieją.',
    'Jeśli nie jesteś pewien — daj null.',
  ].join('\n');

  try {
    const response = await callGemini({
      apiKey,
      systemPrompt: 'Jesteś asystentem wyszukującym prawidłowe URLe stron internetowych. Odpowiadaj wyłącznie JSON.',
      userPrompt: prompt,
      model: 'gemini-2.5-flash',
      maxTokens: 2048,
      temperature: 0,
      jsonMode: true,
      useGoogleSearch: true,
    });

    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[links] Failed to find correct URLs via Gemini:', err);
    return {};
  }
}

async function checkUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LINK_CHECK_TIMEOUT_MS);

    // Try HEAD first (lighter)
    let response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': LINK_CHECK_USER_AGENT },
      redirect: 'follow',
      signal: controller.signal,
    });

    // Some servers reject HEAD — retry with GET
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': LINK_CHECK_USER_AGENT },
        redirect: 'follow',
        signal: controller.signal,
      });
    }

    clearTimeout(timeout);

    // 2xx and 3xx are OK; 403 on GET likely means bot-blocked but site exists
    return response.status < 400 || response.status === 403;
  } catch {
    return false;
  }
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
