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

/** Question prefixes combined with main destination keyword (e.g. "ile kosztuje tajlandia") */
const QUESTION_PREFIXES = [
  // Koszty i budżet
  'ile kosztuje',
  'ile pieniędzy zabrać do',
  // Planowanie podróży
  'kiedy jechać do',
  'kiedy najlepiej lecieć do',
  'jak tanio polecieć do',
  'co zabrać do',
  'na własną rękę',
  // Bezpieczeństwo
  'czy bezpiecznie',
  'niebezpieczeństwa',
  'oszustwa',
  // Noclegi
  'jaki hotel',
  'gdzie nocleg',
  'all inclusive',
  // Wizy i formalności
  'wiza',
  'szczepienia',
  // Transport na miejscu
  'jak dojechać z lotniska',
  'transport',
  // Jedzenie i kultura
  'jedzenie',
  'street food',
  'co zobaczyć',
  'co robić wieczorem',
  // Pogoda i sezon
  'pogoda',
  'pora deszczowa',
];

/** Sub-location prefixes — combined with specific places like "phuket", "ubud", "siem reap" */
const SUB_LOCATION_PREFIXES = [
  'hotel',
  'gdzie spać',
  'nocleg',
  'co zobaczyć',
  'co robić',
  'pogoda',
  'restauracje',
  'plaża',
  'jak dojechać',
  'ile kosztuje',
  'atrakcje',
];

/** General travel queries not tied to any specific destination */
const GENERAL_TRAVEL_QUERIES = [
  'czy latają samoloty przez dubaj',
  'czy latają samoloty przez turcję',
  'odszkodowanie za odwołany lot',
  'odszkodowanie za opóźniony lot',
  'odszkodowanie air arabia',
  'odszkodowanie ryanair',
  'odszkodowanie wizzair',
  'odwołany lot co robić',
  'opóźniony lot prawa pasażera',
  'tanie loty do azji',
  'tanie loty z polski',
  'loty przez istanbul',
  'loty przez doha',
  'przesiadka w dubaju',
  'przesiadka w stambule',
  'tranzyt przez dubaj',
  'ubezpieczenie podróżne azja',
  'ubezpieczenie podróżne co pokrywa',
  'szczepienia przed wyjazdem do azji',
  'malaria azja',
  'jak tanio polecieć do azji',
  'najlepsze linie lotnicze do azji',
  'bagaż podręczny linie lotnicze',
  'karta płatnicza za granicą',
  'wymiana walut azja',
  'eSIM azja',
  'internet za granicą',
  'travel insurance azja',
  'wizz air azja',
  'lot czarterowy azja',
  'bezpieczeństwo lotów bliski wschód',
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
    // Add specific place queries (e.g. "phuket hotel", "ubud gdzie spać", "siem reap atrakcje")
    for (const subKeyword of category.keywords.slice(1)) {
      for (const prefix of SUB_LOCATION_PREFIXES) {
        queries.push(`${subKeyword} ${prefix}`);
      }
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

  // Fetch general travel questions (not destination-specific)
  const generalSuggestions = new Set<string>();
  for (let i = 0; i < GENERAL_TRAVEL_QUERIES.length; i += 5) {
    const batch = GENERAL_TRAVEL_QUERIES.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((q) => fetchGoogleSuggest(q)),
    );
    for (const suggestions of results) {
      for (const s of suggestions) {
        generalSuggestions.add(s);
      }
    }
    if (i + 5 < GENERAL_TRAVEL_QUERIES.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  result['Ogólne podróże'] = [...generalSuggestions];

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
