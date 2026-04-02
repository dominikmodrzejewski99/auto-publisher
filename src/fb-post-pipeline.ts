import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { callGemini } from './ai/gemini.js';
import { generateArticle, validateArticle } from './articles/article-generator.js';
import { assembleHtml } from './articles/template.js';
import { fetchImages, loadUsedImageIds, saveUsedImageIds } from './images/image-fetcher.js';
import { publishToBlogger } from './publisher/blogger.js';
import { requestGoogleIndexing } from './publisher/google-indexing.js';
import {
  checkFbTokenExpiry,
  generateFbPost,
  publishToFacebook,
} from './social/facebook.js';
import type { PublishedData, PublishedArticle, Topic } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

function getFbPostText(): string {
  const args = process.argv.slice(2);
  const postIndex = args.indexOf('--post');
  if (postIndex === -1 || postIndex + 1 >= args.length) {
    console.error('Usage: npm run from-fb -- --post "Tekst posta z Facebooka"');
    process.exit(1);
  }
  return args.slice(postIndex + 1).filter((a) => !a.startsWith('--')).join(' ');
}

async function fbPostToTopic(apiKey: string, fbPost: string): Promise<Topic> {
  const systemPrompt = await readFile(
    join(__dirname, '../prompts/fb-post-to-topic-system.md'),
    'utf-8',
  );

  const currentYear = new Date().getFullYear();
  const userPrompt = [
    `Post z Facebooka:`,
    `"${fbPost}"`,
    '',
    `Aktualny rok: ${currentYear}`,
    '',
    `Przekształć ten post w temat artykułu blogowego. Odpowiedz WYŁĄCZNIE JSON.`,
  ].join('\n');

  const response = await callGemini({
    apiKey,
    systemPrompt,
    userPrompt,
    model: 'gemini-2.5-flash',
    maxTokens: 2048,
    temperature: 0.7,
    jsonMode: true,
  });

  const topic = JSON.parse(response) as Topic;

  // Validate required fields
  if (!topic.title || !topic.slug || !topic.metaDescription || !topic.keywords?.length || !topic.category) {
    throw new Error(`Invalid topic generated: ${JSON.stringify(topic)}`);
  }

  return topic;
}

async function main() {
  console.log('=== FB Post → Article Pipeline ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const fbPost = getFbPostText();
  console.log(`\nFB Post: "${fbPost}"`);

  // 1. Load config
  const config = loadConfig();
  const dryRun = process.argv.includes('--dry-run');
  const draft = process.argv.includes('--draft');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : draft ? 'DRAFT' : 'LIVE'}`);

  // 2. Load data
  const publishedData: PublishedData = JSON.parse(
    await readFile(join(DATA_DIR, 'published.json'), 'utf-8'),
  );
  await loadUsedImageIds();

  // 3. Generate topic from FB post
  console.log('\n--- Generating topic from FB post ---');
  const topic = await fbPostToTopic(config.geminiApiKey, fbPost);
  console.log(`Title: ${topic.title}`);
  console.log(`Category: ${topic.category}`);
  console.log(`Keywords: ${topic.keywords.join(', ')}`);

  // 4. Generate article
  console.log('\n--- Generating article ---');
  const article = await generateArticle({
    apiKey: config.geminiApiKey,
    topic,
    useGoogleSearch: true,
    systemPromptPath: join(__dirname, '../prompts/fb-article-system.md'),
  });
  console.log(`Words: ${article.wordCount}, H2s: ${article.headings.length}`);

  const validation = validateArticle(article);
  if (!validation.valid) {
    console.error(`Validation failed: ${validation.reasons.join(', ')}`);
    process.exit(1);
  }

  // 5. Fetch images
  console.log('\n--- Fetching images ---');
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
  console.log(`Found ${images.length} images`);

  // 6. Assemble HTML
  const html = assembleHtml({
    topic,
    content: article.content,
    images,
    headings: article.headings,
    faqItems: article.faqItems,
  });

  if (dryRun) {
    console.log('\n[DRY RUN] Would publish to Blogger');
    console.log(`HTML length: ${html.length} chars`);
    return;
  }

  // 7. Publish to Blogger (as draft or live)
  console.log(`\n--- ${draft ? 'Creating draft on' : 'Publishing to'} Blogger ---`);
  const bloggerResult = await publishToBlogger({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    refreshToken: config.googleRefreshToken,
    blogId: config.bloggerBlogId,
    title: topic.title,
    content: html,
    labels: [topic.category, ...topic.keywords.slice(0, 3)],
    isDraft: draft,
  });
  console.log(`${draft ? 'Draft created' : 'Published'}: ${bloggerResult.url}`);

  // 8. For drafts: skip indexing, FB, and data saving — just show the link
  if (draft) {
    console.log('\n=== Draft ready! ===');
    console.log(`Review: ${bloggerResult.url}`);
    console.log('Publish manually from Blogger when ready.');
    return;
  }

  // 9. Request Google indexing
  try {
    await requestGoogleIndexing({
      serviceAccountKeyPath: config.googleServiceAccountKeyPath,
      url: bloggerResult.url,
    });
    console.log('Google indexing requested');
  } catch (err) {
    console.warn(`Google indexing failed: ${err instanceof Error ? err.message : err}`);
  }

  // 10. Build article record
  const articleRecord: PublishedArticle = {
    title: topic.title,
    slug: topic.slug,
    url: bloggerResult.url,
    category: topic.category,
    publishedAt: new Date().toISOString(),
  };

  // 11. Facebook post
  const fbTokenStatus = await checkFbTokenExpiry({
    pageAccessToken: config.fbPageAccessToken,
    appId: config.fbAppId,
    appSecret: config.fbAppSecret,
  });

  if (fbTokenStatus.valid) {
    try {
      console.log('\n--- Facebook post ---');
      const fbText = await generateFbPost({
        apiKey: config.geminiApiKey,
        articleTitle: topic.title,
        articleDescription: topic.metaDescription,
        articleUrl: bloggerResult.url,
      });

      const fbResult = await publishToFacebook({
        pageId: config.fbPageId,
        pageAccessToken: config.fbPageAccessToken,
        message: fbText,
        link: bloggerResult.url,
      });
      console.log(`FB post published: ${fbResult.postId}`);
      articleRecord.fbPostId = fbResult.postId;
    } catch (err) {
      console.warn(`FB post failed: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    console.warn(`Skipping FB post: ${fbTokenStatus.message}`);
  }

  // 12. Save data
  publishedData.articles.push(articleRecord);
  await writeFile(
    join(DATA_DIR, 'published.json'),
    JSON.stringify(publishedData, null, 2),
    'utf-8',
  );
  await saveUsedImageIds();

  console.log('\n=== Done! ===');
  console.log(`Article: ${bloggerResult.url}`);
}

main().catch((error) => {
  console.error('Pipeline failed:', error);
  process.exit(1);
});
