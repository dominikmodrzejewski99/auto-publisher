import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { UnsplashImage } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USED_IMAGES_PATH = join(__dirname, '../../data/used-images.json');
const MAX_STORED_IDS = 500;

interface FetchImagesOptions {
  accessKey: string;
  /** Queries per section: [heroQuery, h2Query1, h2Query2, ...] */
  queries: string[];
}

/** Track used image IDs across the pipeline run AND across runs via file */
const usedImageIds = new Set<string>();

/** Load previously used image IDs from file */
export async function loadUsedImageIds(): Promise<void> {
  try {
    const raw = await readFile(USED_IMAGES_PATH, 'utf-8');
    const data = JSON.parse(raw);
    for (const id of data.ids ?? []) {
      usedImageIds.add(id);
    }
    console.log(`Loaded ${usedImageIds.size} previously used image IDs`);
  } catch {
    // File doesn't exist yet — first run
  }
}

/** Save used image IDs to file (rolling window) */
export async function saveUsedImageIds(): Promise<void> {
  const allIds = Array.from(usedImageIds);
  // Keep only the most recent IDs
  const idsToSave = allIds.slice(-MAX_STORED_IDS);
  await writeFile(USED_IMAGES_PATH, JSON.stringify({ ids: idsToSave }, null, 2), 'utf-8');
  console.log(`Saved ${idsToSave.length} used image IDs`);
}

/**
 * Rate-limit circuit breaker: once Unsplash returns 403 (hourly quota exhausted
 * on the free tier), further calls in this run are pointless. Flip the flag and
 * short-circuit. Reset on `fetchImages` entry so tests / separate runs behave.
 */
let rateLimited = false;

async function fetchSingleImage(accessKey: string, query: string): Promise<UnsplashImage | null> {
  if (rateLimited) return null;

  try {
    const params = new URLSearchParams({
      query,
      per_page: '15',
      page: '1',
      orientation: 'landscape',
      content_filter: 'high',
      order_by: 'relevant',
    });

    const response = await fetch(
      `https://api.unsplash.com/search/photos?${params}`,
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
        },
      },
    );

    if (!response.ok) {
      console.warn(`Unsplash API error: ${response.status} ${response.statusText}`);
      if (response.status === 403 || response.status === 429) {
        rateLimited = true;
        console.warn('  Unsplash rate limit hit — skipping remaining image fetches this run');
      }
      return null;
    }

    const data = await response.json();

    for (const photo of data.results) {
      if (usedImageIds.has(photo.id)) continue;

      // Skip images that are too small (likely placeholders or broken)
      if (photo.width < 800 || photo.height < 400) continue;

      const imageUrl = `${photo.urls.raw}&w=1200&q=80&fit=crop`;

      // Validate image is actually accessible
      const isValid = await validateImageUrl(imageUrl);
      if (!isValid) {
        console.warn(`  Skipping inaccessible image: ${photo.id}`);
        continue;
      }

      usedImageIds.add(photo.id);
      return {
        url: imageUrl,
        alt: photo.alt_description || query,
        credit: photo.user.name,
      };
    }
  } catch (error) {
    console.warn(`Failed to fetch image for "${query}":`, error);
  }

  return null;
}

/** Validate that an image URL is actually accessible via HEAD request */
async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const contentType = response.headers.get('content-type') ?? '';
    return response.ok && contentType.startsWith('image/');
  } catch {
    return false;
  }
}

export async function fetchImages(options: FetchImagesOptions): Promise<UnsplashImage[]> {
  const { accessKey, queries } = options;
  const images: UnsplashImage[] = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const image = await fetchSingleImage(accessKey, query);

    if (image) {
      images.push(image);
    } else if (!rateLimited) {
      console.warn(`  No relevant image found for query "${query}" — skipping`);
    }

    // Spread calls out: Unsplash free tier is 50 req/h, so ~1s apart keeps
    // bursts modest without making the full run painfully slow.
    if (i < queries.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return images;
}
