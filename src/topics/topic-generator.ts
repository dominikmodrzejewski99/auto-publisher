import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callGemini } from '../ai/gemini.js';
import type { Category, Topic } from '../types.js';
import type { TrendData } from '../trends/trend-fetcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GenerateTopicsOptions {
  apiKey: string;
  trends: TrendData;
  categories: Category[];
  publishedSlugs: string[];
  count: number;
}

export async function generateTopics(options: GenerateTopicsOptions): Promise<Topic[]> {
  const { apiKey, trends, categories, publishedSlugs, count } = options;

  const systemPrompt = await readFile(
    join(__dirname, '../../prompts/topic-system.md'),
    'utf-8',
  );

  const userPrompt = buildUserPrompt(trends, categories, publishedSlugs, count);

  const response = await callGemini({
    apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
    temperature: 0.8,
    jsonMode: true,
  });

  // Gemini sometimes wraps JSON in markdown code blocks
  const cleaned = response.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

  let topics: Topic[];
  try {
    topics = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from partial response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`Failed to parse topics JSON:\n${cleaned.slice(0, 500)}`);
    topics = JSON.parse(match[0]);
  }

  return topics.filter((t) => !publishedSlugs.includes(t.slug));
}

function buildUserPrompt(
  trends: TrendData,
  categories: Category[],
  publishedSlugs: string[],
  count: number,
): string {
  const parts: string[] = [];

  parts.push(`Zaproponuj ${count} unikalne tematy artykułów.`);
  parts.push('');

  parts.push('## Kategorie:');
  for (const cat of categories) {
    parts.push(`- ${cat.name}: ${cat.keywords.join(', ')}`);
  }
  parts.push('');

  if (trends.dailyTrends.length > 0) {
    parts.push('## Aktualne trendy w Polsce:');
    parts.push(trends.dailyTrends.slice(0, 20).join(', '));
    parts.push('');
  }

  if (Object.keys(trends.relatedQueries).length > 0) {
    parts.push('## Powiązane zapytania:');
    for (const [cat, queries] of Object.entries(trends.relatedQueries)) {
      if (queries.length > 0) {
        parts.push(`- ${cat}: ${queries.slice(0, 10).join(', ')}`);
      }
    }
    parts.push('');
  }

  if (Object.keys(trends.peopleQuestions).length > 0) {
    parts.push('## Pytania, które ludzie zadają (Google Suggest):');
    for (const [cat, questions] of Object.entries(trends.peopleQuestions)) {
      if (questions.length > 0) {
        parts.push(`### ${cat}:`);
        parts.push(questions.slice(0, 30).map((q) => `- ${q}`).join('\n'));
        parts.push('');
      }
    }
  }

  if (publishedSlugs.length > 0) {
    parts.push('## Już opublikowane (unikaj):');
    parts.push(publishedSlugs.slice(-50).join(', '));
  }

  return parts.join('\n');
}
