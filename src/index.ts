import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { fetchTrends } from './trends/trend-fetcher.js';
import { generateTopics } from './topics/topic-generator.js';
import { generateArticle, validateArticle } from './articles/article-generator.js';
import { assembleHtml } from './articles/template.js';
import { fetchImages } from './images/image-fetcher.js';
import { publishToBlogger } from './publisher/blogger.js';
import {
  checkFbTokenExpiry,
  generateFbPost,
  publishToFacebook,
  getFbScheduleSlots,
} from './social/facebook.js';
import type { CategoriesData, PublishedData, PublishedArticle } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

async function loadJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  console.log('=== Blog Auto-Publisher ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Load config
  const config = loadConfig();
  console.log(`Mode: ${config.dryRun ? 'DRY RUN' : 'LIVE'}`);

  // 2. Load data files
  const categoriesData = await loadJsonFile<CategoriesData>(join(DATA_DIR, 'categories.json'));
  const publishedData = await loadJsonFile<PublishedData>(join(DATA_DIR, 'published.json'));
  const publishedSlugs = publishedData.articles.map((a) => a.slug);

  // 3. Check FB token
  const fbTokenStatus = await checkFbTokenExpiry({
    pageAccessToken: config.fbPageAccessToken,
    appId: config.fbAppId,
    appSecret: config.fbAppSecret,
  });
  console.log(`FB Token: ${fbTokenStatus.message}`);
  if (fbTokenStatus.warning) {
    console.warn(`WARNING: ${fbTokenStatus.message}`);
  }

  // 4. Fetch trends
  console.log('\n--- Fetching trends ---');
  const trends = await fetchTrends(categoriesData.categories);
  console.log(`Daily trends: ${trends.dailyTrends.length}`);
  console.log(`Related queries: ${Object.keys(trends.relatedQueries).length} categories`);

  // 5. Generate topics
  console.log('\n--- Generating topics ---');
  const topics = await generateTopics({
    apiKey: config.openRouterApiKey,
    trends,
    categories: categoriesData.categories,
    publishedSlugs,
    count: 3,
  });
  console.log(`Generated ${topics.length} topics:`);
  topics.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}`));

  if (topics.length === 0) {
    console.log('No topics generated. Exiting.');
    return;
  }

  // 6. Process each topic
  const fbSlots = getFbScheduleSlots(new Date());
  const newArticles: PublishedArticle[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    console.log(`\n--- Article ${i + 1}/${topics.length}: ${topic.title} ---`);

    try {
      // 6a. Generate article
      console.log('  Generating article...');
      const article = await generateArticle({
        apiKey: config.openRouterApiKey,
        topic,
      });
      console.log(`  Words: ${article.wordCount}, H2s: ${article.headings.length}`);

      // 6b. Validate
      const validation = validateArticle(article);
      if (!validation.valid) {
        console.warn(`  Validation failed: ${validation.reasons.join(', ')}`);
        failCount++;
        continue;
      }

      // 6c. Fetch images
      console.log('  Fetching images...');
      const images = await fetchImages({
        accessKey: config.unsplashAccessKey,
        query: `${topic.category} ${topic.keywords[0]} travel`,
        count: Math.min(article.headings.length + 1, 6),
      });
      console.log(`  Found ${images.length} images`);

      // 6d. Assemble HTML
      const html = assembleHtml({
        topic,
        content: article.content,
        images,
        headings: article.headings,
      });

      if (config.dryRun) {
        console.log('  [DRY RUN] Would publish to Blogger');
        console.log(`  HTML length: ${html.length} chars`);
        newArticles.push({
          title: topic.title,
          slug: topic.slug,
          url: `https://www.podrozedominikanskie.pl/dry-run/${topic.slug}`,
          category: topic.category,
          publishedAt: new Date().toISOString(),
        });
        successCount++;
        continue;
      }

      // 6e. Publish to Blogger
      console.log('  Publishing to Blogger...');
      const bloggerResult = await publishToBlogger({
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        refreshToken: config.googleRefreshToken,
        blogId: config.bloggerBlogId,
        title: topic.title,
        content: html,
        labels: [topic.category, ...topic.keywords.slice(0, 3)],
      });
      console.log(`  Published: ${bloggerResult.url}`);

      // 6f. Facebook post
      if (fbTokenStatus.valid) {
        console.log('  Generating FB post...');
        const fbText = await generateFbPost({
          apiKey: config.openRouterApiKey,
          articleTitle: topic.title,
          articleDescription: topic.metaDescription,
          articleUrl: bloggerResult.url,
        });

        console.log('  Scheduling FB post...');
        const fbResult = await publishToFacebook({
          pageId: config.fbPageId,
          pageAccessToken: config.fbPageAccessToken,
          message: fbText,
          link: bloggerResult.url,
          scheduledTime: fbSlots[i] || undefined,
        });
        console.log(`  FB post scheduled: ${fbResult.postId}`);

        newArticles.push({
          title: topic.title,
          slug: topic.slug,
          url: bloggerResult.url,
          category: topic.category,
          publishedAt: new Date().toISOString(),
          fbPostId: fbResult.postId,
        });
      } else {
        console.warn('  Skipping FB post (token invalid)');
        newArticles.push({
          title: topic.title,
          slug: topic.slug,
          url: bloggerResult.url,
          category: topic.category,
          publishedAt: new Date().toISOString(),
        });
      }

      successCount++;
    } catch (error) {
      console.error(`  Failed: ${error}`);
      failCount++;
    }
  }

  // 7. Update published.json
  publishedData.articles.push(...newArticles);
  await writeFile(
    join(DATA_DIR, 'published.json'),
    JSON.stringify(publishedData, null, 2),
    'utf-8',
  );

  // 8. Report
  console.log('\n=== Report ===');
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total published: ${publishedData.articles.length}`);
}

main().catch((error) => {
  console.error('Pipeline failed:', error);
  process.exit(1);
});
