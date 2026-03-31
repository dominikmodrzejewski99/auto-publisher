import dotenv from 'dotenv';
import { google } from 'googleapis';
import { requestGoogleIndexing } from '../publisher/google-indexing.js';

dotenv.config();

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH!;
const blogId = process.env.BLOGGER_BLOG_ID!;

// Fetch all post URLs from Blogger
const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const blogger = google.blogger({ version: 'v3', auth });

let pageToken: string | undefined;
const urls: string[] = [];

do {
  const res = await blogger.posts.list({
    blogId,
    maxResults: 500,
    status: ['LIVE'],
    fields: 'items(url),nextPageToken',
    pageToken,
  });
  for (const post of res.data.items ?? []) {
    if (post.url) urls.push(post.url);
  }
  pageToken = res.data.nextPageToken ?? undefined;
} while (pageToken);

console.log(`Found ${urls.length} articles. Requesting indexing...\n`);

let success = 0;
let failed = 0;

for (const url of urls) {
  try {
    await requestGoogleIndexing({ serviceAccountKeyPath: keyPath, url });
    success++;
    console.log(`✓ ${url}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${url} — ${err instanceof Error ? err.message : err}`);
  }
  // 1s delay to respect rate limits (200 req/day for Indexing API)
  await new Promise((r) => setTimeout(r, 1000));
}

console.log(`\nDone: ${success} indexed, ${failed} failed (out of ${urls.length})`);
