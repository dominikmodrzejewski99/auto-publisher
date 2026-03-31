import dotenv from 'dotenv';
import type { Config } from './types.js';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    geminiApiKey: requireEnv('GEMINI_API_KEY'),
    unsplashAccessKey: requireEnv('UNSPLASH_ACCESS_KEY'),
    googleClientId: requireEnv('GOOGLE_CLIENT_ID'),
    googleClientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    googleRefreshToken: requireEnv('GOOGLE_REFRESH_TOKEN'),
    bloggerBlogId: requireEnv('BLOGGER_BLOG_ID'),
    fbPageAccessToken: requireEnv('FB_PAGE_ACCESS_TOKEN'),
    fbPageId: requireEnv('FB_PAGE_ID'),
    fbAppId: requireEnv('FB_APP_ID'),
    fbAppSecret: requireEnv('FB_APP_SECRET'),
    googleServiceAccountKeyPath: requireEnv('GOOGLE_SERVICE_ACCOUNT_KEY_PATH'),
    pinterestAccessToken: process.env.PINTEREST_ACCESS_TOKEN ?? '',
    pinterestBoardId: process.env.PINTEREST_BOARD_ID ?? '',
    dryRun: process.argv.includes('--dry-run'),
  };
}
