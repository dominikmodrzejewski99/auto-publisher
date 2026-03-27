import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callGemini } from '../ai/gemini.js';
import { researchTopic } from '../research/web-research.js';
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
    'WYMAGANIE: Artykuł MUSI mieć MINIMUM 1500 słów. Rozwiń każdą sekcję H2 na 3-5 akapitów. Dodaj konkretne przykłady, ceny, porównania. To jest artykuł blogowy, nie skrót.',
  ].join('\n');

  const content = await callGemini({
    apiKey,
    systemPrompt,
    userPrompt,
    model: 'gemini-2.5-flash',
    maxTokens: 16384,
    temperature: 0.7,
  });

  const headings = extractH2Headings(content);
  const wordCount = countWords(content);

  return { content, wordCount, headings };
}

export function validateArticle(article: GeneratedArticle): ValidationResult {
  const reasons: string[] = [];

  if (article.wordCount < 1200) {
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
