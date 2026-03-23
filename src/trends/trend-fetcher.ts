import googleTrends from 'google-trends-api';
import type { Category } from '../types.js';

export interface TrendData {
  dailyTrends: string[];
  relatedQueries: Record<string, string[]>;
}

export async function fetchTrends(categories: Category[]): Promise<TrendData> {
  const dailyTrends = await fetchDailyTrends();
  const relatedQueries = await fetchRelatedQueries(categories);

  return { dailyTrends, relatedQueries };
}

async function fetchDailyTrends(): Promise<string[]> {
  try {
    const raw = await googleTrends.dailyTrends({ geo: 'PL' });
    const data = JSON.parse(raw);
    const days = data.default.trendingSearchesDays;
    const trends: string[] = [];
    for (const day of days) {
      for (const search of day.trendingSearches) {
        trends.push(search.title.query);
      }
    }
    return trends;
  } catch (error) {
    console.warn('Failed to fetch daily trends, using fallback:', error);
    return [];
  }
}

async function fetchRelatedQueries(categories: Category[]): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  for (const category of categories) {
    try {
      const raw = await googleTrends.relatedQueries({
        keyword: category.keywords[0],
        geo: 'PL',
      });
      const data = JSON.parse(raw);
      const queries: string[] = [];
      for (const list of data.default.rankedList) {
        for (const kw of list.rankedKeyword) {
          queries.push(kw.query);
        }
      }
      result[category.name] = queries;
    } catch (error) {
      console.warn(`Failed to fetch related queries for ${category.name}:`, error);
    }
  }

  return result;
}
