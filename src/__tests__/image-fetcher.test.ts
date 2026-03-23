import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchImages } from '../images/image-fetcher.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('fetchImages', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should fetch landscape images for a query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            urls: { raw: 'https://images.unsplash.com/photo-1' },
            alt_description: 'Beautiful beach',
            user: { name: 'John Doe' },
          },
          {
            urls: { raw: 'https://images.unsplash.com/photo-2' },
            alt_description: 'Temple in jungle',
            user: { name: 'Jane Doe' },
          },
        ],
      }),
    });

    const images = await fetchImages({
      accessKey: 'test-key',
      query: 'Bali beach',
      count: 2,
    });

    expect(images).toHaveLength(2);
    expect(images[0].url).toContain('w=1200');
    expect(images[0].url).toContain('q=80');
    expect(images[0].alt).toBe('Beautiful beach');
    expect(images[0].credit).toBe('John Doe');
  });

  it('should return empty array on API failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

    const images = await fetchImages({
      accessKey: 'test-key',
      query: 'Bali beach',
      count: 4,
    });

    expect(images).toEqual([]);
  });
});
