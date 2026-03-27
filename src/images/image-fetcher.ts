import type { UnsplashImage } from '../types.js';

interface FetchImagesOptions {
  accessKey: string;
  query: string;
  count: number;
  excludeIds?: string[];
}

/** Track used image IDs across the pipeline run to avoid repeats */
const usedImageIds = new Set<string>();

export function resetImageTracker() {
  usedImageIds.clear();
}

export async function fetchImages(options: FetchImagesOptions): Promise<UnsplashImage[]> {
  const { accessKey, query, count } = options;

  try {
    // Randomize page to get different results each run
    const page = Math.floor(Math.random() * 5) + 1;

    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(count * 3, 30)), // fetch more to filter duplicates
      page: String(page),
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
      return [];
    }

    const data = await response.json();

    const images: UnsplashImage[] = [];
    for (const photo of data.results) {
      if (usedImageIds.has(photo.id)) continue;
      usedImageIds.add(photo.id);
      images.push({
        url: `${photo.urls.raw}&w=1200&q=80&fit=crop`,
        alt: photo.alt_description || query,
        credit: photo.user.name,
      });
      if (images.length >= count) break;
    }

    return images;
  } catch (error) {
    console.warn('Failed to fetch images from Unsplash:', error);
    return [];
  }
}
