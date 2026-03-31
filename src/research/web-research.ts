const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'pl-PL,pl;q=0.9',
};

/**
 * Research current information about a topic using Google Suggest + snippets.
 * Returns a context string with up-to-date facts to feed into article generation.
 */
export async function researchTopic(title: string, keywords: string[]): Promise<string> {
  const queries = buildResearchQueries(title, keywords);
  const allSuggestions: string[] = [];

  // Fetch Google Suggest for each query
  for (let i = 0; i < queries.length; i += 5) {
    const batch = queries.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchGoogleSuggest));
    for (const suggestions of results) {
      allSuggestions.push(...suggestions);
    }
    if (i + 5 < queries.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Deduplicate
  const unique = [...new Set(allSuggestions)];

  const parts: string[] = [];
  parts.push(`## Aktualne informacje z Google (${new Date().toISOString().slice(0, 10)}):`);
  parts.push('Poniżej znajdziesz aktualne zapytania i informacje zebrane z Google.');
  parts.push('Użyj ich jako kontekstu do napisania artykułu z aktualnymi danymi.\n');

  if (unique.length > 0) {
    parts.push('### Czego ludzie szukają teraz:');
    unique.slice(0, 40).forEach((s) => parts.push(`- ${s}`));
  }

  return parts.join('\n');
}

function buildResearchQueries(title: string, keywords: string[]): string[] {
  const queries: string[] = [];
  const mainKeyword = keywords[0] || title.split(' ').slice(0, 3).join(' ');

  const currentYear = new Date().getFullYear();

  // Current year queries
  queries.push(`${mainKeyword} ${currentYear}`);
  queries.push(`${mainKeyword} ceny ${currentYear}`);
  queries.push(`${mainKeyword} aktualnie`);

  // Price/cost queries
  queries.push(`${mainKeyword} ile kosztuje`);
  queries.push(`${mainKeyword} cena`);

  // Safety/rules queries
  queries.push(`${mainKeyword} przepisy`);
  queries.push(`${mainKeyword} zasady`);

  // Add keyword-specific queries
  for (const kw of keywords.slice(0, 3)) {
    queries.push(`${kw} ${currentYear}`);
  }

  return queries;
}

async function fetchGoogleSuggest(query: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=pl&gl=pl&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) return [];
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const data = JSON.parse(text);
    return data[1] ?? [];
  } catch {
    return [];
  }
}
