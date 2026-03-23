import type { UnsplashImage } from '../types.js';

interface FetchImagesOptions {
  accessKey: string;
  query: string;
  count: number;
}

export async function fetchImages(options: FetchImagesOptions): Promise<UnsplashImage[]> {
  const { accessKey, query, count } = options;

  try {
    const params = new URLSearchParams({
      query,
      per_page: String(Math.min(count, 30)),
      orientation: 'landscape',
      content_filter: 'high',
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

    return data.results.slice(0, count).map((photo: any) => ({
      url: `${photo.urls.raw}&w=1200&q=80&fit=crop`,
      alt: photo.alt_description || query,
      credit: photo.user.name,
    }));
  } catch (error) {
    console.warn('Failed to fetch images from Unsplash:', error);
    return [];
  }
}
