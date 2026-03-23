import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('google-trends-api', () => ({
  default: {
    dailyTrends: vi.fn(),
    relatedQueries: vi.fn(),
  },
}));

import googleTrends from 'google-trends-api';
import { fetchTrends } from '../trends/trend-fetcher.js';

const mockDailyTrends = vi.mocked(googleTrends.dailyTrends);
const mockRelatedQueries = vi.mocked(googleTrends.relatedQueries);

describe('fetchTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return trending keywords for given categories', async () => {
    mockDailyTrends.mockResolvedValueOnce(
      JSON.stringify({
        default: {
          trendingSearchesDays: [
            {
              trendingSearches: [
                { title: { query: 'Bali wakacje 2026' } },
                { title: { query: 'Tanie loty Grecja' } },
              ],
            },
          ],
        },
      }),
    );

    mockRelatedQueries.mockResolvedValue(
      JSON.stringify({
        default: {
          rankedList: [
            { rankedKeyword: [{ query: 'bali hotel' }, { query: 'bali plaże' }] },
          ],
        },
      }),
    );

    const categories = [
      { name: 'Bali', keywords: ['bali', 'ubud'] },
    ];

    const result = await fetchTrends(categories);
    expect(result.dailyTrends.length).toBeGreaterThan(0);
    expect(result.relatedQueries).toBeDefined();
  });

  it('should return empty arrays on API failure (fallback)', async () => {
    mockDailyTrends.mockRejectedValueOnce(new Error('API down'));
    mockRelatedQueries.mockRejectedValue(new Error('API down'));

    const categories = [{ name: 'Bali', keywords: ['bali'] }];
    const result = await fetchTrends(categories);

    expect(result.dailyTrends).toEqual([]);
    expect(result.relatedQueries).toEqual({});
  });
});
