import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callGemini } from '../ai/gemini.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TokenCheckOptions {
  pageAccessToken: string;
  appId: string;
  appSecret: string;
}

interface TokenCheckResult {
  valid: boolean;
  warning: boolean;
  daysRemaining: number;
  message: string;
}

export async function checkFbTokenExpiry(options: TokenCheckOptions): Promise<TokenCheckResult> {
  const { pageAccessToken, appId, appSecret } = options;

  try {
    const params = new URLSearchParams({
      input_token: pageAccessToken,
      access_token: `${appId}|${appSecret}`,
    });

    const response = await fetch(`https://graph.facebook.com/debug_token?${params}`);
    const data = await response.json();

    if (!data.data?.is_valid) {
      return { valid: false, warning: false, daysRemaining: 0, message: 'FB token is invalid or expired' };
    }

    const expiresAt = data.data.expires_at;
    if (expiresAt === 0) {
      // Never expires
      return { valid: true, warning: false, daysRemaining: Infinity, message: 'FB token does not expire' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const daysRemaining = Math.floor((expiresAt - nowSec) / 86400);

    if (daysRemaining < 7) {
      return { valid: true, warning: true, daysRemaining, message: `FB token expires in ${daysRemaining} days — run 'npm run auth:fb-refresh'` };
    }

    return { valid: true, warning: false, daysRemaining, message: `FB token valid for ${daysRemaining} days` };
  } catch (error) {
    return { valid: false, warning: false, daysRemaining: 0, message: `Failed to check FB token: ${error}` };
  }
}

interface GenerateFbPostOptions {
  apiKey: string;
  articleTitle: string;
  articleDescription: string;
  articleUrl: string;
}

export async function generateFbPost(options: GenerateFbPostOptions): Promise<string> {
  const { apiKey, articleTitle, articleDescription, articleUrl } = options;

  const systemPrompt = await readFile(
    join(__dirname, '../../prompts/fb-post-system.md'),
    'utf-8',
  );

  const userPrompt = [
    `Tytuł artykułu: "${articleTitle}"`,
    `Opis: ${articleDescription}`,
    `Link: ${articleUrl}`,
  ].join('\n');

  return callGemini({
    apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 512,
    temperature: 0.9,
  });
}

interface PublishOptions {
  pageId: string;
  pageAccessToken: string;
  message: string;
  link: string;
  scheduledTime?: number;
}

interface PublishResult {
  postId: string;
}

export async function publishToFacebook(options: PublishOptions): Promise<PublishResult> {
  const { pageId, pageAccessToken, message, link, scheduledTime } = options;

  const body: Record<string, any> = {
    message,
    link,
    access_token: pageAccessToken,
  };

  if (scheduledTime) {
    body.published = false;
    body.scheduled_publish_time = scheduledTime;
  }

  const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Facebook API error: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return { postId: data.id };
}

export function getFbScheduleSlots(date: Date): number[] {
  // Returns Unix timestamps for 8:00, 13:00, 19:00 PL time (Europe/Warsaw)
  const slots = [8, 13, 19];
  return slots.map((hour) => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    const probe = new Date(`${yyyy}-${mm}-${dd}T${hh}:00:00Z`);
    const warsawOffset = getWarsawUtcOffsetMinutes(probe);
    const utcMs = probe.getTime() + warsawOffset * 60 * 1000;
    return Math.floor(utcMs / 1000);
  });
}

function getWarsawUtcOffsetMinutes(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const plStr = date.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' });
  const utcDate = new Date(utcStr);
  const plDate = new Date(plStr);
  return (utcDate.getTime() - plDate.getTime()) / (60 * 1000);
}
