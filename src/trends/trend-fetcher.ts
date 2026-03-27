import type { Category } from '../types.js';

export interface TrendData {
  dailyTrends: string[];
  relatedQueries: Record<string, string[]>;
  peopleQuestions: Record<string, string[]>;
}

export async function fetchTrends(categories: Category[]): Promise<TrendData> {
  const [dailyTrends, relatedQueries, peopleQuestions] = await Promise.all([
    fetchDailyTrends(),
    fetchRelatedQueries(categories),
    fetchPeopleQuestions(categories),
  ]);

  return { dailyTrends, relatedQueries, peopleQuestions };
}

const TRENDS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: '*/*',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
};

/** Fetch daily trending searches from Google Trends RSS feed */
async function fetchDailyTrends(): Promise<string[]> {
  try {
    const response = await fetch('https://trends.google.com/trending/rss?geo=PL', {
      headers: TRENDS_HEADERS,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const trends: string[] = [];

    // Parse <title> elements from RSS items (skip the channel title)
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const titleMatch = match[0].match(/<title>([^<]+)<\/title>/);
      if (titleMatch) {
        trends.push(titleMatch[1]);
      }
    }

    return trends;
  } catch (error) {
    console.warn('Failed to fetch daily trends, using fallback:', error);
    return [];
  }
}

/** Fetch related queries via Google Trends explore + widget API */
async function fetchRelatedQueries(
  categories: Category[],
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  // First, get a session cookie from Google Trends
  let cookie = '';
  try {
    const initRes = await fetch('https://trends.google.com/trends/?geo=PL', {
      headers: TRENDS_HEADERS,
      redirect: 'manual',
    });
    const setCookies = initRes.headers.getSetCookie?.() ?? [];
    cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  } catch {
    // proceed without cookies
  }

  const headersWithCookie = {
    ...TRENDS_HEADERS,
    ...(cookie ? { Cookie: cookie } : {}),
  };

  for (const category of categories) {
    try {
      const exploreUrl = new URL('https://trends.google.com/trends/api/explore');
      exploreUrl.searchParams.set('hl', 'pl');
      exploreUrl.searchParams.set('tz', '-60');
      exploreUrl.searchParams.set(
        'req',
        JSON.stringify({
          comparisonItem: [{ keyword: category.keywords[0], geo: 'PL', time: 'today 12-m' }],
          category: 0,
          property: '',
        }),
      );

      const exploreRes = await fetch(exploreUrl.toString(), { headers: headersWithCookie });
      if (!exploreRes.ok) {
        throw new Error(`Explore HTTP ${exploreRes.status}`);
      }

      const exploreRaw = await exploreRes.text();
      const exploreJson = exploreRaw.replace(/^\)\]\}',?\n/, '');
      const exploreData = JSON.parse(exploreJson);

      const widget = exploreData.widgets.find(
        (w: { id: string }) => w.id === 'RELATED_QUERIES',
      );
      if (!widget) {
        result[category.name] = [];
        continue;
      }

      const relatedUrl = new URL(
        'https://trends.google.com/trends/api/widgetdata/relatedsearches',
      );
      relatedUrl.searchParams.set('hl', 'pl');
      relatedUrl.searchParams.set('tz', '-60');
      relatedUrl.searchParams.set('req', JSON.stringify(widget.request));
      relatedUrl.searchParams.set('token', widget.token);

      const relatedRes = await fetch(relatedUrl.toString(), { headers: headersWithCookie });
      if (!relatedRes.ok) {
        throw new Error(`Related HTTP ${relatedRes.status}`);
      }

      const relatedRaw = await relatedRes.text();
      const relatedJson = relatedRaw.replace(/^\)\]\}',?\n/, '');
      const relatedData = JSON.parse(relatedJson);

      const queries: string[] = [];
      for (const list of relatedData.default.rankedList) {
        for (const kw of list.rankedKeyword) {
          queries.push(kw.query);
        }
      }
      result[category.name] = queries;

      // Small delay between categories to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.warn(`Failed to fetch related queries for ${category.name}:`, error);
    }
  }

  return result;
}

/** Question prefixes that reflect what people ask on FB groups and forums */
const QUESTION_PREFIXES = [
  'ile kosztuje',
  'kiedy jechać do',
  'kiedy najlepiej lecieć do',
  'jak tanio polecieć do',
  'co zabrać do',
  'czy warto jechać do',
  'czy bezpiecznie',
  'jaki hotel',
  'gdzie nocleg',
  'ubezpieczenie',
  'wiza',
  'szczepienia',
  'pogoda',
  'lot przez dubaj',
  'odszkodowanie za lot',
  'odwołany lot',
  'all inclusive',
  'last minute',
  'wakacje z dziećmi',
  'na własną rękę',
  'ile pieniędzy zabrać do',
  'jak dojechać z lotniska',
  'transport',
  'jedzenie',
  'niebezpieczeństwa',
  'oszustwa',
];

/** Fetch real questions people ask via Google Suggest API */
async function fetchPeopleQuestions(
  categories: Category[],
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  for (const category of categories) {
    const allSuggestions = new Set<string>();
    const keyword = category.keywords[0];

    const queries = QUESTION_PREFIXES.map((prefix) => `${prefix} ${keyword}`);
    // Also add destination-specific sub-keywords
    for (const subKeyword of category.keywords.slice(1, 4)) {
      queries.push(`${subKeyword} hotel`);
      queries.push(`${subKeyword} pogoda`);
      queries.push(`${subKeyword} co robić`);
    }

    // Fetch in batches to avoid hammering the API
    for (let i = 0; i < queries.length; i += 5) {
      const batch = queries.slice(i, i + 5);
      const results = await Promise.all(
        batch.map((q) => fetchGoogleSuggest(q)),
      );
      for (const suggestions of results) {
        for (const s of suggestions) {
          allSuggestions.add(s);
        }
      }
      // Small delay between batches
      if (i + 5 < queries.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    result[category.name] = [...allSuggestions];
  }

  return result;
}

async function fetchGoogleSuggest(query: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=pl&gl=pl&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: TRENDS_HEADERS });
    if (!response.ok) return [];
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const data = JSON.parse(text);
    return data[1] ?? [];
  } catch {
    return [];
  }
}
