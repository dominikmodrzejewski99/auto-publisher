import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../config.js';
import { fetchTrends } from '../trends/trend-fetcher.js';
import { generateTopics } from '../topics/topic-generator.js';
import { generateArticle, validateArticle } from '../articles/article-generator.js';
import { assembleHtml } from '../articles/template.js';
import { fetchImages } from '../images/image-fetcher.js';
import { publishToBlogger } from '../publisher/blogger.js';
import type { CategoriesData, PublishedData } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

async function main() {
  const config = loadConfig();

  const categoriesData: CategoriesData = JSON.parse(
    await readFile(join(DATA_DIR, 'categories.json'), 'utf-8'),
  );
  const publishedData: PublishedData = JSON.parse(
    await readFile(join(DATA_DIR, 'published.json'), 'utf-8'),
  );
  const publishedSlugs = publishedData.articles.map((a) => a.slug);

  // 1. Fetch trends
  console.log('Fetching trends...');
  const trends = await fetchTrends(categoriesData.categories);
  console.log(
    `Trends: ${trends.dailyTrends.length} daily, ${Object.values(trends.peopleQuestions).reduce((s, q) => s + q.length, 0)} questions`,
  );

  // 2. Generate 1 topic
  console.log('\nGenerating topic...');
  const topics = await generateTopics({
    apiKey: config.geminiApiKey,
    trends,
    categories: categoriesData.categories,
    publishedSlugs,
    count: 1,
  });

  if (topics.length === 0) {
    console.log('No topics generated. Exiting.');
    return;
  }

  const topic = topics[0];
  console.log(`Topic: ${topic.title}`);
  console.log(`Category: ${topic.category}`);
  console.log(`Keywords: ${topic.keywords.join(', ')}`);

  // 3. Generate article
  console.log('\nGenerating article...');
  const article = await generateArticle({
    apiKey: config.geminiApiKey,
    topic,
  });
  console.log(`Words: ${article.wordCount}, H2s: ${article.headings.length}`);

  const validation = validateArticle(article);
  if (!validation.valid) {
    console.error(`Validation failed: ${validation.reasons.join(', ')}`);
    return;
  }

  // 4. Fetch images
  console.log('Fetching images...');
  const images = await fetchImages({
    accessKey: config.unsplashAccessKey,
    query: `${topic.category} ${topic.keywords[0]} travel`,
    count: Math.min(article.headings.length + 1, 6),
  });
  console.log(`Found ${images.length} images`);

  // 5. Assemble HTML
  const html = assembleHtml({
    topic,
    content: article.content,
    images,
    headings: article.headings,
  });

  // 6. Publish as DRAFT
  console.log('\nPublishing as DRAFT to Blogger...');
  const result = await publishToBlogger({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    refreshToken: config.googleRefreshToken,
    blogId: config.bloggerBlogId,
    title: topic.title,
    content: html,
    labels: [topic.category, ...topic.keywords.slice(0, 3)],
    isDraft: true,
  });

  console.log(`\nDraft published!`);
  console.log(`URL: ${result.url}`);
  console.log(`Post ID: ${result.postId}`);
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});
