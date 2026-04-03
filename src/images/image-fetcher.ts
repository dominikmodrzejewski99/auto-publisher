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

async function fetchSingleImage(accessKey: string, query: string): Promise<UnsplashImage | null> {
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
      return null;
    }

    const data = await response.json();

    for (const photo of data.results) {
      if (usedImageIds.has(photo.id)) continue;
      usedImageIds.add(photo.id);
      return {
        url: `${photo.urls.raw}&w=1200&q=80&fit=crop`,
        alt: photo.alt_description || query,
        credit: photo.user.name,
      };
    }
  } catch (error) {
    console.warn(`Failed to fetch image for "${query}":`, error);
  }

  return null;
}

/**
 * Fetch one image per query (one per section).
 * Each query is tailored to the specific H2 section content.
 */
/**
 * Simplify a query by taking only the first few meaningful words.
 * Helps when the original query is too specific for Unsplash.
 */
function simplifyQuery(query: string): string {
  const words = query.split(/\s+/).filter((w) => w.length > 2);
  return words.slice(0, 3).join(' ');
}

export async function fetchImages(options: FetchImagesOptions): Promise<UnsplashImage[]> {
  const { accessKey, queries } = options;
  const images: UnsplashImage[] = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    let image = await fetchSingleImage(accessKey, query);

    // Retry with simplified query if no result
    if (!image) {
      const simplified = simplifyQuery(query);
      if (simplified !== query) {
        console.warn(`  Retrying with simplified query: "${simplified}"`);
        image = await fetchSingleImage(accessKey, simplified);
      }
    }

    if (image) {
      images.push(image);
    } else {
      console.warn(`  No relevant image found for query "${query}" — skipping`);
    }

    // Small delay to respect rate limits
    if (i < queries.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return images;
}
