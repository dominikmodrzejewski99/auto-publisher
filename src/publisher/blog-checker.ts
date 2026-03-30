import { google } from 'googleapis';

interface CheckDuplicateOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  blogId: string;
}

export interface ExistingTitlesResult {
  /** Normalized titles for dedup matching */
  normalizedSet: Set<string>;
  /** Original titles for passing to AI prompt */
  rawTitles: string[];
}

/**
 * Fetches all post titles from the blog to check for duplicates.
 * Returns both normalized set for matching and raw titles for AI context.
 */
export async function fetchExistingTitles(options: CheckDuplicateOptions): Promise<ExistingTitlesResult> {
  const { clientId, clientSecret, refreshToken, blogId } = options;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const blogger = google.blogger({ version: 'v3', auth });
  const normalizedSet = new Set<string>();
  const rawTitles: string[] = [];

  let pageToken: string | undefined;
  do {
    const response = await blogger.posts.list({
      blogId,
      maxResults: 500,
      fields: 'items(title),nextPageToken',
      status: ['LIVE', 'DRAFT'],
      pageToken,
    });

    for (const post of response.data.items ?? []) {
      if (post.title) {
        normalizedSet.add(normalizeTitle(post.title));
        rawTitles.push(post.title);
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return { normalizedSet, rawTitles };
}

/**
 * Check if a topic title is too similar to existing blog posts.
 */
export function isDuplicate(title: string, existingTitles: Set<string>): boolean {
  const normalized = normalizeTitle(title);

  // Exact match
  if (existingTitles.has(normalized)) return true;

  // Check if main subject overlaps (first 4 significant words)
  const titleWords = getSignificantWords(normalized);
  for (const existing of existingTitles) {
    const existingWords = getSignificantWords(existing);
    const overlap = titleWords.filter((w) => existingWords.includes(w));
    // If 4+ significant words match, it's likely a duplicate topic
    if (overlap.length >= 4) return true;
  }

  return false;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[?!.,;:()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'i', 'w', 'na', 'do', 'z', 'o', 'jak', 'co', 'czy', 'ile', 'to',
  'a', 'dla', 'po', 'za', 'od', 'nie', 'się', 'je', 'ten', 'ta',
  'oraz', 'czyli', 'the', 'and', 'or', 'of', 'in', 'to', 'is',
]);

function getSignificantWords(text: string): string[] {
  return text
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}
