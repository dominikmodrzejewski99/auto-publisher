const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'pl-PL,pl;q=0.9',
};

/** Known Asian travel destinations to scan for trending interest */
const DESTINATION_POOL = [
  { name: 'Tajlandia', keywords: ['tajlandia', 'bangkok', 'phuket', 'krabi', 'chiang mai', 'koh samui', 'phi phi'] },
  { name: 'Bali', keywords: ['bali', 'ubud', 'seminyak', 'nusa penida', 'kuta', 'uluwatu', 'canggu'] },
  { name: 'Wietnam', keywords: ['wietnam', 'hanoi', 'ho chi minh', 'ha long bay', 'da nang', 'hoi an', 'sapa'] },
  { name: 'Kambodża', keywords: ['kambodża', 'siem reap', 'angkor wat', 'phnom penh', 'kampot', 'koh rong'] },
  { name: 'Japonia', keywords: ['japonia', 'tokio', 'kioto', 'osaka', 'hiroszima', 'nara'] },
  { name: 'Chiny', keywords: ['chiny', 'pekin', 'szanghaj', 'hongkong', 'guilin', 'wielki mur'] },
  { name: 'Sri Lanka', keywords: ['sri lanka', 'kolombo', 'ella', 'sigirija', 'kandy', 'mirissa'] },
  { name: 'Filipiny', keywords: ['filipiny', 'manila', 'palawan', 'el nido', 'boracay', 'cebu', 'siargao'] },
  { name: 'Malezja', keywords: ['malezja', 'kuala lumpur', 'langkawi', 'penang', 'borneo', 'malakka'] },
  { name: 'Nepal', keywords: ['nepal', 'katmandu', 'pokhara', 'everest', 'annapurna', 'chitwan'] },
  { name: 'Indie', keywords: ['indie', 'goa', 'delhi', 'rajasthan', 'kerala', 'mumbaj', 'agra'] },
  { name: 'Korea Południowa', keywords: ['korea', 'seul', 'busan', 'jeju', 'korea południowa'] },
  { name: 'Singapur', keywords: ['singapur', 'marina bay', 'sentosa', 'gardens by the bay'] },
  { name: 'Indonezja', keywords: ['indonezja', 'jawa', 'lombok', 'komodo', 'flores', 'raja ampat'] },
  { name: 'Birma', keywords: ['birma', 'myanmar', 'rangun', 'bagan', 'mandalay', 'jezioro inle'] },
  { name: 'Laos', keywords: ['laos', 'luang prabang', 'vientiane', 'vang vieng'] },
];

export interface DiscoveredCategory {
  name: string;
  keywords: string[];
  trendScore: number;
}

/**
 * Discover which Asian destinations are trending right now
 * by checking Google Suggest volume for each destination.
 */
export async function discoverTrendingCategories(maxCategories: number = 6): Promise<DiscoveredCategory[]> {
  const scored: DiscoveredCategory[] = [];

  for (const dest of DESTINATION_POOL) {
    const queries = [
      `${dest.keywords[0]} wakacje`,
      `${dest.keywords[0]} loty`,
      `${dest.keywords[0]} ${new Date().getFullYear()}`,
    ];

    let totalSuggestions = 0;
    for (const q of queries) {
      const suggestions = await fetchSuggestCount(q);
      totalSuggestions += suggestions;
    }

    scored.push({
      name: dest.name,
      keywords: dest.keywords,
      trendScore: totalSuggestions,
    });

    // Small delay to not hammer the API
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Sort by trend score (most popular first) and take top N
  scored.sort((a, b) => b.trendScore - a.trendScore);

  const selected = scored.slice(0, maxCategories);
  console.log('Trending destinations:');
  selected.forEach((d) => console.log(`  ${d.name}: score ${d.trendScore}`));

  return selected;
}

async function fetchSuggestCount(query: string): Promise<number> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=pl&gl=pl&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) return 0;
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const data = JSON.parse(text);
    return (data[1] ?? []).length;
  } catch {
    return 0;
  }
}
