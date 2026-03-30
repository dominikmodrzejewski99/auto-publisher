import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { fetchTrends } from './trends/trend-fetcher.js';
import { discoverTrendingCategories } from './trends/category-discovery.js';
import { generateTopics } from './topics/topic-generator.js';
import { generateArticle, validateArticle } from './articles/article-generator.js';
import { assembleHtml } from './articles/template.js';
import { fetchImages, loadUsedImageIds, saveUsedImageIds } from './images/image-fetcher.js';
import { publishToBlogger } from './publisher/blogger.js';
import { fetchExistingTitles, isDuplicate } from './publisher/blog-checker.js';
import {
  checkFbTokenExpiry,
  generateFbPost,
  publishToFacebook,
  getFbScheduleSlots,
} from './social/facebook.js';
import type { PublishedData, PublishedArticle } from './types.js';

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
  const publishedData = await loadJsonFile<PublishedData>(join(DATA_DIR, 'published.json'));
  const publishedSlugs = publishedData.articles.map((a) => a.slug);

  // 2a. Load used image IDs from previous runs
  await loadUsedImageIds();

  // 2b. Discover trending destinations
  console.log('\n--- Discovering trending destinations ---');
  const trendingCategories = await discoverTrendingCategories(6);
  const categories = trendingCategories.map((c) => ({ name: c.name, keywords: c.keywords }));

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

  // 4. Fetch existing blog titles (before topic generation for better dedup)
  console.log('\n--- Fetching existing blog titles ---');
  const existingTitlesResult = await fetchExistingTitles({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    refreshToken: config.googleRefreshToken,
    blogId: config.bloggerBlogId,
  });
  console.log(`Existing posts on blog: ${existingTitlesResult.rawTitles.length}`);

  // 5. Fetch trends
  console.log('\n--- Fetching trends ---');
  const trends = await fetchTrends(categories);
  console.log(`Daily trends: ${trends.dailyTrends.length}`);
  console.log(`Related queries: ${Object.keys(trends.relatedQueries).length} categories`);
  console.log(`People questions: ${Object.values(trends.peopleQuestions).reduce((s, q) => s + q.length, 0)}`);

  // 6. Generate topics (with full blog titles for AI dedup)
  console.log('\n--- Generating topics ---');
  const topics = await generateTopics({
    apiKey: config.geminiApiKey,
    trends,
    categories: categories,
    publishedSlugs,
    existingBlogTitles: existingTitlesResult.rawTitles,
    count: 8,
  });
  console.log(`Generated ${topics.length} topics:`);
  topics.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}`));

  if (topics.length === 0) {
    console.log('No topics generated. Exiting.');
    return;
  }

  // 6b. Double-check for duplicates against blog (programmatic safety net)
  const uniqueTopics = topics.filter((t) => {
    if (isDuplicate(t.title, existingTitlesResult.normalizedSet)) {
      console.log(`  Skipping duplicate: ${t.title}`);
      return false;
    }
    return true;
  });
  console.log(`Topics after dedup: ${uniqueTopics.length}`);

  if (uniqueTopics.length === 0) {
    console.log('All topics are duplicates. Exiting.');
    return;
  }

  // 6. Process each topic
  const fbSlots = getFbScheduleSlots(new Date());
  const newArticles: PublishedArticle[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < uniqueTopics.length; i++) {
    const topic = uniqueTopics[i];
    console.log(`\n--- Article ${i + 1}/${uniqueTopics.length}: ${topic.title} ---`);

    try {
      // 6a. Generate article
      console.log('  Generating article...');
      const article = await generateArticle({
        apiKey: config.geminiApiKey,
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

      // 6c. Fetch images — one per section, query tailored to H2 content
      console.log('  Fetching images...');
      const heroQuery = `${topic.category} travel landscape`;
      const sectionQueries = article.headings.slice(0, 5).map((heading) => {
        // Build a specific query from the H2 heading + category
        const cleanHeading = heading
          .replace(/[?!.,;:()]/g, '')
          .replace(/\d{4}/g, '') // remove year
          .trim();
        return `${cleanHeading} ${topic.category} travel`;
      });
      const images = await fetchImages({
        accessKey: config.unsplashAccessKey,
        queries: [heroQuery, ...sectionQueries],
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
          apiKey: config.geminiApiKey,
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
          scheduledTime: fbSlots[i] > Math.floor(Date.now() / 1000) + 600 ? fbSlots[i] : undefined,
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

    // Delay between articles to respect Gemini rate limits (15 req/min)
    if (i < uniqueTopics.length - 1) {
      console.log('  Waiting 8s before next article...');
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
  }

  // 7. Save used image IDs for next run
  await saveUsedImageIds();

  // 8. Update published.json
  publishedData.articles.push(...newArticles);
  await writeFile(
    join(DATA_DIR, 'published.json'),
    JSON.stringify(publishedData, null, 2),
    'utf-8',
  );

  // 9. Report
  console.log('\n=== Report ===');
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total published: ${publishedData.articles.length}`);
}

main().catch((error) => {
  console.error('Pipeline failed:', error);
  process.exit(1);
});
