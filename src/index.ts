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
import { requestGoogleIndexing } from './publisher/google-indexing.js';
import { fetchExistingTitles, isDuplicate, normalizeTitle } from './publisher/blog-checker.js';
import {
  checkFbTokenExpiry,
  generateFbPost,
  publishToFacebook,
  getFbScheduleSlots,
} from './social/facebook.js';
import { fetchSourceTopics, generateArticleFromSource } from './sources/source-pipeline.js';
import type { PublishedData, PublishedArticle, Topic, SourceArticle } from './types.js';

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

  // 6. Generate topics — TWO PIPELINES IN PARALLEL
  //    Pipeline A: 5 trend-based articles (diverse)
  //    Pipeline B: 5 source-based articles (from foreign blogs)
  const TREND_ARTICLE_COUNT = 5;
  const MAX_GENERATION_ROUNDS = 3;
  const seenSlugs = new Set(publishedSlugs);

  // Run both pipelines concurrently
  const [trendTopics, sourceResults] = await Promise.all([
    // Pipeline A: Trend-based topics
    (async () => {
      const uniqueTopics: Topic[] = [];
      for (let round = 1; round <= MAX_GENERATION_ROUNDS && uniqueTopics.length < TREND_ARTICLE_COUNT; round++) {
        const needed = TREND_ARTICLE_COUNT - uniqueTopics.length;
        const requestCount = Math.min(needed + 4, 10);

        console.log(`\n--- [TRENDS] Generating topics (round ${round}, need ${needed} more) ---`);
        const topics = await generateTopics({
          apiKey: config.geminiApiKey,
          trends,
          categories: categories,
          publishedSlugs: [...seenSlugs],
          existingBlogTitles: [
            ...existingTitlesResult.rawTitles,
            ...uniqueTopics.map((t) => t.title),
          ],
          count: requestCount,
        });
        console.log(`[TRENDS] Generated ${topics.length} topics:`);
        topics.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}`));

        for (const t of topics) {
          if (uniqueTopics.length >= TREND_ARTICLE_COUNT) break;
          if (seenSlugs.has(t.slug)) continue;
          if (isDuplicate(t.title, existingTitlesResult.normalizedSet)) continue;
          const alreadyAccepted = new Set(uniqueTopics.map((u) => normalizeTitle(u.title)));
          if (isDuplicate(t.title, alreadyAccepted)) continue;
          uniqueTopics.push(t);
          seenSlugs.add(t.slug);
        }

        console.log(`[TRENDS] Unique topics so far: ${uniqueTopics.length}/${TREND_ARTICLE_COUNT}`);
        if (uniqueTopics.length >= TREND_ARTICLE_COUNT) break;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      return uniqueTopics;
    })(),

    // Pipeline B: Source-based topics (foreign blogs)
    (async () => {
      try {
        return await fetchSourceTopics({
          apiKey: config.geminiApiKey,
          publishedSlugs: [...seenSlugs],
          existingBlogTitles: existingTitlesResult.rawTitles,
        });
      } catch (err) {
        console.error(`[SOURCES] Pipeline failed: ${err}`);
        return [];
      }
    })(),
  ]);

  // Merge results — add source slugs to seenSlugs to prevent cross-pipeline duplicates
  for (const sr of sourceResults) {
    seenSlugs.add(sr.topic.slug);
  }

  // Build unified work list: { topic, sourceArticle? }
  interface WorkItem {
    topic: Topic;
    sourceArticle?: SourceArticle;
    pipelineLabel: string;
  }

  const workItems: WorkItem[] = [
    ...trendTopics.map((t) => ({ topic: t, pipelineLabel: 'TREND' })),
    ...sourceResults.map((sr) => ({ topic: sr.topic, sourceArticle: sr.sourceArticle, pipelineLabel: 'SOURCE' })),
  ];

  if (workItems.length === 0) {
    console.log('No topics generated from either pipeline. Exiting.');
    return;
  }

  console.log(`\n=== Final topics (${workItems.length}) ===`);
  workItems.forEach((w, i) => console.log(`  ${i + 1}. [${w.pipelineLabel}] ${w.topic.title}`));

  // 7. Process each topic
  const fbSlots = getFbScheduleSlots(new Date());
  const newArticles: PublishedArticle[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < workItems.length; i++) {
    const { topic, sourceArticle, pipelineLabel } = workItems[i];
    console.log(`\n--- Article ${i + 1}/${workItems.length} [${pipelineLabel}]: ${topic.title} ---`);

    try {
      // 7a. Generate article — different path for source vs trend
      console.log('  Generating article...');
      const article = sourceArticle
        ? await generateArticleFromSource({ apiKey: config.geminiApiKey, topic, sourceArticle })
        : await generateArticle({ apiKey: config.geminiApiKey, topic });
      console.log(`  Words: ${article.wordCount}, H2s: ${article.headings.length}`);

      // 7b. Validate
      const validation = validateArticle(article);
      if (!validation.valid) {
        console.warn(`  Validation failed: ${validation.reasons.join(', ')}`);
        failCount++;
        continue;
      }

      // 7c. Fetch images
      console.log('  Fetching images...');
      const heroQuery = `${topic.category} travel landscape`;
      const contentHeadings = article.headings.filter((h) => {
        const lower = h.toLowerCase();
        return !lower.includes('najczęściej zadawane') && !lower.includes('faq') && !lower.includes('podsumowanie');
      });
      const sectionQueries = contentHeadings.slice(0, 5).map((heading) => {
        const cleanHeading = heading
          .replace(/[?!.,;:()]/g, '')
          .replace(/\d{4}/g, '')
          .replace(/[ąćęłńóśźż]/g, (c) => {
            const map: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
            return map[c] || c;
          })
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .slice(0, 4)
          .join(' ');
        return `${cleanHeading} ${topic.category} travel`;
      });
      const images = await fetchImages({
        accessKey: config.unsplashAccessKey,
        queries: [heroQuery, ...sectionQueries],
      });
      console.log(`  Found ${images.length} images`);

      // 7d. Assemble HTML
      const html = assembleHtml({
        topic,
        content: article.content,
        images,
        headings: article.headings,
        faqItems: article.faqItems,
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

      // 7e. Publish to Blogger
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

      // 7e2. Request Google indexing
      try {
        await requestGoogleIndexing({
          serviceAccountKeyPath: config.googleServiceAccountKeyPath,
          url: bloggerResult.url,
        });
        console.log('  Google indexing requested');
      } catch (err) {
        console.warn(`  Google indexing failed: ${err instanceof Error ? err.message : err}`);
      }

      // Build article record
      const articleRecord: PublishedArticle = {
        title: topic.title,
        slug: topic.slug,
        url: bloggerResult.url,
        category: topic.category,
        publishedAt: new Date().toISOString(),
      };

      // 7f. Facebook post
      if (fbTokenStatus.valid) {
        try {
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
          articleRecord.fbPostId = fbResult.postId;
        } catch (err) {
          console.warn(`  FB post failed: ${err instanceof Error ? err.message : err}`);
        }
      } else {
        console.warn('  Skipping FB post (token invalid)');
      }

      newArticles.push(articleRecord);

      successCount++;
    } catch (error) {
      console.error(`  Failed: ${error}`);
      failCount++;
    }

    // Delay between articles to respect Gemini rate limits (15 req/min)
    if (i < workItems.length - 1) {
      console.log('  Waiting 8s before next article...');
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
  }

  // 8. Save used image IDs for next run
  await saveUsedImageIds();

  // 9. Update published.json
  publishedData.articles.push(...newArticles);
  await writeFile(
    join(DATA_DIR, 'published.json'),
    JSON.stringify(publishedData, null, 2),
    'utf-8',
  );

  // 10. Report
  console.log('\n=== Report ===');
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total published: ${publishedData.articles.length}`);
}

main().catch((error) => {
  console.error('Pipeline failed:', error);
  process.exit(1);
});
