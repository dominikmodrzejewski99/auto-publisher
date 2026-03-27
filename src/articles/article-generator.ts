import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callGemini } from '../ai/gemini.js';
import type { Topic, GeneratedArticle } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GenerateArticleOptions {
  apiKey: string;
  topic: Topic;
}

interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

export async function generateArticle(options: GenerateArticleOptions): Promise<GeneratedArticle> {
  const { apiKey, topic } = options;

  const systemPrompt = await readFile(
    join(__dirname, '../../prompts/article-system.md'),
    'utf-8',
  );

  const userPrompt = [
    `Napisz artykuł na temat: "${topic.title}"`,
    `Kategoria: ${topic.category}`,
    `Słowa kluczowe: ${topic.keywords.join(', ')}`,
    `Meta description: ${topic.metaDescription}`,
  ].join('\n');

  const content = await callGemini({
    apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 16384,
    temperature: 0.7,
  });

  const headings = extractH2Headings(content);
  const wordCount = countWords(content);

  return { content, wordCount, headings };
}

export function validateArticle(article: GeneratedArticle): ValidationResult {
  const reasons: string[] = [];

  if (article.wordCount < 1500) {
    reasons.push(`Article too short: ${article.wordCount} words (minimum 1500)`);
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
